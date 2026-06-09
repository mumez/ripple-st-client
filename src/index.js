/**
 * @typedef {Object} RippleOptions
 * @property {Record<string, string>} [headers]
 * @property {number} [ping_interval]
 * @property {(ripple: Ripple) => void} [onOpen]
 * @property {(ripple: Ripple) => void} [onClose]
 * @property {(error: RippleError) => void} [onError]
 */

/**
 * @typedef {Object} RippleError
 * @property {'err'} type
 * @property {string} failureType
 * @property {number} failureCode
 * @property {string} message
 * @property {string} [correlationId]
 */

/**
 * @typedef {(body: unknown, error: RippleError | null) => void} MessageCallback
 */

export class Ripple {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  /**
   * @param {string} url
   * @param {RippleOptions} [options]
   */
  constructor(url, options = {}) {
    this.state = Ripple.CONNECTING;
    /** @type {Map<string, MessageCallback[]>} */
    this.subscriptions = new Map();
    /** @type {Map<string, MessageCallback>} */
    this.pendingRequests = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this._pendingTimers = new Map();
    this._requestTimeout = options.request_timeout ?? 0;
    this.headers = { ...(options.headers ?? {}) };
    this.onOpenHandler = options.onOpen || (() => console.log("--open--"));
    this.onCloseHandler = options.onClose || (() => console.log("--close--"));
    this.onErrorHandler = options.onError || ((json) => console.error(json));
    this.setupWebsocket(url, options);
  }

  /**
   * @param {string} url
   * @param {RippleOptions} options
   */
  setupWebsocket(url, options) {
    const pingInterval = options.ping_interval || 10000;

    let pingTimerID;
    this.wsock = new WebSocket(url, ["ripple-st.0"]);
    this.wsock.onopen = () => {
      const sendPing = () => {
        this.wsock.send(JSON.stringify({ type: "ping" }));
      };
      sendPing();
      pingTimerID = setInterval(sendPing, pingInterval);
      this.state = Ripple.OPEN;
      this.onOpenHandler(this);
    };

    this.wsock.onclose = () => {
      this.state = Ripple.CLOSED;
      if (pingTimerID) clearInterval(pingTimerID);
      this.onCloseHandler(this);
    };

    this.wsock.onerror = () => {
      this.onErrorHandler({ type: "err", failureType: "WebSocketError", failureCode: 0, message: "WebSocket connection error" });
    };

    this.wsock.onmessage = (e) => {
      let json;
      try {
        json = JSON.parse(e.data);
      } catch {
        return;
      }
      const { type } = json;

      if (type === "pong") {
        return;
      }

      if (type === "reply") {
        const callback = this.pendingRequests.get(json.correlationId);
        if (callback) {
          this._clearPendingTimer(json.correlationId);
          this.pendingRequests.delete(json.correlationId);
          callback(json.body, null);
        }
        return;
      }

      if (type === "err" && json.correlationId) {
        const callback = this.pendingRequests.get(json.correlationId);
        if (callback) {
          this._clearPendingTimer(json.correlationId);
          this.pendingRequests.delete(json.correlationId);
          callback(null, json);
        }
        return;
      }

      const handlers = this.subscriptions.get(json.address);
      if (handlers) {
        handlers.forEach((handler) => {
          if (type === "err") {
            handler(null, json);
          } else {
            handler(json.body, null);
          }
        });
      } else {
        if (type === "err") {
          this.handleMessageError(json);
        } else {
          console.warn("No handler found for message: ", json);
        }
      }
    };
  }

  /** @param {RippleError} json */
  handleMessageError(json) {
    this.onErrorHandler(json);
  }

  /** @param {(ripple: Ripple) => void} handler */
  onClose(handler) {
    this.onCloseHandler = handler;
  }

  /** @param {(ripple: Ripple) => void} handler */
  onOpen(handler) {
    this.onOpenHandler = handler;
  }

  /** @param {(error: RippleError) => void} handler */
  onError(handler) {
    this.onErrorHandler = handler;
  }

  /**
   * Send a request and expect a reply via callback(body, error).
   * @param {string} address
   * @param {unknown} message
   * @param {MessageCallback} [callback]
   */
  request(address, message, callback) {
    if (this.state !== Ripple.OPEN) {
      throw new Error("INVALID_STATE_ERR");
    }

    const correlationId = this.makeUUID();
    const envelope = {
      type: "request",
      address,
      headers: this.headers,
      body: message,
      correlationId,
    };

    if (callback) {
      this.pendingRequests.set(correlationId, callback);
      if (this._requestTimeout > 0) {
        const timerId = setTimeout(() => {
          if (this.pendingRequests.has(correlationId)) {
            this.pendingRequests.delete(correlationId);
            this._pendingTimers.delete(correlationId);
            callback(null, { type: "err", failureType: "RequestTimeout", failureCode: 408, message: `Request to "${address}" timed out` });
          }
        }, this._requestTimeout);
        this._pendingTimers.set(correlationId, timerId);
      }
    }

    this.wsock.send(JSON.stringify(envelope));
  }

  /**
   * One-way send with no reply expected.
   * @param {string} address
   * @param {unknown} message
   */
  send(address, message) {
    if (this.state !== Ripple.OPEN) {
      throw new Error("INVALID_STATE_ERR");
    }

    this.wsock.send(
      JSON.stringify({ type: "send", address, headers: this.headers, body: message }),
    );
  }

  /**
   * @param {string} address
   * @param {unknown} message
   */
  publish(address, message) {
    if (this.state !== Ripple.OPEN) {
      throw new Error("INVALID_STATE_ERR");
    }

    this.wsock.send(
      JSON.stringify({ type: "publish", address, headers: this.headers, body: message }),
    );
  }

  /**
   * @param {string} address
   * @param {MessageCallback} callback
   */
  registerHandler(address, callback) {
    if (this.state !== Ripple.OPEN) {
      throw new Error("INVALID_STATE_ERR");
    }

    if (!this.subscriptions.has(address)) {
      this.subscriptions.set(address, []);
      this.wsock.send(
        JSON.stringify({ type: "register", address, headers: this.headers }),
      );
    }

    this.subscriptions.get(address).push(callback);
  }

  /**
   * @param {string} address
   * @param {MessageCallback} callback
   */
  unregisterHandler(address, callback) {
    if (this.state !== Ripple.OPEN) {
      throw new Error("INVALID_STATE_ERR");
    }

    const handlers = this.subscriptions.get(address);
    if (handlers) {
      const idx = handlers.indexOf(callback);
      if (idx !== -1) {
        handlers.splice(idx, 1);
        if (handlers.length === 0) {
          this.wsock.send(
            JSON.stringify({ type: "unregister", address, headers: this.headers }),
          );
          this.subscriptions.delete(address);
        }
      }
    }
  }

  close() {
    this.state = Ripple.CLOSING;
    this._pendingTimers.forEach(clearTimeout);
    this._pendingTimers.clear();
    this.wsock.close();
  }

  /** @param {string} correlationId */
  _clearPendingTimer(correlationId) {
    const timerId = this._pendingTimers.get(correlationId);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this._pendingTimers.delete(correlationId);
    }
  }

  /** @returns {string} */
  makeUUID() {
    return crypto.randomUUID();
  }
}
