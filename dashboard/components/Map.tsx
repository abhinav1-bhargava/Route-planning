// dashboard/components/Map.tsx
//
// Google Maps panel — workers, tasks, route polylines (OSRM road geometry),
// and an ad-hoc pulse effect when a new adhoc task arrives.
//
// NOTE: this file is a CLIENT COMPONENT. It touches `window` via the Google
// Maps SDK and must not be rendered on the server. pages/index.tsx imports
// Map via `next/dynamic` with `ssr: false` — DO NOT change that.

import { Loader } from "@googlemaps/js-api-loader";
import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { workerColor as sharedWorkerColor } from "../lib/workerColor";
import type { WebSocketEvent } from "../hooks/useWebSocket";
import type { Worker, WorkerStatus } from "./WorkerPanel";


// ---- public types -------------------------------------------------------

export type TaskType =
  | "new_installation"
  | "fault_repair"
  | "network_rehab"
  | "fiber_cut";

export type TaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "deferred";

export interface Task {
  id: string;
  type: "planned" | "adhoc";
  task_type: TaskType;
  priority: number;
  location_lat: number;
  location_lng: number;
  address: string;
  scheduled_time: string;
  duration_mins: number;
  status: TaskStatus;
  worker_id: string | null;
}

export interface RouteStop {
  task_id: string;
  address: string;
  arrival_time: string;
  distance_km_so_far: number;
  late?: boolean;
}

export interface RouteWithStops {
  worker_id: string;
  worker_name: string;
  ordered_task_ids: string[];
  ordered_task_addresses: string[];
  total_distance_km: number;
  total_time_mins: number;
  version: number;
  per_stop_etas: RouteStop[];
}

export interface MapProps {
  apiKey: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  workers: Worker[];
  tasks: Task[];
  events: WebSocketEvent[];
  activeWorkerId?: string;
  /** Routes fetched at mount by pages/index.tsx so polylines are visible
   *  before the first scenario fires. */
  initialRoutes?: RouteWithStops[];
  /** User-clicked worker id — triggers highlight/dim and a popup. Kept in
   *  sync with WorkerPanel via the parent. */
  selectedWorkerId?: string | null;
  /** Callback fired when the user clicks a worker marker on the map. */
  onWorkerSelect?: (workerId: string | null) => void;
}


// ---- constants ----------------------------------------------------------

const DEFAULT_CENTER = { lat: 28.4595, lng: 77.0266 };   // Sector 29
const DEFAULT_ZOOM = 12;
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = 5000;
const POLYLINE_FADE_MS = 1000;
const PULSE_DURATION_MS = 3000;


// ---- colour palettes ----------------------------------------------------

const workerColor = sharedWorkerColor;

const STATUS_STROKE: Record<WorkerStatus, string> = {
  idle: "#475569",       // slate-600
  en_route: "#059669",   // emerald-600
  on_site: "#d97706",    // amber-600
};

const TASK_TYPE_FILL: Record<TaskType, string> = {
  new_installation: "#2563eb",  // blue-600
  fault_repair: "#d97706",      // amber-600
  network_rehab: "#059669",     // emerald-600
  fiber_cut: "#dc2626",         // red-600
};

function taskOpacity(status: TaskStatus): number {
  if (status === "completed") return 0.3;
  if (status === "deferred") return 0.35;
  if (status === "pending") return 0.6;
  return 1.0;   // assigned or in_progress
}


// ---- marker shape paths --------------------------------------------------

function workerIcon(
  wId: string,
  status: WorkerStatus,
  selected: boolean = false,
): google.maps.Symbol {
  // 28 px diameter normally → scale 14. Selected workers get a thicker
  // ring (selected: 36 px → scale 18) so the click is visually anchored.
  const scale = selected ? 18 : 14;
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: workerColor(wId),
    fillOpacity: 0.95,
    strokeColor: STATUS_STROKE[status],
    strokeWeight: selected ? 3.5 : 2,
  };
}

