// dashboard/components/PipelineTracker.tsx
//
// Live decision pipeline for the current scenario. Reads events filtered
// to activeCorrelationId and renders 8 stages with live state:
//
//   1. Ad-hoc task arrives            — TASK_CREATED
//   2. Supervisor: score priority     — REALLOCATION_TRIGGERED / ROUTE_REPLAN (queue)
//   3. Priority check                 — decision gate (reallocate vs queue)
//   4. Fetch distance matrix          — FLEET_SCAN
//   5. Reallocation: score each worker — WORKER_SCORED stream + SCORING_COMPLETE
//   6. Consent required?              — decision gate
//   7. Send Telegram message          — CONSENT_SENT → CONSENT_RESOLVED
//   8. Commit + replan                — ROUTE_REPLAN → ROUTE_UPDATED
//
// ESCALATION_REQUIRED replaces stages 6-8 with a rose trade-off card.

import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketEvent } from "../hooks/useWebSocket";


// ---- props --------------------------------------------------------------

export interface PipelineTrackerProps {
  events: WebSocketEvent[];
  activeCorrelationId: string | null;
  /** Current α slider value — drives client-side re-ranking so the S6
   *  selection flips as the presenter drags the slider. Defaults to 0.7
   *  to match the server default. */
  alpha?: number;
}


// ---- derived state ------------------------------------------------------

interface ScoredRow {
  worker_id: string;
  worker_name: string;
  zone: string;
  eta_mins: number | null;
  distance_km: number | null;
  slack_mins: number | null;
  remaining_shift_mins: number | null;
  kpi_ontime: number | null;
  kpi_priority_fit: number | null;
  kpi_distance: number | null;
  score: number | null;
  skill_match: boolean;
  selected: boolean;
  rejection_reason: string | null;
  // Populated when the server marks this worker on_site at scoring
  // time. The pipeline table renders these so the audience sees that
  // the on-site technician's adjusted ETA includes the time they still
  // owe their current customer.
  on_site: boolean;
  remaining_on_site_mins: number;
  adjusted_eta_mins: number | null;
  effective_availability: string;
}

interface PipelineState {
  taskCreated: WebSocketEvent | null;
  priorityDecided: "reallocate" | "queue" | null;
  fleetScan: WebSocketEvent | null;
  workerScores: ScoredRow[];
  scoringComplete: WebSocketEvent | null;
  consentRequired: boolean | null;   // null = undecided, true/false = known
  consentSent: WebSocketEvent | null;
  consentSentAt: number | null;       // epoch ms for countdown
  consentResolved: WebSocketEvent | null;
  routeReplan: WebSocketEvent | null;
  routeUpdated: WebSocketEvent | null;
  escalation: WebSocketEvent | null;
  smartAssignment: WebSocketEvent | null;
  // Dispatcher (supervisor guardrail) state — only relevant on the
  // no-consent direct branch. lastAssignmentProposed tracks the most
  // recent ASSIGNMENT_PROPOSED so that retries (after a SUPERVISOR_OVERRIDE
  // emitted REALLOCATION_TRIGGERED) get a fresh dispatcher stage.
  lastAssignmentProposed: WebSocketEvent | null;
  lastAssignmentProposedAt: number | null;  // epoch ms — drives the
                                            // staggered "✓" reveal
  supervisorOverride: WebSocketEvent | null;
  travelWarning: WebSocketEvent | null;
}

function emptyState(): PipelineState {
  return {
    taskCreated: null,
    priorityDecided: null,
    fleetScan: null,
    workerScores: [],
    scoringComplete: null,
    consentRequired: null,
    consentSent: null,
    consentSentAt: null,
    consentResolved: null,
    routeReplan: null,
    routeUpdated: null,
    escalation: null,
    smartAssignment: null,
    lastAssignmentProposed: null,
    lastAssignmentProposedAt: null,
    supervisorOverride: null,
    travelWarning: null,
  };
}

