// dashboard/pages/index.tsx
//
// Final dashboard assembly. Owns:
//   - ONE useWebSocket call (shared events + status passed to every pane)
//   - ONE fetch of /workers and /tasks at mount (refetched on TASK_CREATED)
//   - Scenario trigger buttons + α slider + Reset button
//
// Map is dynamically imported with ssr:false because the Google Maps SDK
// touches `window` and would crash Next.js SSR otherwise.

import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

import { EventLog } from "../components/EventLog";
import type { MapProps, RouteWithStops, Task } from "../components/Map";
import { MetricsStrip } from "../components/MetricsStrip";
import { PipelineTracker } from "../components/PipelineTracker";
import { WFMOutput } from "../components/WFMOutput";
import type { Worker } from "../components/WorkerPanel";
import { WorkerPanel } from "../components/WorkerPanel";
import { useWebSocket } from "../hooks/useWebSocket";


// ---- dynamic Map (ssr:false — SDK touches window) ----------------------

const Map = dynamic<MapProps>(
  () => import("../components/Map").then((m) => m.default),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-100" /> },
);


// ---- env-driven endpoints ---------------------------------------------
//
// Both endpoints default to relative URLs so the dashboard can be served
// behind any host (localhost, ngrok, App Platform) without code changes:
//   - HTTP: "/api/*" — Next.js's rewrite proxies to the FastAPI backend
//   - WS:   "wss://<current-host>/ws/events" — same tunnel, single domain
// NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL can override either when a
// deployment topology needs an absolute URL.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

