# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About

`ripple-st-client` is a JavaScript WebSocket client library for the [Ripple](https://github.com/mumez/Ripple) event bus protocol. It ships dual ESM/CJS outputs with hand-authored TypeScript declarations.

## Commands

```bash
npm run build        # rollup → dist/index.js (ESM) + dist/index.cjs (CJS), then copies src/index.d.ts → dist/index.d.ts
npm run lint         # eslint src/
npm test             # vitest run (single pass)
npm run test:watch   # vitest (watch mode)
```

Run a single test by name:
```bash
npx vitest run -t "request() sends envelope"
```

## Architecture

All library code lives in `src/index.js` (one class, one file). The TypeScript declarations are maintained by hand in `src/index.d.ts`; the build step copies them to `dist/`.

### Ripple wire protocol

Every WebSocket frame is a JSON envelope with a `type` field. The client uses sub-protocol `"ripple-st.0"`.

| type | direction | purpose |
|------|-----------|---------|
| `ping` / `pong` | client→server / server→client | keepalive (sent on open, then every `ping_interval` ms) |
| `request` | client→server | RPC call; envelope includes `correlationId` |
| `reply` | server→client | response to `request`; matched by `correlationId` |
| `send` | client→server | one-way, no reply |
| `publish` | client→server | broadcast to all subscribers of an address |
| `register` / `unregister` | client→server | subscribe/unsubscribe to an address |
| `err` | server→client | error; routed to pending request callback if `correlationId` present, otherwise to address subscribers or global `onError` |

### Internal routing

The `Ripple` class maintains two separate maps:

- **`subscriptions`** — `address → MessageCallback[]`. `registerHandler` sends the `register` wire message only for the *first* handler at an address; `unregisterHandler` sends `unregister` only when the *last* handler is removed.
- **`pendingRequests`** — `correlationId → MessageCallback`. Populated by `request()`, consumed and deleted on `reply` or correlated `err`.

All public methods throw `"INVALID_STATE_ERR"` if the connection is not in `OPEN` state.

### Callback signature

Every `MessageCallback` follows `(body, error)`: exactly one of the two is non-null. Successful messages pass `(body, null)`; errors pass `(null, errorObject)`.
