// Smoke test for useWebSocket — drives the testable EventStreamController
// directly with a mock WebSocket and an injectable fake timer. No React
// rendering required.
//
// Run: `npx tsx hooks/useWebSocket.test.ts` from dashboard/

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ConnectionStatus,
  DEFAULT_MAX_EVENTS,
  EventStreamController,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_MS,
  WebSocketEvent,
  WebSocketLike,
} from "./useWebSocket.ts";


// ---- mocks --------------------------------------------------------------

class MockWebSocket implements WebSocketLike {
  private listeners: Record<string, Array<(e: any) => void>> = {};
  constructor(public url: string) {}
  addEventListener(type: string, fn: (e: any) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: any) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  close(): void {
    this.fire("close", {});
  }
  simulateOpen(): void { this.fire("open", {}); }
  simulateMessage(data: string): void { this.fire("message", { data }); }
  simulateClose(): void { this.fire("close", {}); }
  simulateError(): void { this.fire("error", {}); }
  private fire(type: string, ev: any): void {
    (this.listeners[type] ?? []).forEach((fn) => fn(ev));
  }
}


class FakeTimer {
  private scheduled: Array<{ id: number; fn: () => void; delay: number }> = [];
  private nextId = 1;
  setTimeout = (fn: () => void, delay: number): number => {
    const id = this.nextId++;
    this.scheduled.push({ id, fn, delay });
    return id;
  };
  clearTimeout = (id: number): void => {
    this.scheduled = this.scheduled.filter((s) => s.id !== id);
  };
  /** Fire every pending timer synchronously. Returns how many fired. */
  flush(): number {
    const batch = this.scheduled;
    this.scheduled = [];
    batch.forEach((s) => s.fn());
    return batch.length;
  }
  /** The delay values of timers currently pending. */
  pending(): number[] {
    return this.scheduled.map((s) => s.delay);
  }
}


function buildEvent(i: number, type = "TASK_CREATED"): WebSocketEvent {
  return {
    id: `evt-${i}`,
    event_type: type,
    payload: { i },
    agent: "test",
    correlation_id: `corr-${i}`,
    human_label: `Event ${i}`,
    timestamp: new Date().toISOString(),
  };
}


// Helper to build a controller with a freshly created MockWebSocket.
function setup(opts: {
  eventTypes?: string[];
  maxEvents?: number;
  autoReconnect?: boolean;
  reconnectMs?: number;
} = {}) {
  const sockets: MockWebSocket[] = [];
  const timer = new FakeTimer();
  let changes = 0;
  const ctrl = new EventStreamController(
    "ws://test",
    opts.maxEvents ?? DEFAULT_MAX_EVENTS,
    opts.reconnectMs ?? 1000,
    opts.autoReconnect ?? true,
    opts.eventTypes,
    () => { changes += 1; },
    {
      wsFactory: (url) => {
        const s = new MockWebSocket(url);
        sockets.push(s);
        return s;
      },
      setTimeoutFn: timer.setTimeout,
      clearTimeoutFn: timer.clearTimeout,
    },
  );
  ctrl.connect();
  return {
    ctrl, timer,
    socket: () => sockets[sockets.length - 1],
    sockets,
    get changes() { return changes; },
  };
}


// ---- tests --------------------------------------------------------------

test("1. events land in the buffer in order", () => {
  const { ctrl, socket } = setup();
  socket().simulateOpen();
  assert.equal(ctrl.status, "open");
  socket().simulateMessage(JSON.stringify(buildEvent(1)));
  socket().simulateMessage(JSON.stringify(buildEvent(2)));
  socket().simulateMessage(JSON.stringify(buildEvent(3)));
  assert.equal(ctrl.events.length, 3);
  assert.deepEqual(ctrl.events.map((e) => e.id), ["evt-1", "evt-2", "evt-3"]);
  assert.equal(ctrl.latestEvent?.id, "evt-3");
  ctrl.close();
});


