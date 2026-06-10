# ripple-st-client

WebSocket client for the [Ripple](https://github.com/mumez/Ripple) event bus protocol.

## Installation

```bash
npm install ripple-st-client
```

## Quick start

```js
import { Ripple } from "ripple-st-client";

const ripple = new Ripple("ws://localhost:7777/ripple", {
  onOpen: () => console.log("connected"),
  onClose: () => console.log("disconnected"),
});
```

## API

### `new Ripple(url, options?)`

Opens a WebSocket connection to a Ripple server.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `Record<string, string>` | `{}` | Headers attached to every outgoing envelope |
| `ping_interval` | `number` | `10000` | Keepalive ping interval in milliseconds |
| `request_timeout` | `number` | `0` | Milliseconds before a pending `request()` is cancelled with a `RequestTimeout` error. `0` disables the timeout. |
| `onOpen` | `(ripple: Ripple) => void` | — | Called when the connection is established |
| `onClose` | `(ripple: Ripple) => void` | — | Called when the connection is closed |
| `onError` | `(error: RippleError) => void` | — | Called for unhandled server errors and WebSocket connection errors |

---

### Messaging

All methods throw `"INVALID_STATE_ERR"` if the connection is not open.

#### `send(address, message)`

One-way fire-and-forget. No reply is expected.

```js
ripple.send("chat.messages", { text: "hello" });
```

#### `publish(address, message)`

Broadcasts a message to all subscribers of an address.

```js
ripple.publish("notifications", { level: "info", text: "Server restarted" });
```

#### `request(address, message, callback?)`

Sends a request and receives a single reply via `callback(body, error)`.

```js
ripple.request("users.find", { id: 42 }, (user, err) => {
  if (err) return console.error(err.message);
  console.log(user.name);
});
```

---

### Subscriptions

#### `registerHandler(address, callback)`

Subscribes to messages arriving at `address`. Multiple handlers can be registered for the same address.

```js
ripple.registerHandler("chat.messages", (body, err) => {
  if (err) return;
  console.log(body.text);
});
```

#### `unregisterHandler(address, callback)`

Removes a previously registered handler. The server is notified when the last handler for an address is removed.

---

### Lifecycle

#### `close()`

Closes the WebSocket connection.

#### `onOpen(handler)` / `onClose(handler)` / `onError(handler)`

Replace the lifecycle handlers after construction.

---

### State

`ripple.state` reflects the current connection state:

| Constant | Value |
|----------|-------|
| `Ripple.CONNECTING` | `0` |
| `Ripple.OPEN` | `1` |
| `Ripple.CLOSING` | `2` |
| `Ripple.CLOSED` | `3` |

---

### Error handling

Errors are delivered in one of three ways depending on their origin:

| Situation | Delivery |
|-----------|----------|
| Server returns `err` in response to a `request()` | `callback(null, error)` on that request |
| Server returns `err` for a subscribed address | `handler(null, error)` on that subscription |
| Server returns `err` with no matching handler | `onError` callback |
| WebSocket connection error | `onError` callback |
| `request()` times out (`request_timeout`) | `callback(null, error)` on that request |

```js
// Per-request error handling
ripple.request("users.find", { id: 42 }, (user, err) => {
  if (err) {
    console.error(err.failureType, err.message); // e.g. "HandlerError" "…"
    return;
  }
  console.log(user.name);
});

// Global fallback for unhandled errors
const ripple = new Ripple(url, {
  onError: (err) => console.error(`[${err.failureCode}] ${err.message}`),
});
```

### `RippleError`

```ts
interface RippleError {
  type: "err";
  failureType: string;
  failureCode: number;
  message: string;
  correlationId?: string; // present only on errors from a request()
}
```

**Server-side `failureType` values:**

| `failureType` | `failureCode` | Cause |
|---------------|---------------|-------|
| `NoSession` | 404 | No session registered for this connection |
| `Forbidden` | 403 | `publish` rejected because `allowClientPublish` is `false` on the server |
| `HandlerError` | 500 | Application handler threw an unhandled exception |
| `general` | 0 | Generic server-side error |
| `application` | 10000 | Application-level error raised by the handler |

**Client-side `failureType` values** (synthesised locally, not received over the wire):

| `failureType` | `failureCode` | Cause |
|---------------|---------------|-------|
| `WebSocketError` | event code / `-1` | Underlying WebSocket connection error |
| `RequestTimeout` | 408 | `request()` received no reply within `request_timeout` ms |

## License

MIT
