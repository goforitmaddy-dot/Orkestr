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
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
  Calendar,
} from 'lucide-react';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    fetchProjects();
  }, []);

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
      await fetchProjects();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Summary metrics calculated directly from real data
  const totalProjects = projects.length;
  const recentProjects = projects.slice(0, 5);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
              onClick={fetchProjects}
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