function reduceEvents(
  events: WebSocketEvent[],
  correlationId: string,
): PipelineState {
  const s = emptyState();
  for (const e of events) {
    if (e.correlation_id !== correlationId) continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.event_type) {
      case "TASK_CREATED":
        s.taskCreated = e;
        break;
      case "REALLOCATION_TRIGGERED":
        if (!s.priorityDecided) s.priorityDecided = "reallocate";
        break;
      case "ROUTE_REPLAN":
        // If REALLOCATION_TRIGGERED hasn't fired, this is the queue branch.
        if (!s.priorityDecided) s.priorityDecided = "queue";
        s.routeReplan = e;
        break;
      case "FLEET_SCAN":
        s.fleetScan = e;
        break;
      case "WORKER_SCORED": {
        // Upsert by worker_id — on retry the same worker may get a new
        // WORKER_SCORED event with updated selected/rejection_reason flags.
        const row: ScoredRow = {
          worker_id: String(p.worker_id ?? ""),
          worker_name: String(p.worker_name ?? ""),
          zone: String(p.zone ?? ""),
          eta_mins: (p.eta_mins as number | null) ?? null,
          distance_km: (p.distance_km as number | null) ?? null,
          slack_mins: (p.slack_mins as number | null) ?? null,
          remaining_shift_mins: (p.remaining_shift_mins as number | null) ?? null,
          kpi_ontime: (p.kpi_ontime as number | null) ?? null,
          kpi_priority_fit: (p.kpi_priority_fit as number | null) ?? null,
          kpi_distance: (p.kpi_distance as number | null) ?? null,
          score: (p.score as number | null) ?? null,
          skill_match: p.skill_match === undefined ? true : Boolean(p.skill_match),
          selected: Boolean(p.selected),
          rejection_reason: (p.rejection_reason as string | null) ?? null,
          on_site: Boolean(p.on_site),
          remaining_on_site_mins: Number(p.remaining_on_site_mins ?? 0),
          adjusted_eta_mins:
            p.adjusted_eta_mins != null
              ? Number(p.adjusted_eta_mins)
              : null,
          effective_availability: String(p.effective_availability ?? ""),
        };
        const idx = s.workerScores.findIndex((r) => r.worker_id === row.worker_id);
        if (idx >= 0) {
          s.workerScores[idx] = row;
        } else {
          s.workerScores.push(row);
        }
        break;
      }
      case "SCORING_COMPLETE":
        s.scoringComplete = e;
        break;
      case "CONSENT_REQUIRED":
        s.consentRequired = true;
        break;
      case "ASSIGNMENT_PROPOSED":
        if (s.consentRequired === null) s.consentRequired = false;
        // Each ASSIGNMENT_PROPOSED (including retries after override) opens
        // a fresh dispatcher-validation pass. Reset the override + warning
        // flags so the previous attempt's red banner clears as soon as
        // reallocation re-emits with a new worker.
        s.lastAssignmentProposed = e;
        s.lastAssignmentProposedAt = new Date(e.timestamp).getTime();
        s.supervisorOverride = null;
        s.travelWarning = null;
        break;
      case "SUPERVISOR_OVERRIDE":
        s.supervisorOverride = e;
        break;
      case "TRAVEL_WARNING":
        s.travelWarning = e;
        break;
      case "CONSENT_SENT":
        s.consentSent = e;
        s.consentSentAt = new Date(e.timestamp).getTime();
        break;
      case "CONSENT_RESOLVED":
        s.consentResolved = e;
        break;
      case "SMART_ASSIGNMENT":
        s.smartAssignment = e;
        break;
      case "ROUTE_UPDATED":
        s.routeUpdated = e;
        break;
      case "ESCALATION_REQUIRED":
        s.escalation = e;
        break;
    }
  }
  // Sort worker scores for display: selected first, then viable by score desc,
  // then rejected at the bottom.
  s.workerScores.sort((a, b) => {
    const aRej = a.rejection_reason ? 1 : 0;
    const bRej = b.rejection_reason ? 1 : 0;
    if (aRej !== bRej) return aRej - bRej;
    if (a.selected !== b.selected) return a.selected ? -1 : 1;
    return (b.score ?? -Infinity) - (a.score ?? -Infinity);
  });
  return s;
}


