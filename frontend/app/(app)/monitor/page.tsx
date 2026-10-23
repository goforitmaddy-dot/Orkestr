'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Incident,
  ApplicationError,
  Project,
  MonitoringStatus,
  MonitoringEventType,
  PollCycleResult,
  ServerHealth,
  ServerErrorReport,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Play,
  Pause,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  FolderGit2,
  Check,
  Bug,
  Radio,
  Link2Off,
  ServerCrash,
  Users,
  Layers,
} from 'lucide-react';


type Filter = 'ACTIVE' | 'RECOVERED' | 'ALL';

export default function LiveMonitorPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [runtimeErrors, setRuntimeErrors] = useState<ApplicationError[]>([]);
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live stream state
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [filter, setFilter] = useState<Filter>('ACTIVE');

  // Expanded log view tracking
  const [expandedIncidentIds, setExpandedIncidentIds] = useState<Record<string, boolean>>({});
  const [expandedErrorIds, setExpandedErrorIds] = useState<Record<string, boolean>>({});

  // Resolution loading states
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const [isPolling, setIsPolling] = useState(false);
  const [pollMessage, setPollMessage] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollResult, setPollResult] = useState<PollCycleResult | null>(null);
  const [hasUserToken, setHasUserToken] = useState(false);

  // Live Server Monitoring State (global dashboard)
  const [serverHealthByProject, setServerHealthByProject] = useState<
    Record<string, ServerHealth>
  >({});
  const [serverErrors, setServerErrors] = useState<ServerErrorReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchAll = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);

      const [incidentsData, errorsData, statusData] = await Promise.all([
        api.getIncidents(),
        api.getApplicationErrors().catch(() => []),
        api.getMonitoringStatus().catch(() => null),
      ]);

      setIncidents(incidentsData);
      setRuntimeErrors(errorsData);
      if (statusData) setMonitoringStatus(statusData);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch live monitoring records');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  /**
   * Fetch all projects and their live server health/errors for the global dashboard.
   */
  const fetchServerMonitoring = useCallback(async () => {
    try {
      const data = await api.getProjects().catch(() => []);
      setProjects(data);

      const healthPromises = data
        .filter((p) => p.server_url)
        .map(async (p) => {
          try {
            const health = await api.getServerHealth(p.id);
            return { id: p.id, health };
          } catch {
            return { id: p.id, health: null };
          }
        });
      const healthResults = await Promise.all(healthPromises);
      const byProject: Record<string, ServerHealth> = {};
      healthResults.forEach((r) => {
        if (r.health) byProject[r.id] = r.health;
      });
      setServerHealthByProject(byProject);

      const allErrors: ServerErrorReport[] = [];
      await Promise.all(
        data.map(async (p) => {
          try {
            const errors = await api.getServerErrors(p.id);
            allErrors.push(...errors);
          } catch {
            // Graceful ignore
          }
        })
      );
      setServerErrors(allErrors);
    } catch {
      // Graceful ignore
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAll();
    fetchServerMonitoring();
  }, [fetchAll, fetchServerMonitoring]);

  /**
   * The user's own GitHub connection decides whether CI polling can work for
   * their projects.
   */
  useEffect(() => {
    api
      .getGitHubConnections()
      .then((connections) => setHasUserToken(connections.some((c) => c.status === 'valid')))
      .catch(() => setHasUserToken(false));
  }, []);

  /**
   * Live event stream.
   *
   * The backend pushes an event whenever it persists a new incident or error.
   * We re-fetch on each event so the UI always reflects committed state.
   */
  useEffect(() => {
    if (!isLivePolling) return;

    const dispose = api.subscribeToMonitoringEvents(
      (type: MonitoringEventType) => {
        if (type === 'monitoring.status') {
          api.getMonitoringStatus().then(setMonitoringStatus).catch(() => undefined);
          api
            .getGitHubConnections()
            .then((connections) =>
              setHasUserToken(connections.some((c) => c.status === 'valid'))
            )
            .catch(() => setHasUserToken(false));
          return;
        }
        fetchAll(true);
        fetchServerMonitoring();
      },
      (connected: boolean) => setIsStreamConnected(connected)
    );

    return dispose;
  }, [isLivePolling, fetchAll, fetchServerMonitoring]);

  /**
   * Polling fallback.
   *
   * Used when the event stream is unavailable so the monitor still refreshes.
   */
  useEffect(() => {
    if (!isLivePolling || isStreamConnected) return;
    const interval = setInterval(() => {
      fetchAll(true);
      fetchServerMonitoring();
    }, 10000);
    return () => clearInterval(interval);
  }, [isLivePolling, isStreamConnected, fetchAll, fetchServerMonitoring]);

  const toggleExpand = (id: string) => {
    setExpandedIncidentIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleErrorExpand = (id: string) => {
    setExpandedErrorIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleResolveIncident = async (incidentId: string) => {
    try {
      setResolvingIds((prev) => ({ ...prev, [incidentId]: true }));
      await api.resolveIncident(incidentId);
      await fetchAll(true);
    } catch (err: any) {
      alert(`Failed to resolve incident: ${err.message}`);
    } finally {
      setResolvingIds((prev) => ({ ...prev, [incidentId]: false }));
    }
  };

  const handleResolveRuntimeError = async (errorId: string) => {
    try {
      setResolvingIds((prev) => ({ ...prev, [errorId]: true }));
      await api.resolveApplicationError(errorId);
      await fetchAll(true);
    } catch (err: any) {
      alert(`Failed to resolve error: ${err.message}`);
    } finally {
      setResolvingIds((prev) => ({ ...prev, [errorId]: false }));
    }
  };

  const handlePollNow = async () => {
    try {
      setIsPolling(true);
      setPollMessage(null);
      setPollFailed(false);
      const response = await api.triggerMonitoringPoll();
      // A cycle can be accepted by the API but still fail internally
      // (bad token, missing permissions, GitHub error). Report that honestly.
      setPollFailed(!response.success);
      setPollResult(response.data);
      setPollMessage(response.message);
      await fetchAll(true);
    } catch (err: any) {
      setPollFailed(true);
      setPollResult(null);
      setPollMessage(err.message || 'Failed to trigger a monitoring cycle');
    } finally {
      setIsPolling(false);
    }
  };

  const activeIncidents = incidents.filter(
    (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING'
  );
  const recoveredIncidents = incidents.filter(
    (i) => i.status === 'RECOVERED' || i.status === 'RESOLVED'
  );
  const activeRuntimeErrors = runtimeErrors.filter((e) => e.status === 'OPEN');
  const resolvedRuntimeErrors = runtimeErrors.filter((e) => e.status === 'RESOLVED');

  const displayedIncidents =
    filter === 'ACTIVE'
      ? activeIncidents
      : filter === 'RECOVERED'
      ? recoveredIncidents
      : incidents;

  const displayedRuntimeErrors =
    filter === 'ACTIVE'
      ? activeRuntimeErrors
      : filter === 'RECOVERED'
      ? resolvedRuntimeErrors
      : runtimeErrors;

  const totalActive = activeIncidents.length + activeRuntimeErrors.length;
  const totalRecords = incidents.length + runtimeErrors.length;

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const hasTargets = (monitoringStatus?.monitoredProjectCount ?? 0) > 0;
  // A personal token is preferred; the server wide token is only a fallback.
  const tokenConfigured =
    hasUserToken || (monitoringStatus?.serverTokenConfigured ?? false);

  return (
    <div className="space-y-6">
      {/* Header with Live Status & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Live Project Error Monitor
            </h1>
            {isStreamConnected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE STREAM
              </span>
            ) : isLivePolling ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <RefreshCw className="w-2.5 h-2.5" />
                POLLING (10s)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <Pause className="w-2.5 h-2.5" />
                PAUSED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Streams genuine CI failures and application runtime errors from your linked
            repositories. Nothing here is simulated.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLivePolling(!isLivePolling)}
            title={isLivePolling ? 'Pause live updates' : 'Resume live updates'}
          >
            {isLivePolling ? (
              <>
                <Pause className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Resume Live
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePollNow}
            isLoading={isPolling}
            disabled={!tokenConfigured}
            title={
              tokenConfigured
                ? 'Run a monitoring cycle against the GitHub API now'
                : 'Connect your GitHub token in Settings to enable CI polling'
            }
          >
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            Poll Now
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAll()}
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-rose-200">Failed to load monitoring data</p>
            <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                fetchAll();
              }}
              className="mt-3"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Connection / configuration banner */}
      {!tokenConfigured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <Link2Off className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-200">Your GitHub token is not connected</p>
            <p className="text-xs text-amber-300 mt-0.5">
              Add a personal access token in Settings to detect CI failures for your projects.
              Runtime errors can still be reported to{' '}
              <code className="font-mono">POST /api/errors</code> right now.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-amber-200 hover:text-amber-100 transition-colors"
            >
              Connect GitHub
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {tokenConfigured && !hasTargets && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4 flex items-start gap-3">
          <FolderGit2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-indigo-200">No repositories are being monitored</p>
            <p className="text-xs text-indigo-300 mt-0.5">
              Link a repository to a project and enable monitoring to start detecting real CI
              failures.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
            >
              Configure monitored projects
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {(pollMessage || pollResult) && (
        <div
          className={`rounded-lg border p-4 text-xs ${
            pollFailed
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              : 'border-slate-800 bg-slate-900/50 text-slate-300'
          }`}
        >
          <div className="flex items-start gap-2">
            {pollFailed ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-2 min-w-0 flex-1">
              <p className="font-medium break-words">{pollMessage}</p>

              {pollResult && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                    <div className="rounded bg-slate-950/50 border border-slate-800/80 px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Last poll</p>
                      <p className="font-mono text-slate-200">
                        {formatDate(pollResult.ranAt)}
                      </p>
                    </div>
                    <div className="rounded bg-slate-950/50 border border-slate-800/80 px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        Repositories
                      </p>
                      <p className="font-mono text-slate-200">
                        {pollResult.repositoriesChecked.length}
                        {pollResult.repositoriesChecked.length > 0 && (
                          <span className="text-slate-500">
                            {' '}
                            ({pollResult.repositoriesChecked.join(', ')})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="rounded bg-slate-950/50 border border-slate-800/80 px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        Workflow runs inspected
                      </p>
                      <p className="font-mono text-slate-200">
                        {pollResult.workflowRunsInspected}
                      </p>
                    </div>
                    <div className="rounded bg-slate-950/50 border border-slate-800/80 px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        Failed runs found
                      </p>
                      <p
                        className={`font-mono ${
                          pollResult.failedRunsFound > 0 ? 'text-rose-300' : 'text-slate-200'
                        }`}
                      >
                        {pollResult.failedRunsFound}
                        {pollResult.failuresDetected !== pollResult.failedRunsFound && (
                          <span className="text-slate-500">
                            {' '}
                            ({pollResult.failuresDetected} recorded)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {pollResult.githubApiErrors.length > 0 && (
                    <div className="rounded bg-rose-500/10 border border-rose-500/20 px-2.5 py-2 space-y-1">
                      <p className="font-semibold text-rose-300">GitHub API error</p>
                      {pollResult.githubApiErrors.map((issue, index) => (
                        <p key={`${issue.repository}-${index}`} className="font-mono break-words">
                          {issue.repository}
                          {issue.status ? ` (HTTP ${issue.status})` : ''}: {issue.message}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Server Health */}
      {projects.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Live Server Health</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchServerMonitoring}
              className="text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              if (!project.server_url) return null;
              const health = serverHealthByProject[project.id];
              const isOnline = health?.status === 'online';
              return (
                <Card
                  key={project.id}
                  className={`border-slate-800 transition-all duration-200 ${
                    !health
                      ? 'bg-slate-900/40'
                      : health.status === 'offline'
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : health.status === 'degraded'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-slate-900/40'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-xs font-medium text-slate-200 truncate max-w-[120px]">
                          {project.name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">
                          {project.server_url}
                        </p>
                      </div>
                      <Badge
                        variant={
                          !health
                            ? 'neutral'
                            : health.status === 'online'
                            ? 'success'
                            : health.status === 'degraded'
                            ? 'warning'
                            : 'danger'
                        }
                        className="text-[10px] font-mono shrink-0"
                      >
                        {!health ? 'UNKNOWN' : health.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">Response Time</span>
                        <div className="mt-0.5 font-mono text-slate-200">
                          {health?.responseTimeMs !== null ? `${health.responseTimeMs} ms` : '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Uptime</span>
                        <div className="mt-0.5 font-mono text-slate-200">
                          {health?.uptimePercent !== null ? `${health.uptimePercent.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                    {health?.lastError && (
                      <div className="mt-2 rounded bg-rose-500/10 border border-rose-500/20 p-2 text-xs">
                        <p className="text-rose-300 font-mono">{health.lastError}</p>
                      </div>
                    )}
                    {!health && (
                      <div className="mt-2 text-xs text-slate-500">
                        Health check not yet run
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Server Errors */}
      {serverErrors.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <ServerCrash className="w-4 h-4 text-rose-400" />
              <CardTitle className="text-base text-slate-200">Server Errors &amp; Crashes</CardTitle>
            </div>
            <div className="text-xs text-slate-400">
              {serverErrors.filter((e) => !e.resolved).length} unresolved
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {serverErrors.map((err) => {
              const project = projects.find((p) => p.id === err.projectId);
              return (
                <div
                  key={err.id}
                  className={`p-3 rounded-lg border ${
                    err.resolved
                      ? 'bg-slate-900/40 border-slate-800/80'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      {err.severity}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {err.environment}
                    </span>
                    {err.resolved && (
                      <Badge variant="success" className="text-[10px]">
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {project?.name || err.projectId}
                    </span>
                    <div className="text-xs text-slate-400 font-mono truncate">
                      {new Date(err.occurredAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-slate-200 font-mono break-words mb-1">
                    {err.message}
                  </div>
                  {err.stackTrace && (
                    <div className="mt-2 p-2 rounded bg-black/60 border border-slate-800 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-32">
                      {err.stackTrace}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={`border-slate-800 ${
            totalActive > 0 ? 'bg-rose-950/20 border-rose-500/30' : 'bg-slate-900/40'
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Active Errors</p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  totalActive > 0 ? 'text-rose-400' : 'text-slate-100'
                }`}
              >
                {totalActive}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activeIncidents.length} CI &middot; {activeRuntimeErrors.length} runtime
              </p>
            </div>
            <div
              className={`p-2.5 rounded-lg ${
                totalActive > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Recovered / Resolved</p>
              <p className="text-2xl font-bold mt-1 text-emerald-400">
                {recoveredIncidents.length + resolvedRuntimeErrors.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {recoveredIncidents.length} CI &middot; {resolvedRuntimeErrors.length} runtime
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Monitored Targets</p>
              <p className="text-2xl font-bold mt-1 text-slate-100">
                {monitoringStatus?.monitoredProjectCount ?? 0}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                of {monitoringStatus?.linkedProjectCount ?? 0} linked projects
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800 text-slate-400">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400">Last Update</p>
              <p className="text-sm font-mono text-slate-300 mt-2">
                {formatDate(lastRefreshed.toISOString())}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isStreamConnected ? 'pushed via event stream' : 'via periodic poll'}
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-800 text-slate-400">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setFilter('ACTIVE')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'ACTIVE'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Active Problems ({totalActive})
        </button>

        <button
          onClick={() => setFilter('RECOVERED')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'RECOVERED'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Recovered ({recoveredIncidents.length + resolvedRuntimeErrors.length})
        </button>

        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'ALL'
              ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All Events ({totalRecords})
        </button>
      </div>

      {/* Main Content Area */}
      {loading && incidents.length === 0 && runtimeErrors.length === 0 ? (
        <Card className="border-slate-800 p-8">
          <LoadingSpinner label="Connecting to monitoring stream..." />
        </Card>
      ) : displayedIncidents.length === 0 && displayedRuntimeErrors.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/30 text-center p-12">
          {filter === 'ACTIVE' ? (
            <div className="space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                No Active Errors Detected
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {hasTargets
                  ? 'All monitored repositories and services are reporting clean. New failures appear here the moment they are detected.'
                  : 'Link a repository to a project and enable monitoring, or report runtime errors to POST /api/errors, to start seeing live data here.'}
              </p>
              {!hasTargets && (
                <div className="pt-2">
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
                  >
                    <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />
                    Link a repository to a project
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No records found matching this filter.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {/* CI workflow incidents */}
          {displayedIncidents.map((incident) => {
            const isActive = incident.status === 'OPEN' || incident.status === 'INVESTIGATING';
            const isExpanded = !!expandedIncidentIds[incident.id];
            const isResolving = !!resolvingIds[incident.id];

            return (
              <Card
                key={incident.id}
                className={`transition-all duration-200 ${
                  isActive
                    ? 'border-rose-500/40 bg-gradient-to-r from-rose-950/20 via-slate-900/60 to-slate-900/60 shadow-lg shadow-rose-950/20'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isActive ? (
                          <Badge variant="danger" className="text-xs font-mono font-bold animate-pulse">
                            ACTIVE FAILURE
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-xs font-mono">
                            {incident.status}
                          </Badge>
                        )}

                        <Badge variant="neutral" className="text-[10px] font-mono">
                          CI
                        </Badge>

                        <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                          <FolderGit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-semibold text-slate-200">
                            {incident.repository_name}
                          </span>
                        </span>

                        <span className="text-xs text-slate-500 font-mono">/</span>

                        <span className="text-xs text-slate-300 font-medium">
                          {incident.workflow_name}
                        </span>

                        {incident.branch && (
                          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            <GitBranch className="w-3 h-3 text-slate-400" />
                            {incident.branch}
                          </span>
                        )}
                      </div>

                      <CardTitle className="text-base text-slate-100 font-semibold pt-1">
                        {incident.title}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={isResolving}
                          onClick={() => handleResolveIncident(incident.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40"
                          title="Mark this incident as resolved"
                        >
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          Mark Resolved
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Recovered at {formatDate(incident.recovered_at || incident.updated_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400">
                    <div>
                      <span className="text-slate-500">First Detected: </span>
                      <span className="text-slate-300">
                        {formatDate(incident.first_failure_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Last Occurrence: </span>
                      <span className="text-slate-300">
                        {formatDate(incident.last_failure_at)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Failure Count: </span>
                      <span className="font-mono font-semibold text-rose-300">
                        {incident.failure_count} attempt(s)
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => toggleExpand(incident.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      {isExpanded ? 'Hide Error & Telemetry Details' : 'View Error Telemetry & Log Excerpt'}
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && <IncidentDetailAccordion incidentId={incident.id} />}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Application runtime errors */}
          {displayedRuntimeErrors.map((runtimeError) => {
            const isActive = runtimeError.status === 'OPEN';
            const isExpanded = !!expandedErrorIds[runtimeError.id];
            const isResolving = !!resolvingIds[runtimeError.id];

            return (
              <Card
                key={runtimeError.id}
                className={`transition-all duration-200 ${
                  isActive
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-950/20 via-slate-900/60 to-slate-900/60'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isActive ? (
                          <Badge variant="warning" className="text-xs font-mono font-bold">
                            RUNTIME ERROR
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-xs font-mono">
                            {runtimeError.status}
                          </Badge>
                        )}

                        <Badge variant="neutral" className="text-[10px] font-mono">
                          RUNTIME
                        </Badge>

                        {runtimeError.error_type && (
                          <span className="text-xs font-mono text-amber-300">
                            {runtimeError.error_type}
                          </span>
                        )}

                        {runtimeError.service && (
                          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                            <ServerCrash className="w-3.5 h-3.5 text-slate-500" />
                            {runtimeError.service}
                          </span>
                        )}

                        {runtimeError.environment && (
                          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {runtimeError.environment}
                          </span>
                        )}
                      </div>

                      <CardTitle className="text-sm text-slate-100 font-semibold pt-1 break-words">
                        {runtimeError.message}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={isResolving}
                          onClick={() => handleResolveRuntimeError(runtimeError.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40"
                          title="Mark this error as resolved"
                        >
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          Mark Resolved
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolved at {formatDate(runtimeError.updated_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400">
                    <div>
                      <span className="text-slate-500">Occurrences: </span>
                      <span className="font-mono font-semibold text-amber-300">
                        {runtimeError.occurrence_count}
                      </span>
                    </div>
                    {runtimeError.affected_users !== null && (
                      <div>
                        <span className="text-slate-500">Users Affected: </span>
                        <span className="font-mono text-slate-300">
                          {runtimeError.affected_users}
                        </span>
                      </div>
                    )}
                    {runtimeError.repository_name && (
                      <div>
                        <span className="text-slate-500">Repository: </span>
                        <span className="font-mono text-slate-300">
                          {runtimeError.repository_name}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Last Seen: </span>
                      <span className="text-slate-300">
                        {formatDate(runtimeError.last_seen_at)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => toggleErrorExpand(runtimeError.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      {isExpanded ? 'Hide Stack Trace' : 'View Stack Trace & Context'}
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-3 p-4 rounded-lg bg-slate-950/80 border border-slate-800/90 text-xs">
                        {runtimeError.stack_trace && (
                          <pre className="p-3 rounded-lg bg-black/60 border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-56">
                            {runtimeError.stack_trace}
                          </pre>
                        )}

                        {runtimeError.context &&
                          Object.keys(runtimeError.context).length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-slate-400 mb-1">
                                Context
                              </p>
                              <pre className="p-3 rounded-lg bg-black/60 border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-40">
                                {JSON.stringify(runtimeError.context, null, 2)}
                              </pre>
                            </div>
                          )}

                        {!runtimeError.stack_trace && !runtimeError.context && (
                          <p className="text-slate-400">No stack trace was reported.</p>
                        )}

                        {runtimeError.source_url && (
                          <div className="pt-1 flex items-center justify-end">
                            <a
                              href={runtimeError.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              <span>Open source</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Subcomponent to fetch and render detailed occurrences, log excerpts, and error messages
 */
function IncidentDetailAccordion({ incidentId }: { incidentId: string }) {
  const [details, setDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getIncident(incidentId)
      .then((data) => {
        if (mounted) setDetails(data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [incidentId]);

  if (loading) {
    return (
      <div className="p-4 mt-3 rounded-lg bg-slate-950/60 border border-slate-800">
        <LoadingSpinner size="sm" label="Fetching error occurrences..." />
      </div>
    );
  }

  if (!details || details.occurrences.length === 0) {
    return (
      <div className="p-3 mt-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
        No log telemetry recorded for this incident.
      </div>
    );
  }

  const primaryOcc = details.occurrences[0];

  return (
    <div className="mt-3 space-y-3 p-4 rounded-lg bg-slate-950/80 border border-slate-800/90 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300 border-b border-slate-800 pb-3">
        <div>
          <span className="text-slate-500 font-medium">Failed Job: </span>
          <span className="font-mono text-rose-300">{primaryOcc.failed_job || 'Unspecified Job'}</span>
        </div>
        <div>
          <span className="text-slate-500 font-medium">Failed Step: </span>
          <span className="font-mono text-rose-300">{primaryOcc.failed_step || 'Unspecified Step'}</span>
        </div>
      </div>

      {primaryOcc.error_message && (
        <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px] leading-relaxed">
          <span className="font-bold text-rose-400">Error: </span>
          {primaryOcc.error_message}
        </div>
      )}

      {primaryOcc.log_excerpt && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Terminal className="w-3 h-3 text-slate-500" />
            Bounded Log Excerpt:
          </p>
          <pre className="p-3 rounded-lg bg-black/60 border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto leading-relaxed max-h-56">
            {primaryOcc.log_excerpt}
          </pre>
        </div>
      )}

      {primaryOcc.run_url && (
        <div className="pt-1 flex items-center justify-end">
          <a
            href={primaryOcc.run_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>View GitHub Actions Run</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
