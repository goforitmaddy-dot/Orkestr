'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Project } from '@/types';
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
  Search,
  Calendar,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  GitBranch,
  Radio,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectRepository, setProjectRepository] = useState('');
  const [projectServerUrl, setProjectServerUrl] = useState('');
  const [projectEnvironment, setProjectEnvironment] = useState('production');
  const [projectMonitoringEnabled, setProjectMonitoringEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hasUserToken, setHasUserToken] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProjects();
      setProjects(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch projects from backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/projects');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  useEffect(() => {
    api
      .getGitHubConnections()
      .then((connections) => setHasUserToken(connections.some((c) => c.status === 'valid')))
      .catch(() => setHasUserToken(false));
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setFormError('Project name is required');
      return;
    }

    const repository = projectRepository.trim();

    try {
      setIsSubmitting(true);
      setFormError(null);
      const updated = await api.createProject({
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        provider: 'github',
        repository: repository || undefined,
        monitoringEnabled: projectMonitoringEnabled && repository.length > 0,
      });

      if (projectServerUrl.trim()) {
        await api.configureServerMonitoring(updated.id, {
          serverUrl: projectServerUrl.trim(),
          environment: projectEnvironment,
          webhookUrl: null,
          notifyTeam: true,
          healthCheckIntervalMs: 30000,
          enabled: true,
        });
      }

      setProjectName('');
      setProjectDescription('');
      setProjectRepository('');
      setProjectServerUrl('');
      setProjectEnvironment('production');
      setProjectMonitoringEnabled(false);
      setIsModalOpen(false);
      await fetchProjects();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Projects
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage your workspace projects and team initiatives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProjects}
            disabled={loading}
            title="Refresh project list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Project
          </Button>
        </div>
      </div>

      {/* Search Input */}
      {projects.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900/60 pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-rose-200">Failed to load projects</p>
            <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProjects}
              className="mt-3 text-xs border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !error ? (
        <Card>
          <LoadingSpinner label="Fetching projects from database..." />
        </Card>
      ) : projects.length === 0 && !error ? (
        /* Empty State */
        <EmptyState
          icon={FolderKanban}
          title="No projects found"
          description="You haven't created any projects yet. Create one now to begin structuring your workflows."
          action={
            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              Create Project
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        /* Search Empty State */
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          No projects match &ldquo;{searchQuery}&rdquo;. Try another search term.
        </div>
      ) : (
        /* Projects Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="flex flex-col justify-between hover:border-slate-700 hover:bg-slate-900/90 transition-all group"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-base font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-1"
                  >
                    {project.name}
                  </Link>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {project.monitoring_enabled ? (
                      <Badge variant="success" className="text-[10px] font-mono">
                        MONITORING
                      </Badge>
                    ) : project.repository ? (
                      <Badge variant="neutral" className="text-[10px] font-mono">
                        LINKED
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="text-[10px] font-mono">
                        Project
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="line-clamp-3 min-h-[3.5rem] mt-1">
                  {project.description || 'No description provided.'}
                </CardDescription>
                {project.repository && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-slate-400">
                    <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{project.repository}</span>
                    {project.monitoring_enabled && (
                      <Radio className="w-3 h-3 text-emerald-400 shrink-0" />
                    )}
                  </div>
                )}
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatDate(project.created_at)}</span>
                  </div>
                  <Link
                    href={`/projects/${project.id}`}
                    className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    Details
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Project"
        description="Add a new project to your workspace."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {formError}
            </div>
          )}
          <Input
            label="Project Name"
            placeholder="e.g. Next-Gen Core Engine"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            required
            autoFocus
          />
          <Textarea
            label="Description (Optional)"
            placeholder="Describe the project scope, technical stack, or deliverables..."
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            rows={3}
          />
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              GitHub Repository (Optional)
            </label>
            <input
              type="text"
              placeholder="owner/repository"
              value={projectRepository}
              onChange={(e) => setProjectRepository(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Linking a repository lets the monitor watch real GitHub Actions workflows.
            </p>
            {!hasUserToken && (
              <p className="text-[11px] text-amber-400 mt-1">
                You have not connected a GitHub token yet - monitoring stays inactive until you
                add one in Settings.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Live Server URL (Optional)
            </label>
            <input
              type="text"
              placeholder="https://api.yourproject.com"
              value={projectServerUrl}
              onChange={(e) => setProjectServerUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              The monitor will poll this server for health and surface crashes/errors to the Live Monitor.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-slate-300">Environment</label>
              <select
                value={projectEnvironment}
                onChange={(e) => setProjectEnvironment(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
          </div>
          <label
            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
              projectRepository.trim()
                ? 'border-slate-800 bg-slate-900/40'
                : 'border-slate-800/60 bg-slate-950/40 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={projectMonitoringEnabled}
              disabled={!projectRepository.trim()}
              onChange={(e) => setProjectMonitoringEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <div>
              <span className="text-xs font-medium text-slate-200">
                Enable live error monitoring
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Poll this repository for workflow failures and stream them to the Live Monitor.
              </span>
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
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
