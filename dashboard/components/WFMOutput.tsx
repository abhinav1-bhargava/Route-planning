// dashboard/components/WFMOutput.tsx
//
// The "this is what we'd push to your WFM" panel. Slides up from the
// bottom whenever a ROUTE_UPDATED arrives for a non-startup correlation.
// Shows the full WFM dispatch JSON the API builds at /wfm-payload/{id},
// plus a readable summary for the audience.

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketEvent } from "../hooks/useWebSocket";


// ---- props --------------------------------------------------------------

export interface WFMOutputProps {
  events: WebSocketEvent[];
  activeCorrelationId: string | null;
  /** Base URL for the API (same one pages/index.tsx uses). */
  apiUrl: string;
  /** Controlled open flag so an operator can keep the panel open or
   *  re-open it from an outside button. */
  open: boolean;
  onClose: () => void;
}


// ---- types ---------------------------------------------------------------

interface WFMTask {
  task_id: string;
  task_type: string;
  address: string;
  scheduled_time: string;
  duration_mins: number;
  status: string;
  required_skill: string;
  consent_obtained: boolean;
  adhoc: boolean;
  priority: number;
  // For ad-hoc tasks, the wall-clock at which the task was created.
  // Server stamps it from TASK_CREATED.timestamp; render as
  // "Dispatched at HH:MM" instead of the placeholder scheduled_time.
  dispatch_time?: string;
  // For tasks moved by a CONSENT yes, the original sched + the new
  // sched (server already overwrites scheduled_time with the new one).
  rescheduled?: boolean;
  original_time?: string;
}

interface WFMStop {
  sequence: number;
  task_id: string;
  address: string;
  arrival_time: string;
  departure_time: string;
}

interface WFMPayload {
  event: string;
  timestamp: string;
  worker: {
    id: string;
    name: string;
    zone: string;
    current_location: { lat: number; lng: number };
  };
  assigned_tasks: WFMTask[];
  route: {
    total_distance_km: number;
    total_time_mins: number;
    estimated_completion: string;
    version: number;
    stops: WFMStop[];
  };
  displaced_tasks: Array<{
    task_id: string;
    original_time: string;
    new_time: string;
    consent_obtained: boolean;
  }>;
  consent_records: Array<{
    task_id: string | null;
    customer_contacted: boolean;
    response: string | null;
    response_time_mins: number | null;
  }>;
  decision_metadata: {
    correlation_id: string;
    trigger: string;
    reallocation_score: number | null;
    alternatives_considered: number;
    decision_time_ms: number;
    smart_assignment: boolean;
  };
}


// ---- colour JSON (no external library) ---------------------------------

function syntaxHighlight(jsonText: string): string {
  return jsonText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "text-emerald-700"; // number
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "text-slate-800 font-semibold" : "text-amber-700"; // key | string
        } else if (/true|false/.test(match)) {
          cls = "text-indigo-700";
        } else if (/null/.test(match)) {
          cls = "text-slate-500";
        }
        return `<span class="${cls}">${match}</span>`;
      },
    );
}


// ---- task-type emoji for readable summary ------------------------------

const ICON: Record<string, string> = {
  new_installation: "🔧",
  fault_repair: "⚡",
  network_rehab: "🔁",
  fiber_cut: "🔴",
};


// ---- component ----------------------------------------------------------

