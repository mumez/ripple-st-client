export interface RippleOptions {
  headers?: Record<string, string>;
  ping_interval?: number;
  onOpen?: (ripple: Ripple) => void;
  onClose?: (ripple: Ripple) => void;
  onError?: (error: RippleError) => void;
}

export interface RippleError {
  type: "err";
  failureType: string;
  failureCode: number;
  message: string;
  correlationId?: string;
}

export type MessageCallback = (body: unknown, error: RippleError | null) => void;

export declare class Ripple {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;

  state: 0 | 1 | 2 | 3;
  headers: Record<string, string>;
  subscriptions: Map<string, MessageCallback[]>;
  pendingRequests: Map<string, MessageCallback>;

  constructor(url: string, options?: RippleOptions);

  onClose(handler: (ripple: Ripple) => void): void;
  onOpen(handler: (ripple: Ripple) => void): void;
  onError(handler: (error: RippleError) => void): void;

  request(address: string, message: unknown, callback?: MessageCallback): void;
  send(address: string, message: unknown): void;
  publish(address: string, message: unknown): void;
  registerHandler(address: string, callback: MessageCallback): void;
  unregisterHandler(address: string, callback: MessageCallback): void;
  close(): void;
}