// ---- stage status -------------------------------------------------------

type StageStatus = "pending" | "active" | "complete" | "skipped" | "error";

interface StageInfo {
  n: number;
  title: string;
  status: StageStatus;
  detail?: string;
  /** Marker the renderer uses to splice in custom UI (dispatcher checks,
   *  scoring table, consent countdown). Avoids a brittle stage-number
   *  branch. */
  kind?: "default" | "dispatcher";
}

const DISPATCHER_CHECKS: ReadonlyArray<string> = [
  "Skill match verified",
  "Shift feasibility confirmed",
  "No time conflicts",
  "Capacity check passed",
  "Distance within range",
  "Travel times verified",
  "All stops reachable on time",
];

const DISPATCHER_CHECK_STAGGER_MS = 180;

function stageList(s: PipelineState): StageInfo[] {
  const out: StageInfo[] = [];

  // Stage 1: Ad-hoc task arrives
  if (s.taskCreated) {
    const p = s.taskCreated.payload as Record<string, unknown>;
    out.push({
      n: 1,
      title: "Ad-hoc task arrives",
      status: "complete",
      detail: s.taskCreated.human_label,
    });
  } else {
    out.push({ n: 1, title: "Ad-hoc task arrives", status: "pending" });
  }

  // Stage 2: Supervisor scores priority
  if (s.priorityDecided) {
    out.push({
      n: 2,
      title: "Supervisor: score priority",
      status: "complete",
      detail:
        s.priorityDecided === "reallocate"
          ? "High priority — reallocating"
          : "Low priority — queued",
    });
  } else if (s.taskCreated) {
    out.push({
      n: 2,
      title: "Supervisor: score priority",
      status: "active",
      detail: "Assessing urgency and SLA breach risk…",
    });
  } else {
    out.push({ n: 2, title: "Supervisor: score priority", status: "pending" });
  }

  // Stage 3: Priority check (decision gate)
  if (s.priorityDecided) {
    out.push({
      n: 3,
      title: "Priority check",
      status: "complete",
      detail:
        s.priorityDecided === "reallocate"
          ? "Priority ≥ 3 → reallocate now"
          : "Priority < 3 → added to worker queue",
    });
  } else {
    out.push({ n: 3, title: "Priority check", status: "pending" });
  }

  // Remaining stages only apply to the reallocate branch.
  if (s.priorityDecided === "queue") {
    // Queue branch completes here.
    return out;
  }

  // Stage 4: Fetch distance matrix
  if (s.fleetScan) {
    out.push({
      n: 4,
      title: "Fetch distance matrix",
      status: s.scoringComplete || s.workerScores.length >= 1 ? "complete" : "active",
      detail:
        s.scoringComplete
          ? "Distance matrix ready — fleet evaluated"
          : "Fetching road distances for all technicians…",
    });
  } else if (s.priorityDecided === "reallocate") {
    out.push({
      n: 4, title: "Fetch distance matrix", status: "active",
      detail: "Preparing fleet scan…",
    });
  } else {
    out.push({ n: 4, title: "Fetch distance matrix", status: "pending" });
  }

  // Stage 5: Score each worker
  if (s.scoringComplete) {
    const p = s.scoringComplete.payload as Record<string, unknown>;
    out.push({
      n: 5, title: "Score each technician",
      status: "complete",
      detail:
        `${p.evaluated} evaluated · ${p.viable} viable · ` +
        `${p.selected_name} selected`,
    });
  } else if (s.workerScores.length > 0) {
    out.push({
      n: 5, title: "Score each technician",
      status: "active",
      detail: `Evaluating — ${s.workerScores.length} scored so far…`,
    });
  } else if (s.fleetScan) {
    out.push({
      n: 5, title: "Score each technician", status: "active",
      detail: "Scoring starts…",
    });
  } else {
    out.push({ n: 5, title: "Score each technician", status: "pending" });
  }

  // Escalation short-circuit: if ESCALATION_REQUIRED fires, stages 6-8
  // collapse into the escalation card (rendered separately).
  if (s.escalation) {
    return out;
  }

  // Stage 6: Consent required?
  if (s.consentRequired === true) {
    out.push({ n: 6, title: "Consent required?", status: "complete",
               detail: "Yes — displacement needs approval" });
  } else if (s.consentRequired === false) {
    out.push({ n: 6, title: "Consent required?", status: "complete",
               detail: "No — committing directly" });
  } else if (s.scoringComplete) {
    out.push({ n: 6, title: "Consent required?", status: "active" });
  } else {
    out.push({ n: 6, title: "Consent required?", status: "pending" });
  }

  // Stage 7a: Dispatcher validation (no-consent direct branch only).
  // Sits between ASSIGNMENT_PROPOSED and ROUTE_REPLAN — the supervisor
  // runs its 7 guardrails here. SUPERVISOR_OVERRIDE → error, retry resets
  // when the next ASSIGNMENT_PROPOSED arrives. ROUTE_REPLAN → complete.
  if (s.consentRequired === false) {
    if (s.supervisorOverride) {
      const op = s.supervisorOverride.payload as Record<string, unknown>;
      const reason =
        Array.isArray(op.reasons) && op.reasons.length > 0
          ? String(op.reasons[0])
          : "guardrail rejected";
      out.push({
        n: 7,
        title: "Dispatcher validation",
        status: "error",
        detail: `${reason} — re-evaluating options`,
        kind: "dispatcher",
      });
    } else if (s.routeReplan || s.routeUpdated) {
      out.push({
        n: 7,
        title: "Dispatcher validation",
        status: "complete",
        detail: "All 7 guardrails passed",
        kind: "dispatcher",
      });
    } else if (s.lastAssignmentProposed) {
      out.push({
        n: 7,
        title: "Dispatcher validation",
        status: "active",
        detail: "Running guardrails…",
        kind: "dispatcher",
      });
    } else {
      out.push({
        n: 7,
        title: "Dispatcher validation",
        status: "pending",
        kind: "dispatcher",
      });
    }
  }

  // Stage 7b: Send Telegram message (consent branch only — kept under the
  // same numeric slot since consent and dispatcher-validation are mutually
  // exclusive).
  if (s.consentRequired === false) {
    // Already covered by 7a above.
  } else {
    // Multi-round-aware: a new CONSENT_SENT after a prior CONSENT_RESOLVED
    // means we're on attempt 2+ (consent-NO fallback).
    const sentTs = s.consentSent ? new Date(s.consentSent.timestamp).getTime() : 0;
    const resolvedTs = s.consentResolved
      ? new Date(s.consentResolved.timestamp).getTime()
      : 0;
    const inNewRound = s.consentSent && sentTs > resolvedTs;
    if (inNewRound) {
      out.push({
        n: 7, title: "Send Telegram message", status: "active",
        detail: "Trying next available technician…",
      });
    } else if (s.consentResolved) {
      const p = s.consentResolved.payload as Record<string, unknown>;
      const outcome = String(p.outcome);
      const detail =
        outcome === "yes" ? "Customer confirmed ✅" :
        outcome === "no"  ? "Customer declined — trying next best technician" :
                            "No reply — escalating ⏱";
      out.push({
        n: 7, title: "Send Telegram message",
        status:
          outcome === "timeout" ? "error" :
          outcome === "no"      ? "active" :   // still in progress (retry pending)
                                   "complete",
        detail,
      });
    } else if (s.consentSent) {
      out.push({
        n: 7, title: "Send Telegram message", status: "active",
        detail: "Message sent — awaiting reply",
      });
    } else if (s.consentRequired === true) {
      out.push({ n: 7, title: "Send Telegram message", status: "active",
                 detail: "Preparing message…" });
    } else {
      out.push({ n: 7, title: "Send Telegram message", status: "pending" });
    }
  }

  // Stage 8: Commit + replan
  if (s.routeUpdated) {
    const p = s.routeUpdated.payload as Record<string, unknown>;
    const stops = Array.isArray(p.ordered_task_ids)
      ? (p.ordered_task_ids as unknown[]).length
      : 0;
    const km = typeof p.total_distance_km === "number"
      ? (p.total_distance_km as number).toFixed(1)
      : "?";
    const perStop = (p.per_stop_etas as Array<{ arrival_time_hm?: string }> | undefined) ?? [];
    const endTime =
      perStop.length > 0
        ? perStop[perStop.length - 1].arrival_time_hm ?? "—"
        : "—";
    const version = typeof p.version === "number" ? (p.version as number) : 0;
    const workerName = (() => {
      const wid = p.worker_id;
      if (typeof wid !== "string") return "";
      return wid;
    })();
    const replanNote = version > 1 ? ` (replanned, v${version})` : "";
    out.push({
      n: 8, title: "Commit reallocation + replan",
      status: "complete",
      detail:
        `After: ${workerName} — ${stops} stops, ${km} km, done by ${endTime}${replanNote}`,
    });
  } else if (s.routeReplan && s.priorityDecided === "reallocate") {
    out.push({
      n: 8, title: "Commit reallocation + replan",
      status: "active",
      detail: "Planner computing new route…",
    });
  } else if (
    s.consentResolved && (s.consentResolved.payload as any).outcome === "yes"
  ) {
    out.push({
      n: 8, title: "Commit reallocation + replan",
      status: "active",
      detail: "Committing…",
    });
  } else {
    out.push({ n: 8, title: "Commit reallocation + replan", status: "pending" });
  }

  return out;
}


