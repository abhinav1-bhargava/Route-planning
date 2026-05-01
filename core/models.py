"""Pydantic models for all entities in the route planning system."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


WorkerStatus = Literal["idle", "en_route", "on_site"]
TaskType = Literal["planned", "adhoc"]
TaskCategory = Literal["new_installation", "fault_repair", "network_rehab", "fiber_cut"]
TaskStatus = Literal["pending", "assigned", "in_progress", "completed", "deferred"]
ConsentResponse = Literal["yes", "no", "timeout"]

HHMM_PATTERN = r"^(?:[01]\d|2[0-3]):[0-5]\d$"


class EventType:
    TASK_CREATED = "TASK_CREATED"
    REALLOCATION_TRIGGERED = "REALLOCATION_TRIGGERED"
    FLEET_SCAN = "FLEET_SCAN"
    WORKER_SCORED = "WORKER_SCORED"
    SCORING_COMPLETE = "SCORING_COMPLETE"
    SMART_ASSIGNMENT = "SMART_ASSIGNMENT"
    ASSIGNMENT_PROPOSED = "ASSIGNMENT_PROPOSED"
    CONSENT_REQUIRED = "CONSENT_REQUIRED"
    CONSENT_SENT = "CONSENT_SENT"
    CONSENT_RESOLVED = "CONSENT_RESOLVED"
    ROUTE_REPLAN = "ROUTE_REPLAN"
    ROUTE_UPDATED = "ROUTE_UPDATED"
    LOCATION_UPDATE = "LOCATION_UPDATE"
    TASK_COMPLETED = "TASK_COMPLETED"
    ESCALATION_REQUIRED = "ESCALATION_REQUIRED"
    ROUTE_CONFLICT = "ROUTE_CONFLICT"
    DEBRIEF_READY = "DEBRIEF_READY"
    ANOMALY_DETECTED = "ANOMALY_DETECTED"
    # Dispatcher guardrail outcomes — fired by the supervisor *after* the
    # reallocation agent emits ASSIGNMENT_PROPOSED. SUPERVISOR_OVERRIDE
    # rejects the proposal (reallocation re-runs excluding that worker);
    # TRAVEL_WARNING is non-fatal — the assignment proceeds but downstream
    # listeners (event log, pipeline tracker) annotate the route.
    SUPERVISOR_OVERRIDE = "SUPERVISOR_OVERRIDE"
    TRAVEL_WARNING = "TRAVEL_WARNING"
    # Continuous monitoring alerts emitted by the supervisor after the
    # initial dispatch. Driven by TASK_COMPLETED / LOCATION_UPDATE /
    # ROUTE_UPDATED — payload.type ∈ {"late_arrival","shift_breach",
    # "consent_stall"}.
    POST_ALLOCATION_ALERT = "POST_ALLOCATION_ALERT"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid4())


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class Worker(_Base):
    id: str
    name: str
    current_lat: float = Field(ge=-90.0, le=90.0)
    current_lng: float = Field(ge=-180.0, le=180.0)
    status: WorkerStatus = "idle"
    skill_tags: list[str] = Field(default_factory=list)
    shift_end_time: str = Field(pattern=HHMM_PATTERN)
    assigned_task_ids: list[str] = Field(default_factory=list)


class Task(_Base):
    id: str
    type: TaskType
    task_type: TaskCategory
    priority: int = Field(ge=1, le=5)
    location_lat: float = Field(ge=-90.0, le=90.0)
    location_lng: float = Field(ge=-180.0, le=180.0)
    address: str
    scheduled_time: str = Field(pattern=HHMM_PATTERN)
    duration_mins: int = Field(gt=0)
    consent_required: bool = False
    status: TaskStatus = "pending"
    required_skill: str
    worker_id: str | None = None


class Route(_Base):
    id: str
    worker_id: str
    ordered_task_ids: list[str] = Field(default_factory=list)
    total_distance_km: float = Field(ge=0.0, default=0.0)
    total_time_mins: int = Field(ge=0, default=0)
    version: int = Field(ge=1, default=1)
    created_at: datetime = Field(default_factory=_utcnow)


class ConsentRequest(_Base):
    id: str
    task_id: str
    customer_phone: str
    message_text: str
    sent_at: datetime = Field(default_factory=_utcnow)
    response: ConsentResponse | None = None
    resolved_at: datetime | None = None
    timeout_mins: int = Field(gt=0, default=10)


class Event(_Base):
    id: str = Field(default_factory=_uuid)
    event_type: str
    payload: dict = Field(default_factory=dict)
    agent: str
    correlation_id: str
    human_label: str
    timestamp: datetime = Field(default_factory=_utcnow)
