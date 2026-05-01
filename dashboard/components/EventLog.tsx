// dashboard/components/EventLog.tsx
//
// Live event feed grouped by correlation_id. Newest group on top; events
// within a group ascend by timestamp. New non-startup groups auto-expand
// on arrival and stay expanded (stable history). Startup groups are
// collapsed by default but still browseable.

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketEvent } from "../hooks/useWebSocket";


// ---- props --------------------------------------------------------------

export interface EventLogProps {
  events: WebSocketEvent[];
  /** When true, groups with `correlation_id` starting with "startup-" are
   *  collapsed by default. Default true. */
  hideStartupByDefault?: boolean;
}


// ---- grouping -----------------------------------------------------------

interface Group {
  correlationId: string;
  events: WebSocketEvent[];
  firstTs: string;
  lastTs: string;
  durationMs: number;
  isStartup: boolean;
}

function groupEvents(events: WebSocketEvent[]): Group[] {
  const byCorrId = new Map<string, WebSocketEvent[]>();
  for (const e of events) {
    const arr = byCorrId.get(e.correlation_id);
    if (arr) arr.push(e);
    else byCorrId.set(e.correlation_id, [e]);
  }
  const groups: Group[] = [];
  for (const [cid, evs] of byCorrId.entries()) {
    evs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const firstTs = evs[0].timestamp;
    const lastTs = evs[evs.length - 1].timestamp;
    const durationMs =
      new Date(lastTs).getTime() - new Date(firstTs).getTime();
    groups.push({
      correlationId: cid,
      events: evs,
      firstTs, lastTs, durationMs,
      isStartup: cid.startsWith("startup-"),
    });
  }
  // Newest-last-event first
  groups.sort((a, b) => b.lastTs.localeCompare(a.lastTs));
  return groups;
}


// ---- agent colour palette -----------------------------------------------

const AGENT_PILL: Record<string, string> = {
  supervisor:    "bg-indigo-100 text-indigo-800",
  reallocation:  "bg-amber-100 text-amber-800",
  route_planner: "bg-emerald-100 text-emerald-800",
  consent:       "bg-fuchsia-100 text-fuchsia-800",
  api:           "bg-slate-200 text-slate-700",
  startup:       "bg-slate-100 text-slate-500",
};

function pillClass(agent: string): string {
  return AGENT_PILL[agent] ?? "bg-slate-200 text-slate-700";
}


// ---- row styling per event type -----------------------------------------

interface ScoredPayload {
  worker_id?: string;
  worker_name?: string;
  selected?: boolean;
  rejection_reason?: string | null;
}

function rowClass(e: WebSocketEvent): string {
  if (e.event_type === "WORKER_SCORED") {
    const p = e.payload as ScoredPayload;
    if (p?.selected) {
      return "border-l-4 border-l-emerald-500 bg-emerald-50/40 ml-10";
    }
    if (p?.rejection_reason) {
      return "border-l-4 border-l-slate-200 bg-slate-50/60 ml-10 opacity-75";
    }
    return "border-l-4 border-l-amber-400 bg-amber-50/30 ml-10";
  }
  if (e.event_type === "ESCALATION_REQUIRED") {
    return "border-l-4 border-l-rose-400 bg-rose-50/50";
  }
  return "";
}


// ---- escalation card ----------------------------------------------------

interface TradeOffOption {
  label: string;
  text: string;
}
interface EscalationPayload {
  adhoc_task_id?: string;
  trade_off_options?: TradeOffOption[];
  narrative?: string;
  reasoning?: string;
}

function ShiftNoteCard({ event }: { event: WebSocketEvent }): JSX.Element {
  const p = (event.payload ?? {}) as { paragraph?: string; scenario_name?: string };
  return (
    <div className="mx-4 my-3 rounded border-l-4 border-l-indigo-500 bg-indigo-50/60 px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <span aria-hidden>📋</span>
        <span className="uppercase tracking-wider">Shift note</span>
        {p.scenario_name && (
          <span className="ml-1 text-xs font-normal text-indigo-700">
            · {p.scenario_name}
          </span>
        )}
      </div>
      <div className="text-sm leading-relaxed text-slate-800">
        {p.paragraph ?? event.human_label}
      </div>
    </div>
  );
}


