// dashboard/components/WorkerPanel.tsx
//
// Ten worker cards. Static roster fetched once by pages/index.tsx; live
// status + route overlay derived from the WebSocket event stream. The
// worker whose id matches `activeWorkerId` is highlighted (★ + amber
// tint) so the audience can follow "who is this reallocation about?"
// during a demo.

import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";

import { workerColor } from "../lib/workerColor";
import type { WebSocketEvent } from "../hooks/useWebSocket";
import type { RouteWithStops, Task } from "./Map";


// ---- props + types ------------------------------------------------------

export type WorkerStatus = "idle" | "en_route" | "on_site";

export interface Worker {
  id: string;
  name: string;
  current_lat: number;
  current_lng: number;
  status: WorkerStatus;
  skill_tags: string[];
  shift_end_time: string;
  assigned_task_ids: string[];
}

export interface WorkerPanelProps {
  workers: Worker[];
  tasks: Task[];
  events: WebSocketEvent[];
  /** Routes fetched at mount by pages/index.tsx so cards display route
   *  info (next stop, ETA, total km) on first paint — before any
   *  ROUTE_UPDATED event has arrived over the WebSocket. */
  initialRoutes?: RouteWithStops[];
  /** id of the worker to highlight (active flow). Usually derived in
   *  pages/index.tsx as the `payload.worker_id` of the latest non-startup
   *  event. */
  activeWorkerId?: string;
  /** Worker id picked by user via card or map-marker click. */
  selectedWorkerId?: string | null;
  /** Callback fired when a card is clicked; keeps map/panel in sync. */
  onWorkerSelect?: (workerId: string | null) => void;
}

/** Numeric sort by trailing digits so W1, W2, …, W10 appear in order
 *  rather than the default lexical W1, W10, W2, … which made the panel
 *  look like it was missing workers. */
function sortWorkersByIdNumeric(workers: Worker[]): Worker[] {
  const num = (id: string): number => {
    const m = id.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };
  return [...workers].sort((a, b) => num(a.id) - num(b.id));
}

// Task-type emoji for the expanded task list (per user spec).
const TASK_TYPE_ICON: Record<string, string> = {
  new_installation: "🔧",
  fault_repair: "⚡",
  network_rehab: "🔁",
  fiber_cut: "🔴",
};

const TASK_STATUS_COLOR: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  assigned: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  deferred: "bg-rose-100 text-rose-800",
};


// ---- skill chip palette --------------------------------------------------
// Skills come from the Worker object returned by GET /workers. No hardcoded
// per-worker lookups — the API is the source of truth.

const SKILL_CHIP: Record<string, string> = {
  installation:  "bg-blue-100 text-blue-800 border-blue-200",
  fault:         "bg-red-100 text-red-800 border-red-200",
  network_rehab: "bg-orange-100 text-orange-800 border-orange-200",
  fiber_cut:     "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function skillChipClass(skill: string): string {
  return (
    SKILL_CHIP[skill] ?? "bg-slate-100 text-slate-700 border-slate-200"
  );
}


// ---- event payload shapes -----------------------------------------------

interface NormalizedStop {
  task_id: string;
  arrival_time_hm: string;
  distance_km_so_far: number;
  late: boolean;
}

interface NormalizedRoute {
  worker_id: string;
  version: number;
  total_distance_km: number;
  total_time_mins: number;
  ordered_task_ids: string[];
  per_stop_etas: NormalizedStop[];
}

interface RouteUpdatedPayload {
  worker_id: string;
  version: number;
  total_distance_km: number;
  total_time_mins: number;
  ordered_task_ids: string[];
  per_stop_etas: Array<{
    task_id: string;
    arrival_time_hm?: string;
    arrival_time?: string;
    distance_km_so_far: number;
    late: boolean;
  }>;
}

interface LocationUpdatePayload {
  worker_id: string;
  status?: WorkerStatus;
  current_lat?: number;
  current_lng?: number;
}


// ---- live-state derivation ---------------------------------------------

interface LiveState {
  status?: WorkerStatus;
  route?: NormalizedRoute;
}

/** Normalize route stops from either the /routes REST shape (uses
 *  `arrival_time`) or ROUTE_UPDATED event payload shape (uses
 *  `arrival_time_hm`) into a single in-component shape. */