// ---- presentational -----------------------------------------------------

function StageDot({ status }: { status: StageStatus }): JSX.Element {
  const cls = {
    pending:  "bg-slate-200 text-slate-400",
    active:   "bg-indigo-500 text-white animate-pulse ring-4 ring-indigo-200",
    complete: "bg-emerald-500 text-white",
    skipped:  "bg-slate-100 text-slate-400 border border-dashed border-slate-300",
    error:    "bg-rose-500 text-white",
  }[status];
  const glyph = {
    pending: "",
    active: "•",
    complete: "✓",
    skipped: "⊘",
    error: "!",
  }[status];
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${cls}`}
      aria-hidden
    >
      {glyph}
    </div>
  );
}


/** Recompute combined score + client-side "selected" using the current α.
 *  Pure — takes the raw rows as-stored (with per-KPI fields from the
 *  server) and returns a new sorted list with updated scores. */
function rerankRows(rows: ScoredRow[], alpha: number): ScoredRow[] {
  // Recompute score where we have all three KPIs; otherwise fall back to
  // the server-side score.
  const recomputed = rows.map((r) => {
    if (
      r.kpi_ontime != null &&
      r.kpi_priority_fit != null &&
      r.kpi_distance != null
    ) {
      const newScore =
        alpha * r.kpi_ontime +
        0.5 * (1 - alpha) * r.kpi_priority_fit +
        0.5 * (1 - alpha) * r.kpi_distance;
      return { ...r, score: newScore };
    }
    return { ...r };
  });
  // Sort by score desc (viable first, rejected-by-physics rejected at end
  // only if their score is lower — keep everything score-ordered so the
  // alpha slider can push a 🔧 row above a ✅ row when ETA/distance dominate).
  recomputed.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  // Client-side selected = first skill_match row that isn't fully_booked or
  // cannot_complete. Overrides server's `selected` flag so the amber row
  // moves as the slider shifts.
  let clientSelectedId: string | null = null;
  for (const r of recomputed) {
    if (!r.skill_match) continue;
    if (
      r.rejection_reason === "fully_booked" ||
      r.rejection_reason === "cannot_complete"
    )
      continue;
    clientSelectedId = r.worker_id;
    break;
  }
  return recomputed.map((r) => ({
    ...r,
    selected: r.worker_id === clientSelectedId,
  }));
}


function ScoringTable({
  rows,
  alpha,
}: {
  rows: ScoredRow[];
  alpha: number;
}): JSX.Element {
  const ranked = useMemo(() => rerankRows(rows, alpha), [rows, alpha]);
  if (ranked.length === 0) {
    return (
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
        Waiting for first score…
      </div>
    );
  }
  return (
    <div className="mt-2 overflow-hidden rounded border border-slate-200">
      <table className="w-full text-xs table-fixed">
        <colgroup>
          <col style={{ width: "150px" }} />
          {/* ETA column widens when an on-site row needs to show
              "150m (60m on-site + 90m travel)". */}
          <col style={{ width: "150px" }} />
          <col style={{ width: "55px" }} />
          <col style={{ width: "55px" }} />
          <col style={{ width: "60px" }} />
          <col style={{ width: "60px" }} />
          <col style={{ width: "60px" }} />
        </colgroup>
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="px-2 py-1 text-left">Technician</th>
            <th className="px-2 py-1 text-right">ETA</th>
            <th className="px-2 py-1 text-right">Dist</th>
            <th className="px-2 py-1 text-right">Slack</th>
            <th className="px-2 py-1 text-right">OT%</th>
            <th className="px-2 py-1 text-right">Fit%</th>
            <th className="px-2 py-1 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const isSelected = r.selected;
            const rej = r.rejection_reason;
            const rowCls = isSelected
              ? "bg-amber-100 text-amber-900 font-semibold"
              : r.on_site
                ? "bg-amber-50 text-amber-900"
                : rej
                  ? "bg-slate-50 text-slate-400"
                  : "bg-white text-slate-700";
            const prefix = isSelected
              ? "⭐"
              : r.on_site
                ? "🔨"
                : rej === "wrong_skill"
                  ? "🔧"
                  : rej === "fully_booked"
                    ? "📅"
                    : rej === "cannot_complete"
                      ? "⏰"
                      : "✅";
            const rawEtaInt =
              r.eta_mins != null ? Math.round(r.eta_mins) : null;
            const adjEtaInt =
              r.adjusted_eta_mins != null
                ? Math.round(r.adjusted_eta_mins)
                : null;
            const eta =
              r.on_site && adjEtaInt != null && rawEtaInt != null
                ? `${adjEtaInt}m (${r.remaining_on_site_mins}m on-site + ${rawEtaInt}m travel)`
                : rawEtaInt != null
                  ? `${rawEtaInt}m`
                  : "—";
            const dist =
              r.distance_km != null ? `${r.distance_km.toFixed(1)}k` : "—";
            const slack = r.slack_mins != null ? `${r.slack_mins}m` : "—";
            const otPct =
              r.kpi_ontime != null ? `${Math.round(r.kpi_ontime * 100)}%` : "—";
            const fitPct =
              r.kpi_priority_fit != null
                ? `${Math.round(r.kpi_priority_fit * 100)}%`
                : "—";
            const score = r.score != null ? r.score.toFixed(2) : "—";
            return (
              <tr
                key={r.worker_id}
                className={`border-t border-slate-100 ${rowCls}`}
              >
                <td className="px-2 py-1">
                  <span className="mr-1" aria-hidden>
                    {prefix}
                  </span>
                  {r.worker_name}
                  {r.zone && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      ({r.zone})
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{eta}</td>
                <td className="px-2 py-1 text-right tabular-nums">{dist}</td>
                <td className="px-2 py-1 text-right tabular-nums">{slack}</td>
                <td className="px-2 py-1 text-right tabular-nums">{otPct}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fitPct}</td>
                <td className="px-2 py-1 text-right tabular-nums font-semibold">
                  {score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/** Renders the seven supervisor guardrails. While `status === "active"`,
 *  checks fill in one at a time on a 180 ms stagger so the audience sees
 *  the dispatcher work; on completion they all pop ✓; on override the
 *  list dims and the offending check shows ✗ alongside the reason. */
function DispatcherChecks({
  status,
  startedAt,
  override,
  travelWarning,
}: {
  status: StageStatus;
  startedAt: number | null;
  override: WebSocketEvent | null;
  travelWarning: WebSocketEvent | null;
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "active" || startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const elapsedMs = startedAt != null ? now - startedAt : 0;
  const revealCount =
    status === "complete"
      ? DISPATCHER_CHECKS.length
      : status === "error"
        ? DISPATCHER_CHECKS.length
        : status === "active"
          ? Math.min(
              DISPATCHER_CHECKS.length,
              Math.max(0, Math.floor(elapsedMs / DISPATCHER_CHECK_STAGGER_MS)),
            )
          : 0;

  const overrideReason: string | null = override
    ? (() => {
        const op = override.payload as Record<string, unknown>;
        const r = op?.reasons;
        return Array.isArray(r) && r.length > 0 ? String(r[0]) : null;
      })()
    : null;

  const warnMsgs: string[] = travelWarning
    ? (() => {
        const wp = travelWarning.payload as Record<string, unknown>;
        const w = wp?.warnings;
        return Array.isArray(w) ? w.map((x) => String(x)) : [];
      })()
    : [];

  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {DISPATCHER_CHECKS.map((label, i) => {
        const isLastWhenError = status === "error" && i === DISPATCHER_CHECKS.length - 1;
        const shown = i < revealCount;
        const tone = !shown
          ? "text-slate-300"
          : isLastWhenError
            ? "text-rose-700 font-semibold"
            : status === "error"
              ? "text-slate-400 line-through"
              : "text-slate-700";
        const glyph = !shown
          ? "·"
          : isLastWhenError
            ? "✗"
            : label === "Travel times verified" && status === "active"
              ? "🚗"
              : "✓";
        return (
          <div key={label} className={`flex gap-1.5 ${tone}`}>
            <span aria-hidden className="w-3 text-center">{glyph}</span>
            <span>{label}</span>
          </div>
        );
      })}
      {status === "error" && overrideReason && (
        <div className="mt-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-800">
          ⚠️ {overrideReason} — re-evaluating options
        </div>
      )}
      {status === "complete" && warnMsgs.length > 0 && (
        <div className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          🚗 Note: {warnMsgs.join(" · ")}
        </div>
      )}
    </div>
  );
}


function CountdownTimer({ startMs }: { startMs: number }): JSX.Element {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, 10 * 60 * 1000 - (now - startMs));
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  return (
    <span className="font-mono tabular-nums text-indigo-700">
      {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
    </span>
  );
}


interface TradeOff {
  label: string;
  text: string;
}

function EscalationCard({ event }: { event: WebSocketEvent }): JSX.Element {
  const p = event.payload as Record<string, unknown>;
  const opts = (p.trade_off_options as TradeOff[] | undefined) ?? [];
  const reason = (p.narrative as string) || (p.reasoning as string) || "All nearby technicians are fully booked.";
  return (
    <div className="mt-3 rounded-lg border-2 border-rose-500 bg-rose-50 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-lg font-bold text-rose-800">
        <span aria-hidden>🚨</span>
        <span>No technician available</span>
      </div>
      <div className="mt-1 text-sm text-rose-900">{reason}</div>
      {opts.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-700">
            Options for dispatcher
          </div>
          <ul className="space-y-1 text-sm">
            {opts.map((o) => (
              <li key={o.label} className="flex gap-2">
                <span className="font-mono font-bold text-rose-700">{o.label})</span>
                <span className="text-rose-900">{o.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


// ---- component ----------------------------------------------------------

export function PipelineTracker({
  events,
  activeCorrelationId,
  alpha = 0.7,
}: PipelineTrackerProps): JSX.Element | null {
  const [visible, setVisible] = useState(true);
  const prevCidRef = useRef<string | null>(null);

  // Reset visibility when the active correlation changes.
  useEffect(() => {
    if (activeCorrelationId !== prevCidRef.current) {
      prevCidRef.current = activeCorrelationId;
      setVisible(true);
    }
  }, [activeCorrelationId]);

  const state = useMemo<PipelineState>(() => {
    if (!activeCorrelationId) return emptyState();
    return reduceEvents(events, activeCorrelationId);
  }, [events.length, activeCorrelationId]);

  // Auto-hide 10 s after ROUTE_UPDATED (but not on escalation — keep those visible).
  useEffect(() => {
    if (state.routeUpdated && !state.escalation) {
      const id = setTimeout(() => setVisible(false), 10_000);
      return () => clearTimeout(id);
    }
  }, [state.routeUpdated, state.escalation]);

  if (!activeCorrelationId) return null;
  if (activeCorrelationId.startsWith("startup-")) return null;
  if (!visible) return null;

  const stages = stageList(state);

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-20 w-[640px] min-w-[600px] rounded-lg border border-slate-300 bg-white/95 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Decision pipeline
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            {activeCorrelationId}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
        <ol className="space-y-3">
          {stages.map((stage) => (
            <li key={stage.n} className="flex gap-3">
              <StageDot status={stage.status} />
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm ${
                    stage.status === "active"
                      ? "font-semibold text-indigo-900"
                      : stage.status === "complete"
                      ? "text-slate-800"
                      : stage.status === "skipped"
                      ? "text-slate-400 italic"
                      : "text-slate-400"
                  }`}
                >
                  {stage.title}
                </div>
                {stage.detail && (
                  <div className="text-xs text-slate-600">{stage.detail}</div>
                )}
                {/* Stage 5 — scoring table (client-reranked via α) */}
                {stage.n === 5 && (stage.status === "active" || stage.status === "complete") && (
                  <>
                    <ScoringTable rows={state.workerScores} alpha={alpha} />
                    {state.smartAssignment && (
                      <div className="mt-2 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        <span className="mr-1" aria-hidden>⚖️</span>
                        {(() => {
                          const p = state.smartAssignment.payload as Record<string, unknown>;
                          return (
                            <>
                              <strong>{String(p.rank1_name)}</strong> and{" "}
                              <strong>{String(p.rank2_name)}</strong> are virtually
                              tied. Assigned{" "}
                              <strong>{String(p.rank2_name)}</strong> to avoid
                              unnecessary customer disruption.
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
                {/* Stage 7 — countdown timer while awaiting (consent path) */}
                {stage.n === 7
                  && stage.kind !== "dispatcher"
                  && stage.status === "active"
                  && state.consentSentAt && (
                  <div className="mt-1 text-xs text-indigo-700">
                    ⏳ Waiting for reply — <CountdownTimer startMs={state.consentSentAt} />
                  </div>
                )}
                {/* Stage 7 — dispatcher guardrail checks (no-consent path) */}
                {stage.n === 7 && stage.kind === "dispatcher" && (
                  <DispatcherChecks
                    status={stage.status}
                    startedAt={state.lastAssignmentProposedAt}
                    override={state.supervisorOverride}
                    travelWarning={state.travelWarning}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Escalation — replaces remaining stages visually */}
        {state.escalation && <EscalationCard event={state.escalation} />}
      </div>
    </div>
  );
}
