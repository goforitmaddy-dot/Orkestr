-- Migration 002: Workflow Monitoring, Failure Detection, Deduplication & Incidents

-- 1. Webhook Events (Raw incoming delivery payloads with deduplication tracking)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'github',
    delivery_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    action TEXT,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSED' CHECK (status IN ('PENDING', 'PROCESSED', 'DUPLICATE', 'IGNORED', 'FAILED')),
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Workflow Runs (Execution instances of CI workflows)
CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'github',
    provider_run_id TEXT NOT NULL,
    run_attempt INTEGER NOT NULL DEFAULT 1,
    repository_name TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    branch TEXT,
    commit_sha TEXT,
    html_url TEXT,
    commit_url TEXT,
    pr_number INTEGER,
    pr_title TEXT,
    pr_url TEXT,
    status TEXT NOT NULL,
    conclusion TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workflow_run_provider_attempt UNIQUE (provider, provider_run_id, run_attempt)
);

-- 3. Incidents (Grouped collection of failure occurrences across runs/jobs)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_key TEXT NOT NULL,
    title TEXT NOT NULL,
    repository_name TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    branch TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RECOVERED', 'RESOLVED', 'CLOSED')),
    first_failure_at TIMESTAMPTZ NOT NULL,
    last_failure_at TIMESTAMPTZ NOT NULL,
    recovered_at TIMESTAMPTZ,
    latest_workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
    recovery_workflow_run_id UUID REFERENCES workflow_runs(id) ON DELETE SET NULL,
    failure_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Failure Occurrences (Specific failure instances recorded within a run)
CREATE TABLE IF NOT EXISTS failure_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    webhook_event_id UUID REFERENCES webhook_events(id) ON DELETE SET NULL,
    failed_job TEXT,
    failed_step TEXT,
    failure_timestamp TIMESTAMPTZ NOT NULL,
    error_message TEXT,
    log_excerpt TEXT,
    run_url TEXT,
    commit_url TEXT,
    raw_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_delivery_id ON webhook_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_lookup ON workflow_runs(provider, provider_run_id, run_attempt);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_repo_wf ON workflow_runs(repository_name, workflow_name);
CREATE INDEX IF NOT EXISTS idx_incidents_key_status ON incidents(incident_key, status);
CREATE INDEX IF NOT EXISTS idx_incidents_repo_status ON incidents(repository_name, status);
CREATE INDEX IF NOT EXISTS idx_failure_occurrences_incident ON failure_occurrences(incident_id);
CREATE INDEX IF NOT EXISTS idx_failure_occurrences_run ON failure_occurrences(workflow_run_id);