function deriveWsUrl(): string {
  // BUILD_TIME-injected env var wins.
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  // Browser fallback: same host as the dashboard, ws/wss based on protocol.
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/events`;
  }
  // SSR fallback. Never actually opened — useWebSocket only fires on mount.
  return "";
}


// ---- scenario metadata (buttons) --------------------------------------

type ScenarioTone = "red" | "amber" | "rose" | "indigo";

interface ScenarioButton {
  n: number;
  label: string;
  description: string;
  tone: ScenarioTone;
}

const SCENARIOS: ScenarioButton[] = [
  {
    n: 1,
    label: "S1 — Fiber Cut · Critical Priority",
    description:
      "An emergency fiber cut at Sector 29. System scans all 10 technicians, scores on ETA, schedule fit and distance, dispatches the nearest fiber_cut skilled technician instantly. No consent needed.",
    tone: "red",
  },
  {
    n: 2,
    label: "S2 — Fiber Cut · Consent Required",
    description:
      "Fiber cut at DLF Phase 3. Best available technician has a scheduled job that must move. System asks the customer for approval via Telegram. Reply on the demo phone by typing anything — YES, NO, haan, nahi, chalega.",
    tone: "red",
  },
  {
    n: 3,
    label: "S3 — New Installation · Commercial Hub",
    description:
      "New installation at Cyber City during business hours. LLM supervisor recognises the commercial hub context and adjusts urgency. Watch the reasoning in the event log — different from S1 despite same priority.",
    tone: "amber",
  },
  {
    n: 4,
    label: "S4 — New Installation · Concurrent Request",
    description:
      "Second installation while S3 is active. System finds a technician with schedule slack without disrupting the first assignment. Shows fleet balancing.",
    tone: "amber",
  },
  {
    n: 5,
    label: "S5 — Fault Repair · Escalation",
    description:
      "Fault repair arrives but all nearby fault-skilled technicians are fully loaded. System cannot resolve automatically and escalates to dispatcher with options A, B, C. Run make seed-s5 before triggering.",
    tone: "rose",
  },
  {
    n: 6,
    label: "S6 — Fault Repair · Distance vs Time",
    description:
      "Two technicians virtually equidistant. Alpha slider controls whether system optimises for speed or distance. Drag the slider and watch the selection flip in the scoring table.",
    tone: "indigo",
  },
];

const TONE_CLASS: Record<ScenarioTone, string> = {
  red:    "border-red-500 bg-red-50 hover:bg-red-100 text-red-900",
  amber:  "border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-900",
  rose:   "border-rose-600 bg-rose-600 hover:bg-rose-700 text-white font-bold",
  indigo: "border-indigo-500 bg-indigo-50 hover:bg-indigo-100 text-indigo-900",
};

const TONE_SUB_CLASS: Record<ScenarioTone, string> = {
  red:    "text-red-700",
  amber:  "text-amber-700",
  rose:   "text-rose-100",
  indigo: "text-indigo-700",
};


// ---- page ---------------------------------------------------------------

export default function Home() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routes, setRoutes] = useState<RouteWithStops[]>([]);
  const [alpha, setAlpha] = useState<number>(0.7);
  const [busyScenario, setBusyScenario] = useState<number | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [wfmOpen, setWfmOpen] = useState<boolean>(false);
  // WS URL is derived in the browser from the current page host so the
  // tunnel only needs one port forwarded. Lazy-init the state so the
  // server-rendered "" never reaches the WebSocket constructor.
  const [wsUrl] = useState<string>(deriveWsUrl);

  const { events, latestEvent, status } = useWebSocket(wsUrl);

  // Initial fetch of workers + tasks + routes.
  useEffect(() => {
    refetchWorkers();
    refetchTasks();
    refetchRoutes();
  }, []);

  // Refetch on relevant events.
  useEffect(() => {
    if (!latestEvent) return;
    if (latestEvent.event_type === "TASK_CREATED") {
      refetchTasks();
    }
    if (latestEvent.event_type === "ROUTE_UPDATED") {
      refetchRoutes();
      // Slide up the WFM panel on non-startup replans.
      if (!latestEvent.correlation_id.startsWith("startup-")) {
        setWfmOpen(true);
      }
    }
  }, [latestEvent]);

  async function refetchWorkers(): Promise<void> {
    try {
      const r = await fetch(`${API_URL}/workers`);
      if (r.ok) setWorkers(await r.json());
    } catch (e) {
      console.error("failed to fetch workers:", e);
    }
  }

  async function refetchTasks(): Promise<void> {
    try {
      const r = await fetch(`${API_URL}/tasks`);
      if (r.ok) setTasks(await r.json());
    } catch (e) {
      console.error("failed to fetch tasks:", e);
    }
  }

  async function refetchRoutes(): Promise<void> {
    try {
      const r = await fetch(`${API_URL}/routes`);
      if (r.ok) setRoutes(await r.json());
    } catch (e) {
      console.error("failed to fetch routes:", e);
    }
  }

  // "Active worker" = the worker id from the latest non-startup event's payload.
  const activeWorkerId = useMemo<string | undefined>(() => {
    if (!latestEvent) return undefined;
    if (latestEvent.correlation_id.startsWith("startup-")) return undefined;
    const wid = (latestEvent.payload as { worker_id?: unknown })?.worker_id;
    return typeof wid === "string" ? wid : undefined;
  }, [latestEvent]);

  // The correlation_id driving the pipeline tracker — non-startup only.
  const activeCorrelationId = useMemo<string | null>(() => {
    if (!latestEvent) return null;
    if (latestEvent.correlation_id.startsWith("startup-")) return null;
    return latestEvent.correlation_id;
  }, [latestEvent]);

  async function triggerScenario(n: number): Promise<void> {
    setBusyScenario(n);
    try {
      // API_URL may be relative ("/api"), so build the path manually rather
      // than using `new URL(...)` which requires an absolute base.
      const qs = n === 6 ? `?alpha=${encodeURIComponent(String(alpha))}` : "";
      await fetch(`${API_URL}/scenario/${n}${qs}`, { method: "POST" });
    } catch (e) {
      console.error(`scenario ${n} failed:`, e);
    } finally {
      setBusyScenario(null);
    }
  }

  async function resetDemo(): Promise<void> {
    try {
      await fetch(`${API_URL}/reset`, { method: "POST" });
      await refetchWorkers();
      await refetchTasks();
      await refetchRoutes();
      setSelectedWorkerId(null);
      setWfmOpen(false);
    } catch (e) {
      console.error("reset failed:", e);
    }
  }

  return (
    <>
      <Head>
        <title>Route Planning Agent Demo</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>

      <div className="flex h-screen flex-col bg-slate-50">
        {/* top strip */}
        <MetricsStrip
          events={events}
          status={status}
          initialRoutes={routes}
        />

        {/* main 3-column */}
        <div className="flex min-h-0 flex-1">
          <div className="flex h-full w-80 min-h-0 flex-shrink-0 flex-col">
            <WorkerPanel
              workers={workers}
              tasks={tasks}
              events={events}
              initialRoutes={routes}
              activeWorkerId={activeWorkerId}
              selectedWorkerId={selectedWorkerId}
              onWorkerSelect={setSelectedWorkerId}
            />
          </div>
          <div className="relative min-w-0 flex-1">
            <Map
              apiKey={GOOGLE_MAPS_KEY}
              workers={workers}
              tasks={tasks}
              events={events}
              activeWorkerId={activeWorkerId}
              initialRoutes={routes}
              selectedWorkerId={selectedWorkerId}
              onWorkerSelect={setSelectedWorkerId}
            />
            {/* Overlay pipeline tracker — floats over the map while a
                non-startup scenario is active; auto-hides 10s after
                ROUTE_UPDATED (unless an escalation is showing). */}
            <PipelineTracker
              events={events}
              activeCorrelationId={activeCorrelationId}
              alpha={alpha}
            />
          </div>
          <div className="w-96 flex-shrink-0">
            <EventLog events={events} />
          </div>
        </div>

        {/* controls */}
        <div className="border-t border-slate-200 bg-white px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                Scenarios
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {SCENARIOS.map((s) => {
                  const busy = busyScenario === s.n;
                  const toneCls = TONE_CLASS[s.tone];
                  const subCls = TONE_SUB_CLASS[s.tone];
                  return (
                    <div key={s.n}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => triggerScenario(s.n)}
                        className={`${toneCls} w-full rounded border-2 px-3 py-2 text-left transition-colors disabled:opacity-50`}
                      >
                        <div className="text-sm font-semibold">
                          {busy ? "Firing…" : s.label}
                        </div>
                        <div className={`mt-0.5 text-xs ${subCls}`}>
                          {s.description}
                        </div>
                      </button>
                      {s.n === 6 && (
                        <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="alpha"
                              className="text-xs font-medium text-indigo-700"
                            >
                              α
                            </label>
                            <input
                              id="alpha"
                              type="range"
                              min={0}
                              max={1}
                              step={0.1}
                              value={alpha}
                              onChange={(e) =>
                                setAlpha(parseFloat(e.target.value))
                              }
                              className="flex-1 accent-indigo-600"
                            />
                            <span className="w-8 text-right font-mono text-xs tabular-nums text-indigo-700">
                              {alpha.toFixed(1)}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-indigo-400">
                            <span>0 = distance</span>
                            <span>1 = time</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWfmOpen((v) => !v)}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {wfmOpen ? "Hide WFM Output" : "View WFM Output"}
              </button>
              <button
                type="button"
                onClick={resetDemo}
                className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Slide-up WFM dispatch payload panel. */}
        <WFMOutput
          events={events}
          activeCorrelationId={activeCorrelationId}
          apiUrl={API_URL}
          open={wfmOpen}
          onClose={() => setWfmOpen(false)}
        />
      </div>
    </>
  );
}
