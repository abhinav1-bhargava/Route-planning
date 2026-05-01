(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/route-planning-demo/dashboard/components/Map.tsx [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/node_modules/react/jsx-dev-runtime.js [client] (ecmascript)");
// dashboard/components/Map.tsx
//
// Google Maps panel — workers, tasks, route polylines (OSRM road geometry),
// and an ad-hoc pulse effect when a new adhoc task arrives.
//
// NOTE: this file is a CLIENT COMPONENT. It touches `window` via the Google
// Maps SDK and must not be rendered on the server. pages/index.tsx imports
// Map via `next/dynamic` with `ssr: false` — DO NOT change that.
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f40$googlemaps$2f$js$2d$api$2d$loader$2f$dist$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/node_modules/@googlemaps/js-api-loader/dist/index.mjs [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/node_modules/react/index.js [client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$lib$2f$workerColor$2e$ts__$5b$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/lib/workerColor.ts [client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
;
;
;
// ---- constants ----------------------------------------------------------
const DEFAULT_CENTER = {
    lat: 28.4595,
    lng: 77.0266
}; // Sector 29
const DEFAULT_ZOOM = 12;
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = 5000;
const POLYLINE_FADE_MS = 1000;
const PULSE_DURATION_MS = 3000;
// ---- colour palettes ----------------------------------------------------
const workerColor = __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$lib$2f$workerColor$2e$ts__$5b$client$5d$__$28$ecmascript$29$__["workerColor"];
const STATUS_STROKE = {
    idle: "#475569",
    en_route: "#059669",
    on_site: "#d97706"
};
const TASK_TYPE_FILL = {
    new_installation: "#2563eb",
    fault_repair: "#d97706",
    network_rehab: "#059669",
    fiber_cut: "#dc2626"
};
function taskOpacity(status) {
    if (status === "completed") return 0.3;
    if (status === "deferred") return 0.35;
    if (status === "pending") return 0.6;
    return 1.0; // assigned or in_progress
}
// ---- marker shape paths --------------------------------------------------
function workerIcon(wId, status, selected = false) {
    // 28 px diameter normally → scale 14. Selected workers get a thicker
    // ring (selected: 36 px → scale 18) so the click is visually anchored.
    const scale = selected ? 18 : 14;
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale,
        fillColor: workerColor(wId),
        fillOpacity: 0.95,
        strokeColor: STATUS_STROKE[status],
        strokeWeight: selected ? 3.5 : 2
    };
}
// Compact pin path roughly 16×22 px. Centered at (0,0) with the point
// at (0,0) so the marker sits naturally on the lat/lng coord.
const PIN_PATH = "M 0,0 C -4,-4 -8,-10 -8,-14 A 8,8 0 1 1 8,-14 C 8,-10 4,-4 0,0 z";
function taskIcon(t) {
    return {
        path: PIN_PATH,
        scale: 1,
        fillColor: TASK_TYPE_FILL[t.task_type],
        fillOpacity: taskOpacity(t.status),
        strokeColor: "#0f172a",
        strokeWeight: 0.75,
        anchor: new google.maps.Point(0, 0)
    };
}
// ---- OSRM — client-side, 5s timeout, straight-line fallback -------------
async function fetchRouteGeometry(orderedCoords) {
    if (orderedCoords.length < 2) return orderedCoords;
    try {
        // OSRM takes lng,lat (NOT lat,lng) in the URL path; flip here and re-flip on response.
        const coordPath = orderedCoords.map((c)=>`${c.lng},${c.lat}`).join(";");
        const url = `${OSRM_BASE}/${coordPath}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), OSRM_TIMEOUT_MS);
        const res = await fetch(url, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        const body = await res.json();
        if (body.code !== "Ok" || !body.routes?.length) {
            throw new Error(`OSRM code=${body.code}`);
        }
        const coords = body.routes[0].geometry.coordinates;
        return coords.map(([lng, lat])=>({
                lat,
                lng
            }));
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
const DASH_GREY = "#94a3b8"; // slate-400
function swapPolyline(map, polylinesRef, workerId, newPath) {
    const oldPolyline = polylinesRef.current.get(workerId) ?? null;
    const color = workerColor(workerId);
    const next = new google.maps.Polyline({
        path: newPath,
        strokeColor: color,
        strokeOpacity: 0,
        strokeWeight: 4,
        map
    });
    polylinesRef.current.set(workerId, next);
    // Convert old polyline to dashed grey for the hold window.
    if (oldPolyline) {
        oldPolyline.setOptions({
            strokeColor: DASH_GREY,
            strokeOpacity: 0,
            strokeWeight: 2,
            icons: [
                {
                    icon: {
                        path: "M 0,-1 0,1",
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        scale: 4
                    },
                    offset: "0",
                    repeat: "16px"
                }
            ],
            zIndex: 0
        });
    }
    // Fade in the new polyline immediately so the new sequence is visible
    // alongside the dashed-grey old route.
    const fadeInStart = performance.now();
    const fadeInTick = ()=>{
        const t = Math.min(1, (performance.now() - fadeInStart) / POLYLINE_FADE_MS);
        next.setOptions({
            strokeOpacity: 0.75 * t
        });
        if (t < 1) requestAnimationFrame(fadeInTick);
    };
    fadeInTick();
    // After the hold window, fade out the dashed old polyline and remove.
    if (oldPolyline) {
        setTimeout(()=>{
            const fadeOutStart = performance.now();
            const fadeOutTick = ()=>{
                const t = Math.min(1, (performance.now() - fadeOutStart) / POLYLINE_FADE_MS);
                // Dashes carry the visible weight, so we fade their opacity by
                // re-applying the icon array with a scaled opacity.
                oldPolyline.setOptions({
                    icons: [
                        {
                            icon: {
                                path: "M 0,-1 0,1",
                                strokeOpacity: 0.8 * (1 - t),
                                strokeWeight: 2,
                                scale: 4
                            },
                            offset: "0",
                            repeat: "16px"
                        }
                    ]
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
function _formatHm(arr, addMins) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(arr);
    if (!m) return "—";
    const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + addMins;
    if (!Number.isFinite(total)) return "—";
    const hh = Math.floor(total / 60).toString().padStart(2, "0");
    const mm = (total % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
}
function stopMarkerIcon(workerId, selected, dimmed) {
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: selected ? 12 : 10,
        fillColor: workerColor(workerId),
        fillOpacity: dimmed ? 0.35 : 1.0,
        strokeColor: "#ffffff",
        strokeWeight: 2
    };
}
function stopMarkerLabel(num, dimmed) {
    return {
        text: String(num),
        color: dimmed ? "rgba(255,255,255,0.75)" : "#ffffff",
        fontSize: "10px",
        fontWeight: "700"
    };
}
function renderStopMarkers(map, stopMarkersRef, workerId, stops) {
    const prev = stopMarkersRef.current.get(workerId) ?? [];
    for (const m of prev)m.setMap(null);
    if (stops.length === 0) {
        stopMarkersRef.current.delete(workerId);
        return;
    }
    const next = [];
    for(let i = 0; i < stops.length; i += 1){
        const s = stops[i];
        const taskTypeLabel = s.taskType ? s.taskType.replace(/_/g, " ").replace(/\b\w/g, (c)=>c.toUpperCase()) : "Task";
        const completeHm = _formatHm(s.arrivalHm, s.durationMins);
        const tooltip = `Stop ${i + 1} — ${taskTypeLabel}\n` + `${s.address}\n` + `Arrive: ${s.arrivalHm || "--:--"} · ` + `Complete: ${completeHm}`;
        const marker = new google.maps.Marker({
            position: s.position,
            map,
            icon: stopMarkerIcon(workerId, false, false),
            label: stopMarkerLabel(i + 1, false),
            title: tooltip,
            zIndex: 20
        });
        next.push(marker);
    }
    stopMarkersRef.current.set(workerId, next);
}
// ---- pulse effect for adhoc arrivals ------------------------------------
function addPulse(map, lat, lng) {
    const circle = new google.maps.Circle({
        map,
        center: {
            lat,
            lng
        },
        radius: 50,
        fillColor: "#dc2626",
        fillOpacity: 0.4,
        strokeColor: "#dc2626",
        strokeOpacity: 0.9,
        strokeWeight: 2
    });
    const start = performance.now();
    const tick = ()=>{
        const elapsed = performance.now() - start;
        if (elapsed >= PULSE_DURATION_MS) {
            circle.setMap(null);
            return;
        }
        const phase = elapsed % 700 / 700; // 0..1 every 0.7s
        circle.setRadius(60 + phase * 220);
        circle.setOptions({
            fillOpacity: 0.55 * (1 - phase),
            strokeOpacity: 0.9 * (1 - phase)
        });
        requestAnimationFrame(tick);
    };
    tick();
}
// ---- component ----------------------------------------------------------
function MapPanel({ apiKey, initialCenter = DEFAULT_CENTER, initialZoom = DEFAULT_ZOOM, workers, tasks, events, activeWorkerId, initialRoutes, selectedWorkerId, onWorkerSelect }) {
    _s();
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const mapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const workerMarkersRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const workerPositionsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const taskMarkersRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const polylinesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const stopMarkersRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const routeVersionRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const processedEventIdsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const seenAdhocTaskIdsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const paintedInitialRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Set());
    const infoWindowRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Per-worker snapshot of stats at the moment a ROUTE_UPDATED event was
    // last processed — drives the route-diff card's "Before" column.
    const prevRouteStatsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useRef"])(new Map());
    const [routeDiff, setRouteDiff] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [mapReady, setMapReady] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loadError, setLoadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // ---- load the Google Maps SDK + instantiate the map -------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!apiKey) {
                setLoadError("GOOGLE_MAPS_API_KEY not set");
                return;
            }
            let cancelled = false;
            const loader = new __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f40$googlemaps$2f$js$2d$api$2d$loader$2f$dist$2f$index$2e$mjs__$5b$client$5d$__$28$ecmascript$29$__["Loader"]({
                apiKey,
                version: "weekly"
            });
            loader.load().then({
                "MapPanel.useEffect": ()=>{
                    if (cancelled || !containerRef.current) return;
                    mapRef.current = new google.maps.Map(containerRef.current, {
                        center: initialCenter,
                        zoom: initialZoom,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false,
                        clickableIcons: false
                    });
                    setMapReady(true);
                }
            }["MapPanel.useEffect"]).catch({
                "MapPanel.useEffect": (err)=>{
                    if (!cancelled) setLoadError(String(err));
                }
            }["MapPanel.useEffect"]);
            return ({
                "MapPanel.useEffect": ()=>{
                    cancelled = true;
                }
            })["MapPanel.useEffect"];
        // initialCenter/Zoom intentionally not in deps — changing them after
        // load shouldn't tear the map down.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["MapPanel.useEffect"], [
        apiKey
    ]);
    // ---- worker markers ---------------------------------------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current) return;
            const existing = workerMarkersRef.current;
            const seen = new Set();
            for (const w of workers){
                seen.add(w.id);
                const pos = workerPositionsRef.current.get(w.id) ?? {
                    lat: w.current_lat,
                    lng: w.current_lng
                };
                workerPositionsRef.current.set(w.id, pos);
                let marker = existing.get(w.id);
                if (!marker) {
                    marker = new google.maps.Marker({
                        position: pos,
                        map: mapRef.current,
                        label: {
                            text: w.id,
                            color: "#ffffff",
                            fontSize: "9px",
                            fontWeight: "700"
                        },
                        title: `${w.name} (${w.status})`,
                        icon: workerIcon(w.id, w.status),
                        zIndex: 10
                    });
                    // Click → notify parent to set selected worker.
                    const onClickWid = w.id;
                    marker.addListener("click", {
                        "MapPanel.useEffect": ()=>{
                            if (onWorkerSelect) {
                                onWorkerSelect(onClickWid);
                            }
                        }
                    }["MapPanel.useEffect"]);
                    existing.set(w.id, marker);
                } else {
                    marker.setPosition(pos);
                    marker.setIcon(workerIcon(w.id, w.status));
                    marker.setTitle(`${w.name} (${w.status})`);
                }
            }
            for (const [id, marker] of existing){
                if (!seen.has(id)) {
                    marker.setMap(null);
                    existing.delete(id);
                }
            }
        }
    }["MapPanel.useEffect"], [
        mapReady,
        workers
    ]);
    // ---- task markers (+ adhoc pulse on first appearance) -----------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current) return;
            const existing = taskMarkersRef.current;
            const seen = new Set();
            for (const t of tasks){
                seen.add(t.id);
                const pos = {
                    lat: t.location_lat,
                    lng: t.location_lng
                };
                let marker = existing.get(t.id);
                if (!marker) {
                    marker = new google.maps.Marker({
                        position: pos,
                        map: mapRef.current,
                        title: `${t.id} — ${t.task_type} (${t.status}) — ${t.address}`,
                        icon: taskIcon(t)
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
            for (const [id, marker] of existing){
                if (!seen.has(id)) {
                    marker.setMap(null);
                    existing.delete(id);
                }
            }
        }
    }["MapPanel.useEffect"], [
        mapReady,
        tasks
    ]);
    // Task-id → coordinates for polyline reconstruction.
    const taskCoords = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "MapPanel.useMemo[taskCoords]": ()=>{
            const m = new Map();
            for (const t of tasks)m.set(t.id, {
                lat: t.location_lat,
                lng: t.location_lng
            });
            return m;
        }
    }["MapPanel.useMemo[taskCoords]"], [
        tasks
    ]);
    // ---- event processing: LOCATION_UPDATE + ROUTE_UPDATED ----------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current) return;
            const map = mapRef.current;
            for (const e of events){
                if (processedEventIdsRef.current.has(e.id)) continue;
                processedEventIdsRef.current.add(e.id);
                if (e.event_type === "LOCATION_UPDATE") {
                    const p = e.payload;
                    if (!p.worker_id) continue;
                    const marker = workerMarkersRef.current.get(p.worker_id);
                    if (!marker) continue;
                    const prev = workerPositionsRef.current.get(p.worker_id);
                    const next = {
                        lat: p.current_lat ?? prev?.lat ?? 0,
                        lng: p.current_lng ?? prev?.lng ?? 0
                    };
                    workerPositionsRef.current.set(p.worker_id, next);
                    marker.setPosition(next);
                    if (p.status) {
                        marker.setIcon(workerIcon(p.worker_id, p.status));
                    }
                } else if (e.event_type === "ROUTE_UPDATED") {
                    const p = e.payload;
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
                    const newEnd = (p.per_stop_etas && p.per_stop_etas.length > 0 ? p.per_stop_etas[p.per_stop_etas.length - 1].arrival_time_hm : "") || "—";
                    if (!isStartup) {
                        const before = prevRouteStatsRef.current.get(p.worker_id);
                        if (before) {
                            const w = workers.find({
                                "MapPanel.useEffect.w": (x)=>x.id === p.worker_id
                            }["MapPanel.useEffect.w"]);
                            // Try to identify the new ad-hoc task introduced by this
                            // replan by diffing ordered_task_ids against the prior set.
                            const newAdhoc = (p.ordered_task_ids ?? []).map({
                                "MapPanel.useEffect.newAdhoc": (tid)=>tasks.find({
                                        "MapPanel.useEffect.newAdhoc": (tk)=>tk.id === tid
                                    }["MapPanel.useEffect.newAdhoc"])
                            }["MapPanel.useEffect.newAdhoc"]).find({
                                "MapPanel.useEffect.newAdhoc": (t)=>t && t.type === "adhoc"
                            }["MapPanel.useEffect.newAdhoc"]);
                            setRouteDiff({
                                workerId: p.worker_id,
                                workerName: w?.name ?? p.worker_id,
                                before,
                                after: {
                                    stops: newStops,
                                    km: newKm,
                                    endTime: newEnd
                                },
                                adhocAddress: newAdhoc?.address,
                                adhocType: newAdhoc?.task_type
                            });
                        }
                    }
                    prevRouteStatsRef.current.set(p.worker_id, {
                        stops: newStops,
                        km: newKm,
                        endTime: newEnd
                    });
                    const coords = [];
                    const wpos = workerPositionsRef.current.get(p.worker_id);
                    if (wpos) coords.push(wpos);
                    for (const tid of p.ordered_task_ids ?? []){
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
                    const stops = [];
                    for (const s of p.per_stop_etas ?? []){
                        if (!s.task_id) continue;
                        const t = tasks.find({
                            "MapPanel.useEffect.t": (x)=>x.id === s.task_id
                        }["MapPanel.useEffect.t"]);
                        if (!t) continue;
                        stops.push({
                            taskId: s.task_id,
                            position: {
                                lat: t.location_lat,
                                lng: t.location_lng
                            },
                            arrivalHm: s.arrival_time_hm ?? "",
                            taskType: t.task_type,
                            address: t.address,
                            durationMins: t.duration_mins
                        });
                    }
                    renderStopMarkers(map, stopMarkersRef, p.worker_id, stops);
                    // Fetch async; guard against stale responses via version check.
                    const myVersion = p.version;
                    const workerId = p.worker_id;
                    void ({
                        "MapPanel.useEffect": async ()=>{
                            const geom = await fetchRouteGeometry(coords);
                            if ((routeVersionRef.current.get(workerId) ?? -1) !== myVersion) return;
                            swapPolyline(map, polylinesRef, workerId, geom);
                        }
                    })["MapPanel.useEffect"]();
                }
            }
        }
    }["MapPanel.useEffect"], [
        events,
        mapReady,
        taskCoords
    ]);
    // ---- pan to active worker --------------------------------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current || !activeWorkerId) return;
            const pos = workerPositionsRef.current.get(activeWorkerId);
            if (pos) mapRef.current.panTo(pos);
        }
    }["MapPanel.useEffect"], [
        activeWorkerId,
        mapReady
    ]);
    // ---- initial-route polylines + numbered markers (painted once;
    //      OSRM fetched in background) -------------------------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current || !initialRoutes) return;
            const map = mapRef.current;
            for (const r of initialRoutes){
                // Always seed the route-diff "before" snapshot from the latest
                // /routes payload, even if we already painted polyline + markers
                // for this worker. Without this seed, the first scenario's
                // ROUTE_UPDATED has no baseline to diff against and the
                // BEFORE/AFTER card never shows.
                const stopsCount = r.ordered_task_ids?.length ?? 0;
                const lastEta = r.per_stop_etas?.length ? r.per_stop_etas[r.per_stop_etas.length - 1]?.arrival_time : "";
                prevRouteStatsRef.current.set(r.worker_id, {
                    stops: stopsCount,
                    km: r.total_distance_km ?? 0,
                    endTime: lastEta || "—"
                });
                if (paintedInitialRef.current.has(r.worker_id)) continue;
                if (polylinesRef.current.has(r.worker_id)) continue;
                const coords = [];
                const wpos = workerPositionsRef.current.get(r.worker_id);
                if (wpos) coords.push(wpos);
                for (const tid of r.ordered_task_ids){
                    const t = tasks.find({
                        "MapPanel.useEffect.t": (x)=>x.id === tid
                    }["MapPanel.useEffect.t"]);
                    if (t) coords.push({
                        lat: t.location_lat,
                        lng: t.location_lng
                    });
                }
                if (coords.length < 2) continue;
                paintedInitialRef.current.add(r.worker_id);
                // Numbered stop markers from the per_stop_etas snapshot in the
                // /routes payload — drawn synchronously so the sequence is
                // visible before OSRM resolves.
                const stops = [];
                for (const s of r.per_stop_etas ?? []){
                    const t = tasks.find({
                        "MapPanel.useEffect.t": (x)=>x.id === s.task_id
                    }["MapPanel.useEffect.t"]);
                    if (!t) continue;
                    stops.push({
                        taskId: s.task_id,
                        position: {
                            lat: t.location_lat,
                            lng: t.location_lng
                        },
                        arrivalHm: s.arrival_time ?? "",
                        taskType: t.task_type,
                        address: t.address,
                        durationMins: t.duration_mins
                    });
                }
                renderStopMarkers(map, stopMarkersRef, r.worker_id, stops);
                const wid = r.worker_id;
                void ({
                    "MapPanel.useEffect": async ()=>{
                        const geom = await fetchRouteGeometry(coords);
                        if (polylinesRef.current.has(wid)) return; // event-driven replacement
                        swapPolyline(map, polylinesRef, wid, geom);
                    }
                })["MapPanel.useEffect"]();
            }
        }
    }["MapPanel.useEffect"], [
        mapReady,
        initialRoutes,
        tasks
    ]);
    // ---- polyline opacity follows selectedWorkerId -------------------------
    // Defaults: 2 px / 40 %; selected: 3 px / 100 %; others when one selected:
    // 1 px / 20 %.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            for (const [wid, poly] of polylinesRef.current.entries()){
                if (!selectedWorkerId) {
                    poly.setOptions({
                        strokeOpacity: 0.4,
                        strokeWeight: 2,
                        zIndex: 1
                    });
                } else if (selectedWorkerId === wid) {
                    poly.setOptions({
                        strokeOpacity: 1.0,
                        strokeWeight: 3,
                        zIndex: 5
                    });
                } else {
                    poly.setOptions({
                        strokeOpacity: 0.2,
                        strokeWeight: 1,
                        zIndex: 1
                    });
                }
            }
            // Numbered stop markers follow the same selection logic — selected
            // worker's sequence is full opacity / slightly larger; others dim.
            for (const [wid, markers] of stopMarkersRef.current.entries()){
                const selected = !!selectedWorkerId && selectedWorkerId === wid;
                const dimmed = !!selectedWorkerId && selectedWorkerId !== wid;
                for(let i = 0; i < markers.length; i += 1){
                    markers[i].setIcon(stopMarkerIcon(wid, selected, dimmed));
                    markers[i].setLabel(stopMarkerLabel(i + 1, dimmed));
                    markers[i].setZIndex(selected ? 25 : dimmed ? 15 : 20);
                }
            }
        }
    }["MapPanel.useEffect"], [
        selectedWorkerId
    ]);
    // ---- update worker marker icon on selection toggle -------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            for (const [wid, marker] of workerMarkersRef.current.entries()){
                const w = workers.find({
                    "MapPanel.useEffect.w": (x)=>x.id === wid
                }["MapPanel.useEffect.w"]);
                if (!w) continue;
                const isSelected = selectedWorkerId === wid;
                marker.setIcon(workerIcon(wid, w.status, isSelected));
            }
        }
    }["MapPanel.useEffect"], [
        selectedWorkerId,
        workers
    ]);
    // ---- InfoWindow popup on worker selection ----------------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!mapReady || !mapRef.current) return;
            // Always close any prior window before deciding what to show.
            if (infoWindowRef.current) {
                infoWindowRef.current.close();
                infoWindowRef.current = null;
            }
            if (!selectedWorkerId) return;
            const marker = workerMarkersRef.current.get(selectedWorkerId);
            if (!marker) return;
            const worker = workers.find({
                "MapPanel.useEffect.worker": (w)=>w.id === selectedWorkerId
            }["MapPanel.useEffect.worker"]);
            const route = initialRoutes?.find({
                "MapPanel.useEffect": (r)=>r.worker_id === selectedWorkerId
            }["MapPanel.useEffect"]);
            const stopsHtml = route?.per_stop_etas?.length ? route.per_stop_etas.map({
                "MapPanel.useEffect": (s, i)=>`<div style="padding:2px 0;font-size:11px;color:#334155;">` + `${i + 1}. <b>${s.arrival_time || "--:--"}</b> · ` + `${(s.address || "").replace(/</g, "&lt;").slice(0, 50)}` + (s.late ? ` <span style="color:#b91c1c;font-weight:600">LATE</span>` : "") + `</div>`
            }["MapPanel.useEffect"]).join("") : `<div style="font-size:11px;color:#94a3b8;">No route assigned yet</div>`;
            const nameHtml = `<div style="font-weight:600;font-size:13px;color:#0f172a;">` + `${worker?.name ?? selectedWorkerId} ` + `<span style="font-weight:400;color:#64748b;font-size:11px;">(${selectedWorkerId})</span>` + `</div>`;
            const skillsHtml = worker ? `<div style="color:#64748b;font-size:11px;margin-bottom:4px;">` + `${worker.skill_tags.join(" · ")}</div>` : "";
            const summary = route && route.total_distance_km ? `<div style="font-size:11px;color:#334155;margin-bottom:4px;">` + `<b>${route.total_distance_km.toFixed(1)} km</b> · ` + `${route.total_time_mins} min · ${route.per_stop_etas.length} stops</div>` : "";
            const html = `<div style="min-width:260px;font-family:system-ui;">
      ${nameHtml}${skillsHtml}${summary}
      <div style="border-top:1px solid #e2e8f0;padding-top:4px;">${stopsHtml}</div>
    </div>`;
            const iw = new google.maps.InfoWindow({
                content: html
            });
            iw.open({
                anchor: marker,
                map: mapRef.current
            });
            infoWindowRef.current = iw;
        }
    }["MapPanel.useEffect"], [
        mapReady,
        selectedWorkerId,
        initialRoutes,
        workers
    ]);
    // ---- auto-dismiss the route diff card after 10 seconds ---------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            if (!routeDiff) return;
            const id = setTimeout({
                "MapPanel.useEffect.id": ()=>setRouteDiff(null)
            }["MapPanel.useEffect.id"], 10_000);
            return ({
                "MapPanel.useEffect": ()=>clearTimeout(id)
            })["MapPanel.useEffect"];
        }
    }["MapPanel.useEffect"], [
        routeDiff
    ]);
    // ---- cleanup on unmount ----------------------------------------------
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$index$2e$js__$5b$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MapPanel.useEffect": ()=>{
            return ({
                "MapPanel.useEffect": ()=>{
                    for (const m of workerMarkersRef.current.values())m.setMap(null);
                    for (const m of taskMarkersRef.current.values())m.setMap(null);
                    for (const p of polylinesRef.current.values())p.setMap(null);
                    for (const arr of stopMarkersRef.current.values()){
                        for (const m of arr)m.setMap(null);
                    }
                    workerMarkersRef.current.clear();
                    taskMarkersRef.current.clear();
                    polylinesRef.current.clear();
                    stopMarkersRef.current.clear();
                }
            })["MapPanel.useEffect"];
        }
    }["MapPanel.useEffect"], []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative h-full w-full bg-slate-100",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: containerRef,
                className: "h-full w-full"
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                lineNumber: 878,
                columnNumber: 7
            }, this),
            loadError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute inset-0 flex items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded bg-rose-100 px-4 py-2 text-sm text-rose-800 shadow",
                    children: [
                        "Map unavailable: ",
                        loadError
                    ]
                }, void 0, true, {
                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                    lineNumber: 881,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                lineNumber: 880,
                columnNumber: 9
            }, this),
            !mapReady && !loadError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute inset-0 flex items-center justify-center",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded bg-white px-4 py-2 text-sm text-slate-500 shadow",
                    children: "Loading map…"
                }, void 0, false, {
                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                    lineNumber: 888,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                lineNumber: 887,
                columnNumber: 9
            }, this),
            routeDiff && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-auto absolute bottom-4 left-4 z-20 w-80 rounded-lg border-2 border-indigo-400 bg-white shadow-xl",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-700",
                        children: [
                            "Route change — ",
                            routeDiff.workerName,
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setRouteDiff(null),
                                className: "float-right text-slate-400 hover:text-slate-700",
                                "aria-label": "Dismiss",
                                children: "✕"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 898,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                        lineNumber: 896,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 divide-x divide-slate-200",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-3 py-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-[10px] font-semibold uppercase tracking-wider text-slate-500",
                                        children: "Before"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                        lineNumber: 909,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-1 text-xs text-slate-700",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    routeDiff.before.stops,
                                                    " stops"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 913,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "tabular-nums",
                                                children: [
                                                    routeDiff.before.km.toFixed(1),
                                                    " km"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 914,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "tabular-nums",
                                                children: [
                                                    "Done by ",
                                                    routeDiff.before.endTime
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 917,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                        lineNumber: 912,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 908,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "px-3 py-2 bg-emerald-50",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-[10px] font-semibold uppercase tracking-wider text-emerald-700",
                                        children: "After"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                        lineNumber: 923,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-1 text-xs text-slate-800",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    routeDiff.after.stops,
                                                    " stops"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 927,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "tabular-nums",
                                                children: [
                                                    routeDiff.after.km.toFixed(1),
                                                    " km"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 928,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "tabular-nums",
                                                children: [
                                                    "Done by ",
                                                    routeDiff.after.endTime
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                                lineNumber: 931,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                        lineNumber: 926,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 922,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                        lineNumber: 907,
                        columnNumber: 11
                    }, this),
                    (()=>{
                        const dStops = routeDiff.after.stops - routeDiff.before.stops;
                        const dKm = routeDiff.after.km - routeDiff.before.km;
                        const stopSign = dStops >= 0 ? "+" : "";
                        const kmSign = dKm >= 0 ? "+" : "";
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "border-t border-slate-200 bg-indigo-50 px-3 py-1.5 text-[11px] text-indigo-900",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "font-semibold uppercase tracking-wider text-indigo-700",
                                    children: "Change"
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                    lineNumber: 944,
                                    columnNumber: 17
                                }, this),
                                " ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "tabular-nums",
                                    children: [
                                        stopSign,
                                        dStops,
                                        " stop",
                                        Math.abs(dStops) === 1 ? "" : "s"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                    lineNumber: 947,
                                    columnNumber: 17
                                }, this),
                                " · ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "tabular-nums",
                                    children: [
                                        kmSign,
                                        dKm.toFixed(1),
                                        " km"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                    lineNumber: 951,
                                    columnNumber: 17
                                }, this),
                                " · ",
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        routeDiff.workerName,
                                        " dispatched"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                    lineNumber: 955,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                            lineNumber: 943,
                            columnNumber: 15
                        }, this);
                    })(),
                    routeDiff.adhocAddress && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border-t border-slate-200 px-3 py-2 text-xs",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-rose-700 font-semibold",
                                children: "+ "
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 961,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-slate-700",
                                children: [
                                    routeDiff.adhocType?.replace("_", " ") || "task",
                                    " ·",
                                    " ",
                                    routeDiff.adhocAddress
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 962,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ml-2 rounded bg-rose-100 px-1 text-[10px] font-medium text-rose-800",
                                children: "NEW AD-HOC"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                                lineNumber: 966,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                        lineNumber: 960,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
                lineNumber: 895,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/Map.tsx",
        lineNumber: 877,
        columnNumber: 5
    }, this);
}
_s(MapPanel, "rl/WkN5n3FXuTpmD/CPNrk5vzik=");
_c = MapPanel;
const __TURBOPACK__default__export__ = MapPanel;
var _c;
__turbopack_context__.k.register(_c, "MapPanel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/route-planning-demo/dashboard/components/Map.tsx [client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/route-planning-demo/dashboard/components/Map.tsx [client] (ecmascript)"));
}),
"[project]/route-planning-demo/dashboard/node_modules/@googlemaps/js-api-loader/dist/index.mjs [client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_ID",
    ()=>DEFAULT_ID,
    "Loader",
    ()=>Loader,
    "LoaderStatus",
    ()=>LoaderStatus
]);
/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */ /* global Reflect, Promise, SuppressedError, Symbol, Iterator */ function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
        return value instanceof P ? value : new P(function(resolve) {
            resolve(value);
        });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
        function fulfilled(value) {
            try {
                step(generator.next(value));
            } catch (e) {
                reject(e);
            }
        }
        function rejected(value) {
            try {
                step(generator["throw"](value));
            } catch (e) {
                reject(e);
            }
        }
        function step(result) {
            result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}
typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};
function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}
var fastDeepEqual;
var hasRequiredFastDeepEqual;
function requireFastDeepEqual() {
    if (hasRequiredFastDeepEqual) return fastDeepEqual;
    hasRequiredFastDeepEqual = 1;
    // do not edit .js files directly - edit src/index.jst
    fastDeepEqual = function equal(a, b) {
        if (a === b) return true;
        if (a && b && typeof a == 'object' && typeof b == 'object') {
            if (a.constructor !== b.constructor) return false;
            var length, i, keys;
            if (Array.isArray(a)) {
                length = a.length;
                if (length != b.length) return false;
                for(i = length; i-- !== 0;)if (!equal(a[i], b[i])) return false;
                return true;
            }
            if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
            if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
            if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
            keys = Object.keys(a);
            length = keys.length;
            if (length !== Object.keys(b).length) return false;
            for(i = length; i-- !== 0;)if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
            for(i = length; i-- !== 0;){
                var key = keys[i];
                if (!equal(a[key], b[key])) return false;
            }
            return true;
        }
        // true if both NaN, false otherwise
        return a !== a && b !== b;
    };
    return fastDeepEqual;
}
var fastDeepEqualExports = requireFastDeepEqual();
var isEqual = /*@__PURE__*/ getDefaultExportFromCjs(fastDeepEqualExports);
/**
 * Copyright 2019 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at.
 *
 *      Http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */ const DEFAULT_ID = "__googleMapsScriptId";
/**
 * The status of the [[Loader]].
 */ var LoaderStatus;
(function(LoaderStatus) {
    LoaderStatus[LoaderStatus["INITIALIZED"] = 0] = "INITIALIZED";
    LoaderStatus[LoaderStatus["LOADING"] = 1] = "LOADING";
    LoaderStatus[LoaderStatus["SUCCESS"] = 2] = "SUCCESS";
    LoaderStatus[LoaderStatus["FAILURE"] = 3] = "FAILURE";
})(LoaderStatus || (LoaderStatus = {}));
/**
 * [[Loader]] makes it easier to add Google Maps JavaScript API to your application
 * dynamically using
 * [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).
 * It works by dynamically creating and appending a script node to the the
 * document head and wrapping the callback function so as to return a promise.
 *
 * ```
 * const loader = new Loader({
 *   apiKey: "",
 *   version: "weekly",
 *   libraries: ["places"]
 * });
 *
 * loader.load().then((google) => {
 *   const map = new google.maps.Map(...)
 * })
 * ```
 */ class Loader {
    /**
     * Creates an instance of Loader using [[LoaderOptions]]. No defaults are set
     * using this library, instead the defaults are set by the Google Maps
     * JavaScript API server.
     *
     * ```
     * const loader = Loader({apiKey, version: 'weekly', libraries: ['places']});
     * ```
     */ constructor({ apiKey, authReferrerPolicy, channel, client, id = DEFAULT_ID, language, libraries = [], mapIds, nonce, region, retries = 3, url = "https://maps.googleapis.com/maps/api/js", version }){
        this.callbacks = [];
        this.done = false;
        this.loading = false;
        this.errors = [];
        this.apiKey = apiKey;
        this.authReferrerPolicy = authReferrerPolicy;
        this.channel = channel;
        this.client = client;
        this.id = id || DEFAULT_ID; // Do not allow empty string
        this.language = language;
        this.libraries = libraries;
        this.mapIds = mapIds;
        this.nonce = nonce;
        this.region = region;
        this.retries = retries;
        this.url = url;
        this.version = version;
        if (Loader.instance) {
            if (!isEqual(this.options, Loader.instance.options)) {
                throw new Error(`Loader must not be called again with different options. ${JSON.stringify(this.options)} !== ${JSON.stringify(Loader.instance.options)}`);
            }
            return Loader.instance;
        }
        Loader.instance = this;
    }
    get options() {
        return {
            version: this.version,
            apiKey: this.apiKey,
            channel: this.channel,
            client: this.client,
            id: this.id,
            libraries: this.libraries,
            language: this.language,
            region: this.region,
            mapIds: this.mapIds,
            nonce: this.nonce,
            url: this.url,
            authReferrerPolicy: this.authReferrerPolicy
        };
    }
    get status() {
        if (this.errors.length) {
            return LoaderStatus.FAILURE;
        }
        if (this.done) {
            return LoaderStatus.SUCCESS;
        }
        if (this.loading) {
            return LoaderStatus.LOADING;
        }
        return LoaderStatus.INITIALIZED;
    }
    get failed() {
        return this.done && !this.loading && this.errors.length >= this.retries + 1;
    }
    /**
     * CreateUrl returns the Google Maps JavaScript API script url given the [[LoaderOptions]].
     *
     * @ignore
     * @deprecated
     */ createUrl() {
        let url = this.url;
        url += `?callback=__googleMapsCallback&loading=async`;
        if (this.apiKey) {
            url += `&key=${this.apiKey}`;
        }
        if (this.channel) {
            url += `&channel=${this.channel}`;
        }
        if (this.client) {
            url += `&client=${this.client}`;
        }
        if (this.libraries.length > 0) {
            url += `&libraries=${this.libraries.join(",")}`;
        }
        if (this.language) {
            url += `&language=${this.language}`;
        }
        if (this.region) {
            url += `&region=${this.region}`;
        }
        if (this.version) {
            url += `&v=${this.version}`;
        }
        if (this.mapIds) {
            url += `&map_ids=${this.mapIds.join(",")}`;
        }
        if (this.authReferrerPolicy) {
            url += `&auth_referrer_policy=${this.authReferrerPolicy}`;
        }
        return url;
    }
    deleteScript() {
        const script = document.getElementById(this.id);
        if (script) {
            script.remove();
        }
    }
    /**
     * Load the Google Maps JavaScript API script and return a Promise.
     * @deprecated, use importLibrary() instead.
     */ load() {
        return this.loadPromise();
    }
    /**
     * Load the Google Maps JavaScript API script and return a Promise.
     *
     * @ignore
     * @deprecated, use importLibrary() instead.
     */ loadPromise() {
        return new Promise((resolve, reject)=>{
            this.loadCallback((err)=>{
                if (!err) {
                    resolve(window.google);
                } else {
                    reject(err.error);
                }
            });
        });
    }
    importLibrary(name) {
        this.execute();
        return google.maps.importLibrary(name);
    }
    /**
     * Load the Google Maps JavaScript API script with a callback.
     * @deprecated, use importLibrary() instead.
     */ loadCallback(fn) {
        this.callbacks.push(fn);
        this.execute();
    }
    /**
     * Set the script on document.
     */ setScript() {
        var _a, _b;
        if (document.getElementById(this.id)) {
            // TODO wrap onerror callback for cases where the script was loaded elsewhere
            this.callback();
            return;
        }
        const params = {
            key: this.apiKey,
            channel: this.channel,
            client: this.client,
            libraries: this.libraries.length && this.libraries,
            v: this.version,
            mapIds: this.mapIds,
            language: this.language,
            region: this.region,
            authReferrerPolicy: this.authReferrerPolicy
        };
        // keep the URL minimal:
        Object.keys(params).forEach(// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (key)=>!params[key] && delete params[key]);
        if (!((_b = (_a = window === null || window === void 0 ? void 0 : window.google) === null || _a === void 0 ? void 0 : _a.maps) === null || _b === void 0 ? void 0 : _b.importLibrary)) {
            // tweaked copy of https://developers.google.com/maps/documentation/javascript/load-maps-js-api#dynamic-library-import
            // which also sets the base url, the id, and the nonce
            /* eslint-disable */ ((g)=>{
                // @ts-ignore
                let h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window;
                // @ts-ignore
                b = b[c] || (b[c] = {});
                // @ts-ignore
                const d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(), u = ()=>// @ts-ignore
                    h || (h = new Promise((f, n)=>__awaiter(this, void 0, void 0, function*() {
                            var _a;
                            yield a = m.createElement("script");
                            a.id = this.id;
                            e.set("libraries", [
                                ...r
                            ] + "");
                            // @ts-ignore
                            for(k in g)e.set(k.replace(/[A-Z]/g, (t)=>"_" + t[0].toLowerCase()), g[k]);
                            e.set("callback", c + ".maps." + q);
                            a.src = this.url + `?` + e;
                            d[q] = f;
                            a.onerror = ()=>h = n(Error(p + " could not load."));
                            // @ts-ignore
                            a.nonce = this.nonce || ((_a = m.querySelector("script[nonce]")) === null || _a === void 0 ? void 0 : _a.nonce) || "";
                            m.head.append(a);
                        })));
                // @ts-ignore
                d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n)=>r.add(f) && u().then(()=>d[l](f, ...n));
            })(params);
        /* eslint-enable */ }
        // While most libraries populate the global namespace when loaded via bootstrap params,
        // this is not the case for "marker" when used with the inline bootstrap loader
        // (and maybe others in the future). So ensure there is an importLibrary for each:
        const libraryPromises = this.libraries.map((library)=>this.importLibrary(library));
        // ensure at least one library, to kick off loading...
        if (!libraryPromises.length) {
            libraryPromises.push(this.importLibrary("core"));
        }
        Promise.all(libraryPromises).then(()=>this.callback(), (error)=>{
            const event = new ErrorEvent("error", {
                error
            }); // for backwards compat
            this.loadErrorCallback(event);
        });
    }
    /**
     * Reset the loader state.
     */ reset() {
        this.deleteScript();
        this.done = false;
        this.loading = false;
        this.errors = [];
        this.onerrorEvent = null;
    }
    resetIfRetryingFailed() {
        if (this.failed) {
            this.reset();
        }
    }
    loadErrorCallback(e) {
        this.errors.push(e);
        if (this.errors.length <= this.retries) {
            const delay = this.errors.length * Math.pow(2, this.errors.length);
            console.error(`Failed to load Google Maps script, retrying in ${delay} ms.`);
            setTimeout(()=>{
                this.deleteScript();
                this.setScript();
            }, delay);
        } else {
            this.onerrorEvent = e;
            this.callback();
        }
    }
    callback() {
        this.done = true;
        this.loading = false;
        this.callbacks.forEach((cb)=>{
            cb(this.onerrorEvent);
        });
        this.callbacks = [];
    }
    execute() {
        this.resetIfRetryingFailed();
        if (this.loading) {
            // do nothing but wait
            return;
        }
        if (this.done) {
            this.callback();
        } else {
            // short circuit and warn if google.maps is already loaded
            if (window.google && window.google.maps && window.google.maps.version) {
                console.warn("Google Maps already loaded outside @googlemaps/js-api-loader. " + "This may result in undesirable behavior as options and script parameters may not match.");
                this.callback();
                return;
            }
            this.loading = true;
            this.setScript();
        }
    }
}
;
}),
]);

//# sourceMappingURL=route-planning-demo_dashboard_0fug~xu._.js.map