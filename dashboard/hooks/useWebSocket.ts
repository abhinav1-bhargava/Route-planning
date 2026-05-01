// dashboard/hooks/useWebSocket.ts
//
// React hook for the /ws/events stream.
//   - Ring buffer capped at 500 events (oldest discarded on overflow)
//   - Exponential-backoff reconnect: 1s → 2s → 4s → 8s → 10s cap,
//     max 5 consecutive failures, then status="error" and stop
//   - eventTypes filter applied at the hook boundary (filtered events
//     never enter the buffer)
//   - One WebSocket per hook instance (per-component pattern — no shared
//     context at this stage)
//
// The non-React state machine lives in EventStreamController so it can
// be smoke-tested without a DOM/React renderer. The hook is a thin
// wrapper that binds the controller to useState/useEffect.

import { useCallback, useEffect, useRef, useState } from "react";


// ---- public types -------------------------------------------------------

export interface WebSocketEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  agent: string;
  correlation_id: string;
  human_label: string;
  timestamp: string;
}

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface UseWebSocketOptions {
  /** Ring buffer cap. When full, oldest events are discarded. Default 500. */
  maxEvents?: number;
  /** Base reconnect delay (ms). Doubles per failure, capped at 10s. Default 1000. */
  reconnectMs?: number;
  /** Auto-reconnect on close. Default true. */
  autoReconnect?: boolean;
  /** Allow-list of event types. `undefined` lets all events through. */
  eventTypes?: string[];
}

export interface UseWebSocketReturn {
  events: WebSocketEvent[];
  latestEvent: WebSocketEvent | null;
  status: ConnectionStatus;
  clear: () => void;
}


// ---- constants ----------------------------------------------------------

export const DEFAULT_MAX_EVENTS = 500;
export const DEFAULT_RECONNECT_MS = 1000;
export const MAX_RECONNECT_MS = 10_000;
export const MAX_RECONNECT_ATTEMPTS = 5;


// ---- testable state machine --------------------------------------------
//
// Exported so the smoke test can drive it directly with a mock WebSocket
// and injectable timers. Not part of the hook's public consumer surface —
// dashboard components should use the useWebSocket hook below.

export interface WebSocketLike {
  close(): void;
  addEventListener(type: string, listener: (ev: any) => void): void;
  removeEventListener?(type: string, listener: (ev: any) => void): void;
}

export interface ControllerDeps {
  wsFactory?: (url: string) => WebSocketLike;
  setTimeoutFn?: (fn: () => void, ms: number) => any;
  clearTimeoutFn?: (handle: any) => void;
}

export class EventStreamController {
  events: WebSocketEvent[] = [];
  latestEvent: WebSocketEvent | null = null;
  status: ConnectionStatus = "connecting";

  private ws: WebSocketLike | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private shutdown = false;
  private filterSet: Set<string> | null;
  private readonly wsFactory: (url: string) => WebSocketLike;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => any;
  private readonly clearTimeoutFn: (handle: any) => void;

  constructor(
    private readonly url: string,
    private readonly maxEvents: number,
    private readonly reconnectMs: number,
    private readonly autoReconnect: boolean,
    eventTypes: string[] | undefined,
    private readonly onChange: () => void,
    deps: ControllerDeps = {},
  ) {
    this.filterSet = eventTypes ? new Set(eventTypes) : null;
    this.wsFactory = deps.wsFactory ?? ((u) => new WebSocket(u) as WebSocketLike);
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h));
  }

  connect(): void {
    if (this.shutdown) return;
    this.status = "connecting";
    this.onChange();

    let ws: WebSocketLike;
    try {
      ws = this.wsFactory(this.url);
    } catch {
      this.handleClose();
      return;
    }
    this.ws = ws;
    ws.addEventListener("open", () => this.handleOpen());
    ws.addEventListener("message", (e: any) => this.handleMessage(e?.data));
    ws.addEventListener("close", () => this.handleClose());
    ws.addEventListener("error", () => {
      // Rely on the subsequent close event to drive reconnect.
    });
  }

  close(): void {
    this.shutdown = true;
    if (this.reconnectTimer !== null) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  clear(): void {
    this.events = [];
    this.latestEvent = null;
    this.onChange();
  }

  setEventTypes(types: string[] | undefined): void {
    this.filterSet = types ? new Set(types) : null;
  }

  // ---- internal event handlers ----

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.status = "open";
    this.onChange();
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let data: WebSocketEvent;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // drop malformed frames silently
    }
    if (this.filterSet && !this.filterSet.has(data.event_type)) return;

    const next = [...this.events, data];
    this.events = next.length > this.maxEvents
      ? next.slice(next.length - this.maxEvents)
      : next;
    this.latestEvent = data;
    this.onChange();
  }

  private handleClose(): void {
    if (this.shutdown) return;
    this.ws = null;

    if (!this.autoReconnect) {
      this.status = "closed";
      this.onChange();
      return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.status = "error";
      this.onChange();
      return;
    }

    this.status = "closed";
    this.onChange();

    const delay = Math.min(
      this.reconnectMs * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_MS,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}


// ---- the hook -----------------------------------------------------------

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const {
    maxEvents = DEFAULT_MAX_EVENTS,
    reconnectMs = DEFAULT_RECONNECT_MS,
    autoReconnect = true,
    eventTypes,
  } = options;

  const [events, setEvents] = useState<WebSocketEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<WebSocketEvent | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const controllerRef = useRef<EventStreamController | null>(null);

  useEffect(() => {
    const controller = new EventStreamController(
      url, maxEvents, reconnectMs, autoReconnect, eventTypes,
      () => {
        setEvents([...controller.events]);
        setLatestEvent(controller.latestEvent);
        setStatus(controller.status);
      },
    );
    controllerRef.current = controller;
    controller.connect();
    return () => {
      controller.close();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
    // url/options are the stable deps; eventTypes updates go through the
    // effect below without tearing down the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, maxEvents, reconnectMs, autoReconnect]);

  useEffect(() => {
    controllerRef.current?.setEventTypes(eventTypes);
    // Identity compare on eventTypes — consumers should memoize the array
    // or the effect becomes a no-op-but-runs on every render (harmless).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTypes]);

  const clear = useCallback(() => {
    controllerRef.current?.clear();
    setEvents([]);
    setLatestEvent(null);
  }, []);

  return { events, latestEvent, status, clear };
}
