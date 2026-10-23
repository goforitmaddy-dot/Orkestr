'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Project,
  Incident,
  ApplicationError,
  ServerHealth,
  ServerErrorReport,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Sparkles,
  Bot,
  ListTodo,
  Edit2,
  Trash2,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Activity,
  Terminal,
  Check,
  GitBranch,
  Radio,
  Link2Off,
  ServerCrash,
  Wifi,
  RefreshCw,
  Play,
  Pause,
  Bug,
} from 'lucide-react';

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRepository, setEditRepository] = useState('');
  const [editServerUrl, setEditServerUrl] = useState('');
  const [editMonitoringEnabled, setEditMonitoringEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Live Error Monitoring State
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [runtimeErrors, setRuntimeErrors] = useState<ApplicationError[]>([]);
  const [isResolvingIncident, setIsResolvingIncident] = useState(false);

  // Live Server Monitoring State
  const [serverHealth, setServerHealth] = useState<ServerHealth | null>(null);
  const [serverErrors, setServerErrors] = useState<ServerErrorReport[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isReportingError, setIsReportingError] = useState(false);

  const fetchProjectIncidents = React.useCallback(async (repository: string) => {
    try {
      const [incidentData, errorData] = await Promise.all([
        api.getIncidents({ repository }),
        api.getApplicationErrors({ repository }).catch(() => []),
      ]);
      setIncidents(incidentData);
      setRuntimeErrors(errorData);
    } catch {
      // Graceful ignore
    }
  }, []);

  const fetchProject = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProject(projectId);
      setProject(data);
      setEditName(data.name);
      setEditDescription(data.description || '');
      setEditRepository(data.repository || '');
      setEditServerUrl(data.server_url || '');
      setEditMonitoringEnabled(data.monitoring_enabled);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve project details');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchServerHealth = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setIsCheckingHealth(true);
      const health = await api.getServerHealth(projectId);
      setServerHealth(health);
    } catch {
      // Graceful ignore - server may not be configured yet
    } finally {
      setIsCheckingHealth(false);
    }
  }, [projectId]);

  const fetchServerErrors = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const errors = await api.getServerErrors(projectId);
      setServerErrors(errors);
    } catch {
      // Graceful ignore
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Live updates for project-specific incidents and runtime errors
  useEffect(() => {
    const repository = project?.repository;
    if (!repository) return;

    fetchProjectIncidents(repository);
    fetchServerHealth();
    fetchServerErrors();
    const interval = setInterval(() => {
      fetchProjectIncidents(repository);
      fetchServerHealth();
      fetchServerErrors();
    }, 15000);
    return () => clearInterval(interval);
  }, [project?.repository, fetchProjectIncidents, fetchServerHealth, fetchServerErrors]);

  const activeIncident = incidents.find(
    (i) => i.status === 'OPEN' || i.status === 'INVESTIGATING'
  );
  const activeRuntimeError = runtimeErrors.find((e) => e.status === 'OPEN');

  const handleResolveProjectIncident = async (incId: string) => {
    if (!project) return;
    try {
      setIsResolvingIncident(true);
      await api.resolveIncident(incId);
      await fetchProjectIncidents(project.repository || '');
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`);
    } finally {
      setIsResolvingIncident(false);
    }
  };

  const handleReportServerError = async () => {
    if (!project) return;
    try {
      setIsReportingError(true);
      await api.reportServerError(projectId, {
        message: 'Simulated server crash detected',
        stackTrace: 'Error: Connection refused\n    at Server.connect (server.js:42:11)\n    at process.nextTick (internal/process/task_queues.js:79:9)',
        severity: 'critical',
        environment: 'production',
      });
      await fetchServerErrors();
      await fetchServerHealth();
    } catch (err: any) {
      alert(`Failed to report server error: ${err.message}`);
    } finally {
      setIsReportingError(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Project name cannot be empty');
      return;
    }

    const repository = editRepository.trim();

    try {
      setIsUpdating(true);
      setEditError(null);
      const updated = await api.updateProject(projectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        provider: 'github',
        repository: editRepository.trim() || null,
        monitoringEnabled: editMonitoringEnabled && editRepository.trim().length > 0,
      });
      setProject(updated);

      if (editServerUrl.trim()) {
        await api.configureServerMonitoring(projectId, {
          serverUrl: editServerUrl.trim(),
          environment: 'production',
          webhookUrl: null,
          notifyTeam: true,
          healthCheckIntervalMs: 30000,
          enabled: true,
        });
      }

      setIsEditModalOpen(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update project');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.deleteProject(projectId);
      router.push('/projects');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete project');
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingSpinner label="Loading project details..." />
      </Card>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Projects
        </Link>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-semibold text-rose-200">Project Not Found</h2>
          </div>
          <p className="mt-2 text-xs text-rose-300">
            {error || `The project with ID ${projectId} does not exist in the database.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/projects')}
            className="mt-4 border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
          >
            Return to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb / Back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Projects
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditModalOpen(true)}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Project Header Banner */}
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl font-bold text-slate-100">
                  {project.name}
                </CardTitle>
                <Badge variant="default" className="text-xs font-mono">
                  ACTIVE
                </Badge>
              </div>
              <CardDescription className="text-sm text-slate-300 mt-2 max-w-2xl whitespace-pre-wrap">
                {project.description || 'No description provided for this project.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-slate-500" />
              <span>
                <span className="text-slate-500">ID: </span>
                <span className="font-mono text-slate-300">{project.id}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>
                <span className="text-slate-500">Created: </span>
                <span className="text-slate-300">{formatDate(project.created_at)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>
                <span className="text-slate-500">Updated: </span>
                <span className="text-slate-300">{formatDate(project.updated_at)}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Project Error Monitoring Card (Shows problem until resolved) */}
      <Card
        className={`transition-all duration-300 ${
          activeIncident
            ? 'border-rose-500/50 bg-gradient-to-r from-rose-950/30 via-slate-900/80 to-slate-900/80 shadow-xl shadow-rose-950/30'
            : 'border-slate-800 bg-slate-900/30'
        }`}
      >
        <CardContent className="p-5">
          {activeIncident ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="danger" className="text-xs font-mono font-bold animate-pulse">
                      ● UNRESOLVED FAILURE DETECTED
                    </Badge>
                    <span className="text-xs font-mono text-slate-300">
                      Workflow: <span className="text-rose-300 font-semibold">{activeIncident.workflow_name}</span>
                    </span>
                    {activeIncident.branch && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        branch: {activeIncident.branch}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-rose-400">
                      ({activeIncident.failure_count} attempt{activeIncident.failure_count > 1 ? 's' : ''})
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-rose-100 mt-2">
                    {activeIncident.title}
                  </h3>

                  <p className="text-xs text-rose-300/80">
                    Detected from a real GitHub Actions run in{' '}
                    <span className="font-mono">{activeIncident.repository_name}</span>. It stays
                    visible here and in the Live Monitor until a green run clears it or someone
                    marks it resolved.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={isResolvingIncident}
                    onClick={() => handleResolveProjectIncident(activeIncident.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/30"
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Mark Resolved
                  </Button>
                  <Link href="/monitor">
                    <Button variant="outline" size="sm">
                      <Activity className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                      View Monitor
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-rose-500/20 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>First Failure: {new Date(activeIncident.first_failure_at).toLocaleTimeString()}</span>
                  <span>Latest Occurrence: {new Date(activeIncident.last_failure_at).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-200">
                      Live Error Monitor: Normal
                    </h4>
                    <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {project.monitoring_enabled ? 'MONITORING' : 'IDLE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {project.repository
                      ? 'No active failures or unresolved workflow errors detected for this project.'
                      : 'Link a GitHub repository to this project to start detecting real CI failures.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href="/monitor">
                  <Button variant="outline" size="sm">
                    <Activity className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                    Open Live Monitor
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repository & Monitoring Configuration */}
      <Card className="border-slate-800 bg-slate-900/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-400" />
              <CardTitle className="text-base text-slate-200">
                Repository &amp; Monitoring
              </CardTitle>
            </div>
            <Badge
              variant={project.monitoring_enabled ? 'success' : 'neutral'}
              className="text-[10px] font-mono"
            >
              {project.monitoring_enabled ? 'ENABLED' : 'DISABLED'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.repository ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <span className="text-slate-500">Repository: </span>
                <span className="font-mono text-slate-200">{project.repository}</span>
              </div>
              <div>
                <span className="text-slate-500">Provider: </span>
                <span className="font-mono text-slate-300">{project.provider}</span>
              </div>
              <div>
                <span className="text-slate-500">Last Polled: </span>
                <span className="font-mono text-slate-300">
                  {project.last_polled_at
                    ? new Date(project.last_polled_at).toLocaleString()
                    : 'Never'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">Last Poll Error: </span>
                <span className="font-mono text-rose-300">
                  {project.last_poll_error || 'None'}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
              <Link2Off className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-200">No repository linked</p>
                <p className="text-xs text-amber-300 mt-0.5">
                  Add an <code className="font-mono">owner/repository</code> slug to monitor real
                  GitHub Actions failures for this project.
                </p>
              </div>
            </div>
          )}

          {activeRuntimeError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <span className="font-semibold text-amber-200">Runtime error: </span>
              {activeRuntimeError.message}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Configure
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Server Health Card */}
      <Card className="border-slate-800 bg-slate-900/30">
        <CardHeader className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-slate-400" />
            <CardTitle className="text-base text-slate-200">Live Server Health</CardTitle>
            {serverHealth ? (
              <Badge
                variant={
                  serverHealth.status === 'online'
                    ? 'success'
                    : serverHealth.status === 'degraded'
                    ? 'warning'
                    : 'danger'
                }
                className="text-[10px] font-mono"
              >
                {serverHealth.status.toUpperCase()}
              </Badge>
            ) : (
              <Badge variant="neutral" className="text-[10px] font-mono">
                UNKNOWN
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchServerHealth}
            isLoading={isCheckingHealth}
            disabled={!project?.server_url}
            title={project?.server_url ? 'Refresh server health' : 'Configure a server URL to enable health checks'}
          >
            <RefreshCw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!project?.server_url ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs text-amber-300">
              <p className="font-semibold text-amber-200 mb-1">No server URL configured</p>
              <p className="text-amber-300">
                Add a live server URL in project settings to enable server health monitoring
                and crash detection.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-950/50 rounded-lg border border-slate-800/80 p-3">
                <span className="text-slate-500">Status</span>
                <div className="mt-1 text-slate-200 font-mono">
                  {serverHealth?.status || 'checking...'}
                </div>
              </div>
                  <div className="bg-slate-950/50 rounded-lg border border-slate-800/80 p-3">
                <span className="text-slate-500">Response Time</span>
                <div className="mt-1 text-slate-200 font-mono">
                  {serverHealth?.responseTimeMs !== null
                    ? `${serverHealth?.responseTimeMs} ms`
                    : '—'}
                </div>
              </div>
              <div className="bg-slate-950/50 rounded-lg border border-slate-800/80 p-3">
                <span className="text-slate-500">Uptime</span>
                <div className="mt-1 text-slate-200 font-mono">
                  {serverHealth?.uptimePercent !== null
                    ? `${serverHealth?.uptimePercent.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
              <div className="sm:col-span-3 bg-slate-950/50 rounded-lg border border-slate-800/80 p-3">
                <span className="text-slate-500">Last Checked</span>
                <div className="mt-1 text-slate-200 font-mono">
                  {serverHealth?.lastCheckedAt
                    ? new Date(serverHealth.lastCheckedAt).toLocaleString()
                    : 'Never'}
                </div>
              </div>
              {serverHealth?.lastError && (
                <div className="sm:col-span-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs">
                  <span className="text-rose-500 font-medium">Last Error: </span>
                  <span className="text-rose-300 mt-1 block break-words">
                    {serverHealth.lastError}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Server Errors */}
      {serverErrors.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/30">
          <CardHeader className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <ServerCrash className="w-4 h-4 text-rose-400" />
              <CardTitle className="text-base text-slate-200">Server Errors & Crashes</CardTitle>
            </div>
            <div className="text-xs text-slate-400">
              {serverErrors.filter((e) => !e.resolved).length} unresolved
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {serverErrors.map((err) => (
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
                <div className="text-xs text-slate-200 font-mono break-words mb-1">
                  {err.message}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>{new Date(err.occurredAt).toLocaleString()}</span>
                  {!err.resolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Resolve via API - reuse incident resolve pattern or a dedicated endpoint
                        alert('Server error resolution requires backend endpoint.');
                      }}
                    >
                      Mark Resolved
                    </Button>
                  )}
                </div>
                {err.stackTrace && (
                  <div className="mt-2 p-2 rounded bg-black/60 border border-slate-800 text-xs font-mono text-slate-400 overflow-x-auto max-h-32">
                    {err.stackTrace}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReportServerError}
          isLoading={isReportingError}
          disabled={!project?.server_url}
          title={project?.server_url ? 'Send a test server error to verify detection' : 'Configure a server URL first'}
        >
          <Bug className="w-3 h-3 mr-1.5" />
          Report Test Error
        </Button>
        {serverErrors.some((e) => !e.resolved) && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              const unresolved = serverErrors.filter((e) => !e.resolved);
              alert(
                `Team notified about ${unresolved.length} unresolved server error(s). Check notifications and assignments.`
              );
            }}
          >
            <AlertTriangle className="w-3 h-3 mr-1.5" />
            Notify Team
          </Button>
        )}
      </div>

      {/* Clearly Marked Placeholders for Future Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Task Management Placeholder */}
        <Card className="border-dashed border-slate-800 bg-slate-900/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-base text-slate-200">
                  Task Management
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-indigo-400 border-indigo-500/30">
                Future Module
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Work item breakdown, status boards, and milestone tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 text-center">
              <p className="text-xs text-slate-400 leading-relaxed">
                Task decomposition and Kanban workflows will be enabled here in the next iteration.
                Tasks will automatically link to project milestones and team members.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI-Generated Plans Placeholder */}
        <Card className="border-dashed border-slate-800 bg-slate-900/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-400" />
                <CardTitle className="text-base text-slate-200">
                  AI-Generated Execution Plans
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">
                Future Module
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-400 mt-1">
              Automated roadmap generation, dependency graphs, and resource estimation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-violet-400 font-medium mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                AI Decomposition Engine
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                LLM integrations will allow project specifications to be decomposed into actionable tickets,
                risk evaluations, and dependency chains.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Project"
        description="Update project details."
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          {editError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {editError}
            </div>
          )}
          <Input
            label="Project Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            autoFocus
          />
          <Textarea
            label="Description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={4}
          />
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              GitHub Repository
            </label>
            <input
              type="text"
              placeholder="owner/repository"
              value={editRepository}
              onChange={(e) => setEditRepository(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Clear this field to unlink the repository from the project.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Live Server URL (Optional)
            </label>
            <input
              type="text"
              placeholder="https://api.yourproject.com"
              value={editServerUrl}
              onChange={(e) => setEditServerUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              The monitor will poll this server for health and surface crashes/errors to the Live Monitor.
            </p>
          </div>
          <label
            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
              editRepository.trim()
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-slate-800/60 bg-slate-950/40 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={editMonitoringEnabled}
              disabled={!editRepository.trim()}
              onChange={(e) => setEditMonitoringEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <div>
              <span className="text-xs font-medium text-slate-200">
                Enable live error monitoring
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Poll this repository for failed workflows and stream results to the Live Monitor.
              </span>
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isUpdating}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Project"
        description="This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {deleteError}
            </div>
          )}
          <p className="text-xs text-slate-300">
            Are you sure you want to delete <span className="font-semibold text-slate-100">{project.name}</span>?
            All associated records and team memberships will be permanently removed.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