test("2. eventTypes filter keeps only allowed types", () => {
  const { ctrl, socket } = setup({ eventTypes: ["TASK_CREATED", "ROUTE_UPDATED"] });
  socket().simulateOpen();
  socket().simulateMessage(JSON.stringify(buildEvent(1, "TASK_CREATED")));
  socket().simulateMessage(JSON.stringify(buildEvent(2, "LOCATION_UPDATE")));  // filtered
  socket().simulateMessage(JSON.stringify(buildEvent(3, "ROUTE_UPDATED")));
  socket().simulateMessage(JSON.stringify(buildEvent(4, "ESCALATION_REQUIRED"))); // filtered
  assert.equal(ctrl.events.length, 2);
  assert.deepEqual(ctrl.events.map((e) => e.event_type),
                   ["TASK_CREATED", "ROUTE_UPDATED"]);
  ctrl.close();
});


test("3. ring buffer rolls over at 500 — oldest dropped when 501st arrives", () => {
  const { ctrl, socket } = setup({ maxEvents: 500 });
  socket().simulateOpen();
  for (let i = 1; i <= 500; i++) {
    socket().simulateMessage(JSON.stringify(buildEvent(i)));
  }
  assert.equal(ctrl.events.length, 500);
  assert.equal(ctrl.events[0].id, "evt-1");           // oldest
  assert.equal(ctrl.events[499].id, "evt-500");       // newest

  socket().simulateMessage(JSON.stringify(buildEvent(501)));
  assert.equal(ctrl.events.length, 500, "buffer capped at maxEvents");
  assert.equal(ctrl.events[0].id, "evt-2",  "oldest event dropped");
  assert.equal(ctrl.events[499].id, "evt-501", "newest event appended");
  ctrl.close();
});


test("4. reconnect fires after close; status transitions correctly", () => {
  const { ctrl, timer, socket, sockets } = setup();
  socket().simulateOpen();
  assert.equal(ctrl.status, "open");

  socket().simulateClose();
  assert.equal(ctrl.status, "closed", "close event → status=closed");
  assert.equal(timer.pending().length, 1, "one reconnect timer scheduled");
  assert.equal(timer.pending()[0], 1000, "first retry backs off to base delay 1000ms");

  // Fire the reconnect timer — should create a second socket.
  const fired = timer.flush();
  assert.equal(fired, 1);
  assert.equal(sockets.length, 2, "new WebSocket constructed for reconnect");
  assert.equal(ctrl.status, "connecting", "status returns to connecting during reconnect");
  socket().simulateOpen();
  assert.equal(ctrl.status, "open", "reconnected socket reaches open");
  ctrl.close();
});


test("5. status='error' after 5 consecutive failures, retries stop", () => {
  const { ctrl, timer, socket, sockets } = setup({ reconnectMs: 1000 });
  // 5 failed attempts: each simulateClose schedules a retry (attempts 1..5);
  // after the 6th close (the 6th attempt), status flips to error.
  const expectedDelays = [1000, 2000, 4000, 8000, MAX_RECONNECT_MS];
  const observedDelays: number[] = [];

  socket().simulateClose();                              // attempt 1 scheduled
  for (let i = 0; i < 5; i++) {
    observedDelays.push(timer.pending()[0]);
    if (ctrl.status === "error") break;
    timer.flush();                                       // fire scheduled retry → new socket
    socket().simulateClose();                            // immediately fails again
  }

  // Sanity: first 5 retry delays follow the exponential curve
  assert.deepEqual(observedDelays.slice(0, 5), expectedDelays,
                   `observed=${observedDelays} expected=${expectedDelays}`);
  assert.equal(ctrl.status, "error",
               `after ${MAX_RECONNECT_ATTEMPTS} failures, status must be 'error'`);
  assert.equal(timer.pending().length, 0, "no further retries scheduled once in error");

  // Confirming no further sockets created after error state:
  const socketsAtError = sockets.length;
  timer.flush();
  assert.equal(sockets.length, socketsAtError,
               "no new socket after error state reached");

  ctrl.close();
});