function normalizeRoute(
  src: {
    worker_id: string;
    version: number;
    total_distance_km: number;
    total_time_mins: number;
    ordered_task_ids: string[];
    per_stop_etas: Array<{
      task_id: string;
      arrival_time_hm?: string;
      arrival_time?: string;
      distance_km_so_far: number;
      late?: boolean;
    }>;
  },
): NormalizedRoute {
  return {
    worker_id: src.worker_id,
    version: src.version,
    total_distance_km: src.total_distance_km,
    total_time_mins: src.total_time_mins,
    ordered_task_ids: src.ordered_task_ids,
    per_stop_etas: (src.per_stop_etas ?? []).map((s) => ({
      task_id: s.task_id,
      arrival_time_hm: s.arrival_time_hm ?? s.arrival_time ?? "",
      distance_km_so_far: s.distance_km_so_far ?? 0,
      late: !!s.late,
    })),
  };
}

function deriveLiveState(
  events: WebSocketEvent[],
  initialRoutes?: RouteWithStops[],
): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  // Seed from initialRoutes so cards show route info on first paint.
  for (const r of initialRoutes ?? []) {
    if (!r?.worker_id) continue;
    if ((r.ordered_task_ids?.length ?? 0) === 0) continue;
    out.set(r.worker_id, {
      route: normalizeRoute({
        worker_id: r.worker_id,
        version: r.version ?? 0,
        total_distance_km: r.total_distance_km ?? 0,
        total_time_mins: r.total_time_mins ?? 0,
        ordered_task_ids: r.ordered_task_ids ?? [],
        per_stop_etas: r.per_stop_etas ?? [],
      }),
    });
  }
  for (const e of events) {
    if (e.event_type === "LOCATION_UPDATE") {
      const p = e.payload as unknown as LocationUpdatePayload;
      if (!p?.worker_id) continue;
      const ls = out.get(p.worker_id) ?? {};
      if (p.status) ls.status = p.status;
      out.set(p.worker_id, ls);
    } else if (e.event_type === "ROUTE_UPDATED") {
      const p = e.payload as unknown as RouteUpdatedPayload;
      if (!p?.worker_id || typeof p.version !== "number") continue;
      const ls = out.get(p.worker_id) ?? {};
      if (!ls.route || p.version >= ls.route.version) {
        ls.route = normalizeRoute(p);
      }
      out.set(p.worker_id, ls);
    }
  }
  return out;
}


// ---- presentation helpers ----------------------------------------------

