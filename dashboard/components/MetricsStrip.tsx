// dashboard/components/MetricsStrip.tsx
//
// Four live counters at the top of the dashboard. Values seed from
// initialRoutes (fetched once at mount) so the bar isn't zeroed out on
// page load; WebSocket events update the counters on top. Each new
// update flashes a delta badge (↑/↓) for 5 seconds.

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RouteStop, RouteWithStops } from "./Map";
import type { ConnectionStatus, WebSocketEvent } from "../hooks/useWebSocket";


// ---- props --------------------------------------------------------------

export interface MetricsStripProps {
  events: WebSocketEvent[];
  status: ConnectionStatus;
  /** Routes fetched once at mount so initial metrics are non-zero. */
  initialRoutes?: RouteWithStops[];
}


// ---- event payload shapes -----------------------------------------------

interface PerStopEta {
  task_id: string;
  arrival_time_hm: string;
  arrival_mins_from_start: number;
  distance_km_so_far: number;
  late: boolean;
}

interface RouteUpdatedPayload {
  worker_id: string;
  version: number;
  total_distance_km: number;
  total_time_mins: number;
  per_stop_etas: PerStopEta[];
}


// ---- metric derivation --------------------------------------------------

interface Metrics {
  onTimePct: number;
  totalStops: number;
  onTimeStops: number;
  fleetKm: number;
  tasksAtRisk: number;
  replanCount: number;
}

function emptyMetrics(): Metrics {
  return {
    onTimePct: 100,
    totalStops: 0,
    onTimeStops: 0,
    fleetKm: 0,
    tasksAtRisk: 0,
    replanCount: 0,
  };
}

/** Initial metrics from the /routes response — before any WebSocket
 *  event arrives. `late` per stop comes from the backend's route_planner
 *  time-window check. */
function metricsFromInitial(routes: RouteWithStops[] | undefined): Metrics {
  const m = emptyMetrics();
  if (!routes) return m;
  for (const r of routes) {
    m.fleetKm += r.total_distance_km ?? 0;
    for (const s of r.per_stop_etas ?? []) {
      m.totalStops += 1;
      if (s.late) m.tasksAtRisk += 1;
      else m.onTimeStops += 1;
    }
  }
  m.onTimePct = m.totalStops === 0
    ? 100
    : Math.round((m.onTimeStops / m.totalStops) * 100);
  return m;
}

/** Fold ROUTE_UPDATED events into the initial metric baseline. Each
 *  worker's latest ROUTE_UPDATED replaces their contribution from the
 *  initial snapshot. Non-startup replans also increment replanCount. */
function metricsFromEvents(
  initial: Metrics,
  events: WebSocketEvent[],
  initialByWorker: Map<string, RouteWithStops>,
): Metrics {
  const latestByWorker = new Map<string, RouteUpdatedPayload>();
  let replanCount = 0;
  for (const e of events) {
    if (e.event_type !== "ROUTE_UPDATED") continue;
    const p = e.payload as unknown as RouteUpdatedPayload;
    if (!p?.worker_id || typeof p.version !== "number") continue;
    if (!e.correlation_id.startsWith("startup-")) {
      replanCount += 1;
    }
    const prev = latestByWorker.get(p.worker_id);
    if (!prev || p.version > prev.version) {
      latestByWorker.set(p.worker_id, p);
    }
  }

  let onTimeStops = initial.onTimeStops;
  let totalStops = initial.totalStops;
  let fleetKm = initial.fleetKm;
  let tasksAtRisk = initial.tasksAtRisk;

  for (const [wid, route] of latestByWorker.entries()) {
    // Subtract this worker's initial contribution (if any) and re-add
    // from the latest event.
    const prior = initialByWorker.get(wid);
    if (prior) {
      fleetKm -= prior.total_distance_km ?? 0;
      for (const s of prior.per_stop_etas ?? []) {
        totalStops -= 1;
        if (s.late) tasksAtRisk -= 1;
        else onTimeStops -= 1;
      }
    }
    fleetKm += route.total_distance_km ?? 0;
    for (const s of route.per_stop_etas ?? []) {
      totalStops += 1;
      if (s.late) tasksAtRisk += 1;
      else onTimeStops += 1;
    }
  }
  const onTimePct =
    totalStops === 0 ? 100 : Math.round((onTimeStops / totalStops) * 100);
  return {
    onTimePct, totalStops, onTimeStops,
    fleetKm: Math.max(0, fleetKm),
    tasksAtRisk: Math.max(0, tasksAtRisk),
    replanCount,
  };
}


