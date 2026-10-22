'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Project } from '@/types';
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchProject = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProject(projectId);
      setProject(data);
      setEditName(data.name);
      setEditDescription(data.description || '');
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve project details');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Project name cannot be empty');
      return;
    }

    try {
      setIsUpdating(true);
      setEditError(null);
      const updated = await api.updateProject(projectId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setProject(updated);
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
