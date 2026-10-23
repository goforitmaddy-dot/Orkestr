"""
Pydantic Schemas for Normalized Monitoring Records, Deduplication, and Incidents (Stage 3 & 4)
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class AssociatedPullRequest(BaseModel):
    """Details of an associated pull request, explicitly optional."""
    number: int
    title: Optional[str] = None
    url: Optional[str] = None


class NormalizedMonitoringRecord(BaseModel):
    """
    Stage 3: Normalized failure & monitoring record.
    Captures failure context with explicit nulls for unavailable info.
    """
    provider: str = Field(default="github", description="CI Provider name")
    delivery_id: str = Field(description="Unique delivery ID for deduplication")
    event_type: str = Field(description="Webhook event type, e.g. workflow_run, workflow_job")
    action: Optional[str] = None

    # Identity
    repository_name: str = Field(description="Full repository identity (owner/repo)")
    workflow_name: str = Field(description="Name of the CI workflow")
    workflow_run_id: str = Field(description="Stable provider run ID")
    run_attempt: int = Field(default=1, description="Run attempt number")
    branch: Optional[str] = Field(default=None, description="Head branch name")
    commit_sha: Optional[str] = Field(default=None, description="Head commit SHA")

    # Associated PR (explicitly None if unavailable)
    associated_pull_request: Optional[AssociatedPullRequest] = None

    # Failed job and step (explicitly None if unavailable)
    failed_job: Optional[str] = None
    failed_step: Optional[str] = None

    # Timing
    failure_timestamp: str = Field(description="ISO-8601 failure timestamp")

    # Error & Bounded Log Excerpt (Never entire logs)
    error_message: Optional[str] = None
    log_excerpt: Optional[str] = None

    # Links
    run_url: Optional[str] = None
    commit_url: Optional[str] = None

    # State
    status: str
    conclusion: Optional[str] = None
    is_failure: bool
    is_recovery: bool

    # Raw context
    raw_details: Dict[str, Any] = Field(default_factory=dict)


class FailureOccurrenceModel(BaseModel):
    """A distinct failure occurrence within a workflow run."""
    id: str
    incident_id: str
    workflow_run_id: str
    webhook_event_id: Optional[str] = None
    failed_job: Optional[str] = None
    failed_step: Optional[str] = None
    failure_timestamp: str
    error_message: Optional[str] = None
    log_excerpt: Optional[str] = None
    run_url: Optional[str] = None
    commit_url: Optional[str] = None
    created_at: str


class WorkflowRunModel(BaseModel):
    """An execution instance of a workflow in the CI provider."""
    id: str
    provider: str = "github"
    provider_run_id: str
    run_attempt: int = 1
    repository_name: str
    workflow_name: str
    branch: Optional[str] = None
    commit_sha: Optional[str] = None
    html_url: Optional[str] = None
    commit_url: Optional[str] = None
    status: str
    conclusion: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class IncidentModel(BaseModel):
    """
    Stage 4: Incident grouping related failure occurrences across workflow runs.
    Preserves recovery history when reruns succeed.
    """
    id: str
    incident_key: str
    title: str
    repository_name: str
    workflow_name: str
    branch: Optional[str] = None
    status: str = Field(default="OPEN", description="OPEN, INVESTIGATING, RECOVERED, RESOLVED, CLOSED")
    first_failure_at: str
    last_failure_at: str
    recovered_at: Optional[str] = None
    latest_workflow_run_id: Optional[str] = None
    recovery_workflow_run_id: Optional[str] = None
    failure_count: int = 1
    occurrences: List[FailureOccurrenceModel] = Field(default_factory=list)
