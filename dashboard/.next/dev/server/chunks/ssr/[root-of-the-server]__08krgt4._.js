module.exports = [
"[project]/route-planning-demo/dashboard/components/EventLog.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// dashboard/components/EventLog.tsx
//
// Live event feed grouped by correlation_id. Newest group on top; events
// within a group ascend by timestamp. New non-startup groups auto-expand
// on arrival and stay expanded (stable history). Startup groups are
// collapsed by default but still browseable.
__turbopack_context__.s([
    "EventLog",
    ()=>EventLog
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
;
;
function groupEvents(events) {
    const byCorrId = new Map();
    for (const e of events){
        const arr = byCorrId.get(e.correlation_id);
        if (arr) arr.push(e);
        else byCorrId.set(e.correlation_id, [
            e
        ]);
    }
    const groups = [];
    for (const [cid, evs] of byCorrId.entries()){
        evs.sort((a, b)=>a.timestamp.localeCompare(b.timestamp));
        const firstTs = evs[0].timestamp;
        const lastTs = evs[evs.length - 1].timestamp;
        const durationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();
        groups.push({
            correlationId: cid,
            events: evs,
            firstTs,
            lastTs,
            durationMs,
            isStartup: cid.startsWith("startup-")
        });
    }
    // Newest-last-event first
    groups.sort((a, b)=>b.lastTs.localeCompare(a.lastTs));
    return groups;
}
// ---- agent colour palette -----------------------------------------------
const AGENT_PILL = {
    supervisor: "bg-indigo-100 text-indigo-800",
    reallocation: "bg-amber-100 text-amber-800",
    route_planner: "bg-emerald-100 text-emerald-800",
    consent: "bg-fuchsia-100 text-fuchsia-800",
    api: "bg-slate-200 text-slate-700",
    startup: "bg-slate-100 text-slate-500"
};
function pillClass(agent) {
    return AGENT_PILL[agent] ?? "bg-slate-200 text-slate-700";
}
function rowClass(e) {
    if (e.event_type === "WORKER_SCORED") {
        const p = e.payload;
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
function ShiftNoteCard({ event }) {
    const p = event.payload ?? {};
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mx-4 my-3 rounded border-l-4 border-l-indigo-500 bg-indigo-50/60 px-4 py-3 shadow-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mb-1 flex items-center gap-2 text-sm font-semibold text-indigo-900",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "📋"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 123,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "uppercase tracking-wider",
                        children: "Shift note"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 124,
                        columnNumber: 9
                    }, this),
                    p.scenario_name && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "ml-1 text-xs font-normal text-indigo-700",
                        children: [
                            "· ",
                            p.scenario_name
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 126,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "text-sm leading-relaxed text-slate-800",
                children: p.paragraph ?? event.human_label
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 131,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 121,
        columnNumber: 5
    }, this);
}
function AnomalyCard({ event }) {
    const p = event.payload ?? {};
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mx-4 my-3 rounded border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mb-1 flex items-center gap-2 text-sm font-bold text-amber-900",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "⚠️"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 150,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "uppercase tracking-wider",
                        children: "Pattern detected"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 151,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 149,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "text-sm text-amber-900",
                children: [
                    p.count,
                    " ",
                    p.task_type?.replace("_", " "),
                    " jobs in ",
                    p.zone,
                    " today.",
                    " ",
                    p.pattern_description
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 153,
                columnNumber: 7
            }, this),
            p.recommendation && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-2 text-sm font-medium text-amber-900",
                children: [
                    "Recommendation: ",
                    p.recommendation
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 158,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 148,
        columnNumber: 5
    }, this);
}
function SupervisorOverrideCard({ event }) {
    const p = event.payload ?? {};
    const workerName = p.rejected_worker_name || p.rejected_worker_id || "Worker";
    const reason = p.reasons && p.reasons.length > 0 ? p.reasons[0] : "guardrail rejected";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mx-4 my-3 rounded border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-900",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "⚠️"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 184,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        children: "Dispatcher check failed"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 185,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 183,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "text-sm text-amber-900",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "font-semibold",
                        children: workerName
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 188,
                        columnNumber: 9
                    }, this),
                    " rejected — ",
                    reason
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 187,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-xs text-amber-800",
                children: "Finding next best technician…"
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 190,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 182,
        columnNumber: 5
    }, this);
}
function PostAllocationAlertCard({ event }) {
    const p = event.payload ?? {};
    const kind = p.type ?? "late_arrival";
    const palette = kind === "shift_breach" ? {
        border: "border-rose-500",
        bg: "bg-rose-50",
        title: "text-rose-900",
        body: "text-rose-900",
        glyph: "🚨",
        heading: "Shift breach risk"
    } : kind === "consent_stall" ? {
        border: "border-amber-400",
        bg: "bg-amber-50",
        title: "text-amber-900",
        body: "text-amber-900",
        glyph: "⏳",
        heading: "Consent pending"
    } : {
        border: "border-amber-400",
        bg: "bg-amber-50",
        title: "text-amber-900",
        body: "text-amber-900",
        glyph: "⏰",
        heading: "Route monitor"
    };
    const body = (()=>{
        if (kind === "shift_breach") {
            return `${p.worker_name ?? "Worker"} will exceed shift end by ${p.delay_mins ?? "?"} mins. Reassignment needed.`;
        }
        if (kind === "consent_stall") {
            return `Waiting ${p.wait_mins ?? "?"} mins for customer reply on ${p.worker_name ?? "Worker"}'s pending task.`;
        }
        return `${p.worker_name ?? "Worker"} will arrive ${p.delay_mins ?? "?"} mins late to ${p.address ?? "next stop"}. Consider rerouting.`;
    })();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: `mx-4 my-3 rounded border-2 ${palette.border} ${palette.bg} px-4 py-3 shadow-sm`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: `mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${palette.title}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: palette.glyph
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 261,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        children: palette.heading
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 262,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 258,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: `text-sm ${palette.body}`,
                children: body
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 264,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 255,
        columnNumber: 5
    }, this);
}
function TravelWarningNote({ event }) {
    const p = event.payload ?? {};
    const warnings = p.warnings ?? [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mx-4 my-2 rounded border-l-4 border-l-amber-400 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-900",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                "aria-hidden": true,
                className: "mr-1",
                children: "🚗"
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 279,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: "font-medium",
                children: "Note: "
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 280,
                columnNumber: 7
            }, this),
            warnings.length > 0 ? warnings.join(" · ") : event.human_label
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 278,
        columnNumber: 5
    }, this);
}
function EscalationCard({ event }) {
    const p = event.payload ?? {};
    const options = p.trade_off_options ?? [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mx-4 my-3 rounded border-2 border-rose-400 bg-rose-50 px-4 py-3 text-rose-900 shadow-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-base font-semibold",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "🚨"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 295,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        children: "Manual Dispatch Required"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 296,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 294,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-sm text-rose-800",
                children: p.narrative ?? p.reasoning ?? "All nearby technicians are fully booked."
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 298,
                columnNumber: 7
            }, this),
            options.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "text-xs font-semibold uppercase tracking-wider text-rose-700",
                        children: "Options available"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 303,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                        className: "mt-1 space-y-1 text-sm",
                        children: options.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                                className: "flex gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "font-mono font-semibold text-rose-700",
                                        children: [
                                            o.label,
                                            ")"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                        lineNumber: 309,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        children: o.text
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                        lineNumber: 312,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, o.label, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 308,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 306,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 302,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 293,
        columnNumber: 5
    }, this);
}
// ---- formatting helpers -------------------------------------------------
function formatTime(iso) {
    const d = new Date(iso);
    const pad = (n)=>n.toString().padStart(2, "0");
    const ms = d.getMilliseconds().toString().padStart(3, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
function EventLog({ events, hideStartupByDefault = true }) {
    const groups = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>groupEvents(events), [
        events.length
    ]);
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(new Set());
    const seenRef = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useRef"])(new Set());
    // Auto-expand a group the FIRST time we see its correlation_id (unless
    // it's a startup-* group and hideStartupByDefault is on). Subsequent
    // sightings don't change state, so a user manually collapsing a group
    // stays collapsed.
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        const newlyExpanded = [];
        for (const g of groups){
            if (seenRef.current.has(g.correlationId)) continue;
            seenRef.current.add(g.correlationId);
            if (g.isStartup && hideStartupByDefault) continue;
            newlyExpanded.push(g.correlationId);
        }
        if (newlyExpanded.length > 0) {
            setExpanded((prev)=>{
                const next = new Set(prev);
                for (const id of newlyExpanded)next.add(id);
                return next;
            });
        }
    }, [
        groups,
        hideStartupByDefault
    ]);
    const toggle = (id)=>{
        setExpanded((prev)=>{
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "h-full overflow-y-auto bg-white border-l border-slate-200",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("h2", {
                    className: "text-sm font-semibold uppercase tracking-wider text-slate-600",
                    children: [
                        "Event log",
                        groups.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                            className: "ml-2 text-xs font-normal text-slate-400",
                            children: [
                                "(",
                                groups.length,
                                " flow",
                                groups.length === 1 ? "" : "s",
                                ")"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 385,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                    lineNumber: 382,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 381,
                columnNumber: 7
            }, this),
            groups.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "px-4 py-8 text-center text-sm text-slate-400",
                children: "No events yet."
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 393,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                className: "divide-y divide-slate-100",
                children: groups.map((g)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(GroupCard, {
                        group: g,
                        isExpanded: expanded.has(g.correlationId),
                        onToggle: ()=>toggle(g.correlationId)
                    }, g.correlationId, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 399,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 397,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 380,
        columnNumber: 5
    }, this);
}
function GroupCard({ group, isExpanded, onToggle }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: onToggle,
                className: "flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "w-4 select-none text-xs text-slate-400",
                        children: isExpanded ? "▼" : "▶"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 429,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: `truncate font-mono text-xs ${group.isStartup ? "text-slate-500" : "text-slate-800"}`,
                        children: group.correlationId
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 432,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "ml-auto whitespace-nowrap text-xs text-slate-400 tabular-nums",
                        children: [
                            group.events.length,
                            " event",
                            group.events.length === 1 ? "" : "s",
                            " · ",
                            formatDuration(group.durationMs)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 439,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 424,
                columnNumber: 7
            }, this),
            isExpanded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                className: "mb-2",
                children: group.events.map((e, i)=>{
                    if (e.event_type === "ESCALATION_REQUIRED") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(EscalationCard, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 452,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 451,
                            columnNumber: 17
                        }, this);
                    }
                    if (e.event_type === "DEBRIEF_READY") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(ShiftNoteCard, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 459,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 458,
                            columnNumber: 17
                        }, this);
                    }
                    if (e.event_type === "ANOMALY_DETECTED") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(AnomalyCard, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 466,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 465,
                            columnNumber: 17
                        }, this);
                    }
                    if (e.event_type === "POST_ALLOCATION_ALERT") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(PostAllocationAlertCard, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 473,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 472,
                            columnNumber: 17
                        }, this);
                    }
                    if (e.event_type === "SUPERVISOR_OVERRIDE") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(SupervisorOverrideCard, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 480,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 479,
                            columnNumber: 17
                        }, this);
                    }
                    if (e.event_type === "TRAVEL_WARNING") {
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(TravelWarningNote, {
                                event: e
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 487,
                                columnNumber: 19
                            }, this)
                        }, e.id || `${group.correlationId}-${i}`, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                            lineNumber: 486,
                            columnNumber: 17
                        }, this);
                    }
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                        className: `ml-6 mr-4 border-l-2 border-slate-100 px-4 py-1.5 pl-4 ${rowClass(e)}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 text-xs",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: `rounded px-1.5 py-0.5 font-medium ${pillClass(e.agent)}`,
                                        children: e.agent
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                        lineNumber: 497,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "font-mono font-medium text-slate-700",
                                        children: e.event_type
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                        lineNumber: 502,
                                        columnNumber: 19
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "ml-auto font-mono tabular-nums text-slate-400",
                                        children: formatTime(e.timestamp)
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                        lineNumber: 505,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 496,
                                columnNumber: 17
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "mt-1 border-l border-slate-200 pl-2 text-sm text-slate-600",
                                children: e.human_label
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                                lineNumber: 509,
                                columnNumber: 17
                            }, this)
                        ]
                    }, e.id || `${group.correlationId}-${i}`, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                        lineNumber: 492,
                        columnNumber: 15
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
                lineNumber: 447,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/EventLog.tsx",
        lineNumber: 423,
        columnNumber: 5
    }, this);
}
}),
"[externals]/styled-jsx/style.js [external] (styled-jsx/style.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("styled-jsx/style.js", () => require("styled-jsx/style.js"));

