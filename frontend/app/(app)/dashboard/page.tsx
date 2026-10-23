'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Project, MonitoringSummary } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Sparkles,
  Layers,
  AlertCircle,
  Calendar,
  Activity,
  AlertTriangle,
} from 'lucide-react';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStreamConnected, setIsStreamConnected] = useState(false);

  // Create Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const summaryData = await api.getMonitoringSummary();
      setSummary(summaryData);
    } catch {
      // Ignore background failures
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [projectsData] = await Promise.all([api.getProjects(), fetchSummary()]);
      setProjects(projectsData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data from backend');
    } finally {
      setLoading(false);
    }
  }, [fetchSummary]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Live updates straight from the backend event stream
  useEffect(() => {
    const dispose = api.subscribeToMonitoringEvents(
      () => fetchSummary(),
      (connected) => setIsStreamConnected(connected)
    );
    return dispose;
  }, [fetchSummary]);

  // Polling fallback when the stream is unavailable
  useEffect(() => {
    if (isStreamConnected) return;
    const interval = setInterval(fetchSummary, 15000);
    return () => clearInterval(interval);
  }, [isStreamConnected, fetchSummary]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setFormError('Project name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      await api.createProject({
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
      });

      setProjectName('');
      setProjectDescription('');
      setIsModalOpen(false);
      await fetchDashboardData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Summary metrics calculated directly from real data
  const totalProjects = projects.length;
  const recentProjects = projects.slice(0, 5);
  const activeErrors = summary?.totalActiveErrors ?? 0;
  const activeIncidents = summary?.activeIncidents ?? 0;
  const activeRuntimeErrors = summary?.activeRuntimeErrors ?? 0;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Welcome to Orkestr
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Autonomous AI Project Management MVP. Orchestrate projects, workflows, and deliverables.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="sm:self-start">
          <Plus className="w-4 h-4 mr-1.5" />
          Create Project
        </Button>
      </div>

      {/* Real Summary Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Total Projects
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">
              {loading ? '—' : totalProjects}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active projects tracked in PostgreSQL
            </p>
          </CardContent>
        </Card>

        {/* Live Error Monitor Status */}
        <Link href="/monitor">
          <Card className={`transition-all duration-200 cursor-pointer hover:border-slate-700 ${
            activeErrors > 0 ? 'border-rose-500/40 bg-rose-950/20' : ''
          }`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Live Error Monitor
              </CardTitle>
              <Activity className={`h-4 w-4 ${activeErrors > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${activeErrors > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {activeErrors > 0 ? `${activeErrors} Error${activeErrors > 1 ? 's' : ''}` : 'All Healthy'}
                </span>
                {activeErrors > 0 && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activeErrors > 0
                  ? `${activeIncidents} CI failure(s), ${activeRuntimeErrors} runtime error(s)`
                  : isStreamConnected
                  ? 'Live stream connected - no open failures'
                  : 'No open failures detected'}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Architecture Status
            </CardTitle>
            <Layers className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Operational
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Next.js frontend + Express REST backend
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              AI Capabilities
            </CardTitle>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-slate-200">
              Foundation Stage
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Prepared for AI task decomposition modules
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Unresolved Errors Alert Banner */}
      {activeErrors > 0 && (
        <div className="rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-slate-900/60 p-4 text-rose-200 shadow-lg shadow-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300">
              <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-rose-100 text-sm">
                  {activeErrors} Active Error{activeErrors > 1 ? 's' : ''} Detected
                </span>
                <Badge variant="danger" className="text-[10px] font-mono">
                  ACTION REQUIRED
                </Badge>
              </div>
              <p className="text-xs text-rose-300/80 mt-0.5">
                {activeIncidents} CI workflow failure(s) and {activeRuntimeErrors} application
                runtime error(s) are currently open.
              </p>
            </div>
          </div>
          <Link href="/monitor">
            <Button size="sm" className="bg-rose-600 hover:bg-rose-500 text-white shrink-0">
              <Activity className="w-3.5 h-3.5 mr-1" />
              Open Live Monitor
            </Button>
          </Link>
        </div>
      )}

      {/* Error Banner if API connection fails */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-rose-200">Unable to load projects</p>
            <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDashboardData}
              className="mt-3 text-xs border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
            >
              Retry Connection
            </Button>
          </div>
        </div>
      )}

      {/* Recent Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
              Recent Projects
            </h2>
            <p className="text-xs text-slate-400">
              Latest initiatives created in the workspace
            </p>
          </div>
          {projects.length > 0 && (
            <Link
              href="/projects"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
            >
              View all projects
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {loading ? (
          <Card>
            <LoadingSpinner label="Loading recent projects..." />
          </Card>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects created yet"
            description="Get started by creating your first project. You will be able to organize tasks, track milestones, and trigger AI planning."
            action={
              <Button onClick={() => setIsModalOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Create your first project
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block focus:outline-none"
              >
                <Card className="h-full hover:border-slate-700 hover:bg-slate-900 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {project.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                        Active
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                      {project.description || 'No description provided.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Created {formatDate(project.created_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project"
        description="Set up a new project space to organize tasks and workflows."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {formError}
            </div>
          )}
          <Input
            label="Project Name"
            placeholder="e.g. Autonomous Agent Pipeline"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            required
            autoFocus
          />
          <Textarea
            label="Description (Optional)"
            placeholder="Brief overview of goals, scope, and objectives..."
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