// Compact pin path roughly 16×22 px. Centered at (0,0) with the point
// at (0,0) so the marker sits naturally on the lat/lng coord.
const PIN_PATH =
  "M 0,0 C -4,-4 -8,-10 -8,-14 A 8,8 0 1 1 8,-14 C 8,-10 4,-4 0,0 z";

function taskIcon(t: Task): google.maps.Symbol {
  return {
    path: PIN_PATH,
    scale: 1,
    fillColor: TASK_TYPE_FILL[t.task_type],
    fillOpacity: taskOpacity(t.status),
    strokeColor: "#0f172a",
    strokeWeight: 0.75,
    anchor: new google.maps.Point(0, 0),
  };
}


// ---- OSRM — client-side, 5s timeout, straight-line fallback -------------

async function fetchRouteGeometry(
  orderedCoords: Array<{ lat: number; lng: number }>,
): Promise<Array<{ lat: number; lng: number }>> {
  if (orderedCoords.length < 2) return orderedCoords;
  try {
    // OSRM takes lng,lat (NOT lat,lng) in the URL path; flip here and re-flip on response.
    const coordPath = orderedCoords.map((c) => `${c.lng},${c.lat}`).join(";");
    const url = `${OSRM_BASE}/${coordPath}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const body = await res.json();
    if (body.code !== "Ok" || !body.routes?.length) {
      throw new Error(`OSRM code=${body.code}`);
    }
    const coords: Array<[number, number]> = body.routes[0].geometry.coordinates;
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (err) {
    // Fallback: straight-line between input stops.
    console.warn("[Map] OSRM fallback to straight-line segments:", err);
    return orderedCoords;
  }
}


// ---- polyline fade animation --------------------------------------------
// On a route swap the old polyline is converted to a dashed grey trail for
// ROUTE_DIFF_HOLD_MS so the audience can read the BEFORE/AFTER, then it
// fades over POLYLINE_FADE_MS and is removed. The new polyline draws in
// over the same fade window in the worker's colour.

const ROUTE_DIFF_HOLD_MS = 3000;
const DASH_GREY = "#94a3b8";   // slate-400

function swapPolyline(
  map: google.maps.Map,
  polylinesRef: React.MutableRefObject<Map<string, google.maps.Polyline>>,
  workerId: string,
  newPath: Array<{ lat: number; lng: number }>,
): void {
  const oldPolyline = polylinesRef.current.get(workerId) ?? null;
  const color = workerColor(workerId);

  const next = new google.maps.Polyline({
    path: newPath,
    strokeColor: color,
    strokeOpacity: 0,
    strokeWeight: 4,
    map,
  });
  polylinesRef.current.set(workerId, next);

  // Convert old polyline to dashed grey for the hold window.
  if (oldPolyline) {
    oldPolyline.setOptions({
      strokeColor: DASH_GREY,
      strokeOpacity: 0,         // base line invisible — dashes do the work
      strokeWeight: 2,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            scale: 4,
          },
          offset: "0",
          repeat: "16px",
        },
      ],
      zIndex: 0,
    });
  }

  // Fade in the new polyline immediately so the new sequence is visible
  // alongside the dashed-grey old route.
  const fadeInStart = performance.now();
  const fadeInTick = () => {
    const t = Math.min(
      1, (performance.now() - fadeInStart) / POLYLINE_FADE_MS,
    );
    next.setOptions({ strokeOpacity: 0.75 * t });
    if (t < 1) requestAnimationFrame(fadeInTick);
  };
  fadeInTick();

  // After the hold window, fade out the dashed old polyline and remove.
  if (oldPolyline) {
    setTimeout(() => {
      const fadeOutStart = performance.now();
      const fadeOutTick = () => {
        const t = Math.min(
          1, (performance.now() - fadeOutStart) / POLYLINE_FADE_MS,
        );
        // Dashes carry the visible weight, so we fade their opacity by
        // re-applying the icon array with a scaled opacity.
        oldPolyline.setOptions({
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 0.8 * (1 - t),
                strokeWeight: 2,
                scale: 4,
              },
              offset: "0",
              repeat: "16px",
            },
          ],
        });
        if (t < 1) {
          requestAnimationFrame(fadeOutTick);
        } else {
          oldPolyline.setMap(null);
        }
      };
      fadeOutTick();
    }, ROUTE_DIFF_HOLD_MS);
  }
}


// ---- route diff card data shape ----------------------------------------

interface RouteDiff {
  workerId: string;
  workerName: string;
  before: { stops: number; km: number; endTime: string };
  after: { stops: number; km: number; endTime: string };
  adhocAddress?: string;
  adhocType?: string;
}


// ---- numbered stop markers ----------------------------------------------
// Each stop on a worker's route gets a small (20 px) circle marker in the
// worker's colour with the sequence number painted in white. Hovering
// surfaces a multi-line tooltip with task type, address, arrival, and
// projected completion time. The numbered markers sit ABOVE the
// underlying task pins so the sequence reads cleanly.

interface StopMarkerInput {
  taskId: string;
  position: { lat: number; lng: number };
  arrivalHm: string;
  taskType: TaskType | null;
  address: string;
  durationMins: number;
}

function _formatHm(arr: string, addMins: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(arr);
  if (!m) return "—";
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + addMins;
  if (!Number.isFinite(total)) return "—";
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function stopMarkerIcon(
  workerId: string,
  selected: boolean,
  dimmed: boolean,
): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 12 : 10,
    fillColor: workerColor(workerId),
    fillOpacity: dimmed ? 0.35 : 1.0,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  };
}

function stopMarkerLabel(
  num: number,
  dimmed: boolean,
): google.maps.MarkerLabel {
  return {
    text: String(num),
    color: dimmed ? "rgba(255,255,255,0.75)" : "#ffffff",
    fontSize: "10px",
    fontWeight: "700",
  };
}

function renderStopMarkers(
  map: google.maps.Map,
  stopMarkersRef: React.MutableRefObject<Map<string, google.maps.Marker[]>>,
  workerId: string,
  stops: StopMarkerInput[],
): void {
  const prev = stopMarkersRef.current.get(workerId) ?? [];
  for (const m of prev) m.setMap(null);

  if (stops.length === 0) {
    stopMarkersRef.current.delete(workerId);
    return;
  }

  const next: google.maps.Marker[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const s = stops[i];
    const taskTypeLabel = s.taskType
      ? s.taskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Task";
    const completeHm = _formatHm(s.arrivalHm, s.durationMins);
    const tooltip =
      `Stop ${i + 1} — ${taskTypeLabel}\n` +
      `${s.address}\n` +
      `Arrive: ${s.arrivalHm || "--:--"} · ` +
      `Complete: ${completeHm}`;
    const marker = new google.maps.Marker({
      position: s.position,
      map,
      icon: stopMarkerIcon(workerId, false, false),
      label: stopMarkerLabel(i + 1, false),
      title: tooltip,
      zIndex: 20,
    });
    next.push(marker);
  }
  stopMarkersRef.current.set(workerId, next);
}


// ---- pulse effect for adhoc arrivals ------------------------------------

function addPulse(map: google.maps.Map, lat: number, lng: number): void {
  const circle = new google.maps.Circle({
    map,
    center: { lat, lng },
    radius: 50,
    fillColor: "#dc2626",
    fillOpacity: 0.4,
    strokeColor: "#dc2626",
    strokeOpacity: 0.9,
    strokeWeight: 2,
  });
  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    if (elapsed >= PULSE_DURATION_MS) {
      circle.setMap(null);
      return;
    }
    const phase = (elapsed % 700) / 700;   // 0..1 every 0.7s
    circle.setRadius(60 + phase * 220);
    circle.setOptions({
      fillOpacity: 0.55 * (1 - phase),
      strokeOpacity: 0.9 * (1 - phase),
    });
    requestAnimationFrame(tick);
  };
  tick();
}


// ---- component ----------------------------------------------------------

function MapPanel({
  apiKey,
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  workers,
  tasks,
  events,
  activeWorkerId,
  initialRoutes,
  selectedWorkerId,
  onWorkerSelect,
}: MapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const workerMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const workerPositionsRef = useRef<Map<string, google.maps.LatLngLiteral>>(new Map());
  const taskMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const stopMarkersRef = useRef<Map<string, google.maps.Marker[]>>(new Map());
  const routeVersionRef = useRef<Map<string, number>>(new Map());
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const seenAdhocTaskIdsRef = useRef<Set<string>>(new Set());
  const paintedInitialRef = useRef<Set<string>>(new Set());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  // Per-worker snapshot of stats at the moment a ROUTE_UPDATED event was
  // last processed — drives the route-diff card's "Before" column.
  const prevRouteStatsRef = useRef<
    Map<string, { stops: number; km: number; endTime: string }>
  >(new Map());
  const [routeDiff, setRouteDiff] = useState<RouteDiff | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- load the Google Maps SDK + instantiate the map -------------------
  useEffect(() => {
    if (!apiKey) {
      setLoadError("GOOGLE_MAPS_API_KEY not set");
      return;
    }
    let cancelled = false;
    const loader = new Loader({ apiKey, version: "weekly" });
    loader
      .load()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: initialZoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        setMapReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
    // initialCenter/Zoom intentionally not in deps — changing them after
    // load shouldn't tear the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // ---- worker markers ---------------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const existing = workerMarkersRef.current;
    const seen = new Set<string>();
    for (const w of workers) {
      seen.add(w.id);
      const pos =
        workerPositionsRef.current.get(w.id) ??
        { lat: w.current_lat, lng: w.current_lng };
      workerPositionsRef.current.set(w.id, pos);
      let marker = existing.get(w.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: pos,
          map: mapRef.current,
          label: { text: w.id, color: "#ffffff", fontSize: "9px", fontWeight: "700" },
          title: `${w.name} (${w.status})`,
          icon: workerIcon(w.id, w.status),
          zIndex: 10,
        });
        // Click → notify parent to set selected worker.
        const onClickWid = w.id;
        marker.addListener("click", () => {
          if (onWorkerSelect) {
            onWorkerSelect(onClickWid);
          }
        });
        existing.set(w.id, marker);
      } else {
        marker.setPosition(pos);
        marker.setIcon(workerIcon(w.id, w.status));
        marker.setTitle(`${w.name} (${w.status})`);
      }
    }
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }
  }, [mapReady, workers]);

  // ---- task markers (+ adhoc pulse on first appearance) -----------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const existing = taskMarkersRef.current;
    const seen = new Set<string>();
    for (const t of tasks) {
      seen.add(t.id);
      const pos = { lat: t.location_lat, lng: t.location_lng };
      let marker = existing.get(t.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: pos,
          map: mapRef.current,
          title: `${t.id} — ${t.task_type} (${t.status}) — ${t.address}`,
          icon: taskIcon(t),
        });
        existing.set(t.id, marker);
        // Pulse ONLY the first time we see an adhoc task on the map.
        if (t.type === "adhoc" && !seenAdhocTaskIdsRef.current.has(t.id)) {
          seenAdhocTaskIdsRef.current.add(t.id);
          addPulse(mapRef.current, pos.lat, pos.lng);
        }
      } else {
        marker.setPosition(pos);
        marker.setIcon(taskIcon(t));
        marker.setTitle(`${t.id} — ${t.task_type} (${t.status}) — ${t.address}`);
      }
    }
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }
  }, [mapReady, tasks]);

  // Task-id → coordinates for polyline reconstruction.
  const taskCoords = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const t of tasks) m.set(t.id, { lat: t.location_lat, lng: t.location_lng });
    return m;
  }, [tasks]);

  // ---- event processing: LOCATION_UPDATE + ROUTE_UPDATED ----------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    for (const e of events) {
      if (processedEventIdsRef.current.has(e.id)) continue;
      processedEventIdsRef.current.add(e.id);

      if (e.event_type === "LOCATION_UPDATE") {
        const p = e.payload as {
          worker_id?: string;
          status?: WorkerStatus;
          current_lat?: number;
          current_lng?: number;
        };
        if (!p.worker_id) continue;
        const marker = workerMarkersRef.current.get(p.worker_id);
        if (!marker) continue;
        const prev = workerPositionsRef.current.get(p.worker_id);
        const next = {
          lat: p.current_lat ?? prev?.lat ?? 0,
          lng: p.current_lng ?? prev?.lng ?? 0,
        };
        workerPositionsRef.current.set(p.worker_id, next);
        marker.setPosition(next);
        if (p.status) {
          marker.setIcon(workerIcon(p.worker_id, p.status));
        }
      } else if (e.event_type === "ROUTE_UPDATED") {
        const p = e.payload as {
          worker_id?: string;
          version?: number;
          ordered_task_ids?: string[];
          total_distance_km?: number;
          per_stop_etas?: Array<{
            task_id?: string;
            arrival_time_hm?: string;
          }>;
        };
        if (!p.worker_id || typeof p.version !== "number") continue;
        const prevVersion = routeVersionRef.current.get(p.worker_id) ?? -1;
        if (p.version < prevVersion) continue;
        routeVersionRef.current.set(p.worker_id, p.version);

        // Capture before/after for the route diff card on non-startup
        // replans. The "before" snapshot was last saved on the previous
        // ROUTE_UPDATED (or initial) for this worker.
        const isStartup = (e.correlation_id || "").startsWith("startup-");
        const newStops = (p.ordered_task_ids ?? []).length;
        const newKm = typeof p.total_distance_km === "number" ? p.total_distance_km : 0;
        const newEnd =
          (p.per_stop_etas && p.per_stop_etas.length > 0
            ? p.per_stop_etas[p.per_stop_etas.length - 1].arrival_time_hm
            : "") || "—";
        if (!isStartup) {
          const before = prevRouteStatsRef.current.get(p.worker_id);
          if (before) {
            const w = workers.find((x) => x.id === p.worker_id);
            // Try to identify the new ad-hoc task introduced by this
            // replan by diffing ordered_task_ids against the prior set.
            const newAdhoc = (p.ordered_task_ids ?? [])
              .map((tid) => tasks.find((tk) => tk.id === tid))
              .find((t) => t && t.type === "adhoc");
            setRouteDiff({
              workerId: p.worker_id,
              workerName: w?.name ?? p.worker_id,
              before,
              after: { stops: newStops, km: newKm, endTime: newEnd },
              adhocAddress: newAdhoc?.address,
              adhocType: newAdhoc?.task_type,
            });
          }
        }
        prevRouteStatsRef.current.set(p.worker_id, {
          stops: newStops, km: newKm, endTime: newEnd,
        });

        const coords: Array<{ lat: number; lng: number }> = [];
        const wpos = workerPositionsRef.current.get(p.worker_id);
        if (wpos) coords.push(wpos);
        for (const tid of p.ordered_task_ids ?? []) {
          const loc = taskCoords.get(tid);
          if (loc) coords.push(loc);
        }

        if (coords.length < 2) {
          // Empty route — clear any existing polyline + stop markers.
          const old = polylinesRef.current.get(p.worker_id);
          if (old) {
            old.setMap(null);
            polylinesRef.current.delete(p.worker_id);
          }
          renderStopMarkers(map, stopMarkersRef, p.worker_id, []);
          continue;
        }

        // Build numbered stop markers immediately from the event payload.
        const stops: StopMarkerInput[] = [];
        for (const s of p.per_stop_etas ?? []) {
          if (!s.task_id) continue;
          const t = tasks.find((x) => x.id === s.task_id);
          if (!t) continue;
          stops.push({
            taskId: s.task_id,
            position: { lat: t.location_lat, lng: t.location_lng },
            arrivalHm: s.arrival_time_hm ?? "",
            taskType: t.task_type,
            address: t.address,
            durationMins: t.duration_mins,
          });
        }
        renderStopMarkers(map, stopMarkersRef, p.worker_id, stops);

        // Fetch async; guard against stale responses via version check.
        const myVersion = p.version;
        const workerId = p.worker_id;
        void (async () => {
          const geom = await fetchRouteGeometry(coords);
          if ((routeVersionRef.current.get(workerId) ?? -1) !== myVersion) return;
          swapPolyline(map, polylinesRef, workerId, geom);
        })();
      }
    }
  }, [events, mapReady, taskCoords]);

  // ---- pan to active worker --------------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current || !activeWorkerId) return;
    const pos = workerPositionsRef.current.get(activeWorkerId);
    if (pos) mapRef.current.panTo(pos);
  }, [activeWorkerId, mapReady]);

  // ---- initial-route polylines + numbered markers (painted once;
  //      OSRM fetched in background) -------------------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current || !initialRoutes) return;
    const map = mapRef.current;
    for (const r of initialRoutes) {
      // Always seed the route-diff "before" snapshot from the latest
      // /routes payload, even if we already painted polyline + markers
      // for this worker. Without this seed, the first scenario's
      // ROUTE_UPDATED has no baseline to diff against and the
      // BEFORE/AFTER card never shows.
      const stopsCount = r.ordered_task_ids?.length ?? 0;
      const lastEta = r.per_stop_etas?.length
        ? r.per_stop_etas[r.per_stop_etas.length - 1]?.arrival_time
        : "";
      prevRouteStatsRef.current.set(r.worker_id, {
        stops: stopsCount,
        km: r.total_distance_km ?? 0,
        endTime: lastEta || "—",
      });

      if (paintedInitialRef.current.has(r.worker_id)) continue;
      if (polylinesRef.current.has(r.worker_id)) continue;
      const coords: Array<{ lat: number; lng: number }> = [];
      const wpos = workerPositionsRef.current.get(r.worker_id);
      if (wpos) coords.push(wpos);
      for (const tid of r.ordered_task_ids) {
        const t = tasks.find((x) => x.id === tid);
        if (t) coords.push({ lat: t.location_lat, lng: t.location_lng });
      }
      if (coords.length < 2) continue;
      paintedInitialRef.current.add(r.worker_id);

      // Numbered stop markers from the per_stop_etas snapshot in the
      // /routes payload — drawn synchronously so the sequence is
      // visible before OSRM resolves.
      const stops: StopMarkerInput[] = [];
      for (const s of r.per_stop_etas ?? []) {
        const t = tasks.find((x) => x.id === s.task_id);
        if (!t) continue;
        stops.push({
          taskId: s.task_id,
          position: { lat: t.location_lat, lng: t.location_lng },
          arrivalHm: s.arrival_time ?? "",
          taskType: t.task_type,
          address: t.address,
          durationMins: t.duration_mins,
        });
      }
      renderStopMarkers(map, stopMarkersRef, r.worker_id, stops);

      const wid = r.worker_id;
      void (async () => {
        const geom = await fetchRouteGeometry(coords);
        if (polylinesRef.current.has(wid)) return; // event-driven replacement
        swapPolyline(map, polylinesRef, wid, geom);
      })();
    }
  }, [mapReady, initialRoutes, tasks]);

  // ---- polyline opacity follows selectedWorkerId -------------------------
  // Defaults: 2 px / 40 %; selected: 3 px / 100 %; others when one selected:
  // 1 px / 20 %.
  useEffect(() => {
    for (const [wid, poly] of polylinesRef.current.entries()) {
      if (!selectedWorkerId) {
        poly.setOptions({ strokeOpacity: 0.4, strokeWeight: 2, zIndex: 1 });
      } else if (selectedWorkerId === wid) {
        poly.setOptions({ strokeOpacity: 1.0, strokeWeight: 3, zIndex: 5 });
      } else {
        poly.setOptions({ strokeOpacity: 0.2, strokeWeight: 1, zIndex: 1 });
      }
    }
    // Numbered stop markers follow the same selection logic — selected
    // worker's sequence is full opacity / slightly larger; others dim.
    for (const [wid, markers] of stopMarkersRef.current.entries()) {
      const selected = !!selectedWorkerId && selectedWorkerId === wid;
      const dimmed = !!selectedWorkerId && selectedWorkerId !== wid;
      for (let i = 0; i < markers.length; i += 1) {
        markers[i].setIcon(stopMarkerIcon(wid, selected, dimmed));
        markers[i].setLabel(stopMarkerLabel(i + 1, dimmed));
        markers[i].setZIndex(selected ? 25 : dimmed ? 15 : 20);
      }
    }
  }, [selectedWorkerId]);

  // ---- update worker marker icon on selection toggle -------------------
  useEffect(() => {
    for (const [wid, marker] of workerMarkersRef.current.entries()) {
      const w = workers.find((x) => x.id === wid);
      if (!w) continue;
      const isSelected = selectedWorkerId === wid;
      marker.setIcon(workerIcon(wid, w.status, isSelected));
    }
  }, [selectedWorkerId, workers]);

  // ---- InfoWindow popup on worker selection ----------------------------
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    // Always close any prior window before deciding what to show.
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
    if (!selectedWorkerId) return;
    const marker = workerMarkersRef.current.get(selectedWorkerId);
    if (!marker) return;
    const worker = workers.find((w) => w.id === selectedWorkerId);
    const route = initialRoutes?.find(
      (r) => r.worker_id === selectedWorkerId,
    );
    const stopsHtml = route?.per_stop_etas?.length
      ? route.per_stop_etas
          .map(
            (s, i) =>
              `<div style="padding:2px 0;font-size:11px;color:#334155;">` +
              `${i + 1}. <b>${s.arrival_time || "--:--"}</b> · ` +
              `${(s.address || "").replace(/</g, "&lt;").slice(0, 50)}` +
              (s.late ? ` <span style="color:#b91c1c;font-weight:600">LATE</span>` : "") +
              `</div>`,
          )
          .join("")
      : `<div style="font-size:11px;color:#94a3b8;">No route assigned yet</div>`;
    const nameHtml = `<div style="font-weight:600;font-size:13px;color:#0f172a;">`
      + `${worker?.name ?? selectedWorkerId} `
      + `<span style="font-weight:400;color:#64748b;font-size:11px;">(${selectedWorkerId})</span>`
      + `</div>`;
    const skillsHtml = worker
      ? `<div style="color:#64748b;font-size:11px;margin-bottom:4px;">` +
        `${worker.skill_tags.join(" · ")}</div>`
      : "";
    const summary = route && route.total_distance_km
      ? `<div style="font-size:11px;color:#334155;margin-bottom:4px;">` +
        `<b>${route.total_distance_km.toFixed(1)} km</b> · ` +
        `${route.total_time_mins} min · ${route.per_stop_etas.length} stops</div>`
      : "";
    const html = `<div style="min-width:260px;font-family:system-ui;">
      ${nameHtml}${skillsHtml}${summary}
      <div style="border-top:1px solid #e2e8f0;padding-top:4px;">${stopsHtml}</div>
    </div>`;
    const iw = new google.maps.InfoWindow({ content: html });
    iw.open({ anchor: marker, map: mapRef.current });
    infoWindowRef.current = iw;
  }, [mapReady, selectedWorkerId, initialRoutes, workers]);

  // ---- auto-dismiss the route diff card after 10 seconds ---------------
  useEffect(() => {
    if (!routeDiff) return;
    const id = setTimeout(() => setRouteDiff(null), 10_000);
    return () => clearTimeout(id);
  }, [routeDiff]);

  // ---- cleanup on unmount ----------------------------------------------
  useEffect(() => {
    return () => {
      for (const m of workerMarkersRef.current.values()) m.setMap(null);
      for (const m of taskMarkersRef.current.values()) m.setMap(null);
      for (const p of polylinesRef.current.values()) p.setMap(null);
      for (const arr of stopMarkersRef.current.values()) {
        for (const m of arr) m.setMap(null);
      }
      workerMarkersRef.current.clear();
      taskMarkersRef.current.clear();
      polylinesRef.current.clear();
      stopMarkersRef.current.clear();
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      {loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded bg-rose-100 px-4 py-2 text-sm text-rose-800 shadow">
            Map unavailable: {loadError}
          </div>
        </div>
      )}
      {!mapReady && !loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded bg-white px-4 py-2 text-sm text-slate-500 shadow">
            Loading map…
          </div>
        </div>
      )}

      {routeDiff && (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-80 rounded-lg border-2 border-indigo-400 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
            Route change — {routeDiff.workerName}
            <button
              type="button"
              onClick={() => setRouteDiff(null)}
              className="float-right text-slate-400 hover:text-slate-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-200">
            <div className="px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Before
              </div>
              <div className="mt-1 text-xs text-slate-700">
                <div>{routeDiff.before.stops} stops</div>
                <div className="tabular-nums">
                  {routeDiff.before.km.toFixed(1)} km
                </div>
                <div className="tabular-nums">
                  Done by {routeDiff.before.endTime}
                </div>
              </div>
            </div>
            <div className="px-3 py-2 bg-emerald-50">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                After
              </div>
              <div className="mt-1 text-xs text-slate-800">
                <div>{routeDiff.after.stops} stops</div>
                <div className="tabular-nums">
                  {routeDiff.after.km.toFixed(1)} km
                </div>
                <div className="tabular-nums">
                  Done by {routeDiff.after.endTime}
                </div>
              </div>
            </div>
          </div>
          {(() => {
            const dStops = routeDiff.after.stops - routeDiff.before.stops;
            const dKm = routeDiff.after.km - routeDiff.before.km;
            const stopSign = dStops >= 0 ? "+" : "";
            const kmSign = dKm >= 0 ? "+" : "";
            return (
              <div className="border-t border-slate-200 bg-indigo-50 px-3 py-1.5 text-[11px] text-indigo-900">
                <span className="font-semibold uppercase tracking-wider text-indigo-700">
                  Change
                </span>{" "}
                <span className="tabular-nums">
                  {stopSign}{dStops} stop{Math.abs(dStops) === 1 ? "" : "s"}
                </span>
                {" · "}
                <span className="tabular-nums">
                  {kmSign}{dKm.toFixed(1)} km
                </span>
                {" · "}
                <span>{routeDiff.workerName} dispatched</span>
              </div>
            );
          })()}
          {routeDiff.adhocAddress && (
            <div className="border-t border-slate-200 px-3 py-2 text-xs">
              <span className="text-rose-700 font-semibold">+ </span>
              <span className="text-slate-700">
                {routeDiff.adhocType?.replace("_", " ") || "task"} ·{" "}
                {routeDiff.adhocAddress}
              </span>
              <span className="ml-2 rounded bg-rose-100 px-1 text-[10px] font-medium text-rose-800">
                NEW AD-HOC
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MapPanel;