function AnomalyCard({ event }: { event: WebSocketEvent }): JSX.Element {
  const p = (event.payload ?? {}) as {
    pattern_description?: string;
    recommendation?: string | null;
    count?: number;
    task_type?: string;
    zone?: string;
  };
  return (
    <div className="mx-4 my-3 rounded border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-amber-900">
        <span aria-hidden>⚠️</span>
        <span className="uppercase tracking-wider">Pattern detected</span>
      </div>
      <div className="text-sm text-amber-900">
        {p.count} {p.task_type?.replace("_", " ")} jobs in {p.zone} today.{" "}
        {p.pattern_description}
      </div>
      {p.recommendation && (
        <div className="mt-2 text-sm font-medium text-amber-900">
          Recommendation: {p.recommendation}
        </div>
      )}
    </div>
  );
}


function SupervisorOverrideCard({
  event,
}: {
  event: WebSocketEvent;
}): JSX.Element {
  const p = (event.payload ?? {}) as {
    rejected_worker_id?: string;
    rejected_worker_name?: string;
    reasons?: string[];
  };
  const workerName =
    p.rejected_worker_name || p.rejected_worker_id || "Worker";
  const reason =
    p.reasons && p.reasons.length > 0 ? p.reasons[0] : "guardrail rejected";
  return (
    <div className="mx-4 my-3 rounded border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-900">
        <span aria-hidden>⚠️</span>
        <span>Dispatcher check failed</span>
      </div>
      <div className="text-sm text-amber-900">
        <span className="font-semibold">{workerName}</span> rejected — {reason}
      </div>
      <div className="mt-1 text-xs text-amber-800">
        Finding next best technician…
      </div>
    </div>
  );
}


function PostAllocationAlertCard({
  event,
}: {
  event: WebSocketEvent;
}): JSX.Element {
  const p = (event.payload ?? {}) as {
    type?: "late_arrival" | "shift_breach" | "consent_stall";
    worker_id?: string;
    worker_name?: string;
    task_id?: string;
    task_type?: string;
    address?: string;
    delay_mins?: number;
    wait_mins?: number;
  };
  const kind = p.type ?? "late_arrival";
  const palette =
    kind === "shift_breach"
      ? {
          border: "border-rose-500",
          bg: "bg-rose-50",
          title: "text-rose-900",
          body: "text-rose-900",
          glyph: "🚨",
          heading: "Shift breach risk",
        }
      : kind === "consent_stall"
        ? {
            border: "border-amber-400",
            bg: "bg-amber-50",
            title: "text-amber-900",
            body: "text-amber-900",
            glyph: "⏳",
            heading: "Consent pending",
          }
        : {
            border: "border-amber-400",
            bg: "bg-amber-50",
            title: "text-amber-900",
            body: "text-amber-900",
            glyph: "⏰",
            heading: "Route monitor",
          };
  const body = (() => {
    if (kind === "shift_breach") {
      return `${p.worker_name ?? "Worker"} will exceed shift end by ${
        p.delay_mins ?? "?"
      } mins. Reassignment needed.`;
    }
    if (kind === "consent_stall") {
      return `Waiting ${p.wait_mins ?? "?"} mins for customer reply on ${
        p.worker_name ?? "Worker"
      }'s pending task.`;
    }
    return `${p.worker_name ?? "Worker"} will arrive ${p.delay_mins ?? "?"} mins late to ${p.address ?? "next stop"}. Consider rerouting.`;
  })();
  return (
    <div
      className={`mx-4 my-3 rounded border-2 ${palette.border} ${palette.bg} px-4 py-3 shadow-sm`}
    >
      <div
        className={`mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${palette.title}`}
      >
        <span aria-hidden>{palette.glyph}</span>
        <span>{palette.heading}</span>
      </div>
      <div className={`text-sm ${palette.body}`}>{body}</div>
    </div>
  );
}


function TravelWarningNote({
  event,
}: {
  event: WebSocketEvent;
}): JSX.Element {
  const p = (event.payload ?? {}) as { warnings?: string[] };
  const warnings = p.warnings ?? [];
  return (
    <div className="mx-4 my-2 rounded border-l-4 border-l-amber-400 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-900">
      <span aria-hidden className="mr-1">🚗</span>
      <span className="font-medium">Note: </span>
      {warnings.length > 0
        ? warnings.join(" · ")
        : event.human_label}
    </div>
  );
}