export function WFMOutput({
  events,
  activeCorrelationId,
  apiUrl,
  open,
  onClose,
}: WFMOutputProps): JSX.Element | null {
  const [payload, setPayload] = useState<WFMPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const lastFetchedRef = useRef<string>("");

  // Find the most recent ROUTE_UPDATED under the active correlation —
  // that's the worker whose payload we need.
  const targetWorkerId = useMemo<string | null>(() => {
    if (!activeCorrelationId) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.correlation_id !== activeCorrelationId) continue;
      if (e.event_type !== "ROUTE_UPDATED") continue;
      const wid = (e.payload as { worker_id?: unknown })?.worker_id;
      if (typeof wid === "string") return wid;
    }
    return null;
  }, [events, activeCorrelationId]);

  // Pluck the latest DEBRIEF_READY paragraph for the active correlation.
  const debriefParagraph = useMemo<string | null>(() => {
    if (!activeCorrelationId) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.correlation_id !== activeCorrelationId) continue;
      if (e.event_type !== "DEBRIEF_READY") continue;
      const p = (e.payload as { paragraph?: string })?.paragraph;
      if (typeof p === "string" && p.length > 0) return p;
      return e.human_label || null;
    }
    return null;
  }, [events, activeCorrelationId]);

  useEffect(() => {
    if (!open || !targetWorkerId) return;
    const key = `${activeCorrelationId}::${targetWorkerId}`;
    if (lastFetchedRef.current === key) return;
    lastFetchedRef.current = key;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/wfm-payload/${targetWorkerId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: WFMPayload = await res.json();
        setPayload(data);
      } catch (err) {
        console.error("WFMOutput fetch failed:", err);
      }
    })();
  }, [open, targetWorkerId, activeCorrelationId, apiUrl]);

  if (!open) return null;
  if (!payload) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t-2 border-indigo-400 bg-white px-6 py-4 shadow-2xl">
        <div className="text-sm text-slate-500">Loading WFM payload…</div>
      </div>
    );
  }

  const jsonStr = JSON.stringify(payload, null, 2);
  const decisionSeconds =
    payload.decision_metadata.decision_time_ms / 1000;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — fall through silently
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t-2 border-indigo-400 bg-white shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden>📤</span>
            <span className="font-semibold uppercase tracking-wider text-slate-700">
              WFM Dispatch Output
            </span>
            <span className="font-mono text-xs text-slate-400">
              {payload.decision_metadata.correlation_id}
            </span>
            <span className="text-xs text-slate-400">
              · {decisionSeconds.toFixed(1)}s
            </span>
          </div>
          <div className="mt-0.5 text-xs italic text-slate-500">
            Payload that would be pushed to your WFM API via the integration adapter
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
          >
            {copied ? "Copied ✓" : "Copy JSON"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            Close
          </button>
        </div>
      </div>

      <div className="px-6 py-4 text-sm">
        {debriefParagraph && (
          <div className="mb-3 rounded border-l-4 border-l-indigo-500 bg-indigo-50/60 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Scenario summary
            </div>
            <div className="mt-1 text-sm leading-relaxed text-slate-800">
              {debriefParagraph}
            </div>
          </div>
        )}

        <div className="mb-2">
          <span className="font-medium text-slate-700">Worker: </span>
          <span className="text-slate-900">{payload.worker.name}</span>
          <span className="ml-1 font-mono text-xs text-slate-500">
            ({payload.worker.id})
          </span>
          <span className="ml-2 text-xs uppercase tracking-wider text-slate-400">
            {payload.worker.zone}
          </span>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Assigned tasks
          </div>
          <ol className="mt-1 space-y-0.5">
            {payload.assigned_tasks.map((t, i) => (
              <li key={t.task_id} className="text-sm text-slate-700">
                <span className="mr-1 tabular-nums">{i + 1}.</span>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {t.adhoc && t.dispatch_time ? t.dispatch_time : t.scheduled_time}
                </span>{" "}
                <span aria-hidden>{ICON[t.task_type] ?? "•"}</span>{" "}
                <span className="text-slate-500">
                  {t.task_type.replace(/_/g, " ")}
                </span>{" "}
                · {t.address}
                {t.adhoc && (
                  <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800">
                    NEW AD-HOC
                  </span>
                )}
                {t.adhoc && t.dispatch_time && (
                  <span className="ml-2 text-[11px] italic text-slate-500">
                    Dispatched at {t.dispatch_time}
                  </span>
                )}
                {t.rescheduled && t.original_time && (
                  <div className="ml-6 text-[11px] text-slate-500">
                    ↑ Rescheduled from{" "}
                    <span className="line-through">{t.original_time}</span>
                    {" "}(customer confirmed)
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Route summary
          </div>
          <div className="mt-1 text-sm text-slate-700">
            <b>{payload.route.total_distance_km.toFixed(1)} km</b> ·{" "}
            <b>{payload.route.total_time_mins} mins</b> · Done by{" "}
            <b>{payload.route.estimated_completion || "—"}</b>
            <span className="ml-2 text-xs text-slate-500">
              Version {payload.route.version}
              {payload.route.version > 1 && " (replanned)"}
            </span>
          </div>
        </div>

        {payload.consent_records.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Consent records
            </div>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
              {payload.consent_records.map((c, i) => (
                <li key={i}>
                  task {c.task_id ?? "—"} · contacted:{" "}
                  {c.customer_contacted ? "yes" : "no"}
                  {c.response && (
                    <>
                      {" "}· response: <b>{c.response.toUpperCase()}</b>
                    </>
                  )}
                  {c.response_time_mins != null && (
                    <> ({c.response_time_mins.toFixed(1)} min)</>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {payload.consent_records.length === 0 && (
          <div className="mb-3 text-sm italic text-slate-500">
            No consent required for this assignment.
          </div>
        )}

        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Decision metadata
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Trigger: <b>{payload.decision_metadata.trigger || "—"}</b> ·
            {" "}Score:{" "}
            <b>
              {payload.decision_metadata.reallocation_score != null
                ? payload.decision_metadata.reallocation_score.toFixed(3)
                : "—"}
            </b>{" "}
            · {payload.decision_metadata.alternatives_considered} alternatives ·{" "}
            {decisionSeconds.toFixed(1)}s
            {payload.decision_metadata.smart_assignment && (
              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                SMART ASSIGNMENT
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 rounded border border-slate-200">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
          >
            <span>Raw JSON</span>
            <span aria-hidden className="text-slate-400">
              {expanded ? "▼" : "▶"}
            </span>
          </button>
          {expanded && (
            <pre
              className="overflow-x-auto bg-slate-900 px-4 py-3 text-xs leading-5 text-slate-100"
              dangerouslySetInnerHTML={{
                __html: syntaxHighlight(jsonStr),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
