'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
  TaskWithDependencies,
  TaskDependenciesResponse,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  FolderKanban,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  GitBranch,
  Layers,
  ArrowRight,
  User,
  Filter,
} from 'lucide-react';

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  // Project State
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Edit Project State
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);

  // Delete Project State
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Task Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Create Task Modal State
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('TODO');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState('');
  const [taskParentId, setTaskParentId] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  // Task Details & Dependencies Modal State
  const [selectedTask, setSelectedTask] = useState<TaskWithDependencies | null>(null);
  const [isLoadingTaskDetails, setIsLoadingTaskDetails] = useState(false);
  const [isTaskDetailsModalOpen, setIsTaskDetailsModalOpen] = useState(false);
  const [selectedDependsOnId, setSelectedDependsOnId] = useState('');
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [isAddingDependency, setIsAddingDependency] = useState(false);

  // Edit Task Modal State
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskStatus, setEditTaskStatus] = useState<TaskStatus>('TODO');
  const [editTaskPriority, setEditTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [editTaskEstimatedHours, setEditTaskEstimatedHours] = useState('');
  const [editTaskParentId, setEditTaskParentId] = useState('');
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);

  // Delete Task Modal State
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);

  // Fetch Project
  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadingProject(true);
      setProjectError(null);
      const data = await api.getProject(projectId);
      setProject(data);
      setEditProjectName(data.name);
      setEditProjectDescription(data.description || '');
    } catch (err: any) {
      setProjectError(err.message || 'Failed to retrieve project details');
    } finally {
      setLoadingProject(false);
    }
  }, [projectId]);

  // Fetch Tasks
  const fetchTasks = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadingTasks(true);
      setTasksError(null);
      const filters: any = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (priorityFilter !== 'ALL') filters.priority = priorityFilter;

      const data = await api.getProjectTasks(projectId, filters);
      setTasks(data);
    } catch (err: any) {
      setTasksError(err.message || 'Failed to load project tasks');
    } finally {
      setLoadingTasks(false);
    }
  }, [projectId, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Project Actions
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProjectName.trim()) {
      setEditProjectError('Project name cannot be empty');
      return;
    }

    try {
      setIsUpdatingProject(true);
      setEditProjectError(null);
      const updated = await api.updateProject(projectId, {
        name: editProjectName.trim(),
        description: editProjectDescription.trim() || undefined,
      });
      setProject(updated);
      setIsEditProjectModalOpen(false);
    } catch (err: any) {
      setEditProjectError(err.message || 'Failed to update project');
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      setIsDeletingProject(true);
      setDeleteProjectError(null);
      await api.deleteProject(projectId);
      router.push('/projects');
    } catch (err: any) {
      setDeleteProjectError(err.message || 'Failed to delete project');
      setIsDeletingProject(false);
    }
  };

  // Task Actions
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setTaskFormError('Task title is required');
      return;
    }

    try {
      setIsSubmittingTask(true);
      setTaskFormError(null);
      const hours = taskEstimatedHours ? parseFloat(taskEstimatedHours) : undefined;
      if (hours !== undefined && (isNaN(hours) || hours <= 0)) {
        setTaskFormError('Estimated hours must be a positive number');
        setIsSubmittingTask(false);
        return;
      }

      await api.createProjectTask(projectId, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        status: taskStatus,
        priority: taskPriority,
        estimatedHours: hours,
        parentTaskId: taskParentId || undefined,
      });

      // Reset form
      setTaskTitle('');
      setTaskDescription('');
      setTaskStatus('TODO');
      setTaskPriority('MEDIUM');
      setTaskEstimatedHours('');
      setTaskParentId('');
      setIsCreateTaskModalOpen(false);
      await fetchTasks();
    } catch (err: any) {
      setTaskFormError(err.message || 'Failed to create task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleOpenTaskDetails = async (taskId: string) => {
    try {
      setIsLoadingTaskDetails(true);
      setDependencyError(null);
      setSelectedDependsOnId('');
      setIsTaskDetailsModalOpen(true);
      const details = await api.getTask(taskId);
      setSelectedTask(details);
    } catch (err: any) {
      setDependencyError(err.message || 'Failed to fetch task details');
    } finally {
      setIsLoadingTaskDetails(false);
    }
  };

  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description || '');
    setEditTaskStatus(task.status);
    setEditTaskPriority(task.priority);
    setEditTaskEstimatedHours(task.estimated_hours ? String(task.estimated_hours) : '');
    setEditTaskParentId(task.parent_task_id || '');
    setEditTaskError(null);
    setIsEditTaskModalOpen(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!editTaskTitle.trim()) {
      setEditTaskError('Task title cannot be empty');
      return;
    }

    try {
      setIsUpdatingTask(true);
      setEditTaskError(null);
      const hours = editTaskEstimatedHours ? parseFloat(editTaskEstimatedHours) : undefined;
      if (hours !== undefined && (isNaN(hours) || hours <= 0)) {
        setEditTaskError('Estimated hours must be a positive number');
        setIsUpdatingTask(false);
        return;
      }

      await api.updateTask(editingTask.id, {
        title: editTaskTitle.trim(),
        description: editTaskDescription.trim() || null,
        status: editTaskStatus,
        priority: editTaskPriority,
        estimatedHours: hours || null,
        parentTaskId: editTaskParentId || null,
      });

      setIsEditTaskModalOpen(false);
      await fetchTasks();
      if (selectedTask && selectedTask.id === editingTask.id) {
        await handleOpenTaskDetails(editingTask.id);
      }
    } catch (err: any) {
      setEditTaskError(err.message || 'Failed to update task');
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      setIsDeletingTask(true);
      setDeleteTaskError(null);
      await api.deleteTask(taskToDelete.id);
      setTaskToDelete(null);
      if (selectedTask?.id === taskToDelete.id) {
        setIsTaskDetailsModalOpen(false);
      }
      await fetchTasks();
    } catch (err: any) {
      setDeleteTaskError(err.message || 'Failed to delete task');
    } finally {
      setIsDeletingTask(false);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedTask || !selectedDependsOnId) return;
    try {
      setIsAddingDependency(true);
      setDependencyError(null);
      await api.createTaskDependency(selectedTask.id, selectedDependsOnId);
      setSelectedDependsOnId('');
      // Refresh task details
      const updated = await api.getTask(selectedTask.id);
      setSelectedTask(updated);
    } catch (err: any) {
      setDependencyError(err.message || 'Failed to add dependency');
    } finally {
      setIsAddingDependency(false);
    }
  };

  const handleRemoveDependency = async (dependsOnTaskId: string) => {
    if (!selectedTask) return;
    try {
      setDependencyError(null);
      await api.deleteTaskDependency(selectedTask.id, dependsOnTaskId);
      const updated = await api.getTask(selectedTask.id);
      setSelectedTask(updated);
    } catch (err: any) {
      setDependencyError(err.message || 'Failed to remove dependency');
    }
  };

  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await api.updateTask(taskId, { status: newStatus });
      await fetchTasks();
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update task status');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'TODO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Circle className="w-3 h-3 text-slate-400" />
            To Do
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Clock3 className="w-3 h-3 text-indigo-400" />
            In Progress
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Eye className="w-3 h-3 text-amber-400" />
            In Review
          </span>
        );
      case 'DONE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Done
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'LOW':
        return <Badge variant="neutral" className="text-[10px]">LOW</Badge>;
      case 'MEDIUM':
        return <Badge variant="default" className="text-[10px]">MED</Badge>;
      case 'HIGH':
        return <Badge variant="warning" className="text-[10px]">HIGH</Badge>;
      case 'URGENT':
        return (
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
            URGENT
          </span>
        );
    }
  };

  if (loadingProject) {
    return (
      <Card>
        <LoadingSpinner label="Loading project details..." />
      </Card>
    );
  }

  if (projectError || !project) {
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
            {projectError || `The project with ID ${projectId} does not exist in the database.`}
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
      {/* Top Breadcrumb & Project Actions */}
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
            onClick={() => setIsEditProjectModalOpen(true)}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            Edit Project
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteProjectModalOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete Project
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
                <span className="text-slate-500">Total Tasks: </span>
                <span className="text-slate-100 font-semibold">{tasks.length}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Functional Tasks Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <ListTodo className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center gap-2">
                Tasks & Milestones
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage deliverables, track statuses, and link task dependencies
              </p>
            </div>
          </div>

          <Button onClick={() => setIsCreateTaskModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Task
          </Button>
        </div>

        {/* Task Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            <div className="flex items-center gap-1">
              {['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {st === 'ALL'
                    ? 'All'
                    : st === 'TODO'
                    ? 'To Do'
                    : st === 'IN_PROGRESS'
                    ? 'In Progress'
                    : st === 'IN_REVIEW'
                    ? 'Review'
                    : 'Done'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2.5 py-1 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>

        {/* Task Error State */}
        {tasksError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{tasksError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTasks}
              className="ml-auto text-xs h-7 border-rose-500/40 text-rose-200"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Task List / Empty States */}
        {loadingTasks ? (
          <Card>
            <LoadingSpinner label="Loading project tasks..." />
          </Card>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title={
              statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                ? 'No matching tasks'
                : 'No tasks created yet'
            }
            description={
              statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                ? 'Try adjusting your status or priority filter criteria.'
                : 'Break your project deliverables into manageable tickets and set dependencies.'
            }
            action={
              statusFilter !== 'ALL' || priorityFilter !== 'ALL' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setPriorityFilter('ALL');
                  }}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={() => setIsCreateTaskModalOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add First Task
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <Card
                key={task.id}
                className="hover:border-slate-700 bg-slate-900/60 transition-all group p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Status indicator button */}
                      <button
                        onClick={() => {
                          const nextStatus: Record<TaskStatus, TaskStatus> = {
                            TODO: 'IN_PROGRESS',
                            IN_PROGRESS: 'IN_REVIEW',
                            IN_REVIEW: 'DONE',
                            DONE: 'TODO',
                          };
                          handleQuickStatusChange(task.id, nextStatus[task.status]);
                        }}
                        title="Click to cycle status"
                      >
                        {getStatusBadge(task.status)}
                      </button>

                      <h4
                        onClick={() => handleOpenTaskDetails(task.id)}
                        className={`text-sm font-semibold hover:text-indigo-400 cursor-pointer transition-colors truncate ${
                          task.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-100'
                        }`}
                      >
                        {task.title}
                      </h4>

                      {getPriorityBadge(task.priority)}

                      {task.parent_task_id && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                          <Layers className="w-2.5 h-2.5" />
                          Subtask
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                      {task.estimated_hours !== null && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{task.estimated_hours}h estimated</span>
                        </div>
                      )}
                      {task.assignee_name && (
                        <div className="flex items-center gap-1 text-slate-400">
                          <User className="w-3 h-3" />
                          <span>{task.assignee_name}</span>
                        </div>
                      )}
                      <div className="text-slate-500">
                        Created {formatDate(task.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Task Action Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenTaskDetails(task.id)}
                      className="h-8 px-2.5 text-xs text-slate-300"
                      title="View details & dependencies"
                    >
                      <GitBranch className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                      Dependencies
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditTask(task)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200"
                      title="Edit task"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTaskToDelete(task);
                        setDeleteTaskError(null);
                      }}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* AI Execution Plans Placeholder (Clearly Marked) */}
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
            Automated task decomposition, dependency graph calculation, and resource estimation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-violet-400 font-medium mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              LLM Orchestration Pipeline
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-lg mx-auto">
              Our task data model with dependency cycles prevention and subtasks is now ready. In the next iteration,
              LLM prompts will automatically populate this task graph from high-level project goals.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* CREATE TASK MODAL */}
      <Modal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        title="Add New Task"
        description="Create a work item within this project."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          {taskFormError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {taskFormError}
            </div>
          )}

          <Input
            label="Task Title"
            placeholder="e.g. Design PostgreSQL schema migrations"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            required
            autoFocus
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Describe deliverables, technical requirements, or acceptance criteria..."
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            rows={3}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Status
              </label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Priority
              </label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Estimated Hours (Optional)"
              type="number"
              step="0.5"
              min="0.5"
              placeholder="e.g. 4.5"
              value={taskEstimatedHours}
              onChange={(e) => setTaskEstimatedHours(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Parent Task (Optional)
              </label>
              <select
                value={taskParentId}
                onChange={(e) => setTaskParentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none truncate"
              >
                <option value="">None (Top-Level Task)</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateTaskModalOpen(false)}
              disabled={isSubmittingTask}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmittingTask}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* TASK DETAILS & DEPENDENCIES MODAL */}
      <Modal
        isOpen={isTaskDetailsModalOpen}
        onClose={() => setIsTaskDetailsModalOpen(false)}
        title={selectedTask ? selectedTask.title : 'Task Details'}
        description={selectedTask ? `ID: ${selectedTask.id}` : ''}
      >
        {isLoadingTaskDetails ? (
          <LoadingSpinner label="Loading task details..." />
        ) : selectedTask ? (
          <div className="space-y-5">
            {dependencyError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
                {dependencyError}
              </div>
            )}

            {/* Task Info Header */}
            <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedTask.status)}
                  {getPriorityBadge(selectedTask.priority)}
                </div>
                {selectedTask.estimated_hours && (
                  <span className="text-xs text-slate-400 font-mono">
                    {selectedTask.estimated_hours}h estimated
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap">
                {selectedTask.description || 'No description provided.'}
              </p>
            </div>

            {/* DEPENDENCY MANAGEMENT */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                  Task Dependencies
                </h4>
              </div>

              {/* SECTION: This task depends on */}
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Prerequisites (Depends On):</span>{' '}
                  These tasks must be completed before this task can start.
                </p>

                {selectedTask.depends_on.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2 bg-slate-950/40 rounded border border-slate-800/60">
                    No prerequisites. This task is unblocked.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTask.depends_on.map((dep) => (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getStatusBadge(dep.status)}
                          <span className="text-slate-200 truncate">{dep.title}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveDependency(dep.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                          title="Remove dependency"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Dependency Form */}
                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={selectedDependsOnId}
                    onChange={(e) => setSelectedDependsOnId(e.target.value)}
                    className="flex-1 h-8 rounded border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select a prerequisite task...</option>
                    {tasks
                      .filter(
                        (t) =>
                          t.id !== selectedTask.id &&
                          !selectedTask.depends_on.some((d) => d.id === t.id)
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.status})
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleAddDependency}
                    disabled={!selectedDependsOnId || isAddingDependency}
                    isLoading={isAddingDependency}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {/* SECTION: Tasks that depend on this task */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <p className="text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Dependent Tasks (Blocks):</span>{' '}
                  These tasks are waiting on this task.
                </p>

                {selectedTask.dependent_tasks.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2 bg-slate-950/40 rounded border border-slate-800/60">
                    No tasks are currently waiting on this task.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTask.dependent_tasks.map((dep) => (
                      <div
                        key={dep.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getStatusBadge(dep.status)}
                          <span className="text-slate-200 truncate">{dep.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">Blocked</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleOpenEditTask(selectedTask);
                }}
              >
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                Edit Task
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsTaskDetailsModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* EDIT TASK MODAL */}
      <Modal
        isOpen={isEditTaskModalOpen}
        onClose={() => setIsEditTaskModalOpen(false)}
        title="Edit Task"
        description="Update task details and specifications."
      >
        <form onSubmit={handleUpdateTask} className="space-y-4">
          {editTaskError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {editTaskError}
            </div>
          )}

          <Input
            label="Task Title"
            value={editTaskTitle}
            onChange={(e) => setEditTaskTitle(e.target.value)}
            required
            autoFocus
          />

          <Textarea
            label="Description"
            value={editTaskDescription}
            onChange={(e) => setEditTaskDescription(e.target.value)}
            rows={3}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Status
              </label>
              <select
                value={editTaskStatus}
                onChange={(e) => setEditTaskStatus(e.target.value as TaskStatus)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Priority
              </label>
              <select
                value={editTaskPriority}
                onChange={(e) => setEditTaskPriority(e.target.value as TaskPriority)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Estimated Hours"
              type="number"
              step="0.5"
              min="0.5"
              placeholder="e.g. 4.5"
              value={editTaskEstimatedHours}
              onChange={(e) => setEditTaskEstimatedHours(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Parent Task
              </label>
              <select
                value={editTaskParentId}
                onChange={(e) => setEditTaskParentId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none truncate"
              >
                <option value="">None (Top-Level Task)</option>
                {tasks
                  .filter((t) => editingTask && t.id !== editingTask.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditTaskModalOpen(false)}
              disabled={isUpdatingTask}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isUpdatingTask}>
              Save Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE TASK MODAL */}
      <Modal
        isOpen={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        title="Delete Task"
        description="Are you sure you want to delete this task?"
      >
        <div className="space-y-4">
          {deleteTaskError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {deleteTaskError}
            </div>
          )}
          <p className="text-xs text-slate-300">
            This will permanently remove <span className="font-semibold text-slate-100">{taskToDelete?.title}</span>.
            Any dependencies or subtasks linking to this task will also be deleted consistently.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTaskToDelete(null)}
              disabled={isDeletingTask}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteTask}
              isLoading={isDeletingTask}
            >
              Delete Task
            </Button>
          </div>
        </div>
      </Modal>

      {/* EDIT PROJECT MODAL */}
      <Modal
        isOpen={isEditProjectModalOpen}
        onClose={() => setIsEditProjectModalOpen(false)}
        title="Edit Project"
        description="Update project details."
      >
        <form onSubmit={handleUpdateProject} className="space-y-4">
          {editProjectError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {editProjectError}
            </div>
          )}
          <Input
            label="Project Name"
            value={editProjectName}
            onChange={(e) => setEditProjectName(e.target.value)}
            required
            autoFocus
          />
          <Textarea
            label="Description"
            value={editProjectDescription}
            onChange={(e) => setEditProjectDescription(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditProjectModalOpen(false)}
              disabled={isUpdatingProject}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isUpdatingProject}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE PROJECT MODAL */}
      <Modal
        isOpen={isDeleteProjectModalOpen}
        onClose={() => setIsDeleteProjectModalOpen(false)}
        title="Delete Project"
        description="This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteProjectError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {deleteProjectError}
            </div>
          )}
          <p className="text-xs text-slate-300">
            Are you sure you want to delete <span className="font-semibold text-slate-100">{project.name}</span>?
            All associated tasks, dependencies, and records will be permanently removed.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteProjectModalOpen(false)}
              disabled={isDeletingProject}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteProject}
              isLoading={isDeletingProject}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