// ---- colour thresholds --------------------------------------------------

function onTimeDot(pct: number, totalStops: number): string {
  if (totalStops === 0) return "bg-slate-400";
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-rose-500";
}

function atRiskDot(count: number): string {
  if (count === 0) return "bg-emerald-500";
  if (count <= 3) return "bg-amber-500";
  return "bg-rose-500";
}


// ---- delta badge -------------------------------------------------------

type DeltaTone = "up-good" | "up-bad" | "down-good" | "down-bad" | "neutral";

interface DeltaInfo {
  arrow: "↑" | "↓";
  text: string;
  tone: DeltaTone;
}

function DeltaBadge({ info }: { info: DeltaInfo | null }): JSX.Element | null {
  if (!info) return null;
  const tone = {
    "up-good":   "text-emerald-600",
    "down-good": "text-emerald-600",
    "up-bad":    "text-rose-600",
    "down-bad":  "text-rose-600",
    neutral:     "text-amber-600",
  }[info.tone];
  return (
    <span
      className={`ml-2 inline-flex items-center gap-0.5 text-xs font-semibold ${tone} delta-fade`}
      aria-hidden
    >
      <span>{info.arrow}</span>
      <span className="tabular-nums">{info.text}</span>
      <style jsx>{`
        .delta-fade {
          animation: fade-out 5s ease forwards;
        }
        @keyframes fade-out {
          0%  { opacity: 1; transform: translateY(-2px); }
          20% { opacity: 1; transform: translateY(0); }
          100%{ opacity: 0; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}


// ---- presentational helpers --------------------------------------------

interface TileProps {
  label: string;
  value: string;
  sublabel: string;
  dotColor: string;
  delta: DeltaInfo | null;
}

function Tile({ label, value, sublabel, dotColor, delta }: TileProps): JSX.Element {
  return (
    <div className="flex flex-col px-6 py-4 flex-1 min-w-0">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden />
        <span className="text-2xl font-semibold text-slate-900 tabular-nums">
          {value}
        </span>
        <DeltaBadge info={delta} />
      </div>
      <div className="mt-1 text-xs text-slate-500">{sublabel}</div>
    </div>
  );
}

function StatusBanner({ status }: { status: ConnectionStatus }): JSX.Element | null {
  if (status === "open") return null;
  const copy: Record<Exclude<ConnectionStatus, "open">, string> = {
    connecting: "Connecting to event stream…",
    closed: "Connection closed. Retrying…",
    error: "Connection lost after 5 retries. Refresh the page to reconnect.",
  };
  const tone =
    status === "error"
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <div className={`border-b px-4 py-1.5 text-xs ${tone}`} role="status">
      {copy[status]}
    </div>
  );
}


// ---- component ---------------------------------------------------------

export function MetricsStrip({
  events,
  status,
  initialRoutes,
}: MetricsStripProps): JSX.Element {
  const baseline = useMemo(
    () => metricsFromInitial(initialRoutes),
    [initialRoutes],
  );
  const initialByWorker = useMemo(() => {
    const m = new Map<string, RouteWithStops>();
    for (const r of initialRoutes ?? []) m.set(r.worker_id, r);
    return m;
  }, [initialRoutes]);

  const metrics = useMemo(
    () => metricsFromEvents(baseline, events, initialByWorker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events.length, baseline, initialByWorker],
  );

  // Track prior metrics to compute deltas.
  const prevRef = useRef<Metrics>(baseline);
  const [deltas, setDeltas] = useState<{
    onTime: DeltaInfo | null;
    fleetKm: DeltaInfo | null;
    atRisk: DeltaInfo | null;
    replan: DeltaInfo | null;
  }>({ onTime: null, fleetKm: null, atRisk: null, replan: null });

  useEffect(() => {
    // Compare metrics against the previous snapshot; emit delta badges
    // that auto-fade via the CSS animation on DeltaBadge.
    const prev = prevRef.current;
    const out = { onTime: null, fleetKm: null, atRisk: null, replan: null } as {
      onTime: DeltaInfo | null;
      fleetKm: DeltaInfo | null;
      atRisk: DeltaInfo | null;
      replan: DeltaInfo | null;
    };
    const dOt = metrics.onTimePct - prev.onTimePct;
    if (dOt !== 0 && metrics.totalStops > 0) {
      out.onTime = {
        arrow: dOt > 0 ? "↑" : "↓",
        text: `${dOt > 0 ? "+" : ""}${dOt}%`,
        tone: dOt > 0 ? "up-good" : "down-bad",
      };
    }
    const dKm = metrics.fleetKm - prev.fleetKm;
    if (Math.abs(dKm) >= 0.1) {
      out.fleetKm = {
        arrow: dKm > 0 ? "↑" : "↓",
        text: `${dKm > 0 ? "+" : ""}${dKm.toFixed(1)} km`,
        tone: dKm > 0 ? "up-bad" : "down-good",
      };
    }
    const dRisk = metrics.tasksAtRisk - prev.tasksAtRisk;
    if (dRisk !== 0) {
      out.atRisk = {
        arrow: dRisk > 0 ? "↑" : "↓",
        text: `${dRisk > 0 ? "+" : ""}${dRisk}`,
        tone: dRisk > 0 ? "up-bad" : "down-good",
      };
    }
    const dReplan = metrics.replanCount - prev.replanCount;
    if (dReplan > 0) {
      out.replan = {
        arrow: "↑",
        text: `+${dReplan}`,
        tone: "neutral",
      };
    }
    // Only update state (and trigger fade) if any delta is non-null —
    // otherwise we'd re-start the animation every render.
    if (out.onTime || out.fleetKm || out.atRisk || out.replan) {
      setDeltas(out);
    }
    prevRef.current = metrics;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    metrics.onTimePct, metrics.fleetKm, metrics.tasksAtRisk,
    metrics.replanCount,
  ]);

  const onTimeValue = metrics.totalStops === 0 ? "—" : `${metrics.onTimePct}%`;
  const onTimeSub =
    metrics.totalStops === 0
      ? "no stops yet"
      : `of ${metrics.totalStops} stops`;

  // Active alerts — POST_ALLOCATION_ALERT events from non-startup
  // correlations that haven't been superseded. We count distinct
  // (worker_id, alert_type) pairs so a long flow that re-fires the same
  // alert type doesn't double-count.
  const activeAlerts = useMemo(() => {
    const live = new Set<string>();
    for (const e of events) {
      if (e.event_type !== "POST_ALLOCATION_ALERT") continue;
      const cid = e.correlation_id || "";
      if (cid.startsWith("startup-") || cid.startsWith("reset-")) continue;
      const p = e.payload as { worker_id?: string; type?: string };
      if (p?.worker_id && p?.type) {
        live.add(`${p.worker_id}:${p.type}`);
      }
    }
    return live.size;
  }, [events.length]);

  const alertDot =
    activeAlerts === 0
      ? "bg-emerald-500"
      : activeAlerts === 1
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="border-b border-slate-200 bg-white">
      <StatusBanner status={status} />
      <div className="flex divide-x divide-slate-200">
        <Tile
          label="On-time %"
          value={onTimeValue}
          sublabel={onTimeSub}
          dotColor={onTimeDot(metrics.onTimePct, metrics.totalStops)}
          delta={deltas.onTime}
        />
        <Tile
          label="Fleet km"
          value={metrics.fleetKm.toFixed(1)}
          sublabel="total today"
          dotColor="bg-slate-400"
          delta={deltas.fleetKm}
        />
        <Tile
          label="Tasks at risk"
          value={String(metrics.tasksAtRisk)}
          sublabel="window slip"
          dotColor={atRiskDot(metrics.tasksAtRisk)}
          delta={deltas.atRisk}
        />
        <Tile
          label="Replan count"
          value={String(metrics.replanCount)}
          sublabel="reallocations"
          dotColor="bg-slate-400"
          delta={deltas.replan}
        />
        <Tile
          label="Active alerts"
          value={String(activeAlerts)}
          sublabel={activeAlerts === 0 ? "monitoring" : "needs attention"}
          dotColor={alertDot}
          delta={null}
        />
      </div>
    </div>
  );
}