function EscalationCard({ event }: { event: WebSocketEvent }): JSX.Element {
  const p = (event.payload ?? {}) as EscalationPayload;
  const options = p.trade_off_options ?? [];
  return (
    <div className="mx-4 my-3 rounded border-2 border-rose-400 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm">
      <div className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden>🚨</span>
        <span>Manual Dispatch Required</span>
      </div>
      <div className="mt-1 text-sm text-rose-800">
        {p.narrative ?? p.reasoning ?? "All nearby technicians are fully booked."}
      </div>
      {options.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Options available
          </div>
          <ul className="mt-1 space-y-1 text-sm">
            {options.map((o) => (
              <li key={o.label} className="flex gap-2">
                <span className="font-mono font-semibold text-rose-700">
                  {o.label})
                </span>
                <span>{o.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


// ---- formatting helpers -------------------------------------------------

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}


// ---- component ----------------------------------------------------------

export function EventLog({
  events,
  hideStartupByDefault = true,
}: EventLogProps): JSX.Element {
  const groups = useMemo(() => groupEvents(events), [events.length]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());

  // Auto-expand a group the FIRST time we see its correlation_id (unless
  // it's a startup-* group and hideStartupByDefault is on). Subsequent
  // sightings don't change state, so a user manually collapsing a group
  // stays collapsed.
  useEffect(() => {
    const newlyExpanded: string[] = [];
    for (const g of groups) {
      if (seenRef.current.has(g.correlationId)) continue;
      seenRef.current.add(g.correlationId);
      if (g.isStartup && hideStartupByDefault) continue;
      newlyExpanded.push(g.correlationId);
    }
    if (newlyExpanded.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of newlyExpanded) next.add(id);
        return next;
      });
    }
  }, [groups, hideStartupByDefault]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-white border-l border-slate-200">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
          Event log
          {groups.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({groups.length} flow{groups.length === 1 ? "" : "s"})
            </span>
          )}
        </h2>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          No events yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {groups.map((g) => (
            <GroupCard
              key={g.correlationId}
              group={g}
              isExpanded={expanded.has(g.correlationId)}
              onToggle={() => toggle(g.correlationId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}


// ---- per-group card -----------------------------------------------------

interface GroupCardProps {
  group: Group;
  isExpanded: boolean;
  onToggle: () => void;
}

function GroupCard({ group, isExpanded, onToggle }: GroupCardProps): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50"
      >
        <span className="w-4 select-none text-xs text-slate-400">
          {isExpanded ? "▼" : "▶"}
        </span>
        <span
          className={`truncate font-mono text-xs ${
            group.isStartup ? "text-slate-500" : "text-slate-800"
          }`}
        >
          {group.correlationId}
        </span>
        <span className="ml-auto whitespace-nowrap text-xs text-slate-400 tabular-nums">
          {group.events.length} event{group.events.length === 1 ? "" : "s"}
          {" · "}
          {formatDuration(group.durationMs)}
        </span>
      </button>

      {isExpanded && (
        <ul className="mb-2">
          {group.events.map((e, i) => {
            if (e.event_type === "ESCALATION_REQUIRED") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <EscalationCard event={e} />
                </li>
              );
            }
            if (e.event_type === "DEBRIEF_READY") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <ShiftNoteCard event={e} />
                </li>
              );
            }
            if (e.event_type === "ANOMALY_DETECTED") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <AnomalyCard event={e} />
                </li>
              );
            }
            if (e.event_type === "POST_ALLOCATION_ALERT") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <PostAllocationAlertCard event={e} />
                </li>
              );
            }
            if (e.event_type === "SUPERVISOR_OVERRIDE") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <SupervisorOverrideCard event={e} />
                </li>
              );
            }
            if (e.event_type === "TRAVEL_WARNING") {
              return (
                <li key={e.id || `${group.correlationId}-${i}`}>
                  <TravelWarningNote event={e} />
                </li>
              );
            }
            return (
              <li
                key={e.id || `${group.correlationId}-${i}`}
                className={`ml-6 mr-4 border-l-2 border-slate-100 px-4 py-1.5 pl-4 ${rowClass(e)}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${pillClass(e.agent)}`}
                  >
                    {e.agent}
                  </span>
                  <span className="font-mono font-medium text-slate-700">
                    {e.event_type}
                  </span>
                  <span className="ml-auto font-mono tabular-nums text-slate-400">
                    {formatTime(e.timestamp)}
                  </span>
                </div>
                <div className="mt-1 border-l border-slate-200 pl-2 text-sm text-slate-600">
                  {e.human_label}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