module.exports = mod;
}),
"[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// dashboard/components/MetricsStrip.tsx
//
// Four live counters at the top of the dashboard. Values seed from
// initialRoutes (fetched once at mount) so the bar isn't zeroed out on
// page load; WebSocket events update the counters on top. Each new
// update flashes a delta badge (↑/↓) for 5 seconds.
__turbopack_context__.s([
    "MetricsStrip",
    ()=>MetricsStrip
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$styled$2d$jsx$2f$style$2e$js__$5b$external$5d$__$28$styled$2d$jsx$2f$style$2e$js$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/styled-jsx/style.js [external] (styled-jsx/style.js, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
;
;
;
function emptyMetrics() {
    return {
        onTimePct: 100,
        totalStops: 0,
        onTimeStops: 0,
        fleetKm: 0,
        tasksAtRisk: 0,
        replanCount: 0
    };
}
/** Initial metrics from the /routes response — before any WebSocket
 *  event arrives. `late` per stop comes from the backend's route_planner
 *  time-window check. */ function metricsFromInitial(routes) {
    const m = emptyMetrics();
    if (!routes) return m;
    for (const r of routes){
        m.fleetKm += r.total_distance_km ?? 0;
        for (const s of r.per_stop_etas ?? []){
            m.totalStops += 1;
            if (s.late) m.tasksAtRisk += 1;
            else m.onTimeStops += 1;
        }
    }
    m.onTimePct = m.totalStops === 0 ? 100 : Math.round(m.onTimeStops / m.totalStops * 100);
    return m;
}
/** Fold ROUTE_UPDATED events into the initial metric baseline. Each
 *  worker's latest ROUTE_UPDATED replaces their contribution from the
 *  initial snapshot. Non-startup replans also increment replanCount. */ function metricsFromEvents(initial, events, initialByWorker) {
    const latestByWorker = new Map();
    let replanCount = 0;
    for (const e of events){
        if (e.event_type !== "ROUTE_UPDATED") continue;
        const p = e.payload;
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
    for (const [wid, route] of latestByWorker.entries()){
        // Subtract this worker's initial contribution (if any) and re-add
        // from the latest event.
        const prior = initialByWorker.get(wid);
        if (prior) {
            fleetKm -= prior.total_distance_km ?? 0;
            for (const s of prior.per_stop_etas ?? []){
                totalStops -= 1;
                if (s.late) tasksAtRisk -= 1;
                else onTimeStops -= 1;
            }
        }
        fleetKm += route.total_distance_km ?? 0;
        for (const s of route.per_stop_etas ?? []){
            totalStops += 1;
            if (s.late) tasksAtRisk += 1;
            else onTimeStops += 1;
        }
    }
    const onTimePct = totalStops === 0 ? 100 : Math.round(onTimeStops / totalStops * 100);
    return {
        onTimePct,
        totalStops,
        onTimeStops,
        fleetKm: Math.max(0, fleetKm),
        tasksAtRisk: Math.max(0, tasksAtRisk),
        replanCount
    };
}
// ---- colour thresholds --------------------------------------------------
function onTimeDot(pct, totalStops) {
    if (totalStops === 0) return "bg-slate-400";
    if (pct >= 90) return "bg-emerald-500";
    if (pct >= 75) return "bg-amber-500";
    return "bg-rose-500";
}
function atRiskDot(count) {
    if (count === 0) return "bg-emerald-500";
    if (count <= 3) return "bg-amber-500";
    return "bg-rose-500";
}
function DeltaBadge({ info }) {
    if (!info) return null;
    const tone = {
        "up-good": "text-emerald-600",
        "down-good": "text-emerald-600",
        "up-bad": "text-rose-600",
        "down-bad": "text-rose-600",
        neutral: "text-amber-600"
    }[info.tone];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
        "aria-hidden": true,
        className: "jsx-594f52cad343a7e8" + " " + `ml-2 inline-flex items-center gap-0.5 text-xs font-semibold ${tone} delta-fade`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: "jsx-594f52cad343a7e8",
                children: info.arrow
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 184,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: "jsx-594f52cad343a7e8" + " " + "tabular-nums",
                children: info.text
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 185,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$styled$2d$jsx$2f$style$2e$js__$5b$external$5d$__$28$styled$2d$jsx$2f$style$2e$js$2c$__cjs$29$__["default"], {
                id: "594f52cad343a7e8",
                children: ".delta-fade.jsx-594f52cad343a7e8{animation:5s forwards fade-out}@keyframes fade-out{0%{opacity:1;transform:translateY(-2px)}20%{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(0)}}"
            }, void 0, false, void 0, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
        lineNumber: 180,
        columnNumber: 5
    }, this);
}
function Tile({ label, value, sublabel, dotColor, delta }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "flex flex-col px-6 py-4 flex-1 min-w-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "text-xs font-medium uppercase tracking-wider text-slate-500",
                children: label
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 214,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: `h-2 w-2 rounded-full ${dotColor}`,
                        "aria-hidden": true
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        className: "text-2xl font-semibold text-slate-900 tabular-nums",
                        children: value
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 219,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(DeltaBadge, {
                        info: delta
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 222,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 217,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-xs text-slate-500",
                children: sublabel
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 224,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
        lineNumber: 213,
        columnNumber: 5
    }, this);
}
function StatusBanner({ status }) {
    if (status === "open") return null;
    const copy = {
        connecting: "Connecting to event stream…",
        closed: "Connection closed. Retrying…",
        error: "Connection lost after 5 retries. Refresh the page to reconnect."
    };
    const tone = status === "error" ? "bg-rose-100 text-rose-800 border-rose-200" : "bg-amber-100 text-amber-800 border-amber-200";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: `border-b px-4 py-1.5 text-xs ${tone}`,
        role: "status",
        children: copy[status]
    }, void 0, false, {
        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
        lineNumber: 241,
        columnNumber: 5
    }, this);
}
function MetricsStrip({ events, status, initialRoutes }) {
    const baseline = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>metricsFromInitial(initialRoutes), [
        initialRoutes
    ]);
    const initialByWorker = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        const m = new Map();
        for (const r of initialRoutes ?? [])m.set(r.worker_id, r);
        return m;
    }, [
        initialRoutes
    ]);
    const metrics = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>metricsFromEvents(baseline, events, initialByWorker), // eslint-disable-next-line react-hooks/exhaustive-deps
    [
        events.length,
        baseline,
        initialByWorker
    ]);
    // Track prior metrics to compute deltas.
    const prevRef = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useRef"])(baseline);
    const [deltas, setDeltas] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])({
        onTime: null,
        fleetKm: null,
        atRisk: null,
        replan: null
    });
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        // Compare metrics against the previous snapshot; emit delta badges
        // that auto-fade via the CSS animation on DeltaBadge.
        const prev = prevRef.current;
        const out = {
            onTime: null,
            fleetKm: null,
            atRisk: null,
            replan: null
        };
        const dOt = metrics.onTimePct - prev.onTimePct;
        if (dOt !== 0 && metrics.totalStops > 0) {
            out.onTime = {
                arrow: dOt > 0 ? "↑" : "↓",
                text: `${dOt > 0 ? "+" : ""}${dOt}%`,
                tone: dOt > 0 ? "up-good" : "down-bad"
            };
        }
        const dKm = metrics.fleetKm - prev.fleetKm;
        if (Math.abs(dKm) >= 0.1) {
            out.fleetKm = {
                arrow: dKm > 0 ? "↑" : "↓",
                text: `${dKm > 0 ? "+" : ""}${dKm.toFixed(1)} km`,
                tone: dKm > 0 ? "up-bad" : "down-good"
            };
        }
        const dRisk = metrics.tasksAtRisk - prev.tasksAtRisk;
        if (dRisk !== 0) {
            out.atRisk = {
                arrow: dRisk > 0 ? "↑" : "↓",
                text: `${dRisk > 0 ? "+" : ""}${dRisk}`,
                tone: dRisk > 0 ? "up-bad" : "down-good"
            };
        }
        const dReplan = metrics.replanCount - prev.replanCount;
        if (dReplan > 0) {
            out.replan = {
                arrow: "↑",
                text: `+${dReplan}`,
                tone: "neutral"
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
        metrics.onTimePct,
        metrics.fleetKm,
        metrics.tasksAtRisk,
        metrics.replanCount
    ]);
    const onTimeValue = metrics.totalStops === 0 ? "—" : `${metrics.onTimePct}%`;
    const onTimeSub = metrics.totalStops === 0 ? "no stops yet" : `of ${metrics.totalStops} stops`;
    // Active alerts — POST_ALLOCATION_ALERT events from non-startup
    // correlations that haven't been superseded. We count distinct
    // (worker_id, alert_type) pairs so a long flow that re-fires the same
    // alert type doesn't double-count.
    const activeAlerts = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        const live = new Set();
        for (const e of events){
            if (e.event_type !== "POST_ALLOCATION_ALERT") continue;
            const cid = e.correlation_id || "";
            if (cid.startsWith("startup-") || cid.startsWith("reset-")) continue;
            const p = e.payload;
            if (p?.worker_id && p?.type) {
                live.add(`${p.worker_id}:${p.type}`);
            }
        }
        return live.size;
    }, [
        events.length
    ]);
    const alertDot = activeAlerts === 0 ? "bg-emerald-500" : activeAlerts === 1 ? "bg-amber-500" : "bg-rose-500";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "border-b border-slate-200 bg-white",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(StatusBanner, {
                status: status
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 367,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex divide-x divide-slate-200",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Tile, {
                        label: "On-time %",
                        value: onTimeValue,
                        sublabel: onTimeSub,
                        dotColor: onTimeDot(metrics.onTimePct, metrics.totalStops),
                        delta: deltas.onTime
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 369,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Tile, {
                        label: "Fleet km",
                        value: metrics.fleetKm.toFixed(1),
                        sublabel: "total today",
                        dotColor: "bg-slate-400",
                        delta: deltas.fleetKm
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 376,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Tile, {
                        label: "Tasks at risk",
                        value: String(metrics.tasksAtRisk),
                        sublabel: "window slip",
                        dotColor: atRiskDot(metrics.tasksAtRisk),
                        delta: deltas.atRisk
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 383,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Tile, {
                        label: "Replan count",
                        value: String(metrics.replanCount),
                        sublabel: "reallocations",
                        dotColor: "bg-slate-400",
                        delta: deltas.replan
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 390,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Tile, {
                        label: "Active alerts",
                        value: String(activeAlerts),
                        sublabel: activeAlerts === 0 ? "monitoring" : "needs attention",
                        dotColor: alertDot,
                        delta: null
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                        lineNumber: 397,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
                lineNumber: 368,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx",
        lineNumber: 366,
        columnNumber: 5
    }, this);
}
}),
"[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
__turbopack_context__.s([
    "PipelineTracker",
    ()=>PipelineTracker
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
;
;
function emptyState() {
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
        travelWarning: null
    };
}
function reduceEvents(events, correlationId) {
    const s = emptyState();
    for (const e of events){
        if (e.correlation_id !== correlationId) continue;
        const p = e.payload ?? {};
        switch(e.event_type){
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
            case "WORKER_SCORED":
                {
                    // Upsert by worker_id — on retry the same worker may get a new
                    // WORKER_SCORED event with updated selected/rejection_reason flags.
                    const row = {
                        worker_id: String(p.worker_id ?? ""),
                        worker_name: String(p.worker_name ?? ""),
                        zone: String(p.zone ?? ""),
                        eta_mins: p.eta_mins ?? null,
                        distance_km: p.distance_km ?? null,
                        slack_mins: p.slack_mins ?? null,
                        remaining_shift_mins: p.remaining_shift_mins ?? null,
                        kpi_ontime: p.kpi_ontime ?? null,
                        kpi_priority_fit: p.kpi_priority_fit ?? null,
                        kpi_distance: p.kpi_distance ?? null,
                        score: p.score ?? null,
                        skill_match: p.skill_match === undefined ? true : Boolean(p.skill_match),
                        selected: Boolean(p.selected),
                        rejection_reason: p.rejection_reason ?? null,
                        on_site: Boolean(p.on_site),
                        remaining_on_site_mins: Number(p.remaining_on_site_mins ?? 0),
                        adjusted_eta_mins: p.adjusted_eta_mins != null ? Number(p.adjusted_eta_mins) : null,
                        effective_availability: String(p.effective_availability ?? "")
                    };
                    const idx = s.workerScores.findIndex((r)=>r.worker_id === row.worker_id);
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
    s.workerScores.sort((a, b)=>{
        const aRej = a.rejection_reason ? 1 : 0;
        const bRej = b.rejection_reason ? 1 : 0;
        if (aRej !== bRej) return aRej - bRej;
        if (a.selected !== b.selected) return a.selected ? -1 : 1;
        return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    });
    return s;
}
const DISPATCHER_CHECKS = [
    "Skill match verified",
    "Shift feasibility confirmed",
    "No time conflicts",
    "Capacity check passed",
    "Distance within range",
    "Travel times verified",
    "All stops reachable on time"
];
const DISPATCHER_CHECK_STAGGER_MS = 180;
function stageList(s) {
    const out = [];
    // Stage 1: Ad-hoc task arrives
    if (s.taskCreated) {
        const p = s.taskCreated.payload;
        out.push({
            n: 1,
            title: "Ad-hoc task arrives",
            status: "complete",
            detail: s.taskCreated.human_label
        });
    } else {
        out.push({
            n: 1,
            title: "Ad-hoc task arrives",
            status: "pending"
        });
    }
    // Stage 2: Supervisor scores priority
    if (s.priorityDecided) {
        out.push({
            n: 2,
            title: "Supervisor: score priority",
            status: "complete",
            detail: s.priorityDecided === "reallocate" ? "High priority — reallocating" : "Low priority — queued"
        });
    } else if (s.taskCreated) {
        out.push({
            n: 2,
            title: "Supervisor: score priority",
            status: "active",
            detail: "Assessing urgency and SLA breach risk…"
        });
    } else {
        out.push({
            n: 2,
            title: "Supervisor: score priority",
            status: "pending"
        });
    }
    // Stage 3: Priority check (decision gate)
    if (s.priorityDecided) {
        out.push({
            n: 3,
            title: "Priority check",
            status: "complete",
            detail: s.priorityDecided === "reallocate" ? "Priority ≥ 3 → reallocate now" : "Priority < 3 → added to worker queue"
        });
    } else {
        out.push({
            n: 3,
            title: "Priority check",
            status: "pending"
        });
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
            detail: s.scoringComplete ? "Distance matrix ready — fleet evaluated" : "Fetching road distances for all technicians…"
        });
    } else if (s.priorityDecided === "reallocate") {
        out.push({
            n: 4,
            title: "Fetch distance matrix",
            status: "active",
            detail: "Preparing fleet scan…"
        });
    } else {
        out.push({
            n: 4,
            title: "Fetch distance matrix",
            status: "pending"
        });
    }
    // Stage 5: Score each worker
    if (s.scoringComplete) {
        const p = s.scoringComplete.payload;
        out.push({
            n: 5,
            title: "Score each technician",
            status: "complete",
            detail: `${p.evaluated} evaluated · ${p.viable} viable · ` + `${p.selected_name} selected`
        });
    } else if (s.workerScores.length > 0) {
        out.push({
            n: 5,
            title: "Score each technician",
            status: "active",
            detail: `Evaluating — ${s.workerScores.length} scored so far…`
        });
    } else if (s.fleetScan) {
        out.push({
            n: 5,
            title: "Score each technician",
            status: "active",
            detail: "Scoring starts…"
        });
    } else {
        out.push({
            n: 5,
            title: "Score each technician",
            status: "pending"
        });
    }
    // Escalation short-circuit: if ESCALATION_REQUIRED fires, stages 6-8
    // collapse into the escalation card (rendered separately).
    if (s.escalation) {
        return out;
    }
    // Stage 6: Consent required?
    if (s.consentRequired === true) {
        out.push({
            n: 6,
            title: "Consent required?",
            status: "complete",
            detail: "Yes — displacement needs approval"
        });
    } else if (s.consentRequired === false) {
        out.push({
            n: 6,
            title: "Consent required?",
            status: "complete",
            detail: "No — committing directly"
        });
    } else if (s.scoringComplete) {
        out.push({
            n: 6,
            title: "Consent required?",
            status: "active"
        });
    } else {
        out.push({
            n: 6,
            title: "Consent required?",
            status: "pending"
        });
    }
    // Stage 7a: Dispatcher validation (no-consent direct branch only).
    // Sits between ASSIGNMENT_PROPOSED and ROUTE_REPLAN — the supervisor
    // runs its 7 guardrails here. SUPERVISOR_OVERRIDE → error, retry resets
    // when the next ASSIGNMENT_PROPOSED arrives. ROUTE_REPLAN → complete.
    if (s.consentRequired === false) {
        if (s.supervisorOverride) {
            const op = s.supervisorOverride.payload;
            const reason = Array.isArray(op.reasons) && op.reasons.length > 0 ? String(op.reasons[0]) : "guardrail rejected";
            out.push({
                n: 7,
                title: "Dispatcher validation",
                status: "error",
                detail: `${reason} — re-evaluating options`,
                kind: "dispatcher"
            });
        } else if (s.routeReplan || s.routeUpdated) {
            out.push({
                n: 7,
                title: "Dispatcher validation",
                status: "complete",
                detail: "All 7 guardrails passed",
                kind: "dispatcher"
            });
        } else if (s.lastAssignmentProposed) {
            out.push({
                n: 7,
                title: "Dispatcher validation",
                status: "active",
                detail: "Running guardrails…",
                kind: "dispatcher"
            });
        } else {
            out.push({
                n: 7,
                title: "Dispatcher validation",
                status: "pending",
                kind: "dispatcher"
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
        const resolvedTs = s.consentResolved ? new Date(s.consentResolved.timestamp).getTime() : 0;
        const inNewRound = s.consentSent && sentTs > resolvedTs;
        if (inNewRound) {
            out.push({
                n: 7,
                title: "Send Telegram message",
                status: "active",
                detail: "Trying next available technician…"
            });
        } else if (s.consentResolved) {
            const p = s.consentResolved.payload;
            const outcome = String(p.outcome);
            const detail = outcome === "yes" ? "Customer confirmed ✅" : outcome === "no" ? "Customer declined — trying next best technician" : "No reply — escalating ⏱";
            out.push({
                n: 7,
                title: "Send Telegram message",
                status: outcome === "timeout" ? "error" : outcome === "no" ? "active" : "complete",
                detail
            });
        } else if (s.consentSent) {
            out.push({
                n: 7,
                title: "Send Telegram message",
                status: "active",
                detail: "Message sent — awaiting reply"
            });
        } else if (s.consentRequired === true) {
            out.push({
                n: 7,
                title: "Send Telegram message",
                status: "active",
                detail: "Preparing message…"
            });
        } else {
            out.push({
                n: 7,
                title: "Send Telegram message",
                status: "pending"
            });
        }
    }
    // Stage 8: Commit + replan
    if (s.routeUpdated) {
        const p = s.routeUpdated.payload;
        const stops = Array.isArray(p.ordered_task_ids) ? p.ordered_task_ids.length : 0;
        const km = typeof p.total_distance_km === "number" ? p.total_distance_km.toFixed(1) : "?";
        const perStop = p.per_stop_etas ?? [];
        const endTime = perStop.length > 0 ? perStop[perStop.length - 1].arrival_time_hm ?? "—" : "—";
        const version = typeof p.version === "number" ? p.version : 0;
        const workerName = (()=>{
            const wid = p.worker_id;
            if (typeof wid !== "string") return "";
            return wid;
        })();
        const replanNote = version > 1 ? ` (replanned, v${version})` : "";
        out.push({
            n: 8,
            title: "Commit reallocation + replan",
            status: "complete",
            detail: `After: ${workerName} — ${stops} stops, ${km} km, done by ${endTime}${replanNote}`
        });
    } else if (s.routeReplan && s.priorityDecided === "reallocate") {
        out.push({
            n: 8,
            title: "Commit reallocation + replan",
            status: "active",
            detail: "Planner computing new route…"
        });
    } else if (s.consentResolved && s.consentResolved.payload.outcome === "yes") {
        out.push({
            n: 8,
            title: "Commit reallocation + replan",
            status: "active",
            detail: "Committing…"
        });
    } else {
        out.push({
            n: 8,
            title: "Commit reallocation + replan",
            status: "pending"
        });
    }
    return out;
}
// ---- presentational -----------------------------------------------------
function StageDot({ status }) {
    const cls = {
        pending: "bg-slate-200 text-slate-400",
        active: "bg-indigo-500 text-white animate-pulse ring-4 ring-indigo-200",
        complete: "bg-emerald-500 text-white",
        skipped: "bg-slate-100 text-slate-400 border border-dashed border-slate-300",
        error: "bg-rose-500 text-white"
    }[status];
    const glyph = {
        pending: "",
        active: "•",
        complete: "✓",
        skipped: "⊘",
        error: "!"
    }[status];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: `flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${cls}`,
        "aria-hidden": true,
        children: glyph
    }, void 0, false, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 527,
        columnNumber: 5
    }, this);
}
/** Recompute combined score + client-side "selected" using the current α.
 *  Pure — takes the raw rows as-stored (with per-KPI fields from the
 *  server) and returns a new sorted list with updated scores. */ function rerankRows(rows, alpha) {
    // Recompute score where we have all three KPIs; otherwise fall back to
    // the server-side score.
    const recomputed = rows.map((r)=>{
        if (r.kpi_ontime != null && r.kpi_priority_fit != null && r.kpi_distance != null) {
            const newScore = alpha * r.kpi_ontime + 0.5 * (1 - alpha) * r.kpi_priority_fit + 0.5 * (1 - alpha) * r.kpi_distance;
            return {
                ...r,
                score: newScore
            };
        }
        return {
            ...r
        };
    });
    // Sort by score desc (viable first, rejected-by-physics rejected at end
    // only if their score is lower — keep everything score-ordered so the
    // alpha slider can push a 🔧 row above a ✅ row when ETA/distance dominate).
    recomputed.sort((a, b)=>(b.score ?? -Infinity) - (a.score ?? -Infinity));
    // Client-side selected = first skill_match row that isn't fully_booked or
    // cannot_complete. Overrides server's `selected` flag so the amber row
    // moves as the slider shifts.
    let clientSelectedId = null;
    for (const r of recomputed){
        if (!r.skill_match) continue;
        if (r.rejection_reason === "fully_booked" || r.rejection_reason === "cannot_complete") continue;
        clientSelectedId = r.worker_id;
        break;
    }
    return recomputed.map((r)=>({
            ...r,
            selected: r.worker_id === clientSelectedId
        }));
}
function ScoringTable({ rows, alpha }) {
    const ranked = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>rerankRows(rows, alpha), [
        rows,
        alpha
    ]);
    if (ranked.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
            className: "mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500",
            children: "Waiting for first score…"
        }, void 0, false, {
            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
            lineNumber: 592,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mt-2 overflow-hidden rounded border border-slate-200",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("table", {
            className: "w-full text-xs table-fixed",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("colgroup", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "150px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 601,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "150px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 604,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "55px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 605,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "55px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 606,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "60px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 607,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "60px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 608,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("col", {
                            style: {
                                width: "60px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 609,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                    lineNumber: 600,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("thead", {
                    className: "bg-slate-100 text-slate-600",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("tr", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-left",
                                children: "Technician"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 613,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "ETA"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 614,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "Dist"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 615,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "Slack"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 616,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "OT%"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 617,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "Fit%"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 618,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("th", {
                                className: "px-2 py-1 text-right",
                                children: "Score"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 619,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 612,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                    lineNumber: 611,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("tbody", {
                    children: ranked.map((r)=>{
                        const isSelected = r.selected;
                        const rej = r.rejection_reason;
                        const rowCls = isSelected ? "bg-amber-100 text-amber-900 font-semibold" : r.on_site ? "bg-amber-50 text-amber-900" : rej ? "bg-slate-50 text-slate-400" : "bg-white text-slate-700";
                        const prefix = isSelected ? "⭐" : r.on_site ? "🔨" : rej === "wrong_skill" ? "🔧" : rej === "fully_booked" ? "📅" : rej === "cannot_complete" ? "⏰" : "✅";
                        const rawEtaInt = r.eta_mins != null ? Math.round(r.eta_mins) : null;
                        const adjEtaInt = r.adjusted_eta_mins != null ? Math.round(r.adjusted_eta_mins) : null;
                        const eta = r.on_site && adjEtaInt != null && rawEtaInt != null ? `${adjEtaInt}m (${r.remaining_on_site_mins}m on-site + ${rawEtaInt}m travel)` : rawEtaInt != null ? `${rawEtaInt}m` : "—";
                        const dist = r.distance_km != null ? `${r.distance_km.toFixed(1)}k` : "—";
                        const slack = r.slack_mins != null ? `${r.slack_mins}m` : "—";
                        const otPct = r.kpi_ontime != null ? `${Math.round(r.kpi_ontime * 100)}%` : "—";
                        const fitPct = r.kpi_priority_fit != null ? `${Math.round(r.kpi_priority_fit * 100)}%` : "—";
                        const score = r.score != null ? r.score.toFixed(2) : "—";
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("tr", {
                            className: `border-t border-slate-100 ${rowCls}`,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                            className: "mr-1",
                                            "aria-hidden": true,
                                            children: prefix
                                        }, void 0, false, {
                                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                            lineNumber: 672,
                                            columnNumber: 19
                                        }, this),
                                        r.worker_name,
                                        r.zone && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                            className: "ml-1 text-[10px] font-normal text-slate-400",
                                            children: [
                                                "(",
                                                r.zone,
                                                ")"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                            lineNumber: 677,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 671,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums",
                                    children: eta
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 682,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums",
                                    children: dist
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 683,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums",
                                    children: slack
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 684,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums",
                                    children: otPct
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 685,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums",
                                    children: fitPct
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 686,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("td", {
                                    className: "px-2 py-1 text-right tabular-nums font-semibold",
                                    children: score
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                    lineNumber: 687,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, r.worker_id, true, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 667,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                    lineNumber: 622,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
            lineNumber: 599,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 598,
        columnNumber: 5
    }, this);
}
/** Renders the seven supervisor guardrails. While `status === "active"`,
 *  checks fill in one at a time on a 180 ms stagger so the audience sees
 *  the dispatcher work; on completion they all pop ✓; on override the
 *  list dims and the offending check shows ✗ alongside the reason. */ function DispatcherChecks({ status, startedAt, override, travelWarning }) {
    const [now, setNow] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(()=>Date.now());
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        if (status !== "active" || startedAt == null) return;
        const id = setInterval(()=>setNow(Date.now()), 100);
        return ()=>clearInterval(id);
    }, [
        status,
        startedAt
    ]);
    const elapsedMs = startedAt != null ? now - startedAt : 0;
    const revealCount = status === "complete" ? DISPATCHER_CHECKS.length : status === "error" ? DISPATCHER_CHECKS.length : status === "active" ? Math.min(DISPATCHER_CHECKS.length, Math.max(0, Math.floor(elapsedMs / DISPATCHER_CHECK_STAGGER_MS))) : 0;
    const overrideReason = override ? (()=>{
        const op = override.payload;
        const r = op?.reasons;
        return Array.isArray(r) && r.length > 0 ? String(r[0]) : null;
    })() : null;
    const warnMsgs = travelWarning ? (()=>{
        const wp = travelWarning.payload;
        const w = wp?.warnings;
        return Array.isArray(w) ? w.map((x)=>String(x)) : [];
    })() : [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mt-1 space-y-0.5 text-xs",
        children: [
            DISPATCHER_CHECKS.map((label, i)=>{
                const isLastWhenError = status === "error" && i === DISPATCHER_CHECKS.length - 1;
                const shown = i < revealCount;
                const tone = !shown ? "text-slate-300" : isLastWhenError ? "text-rose-700 font-semibold" : status === "error" ? "text-slate-400 line-through" : "text-slate-700";
                const glyph = !shown ? "·" : isLastWhenError ? "✗" : label === "Travel times verified" && status === "active" ? "🚗" : "✓";
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                    className: `flex gap-1.5 ${tone}`,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                            "aria-hidden": true,
                            className: "w-3 text-center",
                            children: glyph
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 772,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                            children: label
                        }, void 0, false, {
                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                            lineNumber: 773,
                            columnNumber: 13
                        }, this)
                    ]
                }, label, true, {
                    fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                    lineNumber: 771,
                    columnNumber: 11
                }, this);
            }),
            status === "error" && overrideReason && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-800",
                children: [
                    "⚠️ ",
                    overrideReason,
                    " — re-evaluating options"
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 778,
                columnNumber: 9
            }, this),
            status === "complete" && warnMsgs.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900",
                children: [
                    "🚗 Note: ",
                    warnMsgs.join(" · ")
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 783,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 752,
        columnNumber: 5
    }, this);
}
function CountdownTimer({ startMs }) {
    const [now, setNow] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(Date.now());
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        const id = setInterval(()=>setNow(Date.now()), 1000);
        return ()=>clearInterval(id);
    }, []);
    const remaining = Math.max(0, 10 * 60 * 1000 - (now - startMs));
    const mm = Math.floor(remaining / 60000);
    const ss = Math.floor(remaining % 60000 / 1000);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
        className: "font-mono tabular-nums text-indigo-700",
        children: [
            String(mm).padStart(2, "0"),
            ":",
            String(ss).padStart(2, "0")
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 802,
        columnNumber: 5
    }, this);
}
function EscalationCard({ event }) {
    const p = event.payload;
    const opts = p.trade_off_options ?? [];
    const reason = p.narrative || p.reasoning || "All nearby technicians are fully booked.";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mt-3 rounded-lg border-2 border-rose-500 bg-rose-50 p-4 shadow-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 text-lg font-bold text-rose-800",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        "aria-hidden": true,
                        children: "🚨"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 821,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                        children: "No technician available"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 822,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 820,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-sm text-rose-900",
                children: reason
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 824,
                columnNumber: 7
            }, this),
            opts.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-1 text-xs font-semibold uppercase tracking-wider text-rose-700",
                        children: "Options for dispatcher"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 827,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                        className: "space-y-1 text-sm",
                        children: opts.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                                className: "flex gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "font-mono font-bold text-rose-700",
                                        children: [
                                            o.label,
                                            ")"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                        lineNumber: 833,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "text-rose-900",
                                        children: o.text
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                        lineNumber: 834,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, o.label, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 832,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 830,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 826,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 819,
        columnNumber: 5
    }, this);
}
function PipelineTracker({ events, activeCorrelationId, alpha = 0.7 }) {
    const [visible, setVisible] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(true);
    const prevCidRef = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useRef"])(null);
    // Reset visibility when the active correlation changes.
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        if (activeCorrelationId !== prevCidRef.current) {
            prevCidRef.current = activeCorrelationId;
            setVisible(true);
        }
    }, [
        activeCorrelationId
    ]);
    const state = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        if (!activeCorrelationId) return emptyState();
        return reduceEvents(events, activeCorrelationId);
    }, [
        events.length,
        activeCorrelationId
    ]);
    // Auto-hide 10 s after ROUTE_UPDATED (but not on escalation — keep those visible).
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        if (state.routeUpdated && !state.escalation) {
            const id = setTimeout(()=>setVisible(false), 10_000);
            return ()=>clearTimeout(id);
        }
    }, [
        state.routeUpdated,
        state.escalation
    ]);
    if (!activeCorrelationId) return null;
    if (activeCorrelationId.startsWith("startup-")) return null;
    if (!visible) return null;
    const stages = stageList(state);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "pointer-events-auto absolute left-4 top-4 z-20 w-[640px] min-w-[600px] rounded-lg border border-slate-300 bg-white/95 shadow-xl backdrop-blur-sm",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between border-b border-slate-200 px-4 py-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-slate-600",
                                children: "Decision pipeline"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 886,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "font-mono text-[10px] text-slate-400",
                                children: activeCorrelationId
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 889,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 885,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setVisible(false),
                        className: "rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100",
                        children: "✕"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 893,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 884,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "max-h-[70vh] overflow-y-auto px-4 py-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ol", {
                        className: "space-y-3",
                        children: stages.map((stage)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                                className: "flex gap-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(StageDot, {
                                        status: stage.status
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                        lineNumber: 905,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                        className: "flex-1 min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                className: `text-sm ${stage.status === "active" ? "font-semibold text-indigo-900" : stage.status === "complete" ? "text-slate-800" : stage.status === "skipped" ? "text-slate-400 italic" : "text-slate-400"}`,
                                                children: stage.title
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                lineNumber: 907,
                                                columnNumber: 17
                                            }, this),
                                            stage.detail && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                className: "text-xs text-slate-600",
                                                children: stage.detail
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                lineNumber: 921,
                                                columnNumber: 19
                                            }, this),
                                            stage.n === 5 && (stage.status === "active" || stage.status === "complete") && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(ScoringTable, {
                                                        rows: state.workerScores,
                                                        alpha: alpha
                                                    }, void 0, false, {
                                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                        lineNumber: 926,
                                                        columnNumber: 21
                                                    }, this),
                                                    state.smartAssignment && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                        className: "mt-2 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-900",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                                className: "mr-1",
                                                                "aria-hidden": true,
                                                                children: "⚖️"
                                                            }, void 0, false, {
                                                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                                lineNumber: 929,
                                                                columnNumber: 25
                                                            }, this),
                                                            (()=>{
                                                                const p = state.smartAssignment.payload;
                                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("strong", {
                                                                            children: String(p.rank1_name)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                                            lineNumber: 934,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        " and",
                                                                        " ",
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("strong", {
                                                                            children: String(p.rank2_name)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                                            lineNumber: 935,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        " are virtually tied. Assigned",
                                                                        " ",
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("strong", {
                                                                            children: String(p.rank2_name)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                                            lineNumber: 937,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        " to avoid unnecessary customer disruption."
                                                                    ]
                                                                }, void 0, true);
                                                            })()
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                        lineNumber: 928,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true),
                                            stage.n === 7 && stage.kind !== "dispatcher" && stage.status === "active" && state.consentSentAt && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                className: "mt-1 text-xs text-indigo-700",
                                                children: [
                                                    "⏳ Waiting for reply — ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(CountdownTimer, {
                                                        startMs: state.consentSentAt
                                                    }, void 0, false, {
                                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                        lineNumber: 952,
                                                        columnNumber: 43
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                lineNumber: 951,
                                                columnNumber: 19
                                            }, this),
                                            stage.n === 7 && stage.kind === "dispatcher" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(DispatcherChecks, {
                                                status: stage.status,
                                                startedAt: state.lastAssignmentProposedAt,
                                                override: state.supervisorOverride,
                                                travelWarning: state.travelWarning
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                                lineNumber: 957,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                        lineNumber: 906,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, stage.n, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                                lineNumber: 904,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 902,
                        columnNumber: 9
                    }, this),
                    state.escalation && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(EscalationCard, {
                        event: state.escalation
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                        lineNumber: 970,
                        columnNumber: 30
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
                lineNumber: 901,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx",
        lineNumber: 883,
        columnNumber: 5
    }, this);
}
}),
"[project]/route-planning-demo/dashboard/components/WFMOutput.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// dashboard/components/WFMOutput.tsx
//
// The "this is what we'd push to your WFM" panel. Slides up from the
// bottom whenever a ROUTE_UPDATED arrives for a non-startup correlation.
// Shows the full WFM dispatch JSON the API builds at /wfm-payload/{id},
// plus a readable summary for the audience.
__turbopack_context__.s([
    "WFMOutput",
    ()=>WFMOutput
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
;
;
// ---- colour JSON (no external library) ---------------------------------
function syntaxHighlight(jsonText) {
    return jsonText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match)=>{
        let cls = "text-emerald-700"; // number
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? "text-slate-800 font-semibold" : "text-amber-700"; // key | string
        } else if (/true|false/.test(match)) {
            cls = "text-indigo-700";
        } else if (/null/.test(match)) {
            cls = "text-slate-500";
        }
        return `<span class="${cls}">${match}</span>`;
    });
}
// ---- task-type emoji for readable summary ------------------------------
const ICON = {
    new_installation: "🔧",
    fault_repair: "⚡",
    network_rehab: "🔁",
    fiber_cut: "🔴"
};
function WFMOutput({ events, activeCorrelationId, apiUrl, open, onClose }) {
    const [payload, setPayload] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(null);
    const [copied, setCopied] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(false);
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(true);
    const lastFetchedRef = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useRef"])("");
    // Find the most recent ROUTE_UPDATED under the active correlation —
    // that's the worker whose payload we need.
    const targetWorkerId = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        if (!activeCorrelationId) return null;
        for(let i = events.length - 1; i >= 0; i--){
            const e = events[i];
            if (e.correlation_id !== activeCorrelationId) continue;
            if (e.event_type !== "ROUTE_UPDATED") continue;
            const wid = e.payload?.worker_id;
            if (typeof wid === "string") return wid;
        }
        return null;
    }, [
        events,
        activeCorrelationId
    ]);
    // Pluck the latest DEBRIEF_READY paragraph for the active correlation.
    const debriefParagraph = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        if (!activeCorrelationId) return null;
        for(let i = events.length - 1; i >= 0; i--){
            const e = events[i];
            if (e.correlation_id !== activeCorrelationId) continue;
            if (e.event_type !== "DEBRIEF_READY") continue;
            const p = e.payload?.paragraph;
            if (typeof p === "string" && p.length > 0) return p;
            return e.human_label || null;
        }
        return null;
    }, [
        events,
        activeCorrelationId
    ]);
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        if (!open || !targetWorkerId) return;
        const key = `${activeCorrelationId}::${targetWorkerId}`;
        if (lastFetchedRef.current === key) return;
        lastFetchedRef.current = key;
        (async ()=>{
            try {
                const res = await fetch(`${apiUrl}/wfm-payload/${targetWorkerId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setPayload(data);
            } catch (err) {
                console.error("WFMOutput fetch failed:", err);
            }
        })();
    }, [
        open,
        targetWorkerId,
        activeCorrelationId,
        apiUrl
    ]);
    if (!open) return null;
    if (!payload) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
            className: "fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t-2 border-indigo-400 bg-white px-6 py-4 shadow-2xl",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "text-sm text-slate-500",
                children: "Loading WFM payload…"
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                lineNumber: 196,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
            lineNumber: 195,
            columnNumber: 7
        }, this);
    }
    const jsonStr = JSON.stringify(payload, null, 2);
    const decisionSeconds = payload.decision_metadata.decision_time_ms / 1000;
    const onCopy = async ()=>{
        try {
            await navigator.clipboard.writeText(jsonStr);
            setCopied(true);
            setTimeout(()=>setCopied(false), 1500);
        } catch  {
        // clipboard may be blocked — fall through silently
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t-2 border-indigo-400 bg-white shadow-2xl",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        "aria-hidden": true,
                                        children: "📤"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 220,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "font-semibold uppercase tracking-wider text-slate-700",
                                        children: "WFM Dispatch Output"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 221,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "font-mono text-xs text-slate-400",
                                        children: payload.decision_metadata.correlation_id
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 224,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "text-xs text-slate-400",
                                        children: [
                                            "· ",
                                            decisionSeconds.toFixed(1),
                                            "s"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 227,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 219,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "mt-0.5 text-xs italic text-slate-500",
                                children: "Payload that would be pushed to your WFM API via the integration adapter"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 231,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onCopy,
                                className: "rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700",
                                children: copied ? "Copied ✓" : "Copy JSON"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 236,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: onClose,
                                className: "rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300",
                                children: "Close"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 243,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 235,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                lineNumber: 217,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "px-6 py-4 text-sm",
                children: [
                    debriefParagraph && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3 rounded border-l-4 border-l-indigo-500 bg-indigo-50/60 px-3 py-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-indigo-700",
                                children: "Scenario summary"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 256,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-sm leading-relaxed text-slate-800",
                                children: debriefParagraph
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 259,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 255,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "font-medium text-slate-700",
                                children: "Worker: "
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 266,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "text-slate-900",
                                children: payload.worker.name
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 267,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "ml-1 font-mono text-xs text-slate-500",
                                children: [
                                    "(",
                                    payload.worker.id,
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 268,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "ml-2 text-xs uppercase tracking-wider text-slate-400",
                                children: payload.worker.zone
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 271,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 265,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-slate-500",
                                children: "Assigned tasks"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 277,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ol", {
                                className: "mt-1 space-y-0.5",
                                children: payload.assigned_tasks.map((t, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                                        className: "text-sm text-slate-700",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                className: "mr-1 tabular-nums",
                                                children: [
                                                    i + 1,
                                                    "."
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 283,
                                                columnNumber: 17
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                className: "font-mono text-xs tabular-nums text-slate-500",
                                                children: t.adhoc && t.dispatch_time ? t.dispatch_time : t.scheduled_time
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 284,
                                                columnNumber: 17
                                            }, this),
                                            " ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                "aria-hidden": true,
                                                children: ICON[t.task_type] ?? "•"
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 287,
                                                columnNumber: 17
                                            }, this),
                                            " ",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                className: "text-slate-500",
                                                children: t.task_type.replace(/_/g, " ")
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 288,
                                                columnNumber: 17
                                            }, this),
                                            " ",
                                            "· ",
                                            t.address,
                                            t.adhoc && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                className: "ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-800",
                                                children: "NEW AD-HOC"
                                            }, void 0, false, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 293,
                                                columnNumber: 19
                                            }, this),
                                            t.adhoc && t.dispatch_time && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                className: "ml-2 text-[11px] italic text-slate-500",
                                                children: [
                                                    "Dispatched at ",
                                                    t.dispatch_time
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 298,
                                                columnNumber: 19
                                            }, this),
                                            t.rescheduled && t.original_time && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                className: "ml-6 text-[11px] text-slate-500",
                                                children: [
                                                    "↑ Rescheduled from",
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                        className: "line-through",
                                                        children: t.original_time
                                                    }, void 0, false, {
                                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                        lineNumber: 305,
                                                        columnNumber: 21
                                                    }, this),
                                                    " ",
                                                    "(customer confirmed)"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                lineNumber: 303,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, t.task_id, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 282,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 280,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 276,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-slate-500",
                                children: "Route summary"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 315,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-sm text-slate-700",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                        children: [
                                            payload.route.total_distance_km.toFixed(1),
                                            " km"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 319,
                                        columnNumber: 13
                                    }, this),
                                    " ·",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                        children: [
                                            payload.route.total_time_mins,
                                            " mins"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 320,
                                        columnNumber: 13
                                    }, this),
                                    " · Done by",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                        children: payload.route.estimated_completion || "—"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 321,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "ml-2 text-xs text-slate-500",
                                        children: [
                                            "Version ",
                                            payload.route.version,
                                            payload.route.version > 1 && " (replanned)"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 322,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 318,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 314,
                        columnNumber: 9
                    }, this),
                    payload.consent_records.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-slate-500",
                                children: "Consent records"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 331,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                                className: "mt-1 space-y-0.5 text-sm text-slate-700",
                                children: payload.consent_records.map((c, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
                                        children: [
                                            "task ",
                                            c.task_id ?? "—",
                                            " · contacted:",
                                            " ",
                                            c.customer_contacted ? "yes" : "no",
                                            c.response && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                                                children: [
                                                    " ",
                                                    "· response: ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                                        children: c.response.toUpperCase()
                                                    }, void 0, false, {
                                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                                        lineNumber: 341,
                                                        columnNumber: 40
                                                    }, this)
                                                ]
                                            }, void 0, true),
                                            c.response_time_mins != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                                                children: [
                                                    " (",
                                                    c.response_time_mins.toFixed(1),
                                                    " min)"
                                                ]
                                            }, void 0, true)
                                        ]
                                    }, i, true, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 336,
                                        columnNumber: 17
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 334,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 330,
                        columnNumber: 11
                    }, this),
                    payload.consent_records.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3 text-sm italic text-slate-500",
                        children: "No consent required for this assignment."
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 354,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mb-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "text-xs font-semibold uppercase tracking-wider text-slate-500",
                                children: "Decision metadata"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 360,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "mt-1 text-sm text-slate-700",
                                children: [
                                    "Trigger: ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                        children: payload.decision_metadata.trigger || "—"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 364,
                                        columnNumber: 22
                                    }, this),
                                    " ·",
                                    " ",
                                    "Score:",
                                    " ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("b", {
                                        children: payload.decision_metadata.reallocation_score != null ? payload.decision_metadata.reallocation_score.toFixed(3) : "—"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 366,
                                        columnNumber: 13
                                    }, this),
                                    " ",
                                    "· ",
                                    payload.decision_metadata.alternatives_considered,
                                    " alternatives ·",
                                    " ",
                                    decisionSeconds.toFixed(1),
                                    "s",
                                    payload.decision_metadata.smart_assignment && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        className: "ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800",
                                        children: "SMART ASSIGNMENT"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 374,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 363,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 359,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mt-4 rounded border border-slate-200",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setExpanded((v)=>!v),
                                className: "flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        children: "Raw JSON"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 387,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                        "aria-hidden": true,
                                        className: "text-slate-400",
                                        children: expanded ? "▼" : "▶"
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                        lineNumber: 388,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 382,
                                columnNumber: 11
                            }, this),
                            expanded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("pre", {
                                className: "overflow-x-auto bg-slate-900 px-4 py-3 text-xs leading-5 text-slate-100",
                                dangerouslySetInnerHTML: {
                                    __html: syntaxHighlight(jsonStr)
                                }
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                                lineNumber: 393,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                        lineNumber: 381,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
                lineNumber: 253,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/WFMOutput.tsx",
        lineNumber: 216,
        columnNumber: 5
    }, this);
}
}),
"[project]/route-planning-demo/dashboard/lib/workerColor.ts [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Shared worker-colour palette used by the map polylines, the worker
// card left borders, and any other UI that needs to visually link a worker
// to their route. HSL-even spacing keeps the ten workers distinct at a glance.
__turbopack_context__.s([
    "workerColor",
    ()=>workerColor
]);
function workerColor(workerId) {
    const m = workerId.match(/^W(\d+)$/);
    const n = m ? parseInt(m[1], 10) : 0;
    const hue = (n - 1) * 36 % 360;
    return `hsl(${hue}, 65%, 45%)`;
}
}),
"[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// dashboard/components/WorkerPanel.tsx
//
// Ten worker cards. Static roster fetched once by pages/index.tsx; live
// status + route overlay derived from the WebSocket event stream. The
// worker whose id matches `activeWorkerId` is highlighted (★ + amber
// tint) so the audience can follow "who is this reallocation about?"
// during a demo.
__turbopack_context__.s([
    "WorkerPanel",
    ()=>WorkerPanel
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$lib$2f$workerColor$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/lib/workerColor.ts [ssr] (ecmascript)");
;
;
;
/** Numeric sort by trailing digits so W1, W2, …, W10 appear in order
 *  rather than the default lexical W1, W10, W2, … which made the panel
 *  look like it was missing workers. */ function sortWorkersByIdNumeric(workers) {
    const num = (id)=>{
        const m = id.match(/\d+$/);
        return m ? parseInt(m[0], 10) : 0;
    };
    return [
        ...workers
    ].sort((a, b)=>num(a.id) - num(b.id));
}
// Task-type emoji for the expanded task list (per user spec).
const TASK_TYPE_ICON = {
    new_installation: "🔧",
    fault_repair: "⚡",
    network_rehab: "🔁",
    fiber_cut: "🔴"
};
const TASK_STATUS_COLOR = {
    pending: "bg-slate-200 text-slate-700",
    assigned: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    deferred: "bg-rose-100 text-rose-800"
};
// ---- skill chip palette --------------------------------------------------
// Skills come from the Worker object returned by GET /workers. No hardcoded
// per-worker lookups — the API is the source of truth.
const SKILL_CHIP = {
    installation: "bg-blue-100 text-blue-800 border-blue-200",
    fault: "bg-red-100 text-red-800 border-red-200",
    network_rehab: "bg-orange-100 text-orange-800 border-orange-200",
    fiber_cut: "bg-emerald-100 text-emerald-800 border-emerald-200"
};
function skillChipClass(skill) {
    return SKILL_CHIP[skill] ?? "bg-slate-100 text-slate-700 border-slate-200";
}
/** Normalize route stops from either the /routes REST shape (uses
 *  `arrival_time`) or ROUTE_UPDATED event payload shape (uses
 *  `arrival_time_hm`) into a single in-component shape. */ function normalizeRoute(src) {
    return {
        worker_id: src.worker_id,
        version: src.version,
        total_distance_km: src.total_distance_km,
        total_time_mins: src.total_time_mins,
        ordered_task_ids: src.ordered_task_ids,
        per_stop_etas: (src.per_stop_etas ?? []).map((s)=>({
                task_id: s.task_id,
                arrival_time_hm: s.arrival_time_hm ?? s.arrival_time ?? "",
                distance_km_so_far: s.distance_km_so_far ?? 0,
                late: !!s.late
            }))
    };
}
function deriveLiveState(events, initialRoutes) {
    const out = new Map();
    // Seed from initialRoutes so cards show route info on first paint.
    for (const r of initialRoutes ?? []){
        if (!r?.worker_id) continue;
        if ((r.ordered_task_ids?.length ?? 0) === 0) continue;
        out.set(r.worker_id, {
            route: normalizeRoute({
                worker_id: r.worker_id,
                version: r.version ?? 0,
                total_distance_km: r.total_distance_km ?? 0,
                total_time_mins: r.total_time_mins ?? 0,
                ordered_task_ids: r.ordered_task_ids ?? [],
                per_stop_etas: r.per_stop_etas ?? []
            })
        });
    }
    for (const e of events){
        if (e.event_type === "LOCATION_UPDATE") {
            const p = e.payload;
            if (!p?.worker_id) continue;
            const ls = out.get(p.worker_id) ?? {};
            if (p.status) ls.status = p.status;
            out.set(p.worker_id, ls);
        } else if (e.event_type === "ROUTE_UPDATED") {
            const p = e.payload;
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
function StatusBadge({ status }) {
    const palette = {
        idle: {
            icon: "○",
            color: "text-slate-500",
            label: "idle"
        },
        en_route: {
            icon: "▶",
            color: "text-emerald-600",
            label: "en route"
        },
        on_site: {
            icon: "●",
            color: "text-amber-600",
            label: "on site"
        }
    };
    const s = palette[status];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
        className: `inline-flex items-center gap-1 text-xs ${s.color}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                "aria-hidden": true,
                children: s.icon
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 230,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                children: s.label
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 231,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
        lineNumber: 229,
        columnNumber: 5
    }, this);
}
function TaskRow({ task }) {
    const icon = TASK_TYPE_ICON[task.task_type] ?? "•";
    const addr = task.address.length > 30 ? task.address.slice(0, 29) + "…" : task.address;
    const statusClass = TASK_STATUS_COLOR[task.status] ?? "bg-slate-200 text-slate-700";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
        className: "flex items-center gap-2 py-1 text-xs text-slate-600",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                "aria-hidden": true,
                className: "text-sm",
                children: icon
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 255,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: "truncate flex-1",
                children: addr
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 258,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: "font-mono tabular-nums text-slate-500",
                children: task.scheduled_time
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 259,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: `rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`,
                children: task.status
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 262,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
        lineNumber: 254,
        columnNumber: 5
    }, this);
}
function SkillChips({ skills }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "mt-1 flex flex-wrap gap-1",
        children: skills.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                className: `rounded border px-1.5 py-0.5 text-[10px] font-medium ${skillChipClass(s)}`,
                children: s
            }, s, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 273,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
        lineNumber: 271,
        columnNumber: 5
    }, this);
}
const API_URL_ENV = typeof process !== "undefined" && ("TURBOPACK compile-time value", "http://localhost:8000") || "http://localhost:8000";
function WorkerCard({ worker, liveStatus, route, isActive, isSelected, onSelect, tasks }) {
    const [expanded, setExpanded] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(false);
    const [remainingMins, setRemainingMins] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(null);
    const routeColor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$lib$2f$workerColor$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["workerColor"])(worker.id);
    const taskCount = route?.ordered_task_ids?.length ?? worker.assigned_task_ids.length;
    const stops = route?.per_stop_etas ?? [];
    const nextStop = stops[0];
    const lastStop = stops[stops.length - 1];
    // On-site countdown: poll /workers/{id}/remaining once on mount and
    // every 60 s thereafter while status === "on_site". Stops polling
    // immediately when the worker leaves on_site to avoid a stale ping.
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        if (liveStatus !== "on_site") {
            setRemainingMins(null);
            return;
        }
        let cancelled = false;
        const fetchRemaining = async ()=>{
            try {
                const res = await fetch(`${API_URL_ENV}/workers/${worker.id}/remaining`);
                if (!res.ok) return;
                const json = await res.json();
                if (!cancelled && typeof json?.remaining_mins === "number") {
                    setRemainingMins(json.remaining_mins);
                }
            } catch  {
            // network blips are non-fatal — keep prior value
            }
        };
        void fetchRemaining();
        const id = setInterval(fetchRemaining, 60_000);
        return ()=>{
            cancelled = true;
            clearInterval(id);
        };
    }, [
        worker.id,
        liveStatus
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("li", {
        onClick: ()=>{
            if (onSelect) onSelect(isSelected ? null : worker.id);
        },
        style: isSelected ? {
            borderLeftColor: routeColor,
            borderLeftWidth: "4px"
        } : undefined,
        className: `cursor-pointer border-l-4 px-4 py-3 transition-colors ${isActive && !isSelected ? "border-l-amber-500 bg-amber-50" : isSelected ? "bg-slate-50" : "border-l-transparent hover:bg-slate-50"}`,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex items-baseline justify-between gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "flex min-w-0 items-baseline gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                "aria-hidden": true,
                                className: `text-sm ${isActive ? "text-amber-600" : "text-slate-300"}`,
                                children: isActive ? "★" : "●"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 357,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "font-mono text-xs font-semibold text-slate-700",
                                children: worker.id
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 363,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "truncate text-sm font-medium text-slate-900",
                                children: worker.name
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 366,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 356,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(StatusBadge, {
                        status: liveStatus
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 370,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 355,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(SkillChips, {
                skills: worker.skill_tags
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 373,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-xs tabular-nums text-slate-400",
                children: [
                    taskCount,
                    " task",
                    taskCount === 1 ? "" : "s"
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 375,
                columnNumber: 7
            }, this),
            liveStatus === "on_site" && remainingMins !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-xs text-amber-700",
                children: [
                    "🔨 ~",
                    remainingMins,
                    " min",
                    remainingMins === 1 ? "" : "s",
                    " ",
                    "remaining at site"
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 380,
                columnNumber: 9
            }, this),
            nextStop ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "mt-1 text-xs text-slate-600",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "text-slate-400",
                                children: "Next:"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 389,
                                columnNumber: 13
                            }, this),
                            " ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: nextStop.task_id
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 390,
                                columnNumber: 13
                            }, this),
                            " ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "tabular-nums",
                                children: nextStop.arrival_time_hm
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 391,
                                columnNumber: 13
                            }, this),
                            " · ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "tabular-nums",
                                children: [
                                    nextStop.distance_km_so_far.toFixed(1),
                                    " km"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 393,
                                columnNumber: 13
                            }, this),
                            nextStop.late && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "ml-1 rounded bg-rose-100 px-1 text-[10px] font-semibold text-rose-800",
                                children: "LATE"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 397,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 388,
                        columnNumber: 11
                    }, this),
                    lastStop && route && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "text-xs text-slate-400",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                children: "Route:"
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 404,
                                columnNumber: 15
                            }, this),
                            " ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "tabular-nums",
                                children: lastStop.arrival_time_hm
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 405,
                                columnNumber: 15
                            }, this),
                            " end",
                            " · ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                className: "tabular-nums",
                                children: [
                                    route.total_distance_km.toFixed(1),
                                    " km total"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 407,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 403,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "mt-1 text-xs italic text-slate-400",
                children: "— no route yet —"
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 414,
                columnNumber: 9
            }, this),
            tasks.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setExpanded((v)=>!v),
                        className: "mt-2 text-xs text-slate-500 hover:text-slate-700",
                        children: [
                            expanded ? "▼" : "▶",
                            " ",
                            tasks.length,
                            " task",
                            tasks.length === 1 ? "" : "s"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 419,
                        columnNumber: 11
                    }, this),
                    expanded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                        className: "mt-1 divide-y divide-slate-100 border-t border-slate-100 pt-1",
                        children: tasks.map((t)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(TaskRow, {
                                task: t
                            }, t.id, false, {
                                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                                lineNumber: 430,
                                columnNumber: 17
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 428,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
        lineNumber: 338,
        columnNumber: 5
    }, this);
}
function WorkerPanel({ workers, tasks, events, initialRoutes, activeWorkerId, selectedWorkerId, onWorkerSelect }) {
    const sortedWorkers = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>sortWorkersByIdNumeric(workers), [
        workers
    ]);
    const liveStates = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>deriveLiveState(events, initialRoutes), [
        events,
        initialRoutes
    ]);
    const tasksByWorker = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        const m = new Map();
        for (const t of tasks){
            if (!t.worker_id) continue;
            const arr = m.get(t.worker_id) ?? [];
            arr.push(t);
            m.set(t.worker_id, arr);
        }
        for (const arr of m.values()){
            arr.sort((a, b)=>a.scheduled_time.localeCompare(b.scheduled_time));
        }
        return m;
    }, [
        tasks
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
        className: "flex h-full min-h-0 flex-col border-r border-slate-200 bg-white",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "border-b border-slate-200 bg-white px-4 py-3",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("h2", {
                    className: "text-sm font-semibold uppercase tracking-wider text-slate-600",
                    children: [
                        "Workers",
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                            className: "ml-1 text-xs font-normal text-slate-400",
                            children: [
                                "(",
                                sortedWorkers.length,
                                ")"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                            lineNumber: 479,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                    lineNumber: 477,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 476,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("ul", {
                className: "min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto",
                children: sortedWorkers.map((w)=>{
                    const live = liveStates.get(w.id);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(WorkerCard, {
                        worker: w,
                        liveStatus: live?.status ?? w.status,
                        route: live?.route,
                        isActive: activeWorkerId === w.id,
                        isSelected: selectedWorkerId === w.id,
                        onSelect: onWorkerSelect,
                        tasks: tasksByWorker.get(w.id) ?? []
                    }, w.id, false, {
                        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                        lineNumber: 488,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
                lineNumber: 484,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx",
        lineNumber: 475,
        columnNumber: 5
    }, this);
}
}),
"[project]/route-planning-demo/dashboard/hooks/useWebSocket.ts [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_MAX_EVENTS",
    ()=>DEFAULT_MAX_EVENTS,
    "DEFAULT_RECONNECT_MS",
    ()=>DEFAULT_RECONNECT_MS,
    "EventStreamController",
    ()=>EventStreamController,
    "MAX_RECONNECT_ATTEMPTS",
    ()=>MAX_RECONNECT_ATTEMPTS,
    "MAX_RECONNECT_MS",
    ()=>MAX_RECONNECT_MS,
    "useWebSocket",
    ()=>useWebSocket
]);
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
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
;
const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 5;
class EventStreamController {
    url;
    maxEvents;
    reconnectMs;
    autoReconnect;
    onChange;
    events;
    latestEvent;
    status;
    ws;
    reconnectAttempts;
    reconnectTimer;
    shutdown;
    filterSet;
    wsFactory;
    setTimeoutFn;
    clearTimeoutFn;
    constructor(url, maxEvents, reconnectMs, autoReconnect, eventTypes, onChange, deps = {}){
        this.url = url;
        this.maxEvents = maxEvents;
        this.reconnectMs = reconnectMs;
        this.autoReconnect = autoReconnect;
        this.onChange = onChange;
        this.events = [];
        this.latestEvent = null;
        this.status = "connecting";
        this.ws = null;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.shutdown = false;
        this.filterSet = eventTypes ? new Set(eventTypes) : null;
        this.wsFactory = deps.wsFactory ?? ((u)=>new WebSocket(u));
        this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms)=>setTimeout(fn, ms));
        this.clearTimeoutFn = deps.clearTimeoutFn ?? ((h)=>clearTimeout(h));
    }
    connect() {
        if (this.shutdown) return;
        this.status = "connecting";
        this.onChange();
        let ws;
        try {
            ws = this.wsFactory(this.url);
        } catch  {
            this.handleClose();
            return;
        }
        this.ws = ws;
        ws.addEventListener("open", ()=>this.handleOpen());
        ws.addEventListener("message", (e)=>this.handleMessage(e?.data));
        ws.addEventListener("close", ()=>this.handleClose());
        ws.addEventListener("error", ()=>{
        // Rely on the subsequent close event to drive reconnect.
        });
    }
    close() {
        this.shutdown = true;
        if (this.reconnectTimer !== null) {
            this.clearTimeoutFn(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            } catch  {}
            this.ws = null;
        }
    }
    clear() {
        this.events = [];
        this.latestEvent = null;
        this.onChange();
    }
    setEventTypes(types) {
        this.filterSet = types ? new Set(types) : null;
    }
    // ---- internal event handlers ----
    handleOpen() {
        this.reconnectAttempts = 0;
        this.status = "open";
        this.onChange();
    }
    handleMessage(raw) {
        if (typeof raw !== "string") return;
        let data;
        try {
            data = JSON.parse(raw);
        } catch  {
            return; // drop malformed frames silently
        }
        if (this.filterSet && !this.filterSet.has(data.event_type)) return;
        const next = [
            ...this.events,
            data
        ];
        this.events = next.length > this.maxEvents ? next.slice(next.length - this.maxEvents) : next;
        this.latestEvent = data;
        this.onChange();
    }
    handleClose() {
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
        const delay = Math.min(this.reconnectMs * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_MS);
        this.reconnectAttempts += 1;
        this.reconnectTimer = this.setTimeoutFn(()=>{
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }
}
function useWebSocket(url, options = {}) {
    const { maxEvents = DEFAULT_MAX_EVENTS, reconnectMs = DEFAULT_RECONNECT_MS, autoReconnect = true, eventTypes } = options;
    const [events, setEvents] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])([]);
    const [latestEvent, setLatestEvent] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(null);
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])("connecting");
    const controllerRef = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        const controller = new EventStreamController(url, maxEvents, reconnectMs, autoReconnect, eventTypes, ()=>{
            setEvents([
                ...controller.events
            ]);
            setLatestEvent(controller.latestEvent);
            setStatus(controller.status);
        });
        controllerRef.current = controller;
        controller.connect();
        return ()=>{
            controller.close();
            if (controllerRef.current === controller) {
                controllerRef.current = null;
            }
        };
    // url/options are the stable deps; eventTypes updates go through the
    // effect below without tearing down the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        url,
        maxEvents,
        reconnectMs,
        autoReconnect
    ]);
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        controllerRef.current?.setEventTypes(eventTypes);
    // Identity compare on eventTypes — consumers should memoize the array
    // or the effect becomes a no-op-but-runs on every render (harmless).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        eventTypes
    ]);
    const clear = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useCallback"])(()=>{
        controllerRef.current?.clear();
        setEvents([]);
        setLatestEvent(null);
    }, []);
    return {
        events,
        latestEvent,
        status,
        clear
    };
}
}),
"[project]/route-planning-demo/dashboard/pages/index.tsx [ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react/jsx-dev-runtime [external] (react/jsx-dev-runtime, cjs)");
// dashboard/pages/index.tsx
//
// Final dashboard assembly. Owns:
//   - ONE useWebSocket call (shared events + status passed to every pane)
//   - ONE fetch of /workers and /tasks at mount (refetched on TASK_CREATED)
//   - Scenario trigger buttons + α slider + Reset button
//
// Map is dynamically imported with ssr:false because the Google Maps SDK
// touches `window` and would crash Next.js SSR otherwise.
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$next$2f$dynamic$2e$js__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/node_modules/next/dynamic.js [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$next$2f$head$2e$js__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/node_modules/next/head.js [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/react [external] (react, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$EventLog$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/components/EventLog.tsx [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$MetricsStrip$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/components/MetricsStrip.tsx [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$PipelineTracker$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/components/PipelineTracker.tsx [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$WFMOutput$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/components/WFMOutput.tsx [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$WorkerPanel$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/components/WorkerPanel.tsx [ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$hooks$2f$useWebSocket$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/route-planning-demo/dashboard/hooks/useWebSocket.ts [ssr] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
// ---- dynamic Map (ssr:false — SDK touches window) ----------------------
const Map = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$next$2f$dynamic$2e$js__$5b$ssr$5d$__$28$ecmascript$29$__["default"])(()=>__turbopack_context__.A("[project]/route-planning-demo/dashboard/components/Map.tsx [ssr] (ecmascript, next/dynamic entry, async loader)").then((m)=>m.default), {
    loadableGenerated: {
        modules: [
            "[project]/route-planning-demo/dashboard/components/Map.tsx [client] (ecmascript, next/dynamic entry)"
        ]
    },
    ssr: false,
    loading: ()=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
            className: "h-full w-full bg-slate-100"
        }, void 0, false, {
            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
            lineNumber: 29,
            columnNumber: 32
        }, ("TURBOPACK compile-time value", void 0))
});
// ---- env-driven endpoints ---------------------------------------------
const API_URL = ("TURBOPACK compile-time value", "http://localhost:8000") ?? "http://localhost:8000";
const WS_URL = ("TURBOPACK compile-time value", "ws://localhost:8000/ws/events") ?? "ws://localhost:8000/ws/events";
const GOOGLE_MAPS_KEY = ("TURBOPACK compile-time value", "AIzaSyCgacKDJcHmPWiUuGCSz-chW1tb5Ey8Uw8") ?? "";
const SCENARIOS = [
    {
        n: 1,
        label: "S1 — Fiber Cut · Critical Priority",
        description: "An emergency fiber cut at Sector 29. System scans all 10 technicians, scores on ETA, schedule fit and distance, dispatches the nearest fiber_cut skilled technician instantly. No consent needed.",
        tone: "red"
    },
    {
        n: 2,
        label: "S2 — Fiber Cut · Consent Required",
        description: "Fiber cut at DLF Phase 3. Best available technician has a scheduled job that must move. System asks the customer for approval via Telegram. Reply on the demo phone by typing anything — YES, NO, haan, nahi, chalega.",
        tone: "red"
    },
    {
        n: 3,
        label: "S3 — New Installation · Commercial Hub",
        description: "New installation at Cyber City during business hours. LLM supervisor recognises the commercial hub context and adjusts urgency. Watch the reasoning in the event log — different from S1 despite same priority.",
        tone: "amber"
    },
    {
        n: 4,
        label: "S4 — New Installation · Concurrent Request",
        description: "Second installation while S3 is active. System finds a technician with schedule slack without disrupting the first assignment. Shows fleet balancing.",
        tone: "amber"
    },
    {
        n: 5,
        label: "S5 — Fault Repair · Escalation",
        description: "Fault repair arrives but all nearby fault-skilled technicians are fully loaded. System cannot resolve automatically and escalates to dispatcher with options A, B, C. Run make seed-s5 before triggering.",
        tone: "rose"
    },
    {
        n: 6,
        label: "S6 — Fault Repair · Distance vs Time",
        description: "Two technicians virtually equidistant. Alpha slider controls whether system optimises for speed or distance. Drag the slider and watch the selection flip in the scoring table.",
        tone: "indigo"
    }
];
const TONE_CLASS = {
    red: "border-red-500 bg-red-50 hover:bg-red-100 text-red-900",
    amber: "border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-900",
    rose: "border-rose-600 bg-rose-600 hover:bg-rose-700 text-white font-bold",
    indigo: "border-indigo-500 bg-indigo-50 hover:bg-indigo-100 text-indigo-900"
};
const TONE_SUB_CLASS = {
    red: "text-red-700",
    amber: "text-amber-700",
    rose: "text-rose-100",
    indigo: "text-indigo-700"
};
function Home() {
    const [workers, setWorkers] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])([]);
    const [tasks, setTasks] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])([]);
    const [routes, setRoutes] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])([]);
    const [alpha, setAlpha] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(0.7);
    const [busyScenario, setBusyScenario] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(null);
    const [selectedWorkerId, setSelectedWorkerId] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(null);
    const [wfmOpen, setWfmOpen] = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useState"])(false);
    const { events, latestEvent, status } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$hooks$2f$useWebSocket$2e$ts__$5b$ssr$5d$__$28$ecmascript$29$__["useWebSocket"])(WS_URL);
    // Initial fetch of workers + tasks + routes.
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
        refetchWorkers();
        refetchTasks();
        refetchRoutes();
    }, []);
    // Refetch on relevant events.
    (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useEffect"])(()=>{
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
    }, [
        latestEvent
    ]);
    async function refetchWorkers() {
        try {
            const r = await fetch(`${API_URL}/workers`);
            if (r.ok) setWorkers(await r.json());
        } catch (e) {
            console.error("failed to fetch workers:", e);
        }
    }
    async function refetchTasks() {
        try {
            const r = await fetch(`${API_URL}/tasks`);
            if (r.ok) setTasks(await r.json());
        } catch (e) {
            console.error("failed to fetch tasks:", e);
        }
    }
    async function refetchRoutes() {
        try {
            const r = await fetch(`${API_URL}/routes`);
            if (r.ok) setRoutes(await r.json());
        } catch (e) {
            console.error("failed to fetch routes:", e);
        }
    }
    // "Active worker" = the worker id from the latest non-startup event's payload.
    const activeWorkerId = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        if (!latestEvent) return undefined;
        if (latestEvent.correlation_id.startsWith("startup-")) return undefined;
        const wid = latestEvent.payload?.worker_id;
        return typeof wid === "string" ? wid : undefined;
    }, [
        latestEvent
    ]);
    // The correlation_id driving the pipeline tracker — non-startup only.
    const activeCorrelationId = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react__$5b$external$5d$__$28$react$2c$__cjs$29$__["useMemo"])(()=>{
        if (!latestEvent) return null;
        if (latestEvent.correlation_id.startsWith("startup-")) return null;
        return latestEvent.correlation_id;
    }, [
        latestEvent
    ]);
    async function triggerScenario(n) {
        setBusyScenario(n);
        try {
            const url = new URL(`${API_URL}/scenario/${n}`);
            if (n === 6) url.searchParams.set("alpha", String(alpha));
            await fetch(url.toString(), {
                method: "POST"
            });
        } catch (e) {
            console.error(`scenario ${n} failed:`, e);
        } finally{
            setBusyScenario(null);
        }
    }
    async function resetDemo() {
        try {
            await fetch(`${API_URL}/reset`, {
                method: "POST"
            });
            await refetchWorkers();
            await refetchTasks();
            await refetchRoutes();
            setSelectedWorkerId(null);
            setWfmOpen(false);
        } catch (e) {
            console.error("reset failed:", e);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$node_modules$2f$next$2f$head$2e$js__$5b$ssr$5d$__$28$ecmascript$29$__["default"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("title", {
                        children: "Route Planning Agent Demo"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 217,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("meta", {
                        name: "viewport",
                        content: "width=device-width,initial-scale=1"
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                lineNumber: 216,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                className: "flex h-screen flex-col bg-slate-50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$MetricsStrip$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__["MetricsStrip"], {
                        events: events,
                        status: status,
                        initialRoutes: routes
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 223,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "flex min-h-0 flex-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "flex h-full w-80 min-h-0 flex-shrink-0 flex-col",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$WorkerPanel$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__["WorkerPanel"], {
                                    workers: workers,
                                    tasks: tasks,
                                    events: events,
                                    initialRoutes: routes,
                                    activeWorkerId: activeWorkerId,
                                    selectedWorkerId: selectedWorkerId,
                                    onWorkerSelect: setSelectedWorkerId
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                    lineNumber: 232,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                lineNumber: 231,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "relative min-w-0 flex-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(Map, {
                                        apiKey: GOOGLE_MAPS_KEY,
                                        workers: workers,
                                        tasks: tasks,
                                        events: events,
                                        activeWorkerId: activeWorkerId,
                                        initialRoutes: routes,
                                        selectedWorkerId: selectedWorkerId,
                                        onWorkerSelect: setSelectedWorkerId
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                        lineNumber: 243,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$PipelineTracker$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__["PipelineTracker"], {
                                        events: events,
                                        activeCorrelationId: activeCorrelationId,
                                        alpha: alpha
                                    }, void 0, false, {
                                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                        lineNumber: 256,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                lineNumber: 242,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                className: "w-96 flex-shrink-0",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$EventLog$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__["EventLog"], {
                                    events: events
                                }, void 0, false, {
                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                    lineNumber: 263,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                lineNumber: 262,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 230,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                        className: "border-t border-slate-200 bg-white px-4 py-4",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                            className: "flex items-start justify-between gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                    className: "flex-1",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                            className: "mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600",
                                            children: "Scenarios"
                                        }, void 0, false, {
                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                            lineNumber: 271,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                            className: "grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3",
                                            children: SCENARIOS.map((s)=>{
                                                const busy = busyScenario === s.n;
                                                const toneCls = TONE_CLASS[s.tone];
                                                const subCls = TONE_SUB_CLASS[s.tone];
                                                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                                            type: "button",
                                                            disabled: busy,
                                                            onClick: ()=>triggerScenario(s.n),
                                                            className: `${toneCls} w-full rounded border-2 px-3 py-2 text-left transition-colors disabled:opacity-50`,
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                                    className: "text-sm font-semibold",
                                                                    children: busy ? "Firing…" : s.label
                                                                }, void 0, false, {
                                                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                    lineNumber: 287,
                                                                    columnNumber: 25
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                                    className: `mt-0.5 text-xs ${subCls}`,
                                                                    children: s.description
                                                                }, void 0, false, {
                                                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                    lineNumber: 290,
                                                                    columnNumber: 25
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                            lineNumber: 281,
                                                            columnNumber: 23
                                                        }, this),
                                                        s.n === 6 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                            className: "mt-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-2",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                                    className: "flex items-center gap-2",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("label", {
                                                                            htmlFor: "alpha",
                                                                            className: "text-xs font-medium text-indigo-700",
                                                                            children: "α"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                            lineNumber: 297,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("input", {
                                                                            id: "alpha",
                                                                            type: "range",
                                                                            min: 0,
                                                                            max: 1,
                                                                            step: 0.1,
                                                                            value: alpha,
                                                                            onChange: (e)=>setAlpha(parseFloat(e.target.value)),
                                                                            className: "flex-1 accent-indigo-600"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                            lineNumber: 303,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                                            className: "w-8 text-right font-mono text-xs tabular-nums text-indigo-700",
                                                                            children: alpha.toFixed(1)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                            lineNumber: 315,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                    lineNumber: 296,
                                                                    columnNumber: 27
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                                                    className: "mt-1 flex justify-between text-[10px] text-indigo-400",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                                            children: "0 = distance"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                            lineNumber: 320,
                                                                            columnNumber: 29
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("span", {
                                                                            children: "1 = time"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                            lineNumber: 321,
                                                                            columnNumber: 29
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                                    lineNumber: 319,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                            lineNumber: 295,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, s.n, true, {
                                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                                    lineNumber: 280,
                                                    columnNumber: 21
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                            lineNumber: 274,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                    lineNumber: 270,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("div", {
                                    className: "ml-auto flex items-center gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: ()=>setWfmOpen((v)=>!v),
                                            className: "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700",
                                            children: wfmOpen ? "Hide WFM Output" : "View WFM Output"
                                        }, void 0, false, {
                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                            lineNumber: 332,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])("button", {
                                            type: "button",
                                            onClick: resetDemo,
                                            className: "rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300",
                                            children: "Reset"
                                        }, void 0, false, {
                                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                            lineNumber: 339,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                                    lineNumber: 331,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                            lineNumber: 269,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 268,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$externals$5d2f$react$2f$jsx$2d$dev$2d$runtime__$5b$external$5d$__$28$react$2f$jsx$2d$dev$2d$runtime$2c$__cjs$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$route$2d$planning$2d$demo$2f$dashboard$2f$components$2f$WFMOutput$2e$tsx__$5b$ssr$5d$__$28$ecmascript$29$__["WFMOutput"], {
                        events: events,
                        activeCorrelationId: activeCorrelationId,
                        apiUrl: API_URL,
                        open: wfmOpen,
                        onClose: ()=>setWfmOpen(false)
                    }, void 0, false, {
                        fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                        lineNumber: 351,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/route-planning-demo/dashboard/pages/index.tsx",
                lineNumber: 221,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__08krgt4._.js.map