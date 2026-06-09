import { describe, it, expect, vi, beforeEach } from "vitest";
import { Ripple } from "../src/index.js";

class MockWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    MockWebSocket.instance = this;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  triggerOpen() {
    this.onopen?.();
  }
  triggerClose() {
    this.onclose?.();
  }
  triggerMessage(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  triggerError(event = {}) {
    this.onerror?.(event);
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });
});

function openRipple(options = {}) {
  const ripple = new Ripple("ws://localhost:8080", options);
  MockWebSocket.instance.triggerOpen();
  return ripple;
}

describe("Ripple", () => {
  it("transitions state on open and close", () => {
    const ripple = new Ripple("ws://localhost:8080");
    expect(ripple.state).toBe(Ripple.CONNECTING);
    MockWebSocket.instance.triggerOpen();
    expect(ripple.state).toBe(Ripple.OPEN);
    MockWebSocket.instance.triggerClose();
    expect(ripple.state).toBe(Ripple.CLOSED);
  });

  it("sends ping on open", () => {
    openRipple();
    const sent = MockWebSocket.instance.sent;
    expect(sent[0]).toEqual({ type: "ping" });
  });

  it("calls onOpen handler", () => {
    const onOpen = vi.fn();
    openRipple({ onOpen });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("calls onClose handler", () => {
    const onClose = vi.fn();
    const ripple = openRipple({ onClose });
    MockWebSocket.instance.triggerClose();
    expect(onClose).toHaveBeenCalledWith(ripple);
  });

  it("send() emits send envelope", () => {
    const ripple = openRipple();
    ripple.send("test.address", { hello: "world" });
    const sent = MockWebSocket.instance.sent;
    expect(sent.at(-1)).toMatchObject({
      type: "send",
      address: "test.address",
      body: { hello: "world" },
    });
  });

  it("publish() emits publish envelope", () => {
    const ripple = openRipple();
    ripple.publish("test.topic", { value: 42 });
    expect(MockWebSocket.instance.sent.at(-1)).toMatchObject({
      type: "publish",
      address: "test.topic",
      body: { value: 42 },
    });
  });

  it("request() sends envelope with correlationId and calls callback on reply", () => {
    const ripple = openRipple();
    const callback = vi.fn();
    ripple.request("test.request", { q: 1 }, callback);

    const sent = MockWebSocket.instance.sent.find((m) => m.type === "request");
    expect(sent).toMatchObject({ type: "request", address: "test.request", correlationId: "test-uuid" });

    MockWebSocket.instance.triggerMessage({ type: "reply", correlationId: "test-uuid", body: { result: "ok" } });
    expect(callback).toHaveBeenCalledWith({ result: "ok" }, null);
    expect(ripple.pendingRequests.has("test-uuid")).toBe(false);
  });

  it("request() calls callback with error on err reply", () => {
    const ripple = openRipple();
    const callback = vi.fn();
    ripple.request("test.request", {}, callback);

    const errMsg = { type: "err", failureType: "NoSession", failureCode: 404, message: "not found", correlationId: "test-uuid" };
    MockWebSocket.instance.triggerMessage(errMsg);
    expect(callback).toHaveBeenCalledWith(null, errMsg);
  });

  it("registerHandler() sends register message and routes incoming messages", () => {
    const ripple = openRipple();
    const handler = vi.fn();
    ripple.registerHandler("chat.messages", handler);

    expect(MockWebSocket.instance.sent.at(-1)).toMatchObject({ type: "register", address: "chat.messages" });

    MockWebSocket.instance.triggerMessage({ type: "publish", address: "chat.messages", body: { text: "hi" } });
    expect(handler).toHaveBeenCalledWith({ text: "hi" }, null);
  });

  it("unregisterHandler() sends unregister when last handler removed", () => {
    const ripple = openRipple();
    const handler = vi.fn();
    ripple.registerHandler("some.address", handler);
    ripple.unregisterHandler("some.address", handler);

    const sent = MockWebSocket.instance.sent;
    expect(sent.at(-1)).toMatchObject({ type: "unregister", address: "some.address" });
    expect(ripple.subscriptions.has("some.address")).toBe(false);
  });

  it("throws INVALID_STATE_ERR when not open", () => {
    const ripple = new Ripple("ws://localhost:8080");
    expect(() => ripple.send("x", {})).toThrow("INVALID_STATE_ERR");
  });

  it("calls onError handler for unhandled err messages", () => {
    const onError = vi.fn();
    const ripple = openRipple({ onError });
    MockWebSocket.instance.triggerMessage({ type: "err", failureType: "HandlerError", failureCode: 500, message: "oops" });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("calls onError with correct RippleError shape", () => {
    const onError = vi.fn();
    const ripple = openRipple({ onError });
    const err = { type: "err", failureType: "NoSession", failureCode: 404, message: "Session not found" };
    MockWebSocket.instance.triggerMessage(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("calls onError for Forbidden error", () => {
    const onError = vi.fn();
    const ripple = openRipple({ onError });
    const err = { type: "err", failureType: "Forbidden", failureCode: 403, message: "Client publish not allowed" };
    MockWebSocket.instance.triggerMessage(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("calls onError with correct RippleError shape", () => {
    const onError = vi.fn();
    const ripple = openRipple({ onError });
    const err = { type: "err", failureType: "NoSession", failureCode: 404, message: "Session not found" };
    MockWebSocket.instance.triggerMessage(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("calls onError for Forbidden error", () => {
    const onError = vi.fn();
    const ripple = openRipple({ onError });
    const err = { type: "err", failureType: "Forbidden", failureCode: 403, message: "Client publish not allowed" };
    MockWebSocket.instance.triggerMessage(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  // Security: malformed JSON
  it("does not throw when a malformed JSON frame is received", () => {
    openRipple();
    expect(() => {
      MockWebSocket.instance.onmessage?.({ data: "{{not-valid-json" });
    }).not.toThrow();
  });

  // Security: WebSocket onerror
  it("calls onError handler when the WebSocket emits an error event", () => {
    const onError = vi.fn();
    openRipple({ onError });
    MockWebSocket.instance.triggerError({});
    expect(onError).toHaveBeenCalledOnce();
  });

  // Security: prototype pollution via correlationId
  it("does not throw when __proto__ is used as correlationId", () => {
    openRipple();
    expect(() => {
      MockWebSocket.instance.triggerMessage({ type: "reply", correlationId: "__proto__", body: {} });
    }).not.toThrow();
  });

  // Security: prototype pollution via address
  it("does not throw when __proto__ is used as subscription address", () => {
    openRipple();
    expect(() => {
      MockWebSocket.instance.triggerMessage({ type: "publish", address: "__proto__", body: {} });
    }).not.toThrow();
  });
});