function StatusBadge({ status }: { status: WorkerStatus }): JSX.Element {
  const palette: Record<WorkerStatus, { icon: string; color: string; label: string }> = {
    idle:     { icon: "○", color: "text-slate-500",   label: "idle" },
    en_route: { icon: "▶", color: "text-emerald-600", label: "en route" },
    on_site:  { icon: "●", color: "text-amber-600",   label: "on site" },
  };
  const s = palette[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${s.color}`}>
      <span aria-hidden>{s.icon}</span>
      <span>{s.label}</span>
    </span>
  );
}


interface WorkerCardProps {
  worker: Worker;
  liveStatus: WorkerStatus;
  route: NormalizedRoute | undefined;
  isActive: boolean;
  isSelected: boolean;
  onSelect?: (workerId: string | null) => void;
  tasks: Task[];
}

function TaskRow({ task }: { task: Task }): JSX.Element {
  const icon = TASK_TYPE_ICON[task.task_type] ?? "•";
  const addr =
    task.address.length > 30 ? task.address.slice(0, 29) + "…" : task.address;
  const statusClass =
    TASK_STATUS_COLOR[task.status] ?? "bg-slate-200 text-slate-700";
  return (
    <li className="flex items-center gap-2 py-1 text-xs text-slate-600">
      <span aria-hidden className="text-sm">
        {icon}
      </span>
      <span className="truncate flex-1">{addr}</span>
      <span className="font-mono tabular-nums text-slate-500">
        {task.scheduled_time}
      </span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>
        {task.status}
      </span>
    </li>
  );
}

function SkillChips({ skills }: { skills: string[] }): JSX.Element {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {skills.map((s) => (
        <span
          key={s}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${skillChipClass(s)}`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// Default to the relative /api prefix so the dashboard works behind any
// host (localhost, ngrok, App Platform). NEXT_PUBLIC_API_URL is a knob
// for deployments that need an absolute URL.
const API_URL_ENV = process.env.NEXT_PUBLIC_API_URL || "/api";

function WorkerCard({
  worker,
  liveStatus,
  route,
  isActive,
  isSelected,
  onSelect,
  tasks,
}: WorkerCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [remainingMins, setRemainingMins] = useState<number | null>(null);
  const routeColor = workerColor(worker.id);
  const taskCount =
    route?.ordered_task_ids?.length ?? worker.assigned_task_ids.length;
  const stops = route?.per_stop_etas ?? [];
  const nextStop = stops[0];
  const lastStop = stops[stops.length - 1];

  // On-site countdown: poll /workers/{id}/remaining once on mount and
  // every 60 s thereafter while status === "on_site". Stops polling
  // immediately when the worker leaves on_site to avoid a stale ping.
  useEffect(() => {
    if (liveStatus !== "on_site") {
      setRemainingMins(null);
      return;
    }
    let cancelled = false;
    const fetchRemaining = async () => {
      try {
        const res = await fetch(
          `${API_URL_ENV}/workers/${worker.id}/remaining`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && typeof json?.remaining_mins === "number") {
          setRemainingMins(json.remaining_mins);
        }
      } catch {
        // network blips are non-fatal — keep prior value
      }
    };
    void fetchRemaining();
    const id = setInterval(fetchRemaining, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [worker.id, liveStatus]);

  return (
    <li
      onClick={() => {
        if (onSelect) onSelect(isSelected ? null : worker.id);
      }}
      style={
        isSelected
          ? { borderLeftColor: routeColor, borderLeftWidth: "4px" }
          : undefined
      }
      className={`cursor-pointer border-l-4 px-4 py-3 transition-colors ${
        isActive && !isSelected
          ? "border-l-amber-500 bg-amber-50"
          : isSelected
            ? "bg-slate-50"
            : "border-l-transparent hover:bg-slate-50"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            aria-hidden
            className={`text-sm ${isActive ? "text-amber-600" : "text-slate-300"}`}
          >
            {isActive ? "★" : "●"}
          </span>
          <span className="font-mono text-xs font-semibold text-slate-700">
            {worker.id}
          </span>
          <span className="truncate text-sm font-medium text-slate-900">
            {worker.name}
          </span>
        </div>
        <StatusBadge status={liveStatus} />
      </div>

      <SkillChips skills={worker.skill_tags} />

      <div className="mt-1 text-xs tabular-nums text-slate-400">
        {taskCount} task{taskCount === 1 ? "" : "s"}
      </div>

      {liveStatus === "on_site" && remainingMins !== null && (
        <div className="mt-1 text-xs text-amber-700">
          🔨 ~{remainingMins} min{remainingMins === 1 ? "" : "s"}{" "}
          remaining at site
        </div>
      )}

      {nextStop ? (
        <>
          <div className="mt-1 text-xs text-slate-600">
            <span className="text-slate-400">Next:</span>{" "}
            <span className="font-mono">{nextStop.task_id}</span>{" "}
            <span className="tabular-nums">{nextStop.arrival_time_hm}</span>
            {" · "}
            <span className="tabular-nums">
              {nextStop.distance_km_so_far.toFixed(1)} km
            </span>
            {nextStop.late && (
              <span className="ml-1 rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-800">
                LATE
              </span>
            )}
          </div>
          {lastStop && route && (
            <div className="text-xs text-slate-400">
              <span>Route:</span>{" "}
              <span className="tabular-nums">{lastStop.arrival_time_hm}</span> end
              {" · "}
              <span className="tabular-nums">
                {route.total_distance_km.toFixed(1)} km total
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 text-xs italic text-slate-400">— no route yet —</div>
      )}

      {tasks.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs text-slate-500 hover:text-slate-700"
          >
            {expanded ? "▼" : "▶"} {tasks.length} task
            {tasks.length === 1 ? "" : "s"}
          </button>
          {expanded && (
            <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100 pt-1">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}


// ---- component ----------------------------------------------------------

export function WorkerPanel({
  workers,
  tasks,
  events,
  initialRoutes,
  activeWorkerId,
  selectedWorkerId,
  onWorkerSelect,
}: WorkerPanelProps): JSX.Element {
  const sortedWorkers = useMemo(
    () => sortWorkersByIdNumeric(workers),
    [workers],
  );
  const liveStates = useMemo(
    () => deriveLiveState(events, initialRoutes),
    [events, initialRoutes],
  );
  const tasksByWorker = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.worker_id) continue;
      const arr = m.get(t.worker_id) ?? [];
      arr.push(t);
      m.set(t.worker_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    }
    return m;
  }, [tasks]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
          Workers
          <span className="ml-1 text-xs font-normal text-slate-400">
            ({sortedWorkers.length})
          </span>
        </h2>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {sortedWorkers.map((w) => {
          const live = liveStates.get(w.id);
          return (
            <WorkerCard
              key={w.id}
              worker={w}
              liveStatus={live?.status ?? w.status}
              route={live?.route}
              isActive={activeWorkerId === w.id}
              isSelected={selectedWorkerId === w.id}
              onSelect={onWorkerSelect}
              tasks={tasksByWorker.get(w.id) ?? []}
            />
          );
        })}
      </ul>
    </div>
  );
}
