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
| `onOpen` | `(ripple: Ripple) => void` | — | Called when the connection is established |
| `onClose` | `(ripple: Ripple) => void` | — | Called when the connection is closed |
| `onError` | `(error: RippleError) => void` | — | Called for unhandled server errors |

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

### `RippleError`

```ts
interface RippleError {
  type: "err";
  failureType: string;
  failureCode: number;
  message: string;
  correlationId?: string;
}
```

## License

MIT
