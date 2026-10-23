'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
  TaskWithDependencies,
  TaskDependenciesResponse,
  ProjectMemberWithUser,
  ProjectGitHubStatus,
  TaskGitHubActivity,
  TaskVerification,
  VerificationVerdict,
  RequirementCoverage,
  FileAnalysis,
  ReviewDecision,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { AiPlanner } from '@/components/ai/AiPlanner';
import { TaskDistributionWorkbench } from '@/components/distribution/TaskDistributionWorkbench';
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
  Users,
  UserPlus,
  Filter,
  TrendingUp,
  Github,
  ExternalLink,
  Unlink,
  Info,
  GitCommit,
  GitPullRequest,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  FileCode,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const { user, loading: authLoading } = useAuth();

  // Project State
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Members & Roles State
  const [members, setMembers] = useState<ProjectMemberWithUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

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

  // GitHub Repository Connection State
  const [projectRepo, setProjectRepo] = useState<ProjectGitHubStatus | null>(null);
  const [loadingProjectRepo, setLoadingProjectRepo] = useState(true);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [repoOwnerInput, setRepoOwnerInput] = useState('');
  const [repoNameInput, setRepoNameInput] = useState('');
  const [repoDefaultBranchInput, setRepoDefaultBranchInput] = useState('main');
  const [repoInstallationIdInput, setRepoInstallationIdInput] = useState('');
  const [isConnectingRepo, setIsConnectingRepo] = useState(false);
  const [isDisconnectingRepo, setIsDisconnectingRepo] = useState(false);
  const [repoActionError, setRepoActionError] = useState<string | null>(null);
  const [repoActionSuccess, setRepoActionSuccess] = useState<string | null>(null);

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Workspace Active Tab: 1. Set Up Team, 2. Add Tasks Manually, 3. Add Tasks AI, 4. Task Distribution
  const [activeTab, setActiveTab] = useState<'members' | 'tasks' | 'planner' | 'distribution'>('members');

  // Task Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Create Task Modal State
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAcceptanceCriteria, setTaskAcceptanceCriteria] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('TODO');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState('');
  const [taskParentId, setTaskParentId] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  // Task Details & Dependencies Modal State
  const [selectedTask, setSelectedTask] = useState<TaskWithDependencies | null>(null);
  const [isLoadingTaskDetails, setIsLoadingTaskDetails] = useState(false);
  const [isTaskDetailsModalOpen, setIsTaskDetailsModalOpen] = useState(false);
  const [selectedDependsOnId, setSelectedDependsOnId] = useState('');
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [isAddingDependency, setIsAddingDependency] = useState(false);
  const [taskActivities, setTaskActivities] = useState<TaskGitHubActivity[]>([]);
  const [isLoadingTaskActivities, setIsLoadingTaskActivities] = useState(false);

  // Task AI Verification State
  const [taskVerification, setTaskVerification] = useState<TaskVerification | null>(null);
  const [isLoadingVerification, setIsLoadingVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [acknowledgeStale, setAcknowledgeStale] = useState(false);
  const [verificationActiveTab, setVerificationActiveTab] = useState<'criteria' | 'files' | 'risks'>('criteria');

  // Edit Task Modal State
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskAcceptanceCriteria, setEditTaskAcceptanceCriteria] = useState('');
  const [editTaskStatus, setEditTaskStatus] = useState<TaskStatus>('TODO');
  const [editTaskPriority, setEditTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [editTaskEstimatedHours, setEditTaskEstimatedHours] = useState('');
  const [editTaskParentId, setEditTaskParentId] = useState('');
  const [editTaskAssigneeId, setEditTaskAssigneeId] = useState('');
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);

  // Delete Task Modal State
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<Array<{ id: string; name: string; username: string; email: string }>>([]);
  const [loadingRegisteredUsers, setLoadingRegisteredUsers] = useState(false);

  // Remove Member State
  const [memberToRemove, setMemberToRemove] = useState<ProjectMemberWithUser | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null);

  // Teammate Work Distribution and Completion Analytics
  const memberWorkloadStats = useMemo(() => {
    return members.map((member) => {
      const assignedTasks = tasks.filter((t) => t.assignee_id === member.user_id);
      const doneTasks = assignedTasks.filter((t) => t.status === 'DONE');
      const inProgressTasks = assignedTasks.filter(
        (t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW'
      );
      const todoTasks = assignedTasks.filter((t) => t.status === 'TODO');

      const totalHours = assignedTasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0);
      const doneHours = doneTasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0);
      const inProgressHours = inProgressTasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0);
      const remainingHours = totalHours - doneHours;

      const progressPct =
        assignedTasks.length > 0
          ? Math.round((doneTasks.length / assignedTasks.length) * 100)
          : 0;

      return {
        member,
        totalTasks: assignedTasks.length,
        doneTasks: doneTasks.length,
        inProgressTasks: inProgressTasks.length,
        todoTasks: todoTasks.length,
        totalHours,
        doneHours,
        inProgressHours,
        remainingHours,
        progressPct,
      };
    });
  }, [members, tasks]);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?redirect=/projects/${projectId}`);
    }
  }, [authLoading, user, projectId, router]);

  // Fetch Project
  const fetchProject = useCallback(async () => {
    if (!projectId || !user) return;
    try {
      setLoadingProject(true);
      setProjectError(null);
      setIsForbidden(false);
      const data = await api.getProject(projectId);
      setProject(data);
      setEditProjectName(data.name);
      setEditProjectDescription(data.description || '');
    } catch (err: any) {
      if (
        err.status === 403 ||
        err.status === 401 ||
        err.message?.toLowerCase().includes('permission') ||
        err.message?.toLowerCase().includes('not a member')
      ) {
        setIsForbidden(true);
      }
      setProjectError(err.message || 'Failed to retrieve project details');
    } finally {
      setLoadingProject(false);
    }
  }, [projectId, user]);

  // Fetch Project Members (for role resolution)
  const fetchMembers = useCallback(async () => {
    if (!projectId || !user) return;
    try {
      setLoadingMembers(true);
      const data = await api.getProjectMembers(projectId);
      setMembers(data);
    } catch (err: any) {
      console.warn('Failed to load project members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId, user]);

  // GitHub Repository Status Fetcher
  const fetchProjectRepo = useCallback(async () => {
    if (!projectId || !user) return;
    try {
      setLoadingProjectRepo(true);
      const data = await api.getProjectGitHub(projectId);
      setProjectRepo(data);
      if (data.isConnected && data.repoOwner && data.repoName) {
        setRepoOwnerInput(data.repoOwner);
        setRepoNameInput(data.repoName);
        setRepoDefaultBranchInput(data.defaultBranch || 'main');
        setRepoInstallationIdInput(data.installationId || '');
      }
    } catch (err: any) {
      console.error('Failed to load project repository status:', err);
    } finally {
      setLoadingProjectRepo(false);
    }
  }, [projectId, user]);

  // Fetch Tasks
  const fetchTasks = useCallback(async () => {
    if (!projectId || !user) return;
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
  }, [projectId, user, statusFilter, priorityFilter]);

  useEffect(() => {
    if (user) {
      fetchProject();
      fetchMembers();
      fetchProjectRepo();
    }
  }, [fetchProject, fetchMembers, fetchProjectRepo, user]);

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [fetchTasks, user]);

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

  // GitHub Repository Actions
  const handleConnectRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    let owner = repoOwnerInput.trim();
    let name = repoNameInput.trim();

    // Auto-parse full URLs or slash-separated inputs
    if (owner.includes('/') || owner.includes('github.com')) {
      const cleanUrl = owner
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
      const parts = cleanUrl.split('/');
      if (parts.length >= 2) {
        owner = parts[0];
        name = parts[1];
      }
    } else if (name.includes('/') || name.includes('github.com')) {
      const cleanUrl = name
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
      const parts = cleanUrl.split('/');
      if (parts.length >= 2) {
        if (!owner) owner = parts[0];
        name = parts[1];
      }
    }
    name = name.replace(/\.git$/i, '').trim();

    if (!owner || !name) {
      setRepoActionError('Repository owner and name are required.');
      return;
    }

    // Clean installation ID (e.g. if pasted URL https://github.com/settings/installations/12345678)
    let instId = repoInstallationIdInput.trim();
    if (instId) {
      const match = instId.match(/(\d+)\/?$/);
      if (match) instId = match[1];
    }

    try {
      setIsConnectingRepo(true);
      setRepoActionError(null);
      setRepoActionSuccess(null);

      const res = await api.connectProjectRepository(projectId, {
        repoOwner: owner,
        repoName: name,
        defaultBranch: repoDefaultBranchInput.trim() || 'main',
        installationId: instId || undefined,
      });

      setProjectRepo(res.repository);
      setRepoOwnerInput(owner);
      setRepoNameInput(name);
      if (instId) setRepoInstallationIdInput(instId);
      setRepoActionSuccess('GitHub repository connected successfully.');
    } catch (err: any) {
      setRepoActionError(err.message || 'Failed to connect repository.');
    } finally {
      setIsConnectingRepo(false);
    }
  };

  const handleDisconnectRepo = async () => {
    if (!window.confirm('Are you sure you want to disconnect this repository from the project?')) {
      return;
    }

    try {
      setIsDisconnectingRepo(true);
      setRepoActionError(null);
      setRepoActionSuccess(null);

      const res = await api.disconnectProjectRepository(projectId);
      setProjectRepo(res.repository);
      setRepoOwnerInput('');
      setRepoNameInput('');
      setRepoDefaultBranchInput('main');
      setRepoInstallationIdInput('');
      setRepoActionSuccess('Repository disconnected.');
    } catch (err: any) {
      setRepoActionError(err.message || 'Failed to disconnect repository.');
    } finally {
      setIsDisconnectingRepo(false);
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

      const parsedCriteria = taskAcceptanceCriteria
        .split('\n')
        .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean);

      await api.createProjectTask(projectId, {
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        acceptanceCriteria: parsedCriteria.length > 0 ? parsedCriteria : undefined,
        status: taskStatus,
        priority: taskPriority,
        estimatedHours: hours,
        parentTaskId: taskParentId || undefined,
        assigneeId: taskAssigneeId || undefined,
      });

      // Reset form
      setTaskTitle('');
      setTaskDescription('');
      setTaskAcceptanceCriteria('');
      setTaskStatus('TODO');
      setTaskPriority('MEDIUM');
      setTaskEstimatedHours('');
      setTaskParentId('');
      setTaskAssigneeId('');
      setIsCreateTaskModalOpen(false);
      await fetchTasks();
    } catch (err: any) {
      setTaskFormError(err.message || 'Failed to create task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleClaimTask = async (taskId: string) => {
    if (!user) return;
    try {
      await api.updateTask(taskId, { assigneeId: user.id });
      await fetchTasks();
    } catch (err: any) {
      setTasksError(err.message || 'Failed to claim task');
    }
  };

  const handleOpenTaskDetails = async (taskId: string) => {
    try {
      setIsLoadingTaskDetails(true);
      setDependencyError(null);
      setSelectedDependsOnId('');
      setTaskActivities([]);
      setTaskVerification(null);
      setIsLoadingVerification(true);
      setVerificationError(null);
      setReviewError(null);
      setReviewFeedback('');
      setAcknowledgeStale(false);
      setIsTaskDetailsModalOpen(true);
      const details = await api.getTask(taskId);
      setSelectedTask(details);

      // Fetch GitHub activities & Verification report in parallel
      setIsLoadingTaskActivities(true);
      await Promise.all([
        api
          .getTaskGitHubActivities(taskId)
          .then((activities) => setTaskActivities(activities))
          .catch((actErr) => console.warn('Failed to fetch GitHub activities:', actErr))
          .finally(() => setIsLoadingTaskActivities(false)),
        api
          .getTaskVerification(taskId)
          .then((v) => setTaskVerification(v))
          .catch((vErr) => console.warn('Failed to load task verification:', vErr))
          .finally(() => setIsLoadingVerification(false)),
      ]);
    } catch (err: any) {
      setDependencyError(err.message || 'Failed to fetch task details');
    } finally {
      setIsLoadingTaskDetails(false);
    }
  };

  const handleTriggerVerification = async () => {
    if (!selectedTask) return;
    try {
      setIsVerifying(true);
      setVerificationError(null);
      const report = await api.verifyTask(selectedTask.id);
      setTaskVerification(report);
      // Update selectedTask status locally if moved to IN_REVIEW
      if (selectedTask.status === 'TODO' || selectedTask.status === 'IN_PROGRESS') {
        setSelectedTask((prev) => (prev ? { ...prev, status: 'IN_REVIEW' } : null));
      }
      await fetchTasks();
    } catch (err: any) {
      setVerificationError(err.message || 'AI verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitReview = async (decision: 'APPROVED' | 'CHANGES_REQUESTED') => {
    if (!selectedTask) return;
    try {
      setIsSubmittingReview(true);
      setReviewError(null);
      const updated = await api.reviewTaskVerification(selectedTask.id, {
        decision,
        feedback: reviewFeedback.trim() || undefined,
        acknowledgeStale,
      });
      setTaskVerification(updated);
      setReviewFeedback('');
      setAcknowledgeStale(false);
      setSelectedTask((prev) =>
        prev ? { ...prev, status: decision === 'APPROVED' ? 'DONE' : 'CHANGES_REQUESTED' } : null
      );
      await fetchTasks();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit human review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description || '');
    setEditTaskAcceptanceCriteria((task.acceptance_criteria || []).join('\n'));
    setEditTaskStatus(task.status);
    setEditTaskPriority(task.priority);
    setEditTaskEstimatedHours(task.estimated_hours ? String(task.estimated_hours) : '');
    setEditTaskParentId(task.parent_task_id || '');
    setEditTaskAssigneeId(task.assignee_id || '');
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

      const parsedCriteria = editTaskAcceptanceCriteria
        .split('\n')
        .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
        .filter(Boolean);

      await api.updateTask(editingTask.id, {
        title: editTaskTitle.trim(),
        description: editTaskDescription.trim() || null,
        acceptanceCriteria: parsedCriteria,
        status: editTaskStatus,
        priority: editTaskPriority,
        estimatedHours: hours || null,
        parentTaskId: editTaskParentId || null,
        assigneeId: editTaskAssigneeId || null,
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

  useEffect(() => {
    if (user && isAddMemberModalOpen) {
      setLoadingRegisteredUsers(true);
      api
        .getUsers({ all: true })
        .then((users) => setRegisteredUsers(users))
        .catch(() => {})
        .finally(() => setLoadingRegisteredUsers(false));
    }
  }, [user, isAddMemberModalOpen]);

  // Team Member Actions
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdentifier = newMemberIdentifier.trim();
    if (!cleanIdentifier) {
      setAddMemberError('Please select or enter a registered username or email');
      return;
    }

    try {
      setIsSubmittingMember(true);
      setAddMemberError(null);
      await api.addProjectMember(projectId, {
        username: cleanIdentifier,
        email: cleanIdentifier,
        role: newMemberRole,
      });

      setNewMemberIdentifier('');
      setNewMemberRole('MEMBER');
      setIsAddMemberModalOpen(false);
      await fetchMembers();
    } catch (err: any) {
      setAddMemberError(
        err.message || 'Failed to add project member. Ensure user is registered in Orkestr.'
      );
    } finally {
      setIsSubmittingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      setIsRemovingMember(true);
      setRemoveMemberError(null);
      await api.removeProjectMember(projectId, memberToRemove.user_id);
      setMemberToRemove(null);
      await fetchMembers();
      await fetchTasks();
    } catch (err: any) {
      setRemoveMemberError(err.message || 'Failed to remove project member');
    } finally {
      setIsRemovingMember(false);
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
      case 'CHANGES_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Changes Requested
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

  const currentMember = user ? members.find((m) => m.user_id === user.id) : null;
  const isOwner = currentMember?.role === 'OWNER';
  const isOwnerOrAdmin = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';
  const isMember = currentMember?.role === 'MEMBER';

  if (authLoading || (loadingProject && !project)) {
    return (
      <Card>
        <LoadingSpinner label="Loading project details..." />
      </Card>
    );
  }

  if (isForbidden) {
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
            <h2 className="text-base font-semibold text-rose-200">Access Denied</h2>
          </div>
          <p className="mt-2 text-xs text-rose-300">
            You are not an authorized member of this project and cannot access its resources.
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
          {isOwnerOrAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRepoActionError(null);
                setRepoActionSuccess(null);
                setIsRepoModalOpen(true);
              }}
            >
              <Github className="w-3.5 h-3.5 mr-1.5" />
              {projectRepo?.isConnected ? 'GitHub Repo' : 'Connect GitHub'}
            </Button>
          )}
          {isOwnerOrAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditProjectModalOpen(true)}
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Edit Project
            </Button>
          )}
          {isOwner && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteProjectModalOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Project
            </Button>
          )}
        </div>
      </div>

      {/* Project Header Banner */}
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-2xl font-bold text-slate-100">
                  {project.name}
                </CardTitle>
                <Badge variant="default" className="text-xs font-mono">
                  ACTIVE
                </Badge>
                {currentMember && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      isOwner
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        : isOwnerOrAdmin
                        ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    ROLE: {currentMember.role}
                  </span>
                )}
                {projectRepo?.isConnected ? (
                  <a
                    href={`https://github.com/${projectRepo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    <Github className="w-3 h-3 text-slate-300" />
                    <span>{projectRepo.fullName}</span>
                    <span className="text-slate-400 font-mono">({projectRepo.defaultBranch || 'main'})</span>
                    <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900/60 text-slate-400 border border-slate-800">
                    <Github className="w-3 h-3 text-slate-500" />
                    No GitHub Repo Connected
                  </span>
                )}
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
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-slate-500" />
              <span>
                <span className="text-slate-500">Repository: </span>
                {projectRepo?.isConnected ? (
                  <span className="font-mono text-slate-200">{projectRepo.fullName}</span>
                ) : (
                  <span className="text-slate-500">Not connected</span>
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WORKSPACE TABS */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        {/* Tab 1: Set Up Team */}
        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'members'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-amber-300" />
          <span>1. Set Up Team</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'members' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {members.length}
          </span>
        </button>

        {/* Tab 2: Add Tasks Manually */}
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'tasks'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5" />
          <span>2. Add Tasks Manually</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'tasks' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {tasks.length}
          </span>
        </button>

        {/* Tab 3: Add Tasks (AI Planner) */}
        <button
          onClick={() => setActiveTab('planner')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'planner'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
          <span>3. Add Tasks (AI Planner)</span>
        </button>

        {/* Tab 4: Task Distribution */}
        <button
          onClick={() => setActiveTab('distribution')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
            activeTab === 'distribution'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-emerald-300" />
          <span>4. Task Distribution</span>
        </button>
      </div>

      {/* TAB 1: Set Up Team */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center gap-2">
                  Project Team Members
                  <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {members.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Registered Orkestr contributors with authorized access to this project
                </p>
              </div>
            </div>

            {isOwnerOrAdmin && (
              <Button onClick={() => setIsAddMemberModalOpen(true)} size="sm">
                <UserPlus className="w-4 h-4 mr-1.5" />
                Add Member
              </Button>
            )}
          </div>

          {loadingMembers ? (
            <Card>
              <LoadingSpinner label="Loading team members..." />
            </Card>
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No team members"
              description="Add registered Orkestr contributors to this project to assign tasks and distribute work."
              action={
                isOwnerOrAdmin ? (
                  <Button onClick={() => setIsAddMemberModalOpen(true)} size="sm">
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Add Member
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {members.map((m) => {
                const isCurrent = user?.id === m.user_id;
                const isProjectOwner = m.role === 'OWNER';
                return (
                  <Card key={m.id} className="border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                          {m.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-100">
                              {m.user_name}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-medium">
                                You
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                m.role === 'OWNER'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : m.role === 'ADMIN'
                                  ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {m.role}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                            {m.user_username && (
                              <span className="font-mono text-indigo-400 text-[11px] font-medium">
                                @{m.user_username}
                              </span>
                            )}
                            {m.user_username && <span className="text-slate-600">•</span>}
                            <span className="text-slate-300">{m.user_email}</span>
                          </p>

                          {m.user_skills && m.user_skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {m.user_skills.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Teammate Work Completed Summary */}
                          {(() => {
                            const stat = memberWorkloadStats.find((s) => s.member.id === m.id);
                            if (!stat) return null;
                            return (
                              <div className="pt-2 border-t border-slate-800/60 mt-2 flex items-center gap-2.5 text-xs flex-wrap">
                                <span className="text-slate-400">Work Done:</span>
                                <span className="font-semibold text-slate-200">
                                  {stat.doneTasks} of {stat.totalTasks} task{stat.totalTasks !== 1 ? 's' : ''} completed
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-300 font-mono text-[11px]">
                                  {stat.doneHours}h done / {stat.totalHours}h assigned
                                </span>
                                {stat.totalTasks > 0 && (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded font-semibold border ml-auto ${
                                      stat.progressPct === 100
                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                        : stat.doneTasks > 0
                                        ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}
                                  >
                                    {stat.progressPct === 100 ? '🎉 100% Done' : `${stat.progressPct}% Completed`}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {isOwnerOrAdmin && !isProjectOwner && !isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMemberToRemove(m);
                            setRemoveMemberError(null);
                          }}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 shrink-0"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Add Tasks Manually */}
      {activeTab === 'tasks' && (
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

          <div className="flex items-center gap-2">
            {isOwnerOrAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddMemberModalOpen(true)}
                  className="border-slate-700 text-slate-300 hover:text-white"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Add Teammate
                </Button>
                <Button onClick={() => setIsCreateTaskModalOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Task
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Teammate Work Done Breakdown Section */}
        {members.length > 0 && tasks.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/60 p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Teammate Work Progress & Contribution
                </h3>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-3">
                <span>
                  <strong className="text-emerald-400">{tasks.filter((t) => t.status === 'DONE').length}</strong> of{' '}
                  <strong className="text-slate-200">{tasks.length}</strong> tasks completed
                </span>
                <span>•</span>
                <span>
                  <strong className="text-indigo-400">
                    {Math.round(
                      tasks.length > 0
                        ? (tasks.filter((t) => t.status === 'DONE').length / tasks.length) * 100
                        : 0
                    )}%
                  </strong>{' '}
                  project done
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {memberWorkloadStats.map((stat) => (
                <div
                  key={stat.member.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                        {stat.member.user_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {stat.member.user_name}
                        </div>
                        <div className="text-[11px] text-indigo-400 font-mono truncate">
                          @{stat.member.user_username || 'member'}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                        stat.progressPct === 100 && stat.totalTasks > 0
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : stat.doneTasks > 0
                          ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700'
                      }`}
                    >
                      {stat.totalTasks === 0
                        ? 'No tasks'
                        : stat.progressPct === 100
                        ? '🎉 100% Done'
                        : `${stat.progressPct}% Done`}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Work Done:</span>
                      <span className="font-semibold text-slate-200">
                        {stat.doneTasks} of {stat.totalTasks} task{stat.totalTasks !== 1 ? 's' : ''}{' '}
                        <span className="text-slate-400 font-normal">
                          ({stat.doneHours}h / {stat.totalHours}h)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          stat.progressPct === 100
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                        }`}
                        style={{ width: `${stat.progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Breakdown Pills */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-900 text-center">
                    <div className="rounded bg-slate-900/60 p-1">
                      <div className="text-[10px] text-slate-400">To-Do</div>
                      <div className="text-xs font-bold text-slate-200">{stat.todoTasks}</div>
                    </div>
                    <div className="rounded bg-indigo-950/30 p-1 border border-indigo-500/10">
                      <div className="text-[10px] text-indigo-300">Active</div>
                      <div className="text-xs font-bold text-indigo-200">{stat.inProgressTasks}</div>
                    </div>
                    <div className="rounded bg-emerald-950/30 p-1 border border-emerald-500/10">
                      <div className="text-[10px] text-emerald-300">Done</div>
                      <div className="text-xs font-bold text-emerald-200">{stat.doneTasks}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

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
              ) : isOwnerOrAdmin ? (
                <Button onClick={() => setIsCreateTaskModalOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add First Task
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const canUpdateStatus = isOwnerOrAdmin || (task.assignee_id !== null && task.assignee_id === user?.id);

              return (
                <Card
                  key={task.id}
                  className="hover:border-slate-700 bg-slate-900/60 transition-all group p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Status indicator badge */}
                        {task.status === 'TODO' && canUpdateStatus ? (
                          <button
                            onClick={() => handleQuickStatusChange(task.id, 'IN_PROGRESS')}
                            title="Start working on this task"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            {getStatusBadge(task.status)}
                          </button>
                        ) : task.status === 'CHANGES_REQUESTED' && canUpdateStatus ? (
                          <button
                            onClick={() => handleQuickStatusChange(task.id, 'IN_PROGRESS')}
                            title="Resume working on this task"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            {getStatusBadge(task.status)}
                          </button>
                        ) : (
                          <span
                            onClick={() => handleOpenTaskDetails(task.id)}
                            title={`Task Status: ${task.status}. Click to view details and verification report.`}
                            className="cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            {getStatusBadge(task.status)}
                          </span>
                        )}

                        {task.task_number ? (
                          <span
                            onClick={() => handleOpenTaskDetails(task.id)}
                            className="inline-flex items-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 cursor-pointer shrink-0 transition-colors shadow-sm"
                            title={`Task Key: ORK-${task.task_number}`}
                          >
                            ORK-{task.task_number}
                          </span>
                        ) : null}

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
                        {task.assignee_id ? (
                          <div className="flex items-center gap-1.5">
                            {task.assignee_id === user?.id ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                <User className="w-2.5 h-2.5" />
                                Assigned to You
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                                <User className="w-2.5 h-2.5 text-indigo-400" />
                                {task.assignee_name || 'Assigned'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                              Unassigned
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClaimTask(task.id);
                              }}
                              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-0.5"
                              title="Claim this task for yourself"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Claim Task
                            </button>
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
                      {isOwnerOrAdmin && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* TAB 3: AI Execution Planning Engine */}
      {activeTab === 'planner' && (
        <div className="space-y-4">
          {isOwnerOrAdmin ? (
            <AiPlanner
              projectId={projectId}
              project={project}
              onPlanApplied={() => {
                fetchTasks();
                fetchProject();
              }}
            />
          ) : (
            <Card className="border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">AI Project Planning Engine</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    AI execution plan generation and application are restricted to Project Owners and Admins.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: Task Distribution Engine */}
      {activeTab === 'distribution' && (
        <div className="space-y-4">
          {isOwnerOrAdmin ? (
            <TaskDistributionWorkbench
              projectId={projectId}
              tasksCount={tasks.length}
              onDistributionApplied={() => {
                fetchTasks();
                fetchProject();
              }}
            />
          ) : (
            <Card className="border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Task Distribution Workbench</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automated task distribution is restricted to Project Owners and Admins.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}



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
            placeholder="Describe deliverables, technical requirements, or context..."
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            rows={2}
          />

          <Textarea
            label="Structured Acceptance Criteria (Optional, one per line)"
            placeholder="e.g.&#10;Verify code changes against task requirements&#10;Unit tests pass with zero regressions"
            value={taskAcceptanceCriteria}
            onChange={(e) => setTaskAcceptanceCriteria(e.target.value)}
            rows={2}
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
                <option value="CHANGES_REQUESTED">Changes Requested</option>
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
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Assignee (Optional)
              </label>
              {user && (
                <button
                  type="button"
                  onClick={() => setTaskAssigneeId(user.id)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                >
                  Assign to me
                </button>
              )}
            </div>
            <select
              value={taskAssigneeId}
              onChange={(e) => setTaskAssigneeId(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_name} ({m.user_email}) {user?.id === m.user_id ? '— You' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Only registered members of this project can be assigned.
            </p>
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
        title={selectedTask ? (selectedTask.task_number ? `[ORK-${selectedTask.task_number}] ${selectedTask.title}` : selectedTask.title) : 'Task Details'}
        description={selectedTask ? (selectedTask.task_number ? `Key: ORK-${selectedTask.task_number} • ID: ${selectedTask.id}` : `ID: ${selectedTask.id}`) : ''}
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
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedTask.task_number ? (
                    <span className="inline-flex items-center text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 shadow-sm">
                      ORK-{selectedTask.task_number}
                    </span>
                  ) : null}
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

              {selectedTask.acceptance_criteria && selectedTask.acceptance_criteria.length > 0 && (
                <div className="pt-2 border-t border-slate-900 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Acceptance Criteria:
                  </span>
                  <ul className="space-y-1 pl-1">
                    {selectedTask.acceptance_criteria.map((c, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                        <span className="text-indigo-400 font-mono text-[11px] font-semibold mt-0.5">{idx + 1}.</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-900 text-xs">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">
                  Assignee:{' '}
                  {selectedTask.assignee_name ? (
                    <span className="font-semibold text-slate-200">
                      {selectedTask.assignee_name} {user?.id === selectedTask.assignee_id ? '(You)' : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Unassigned</span>
                  )}
                </span>
              </div>
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
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => handleRemoveDependency(dep.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                            title="Remove dependency"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Dependency Form - Owners & Admins only */}
                {isOwnerOrAdmin && (
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
                            {t.task_number ? `[ORK-${t.task_number}] ` : ''}{t.title} ({t.status})
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
                )}
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

            {/* AI CODE VERIFICATION SECTION */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    AI Task Verification
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={taskVerification ? 'outline' : 'primary'}
                    onClick={handleTriggerVerification}
                    disabled={isVerifying || isLoadingVerification}
                    className="h-7 text-xs px-2.5"
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        Verifying Diff...
                      </>
                    ) : taskVerification ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Re-verify
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1 text-indigo-400" />
                        Verify with AI
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Verification In Progress Banner */}
              {isVerifying && (
                <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-3">
                  <LoadingSpinner size="sm" />
                  <div className="text-xs">
                    <p className="font-medium text-indigo-200">Evaluating Code Changes with Gemini...</p>
                    <p className="text-indigo-400/80 text-[11px]">
                      Retrieving commit diffs, fact-checking citations against criteria, and assessing regressions.
                    </p>
                  </div>
                </div>
              )}

              {/* Verification Error */}
              {verificationError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-200">Verification Error</p>
                    <p className="text-[11px] text-rose-300/90">{verificationError}</p>
                  </div>
                </div>
              )}

              {/* Verification Report Card */}
              {isLoadingVerification ? (
                <div className="p-4 text-center">
                  <LoadingSpinner label="Loading verification report..." />
                </div>
              ) : taskVerification ? (
                <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3.5 space-y-3.5">
                  {/* Stale Warning Banner */}
                  {taskVerification.is_stale && (
                    <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-200">Report Outdated</p>
                          <p className="text-[11px] text-amber-300/80">
                            New GitHub activity has been pushed since this verification was performed. Re-run verification to analyze latest commits.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleTriggerVerification}
                        disabled={isVerifying}
                        className="h-6 text-[11px] px-2 shrink-0 border border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                      >
                        Re-verify
                      </Button>
                    </div>
                  )}

                  {/* Verdict & Confidence Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {taskVerification.overall_verdict === 'SATISFIED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          SATISFIED
                        </span>
                      )}
                      {taskVerification.overall_verdict === 'PARTIALLY_SATISFIED' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          PARTIALLY SATISFIED
                        </span>
                      )}
                      {taskVerification.overall_verdict === 'UNMET' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                          UNMET
                        </span>
                      )}
                      {taskVerification.overall_verdict === 'INSUFFICIENT_EVIDENCE' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 shadow-sm">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                          INSUFFICIENT EVIDENCE
                        </span>
                      )}
                      {taskVerification.overall_verdict === 'ERROR' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 shadow-sm">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          ERROR
                        </span>
                      )}

                      {taskVerification.confidence_score !== null && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {Math.round(taskVerification.confidence_score * 100)}% Confidence
                        </span>
                      )}
                    </div>

                    {taskVerification.diff_stats && (
                      <div className="text-[11px] font-mono text-slate-400">
                        {taskVerification.diff_stats.totalFiles ?? 0} files inspected (
                        <span className="text-emerald-400">+{taskVerification.diff_stats.additions ?? 0}</span> /{' '}
                        <span className="text-rose-400">-{taskVerification.diff_stats.deletions ?? 0}</span>)
                      </div>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
                    <p className="font-semibold text-slate-200 mb-1 text-[11px] uppercase tracking-wider text-slate-400">
                      Summary:
                    </p>
                    {taskVerification.summary}
                  </div>

                  {/* Recommendation */}
                  {taskVerification.recommendation && (
                    <div className="p-2.5 rounded bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-300">
                      <p className="font-semibold text-indigo-200 mb-0.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" /> Reviewer Recommendation:
                      </p>
                      <p className="text-[11px] text-indigo-300/90">{taskVerification.recommendation}</p>
                    </div>
                  )}

                  {/* Section Tabs: Criteria Checklist, Inspected Files, Gaps & Risks */}
                  <div className="space-y-2">
                    <div className="flex border-b border-slate-800 gap-2">
                      <button
                        type="button"
                        onClick={() => setVerificationActiveTab('criteria')}
                        className={`text-xs pb-1.5 px-2 font-medium border-b-2 transition-colors ${
                          verificationActiveTab === 'criteria'
                            ? 'border-indigo-500 text-indigo-300'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Requirements Coverage ({taskVerification.requirements_coverage?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerificationActiveTab('files')}
                        className={`text-xs pb-1.5 px-2 font-medium border-b-2 transition-colors ${
                          verificationActiveTab === 'files'
                            ? 'border-indigo-500 text-indigo-300'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Inspected Files ({taskVerification.inspected_files?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerificationActiveTab('risks')}
                        className={`text-xs pb-1.5 px-2 font-medium border-b-2 transition-colors ${
                          verificationActiveTab === 'risks'
                            ? 'border-indigo-500 text-indigo-300'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Gaps & Limitations
                      </button>
                    </div>

                    {/* TAB 1: Criteria Checklist */}
                    {verificationActiveTab === 'criteria' && (
                      <div className="space-y-2 pt-1 max-h-60 overflow-y-auto pr-1">
                        {!taskVerification.requirements_coverage ||
                        taskVerification.requirements_coverage.length === 0 ? (
                          <p className="text-xs text-slate-500 italic p-2">
                            No discrete criteria evaluated in this report.
                          </p>
                        ) : (
                          taskVerification.requirements_coverage.map((req, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded bg-slate-900/70 border border-slate-800 text-xs space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                  <span className="text-indigo-400 font-mono text-[11px]">{idx + 1}.</span>
                                  {req.requirement}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                    req.status === 'SATISFIED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : req.status === 'PARTIALLY_SATISFIED'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : req.status === 'UNMET'
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </div>
                              <p className="text-slate-300 text-[11px]">{req.explanation}</p>
                              {req.evidence && req.evidence.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-slate-800/80">
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Evidence Anchors:
                                  </span>
                                  {req.evidence.map((ev, eIdx) => (
                                    <div
                                      key={eIdx}
                                      className="text-[11px] font-mono p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300"
                                    >
                                      {ev}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB 2: Inspected Files */}
                    {verificationActiveTab === 'files' && (
                      <div className="space-y-2 pt-1 max-h-60 overflow-y-auto pr-1">
                        {!taskVerification.inspected_files ||
                        taskVerification.inspected_files.length === 0 ? (
                          <p className="text-xs text-slate-500 italic p-2">
                            No files were inspected for this verification.
                          </p>
                        ) : (
                          taskVerification.inspected_files.map((f, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded bg-slate-900/70 border border-slate-800 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-indigo-300 font-medium truncate">
                                  {f.filePath}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                    {f.changeType}
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                    {f.relevance}
                                  </span>
                                </div>
                              </div>
                              <p className="text-slate-400 text-[11px]">{f.summary}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB 3: Gaps & Risks */}
                    {verificationActiveTab === 'risks' && (
                      <div className="space-y-3 pt-1 max-h-60 overflow-y-auto pr-1 text-xs">
                        {taskVerification.gaps_and_risks?.missingRequirements?.length > 0 && (
                          <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20 space-y-1">
                            <span className="font-semibold text-rose-300 text-[11px] uppercase tracking-wider">
                              Missing Requirements:
                            </span>
                            <ul className="list-disc list-inside text-rose-200/90 text-[11px] space-y-0.5">
                              {taskVerification.gaps_and_risks.missingRequirements.map((m, idx) => (
                                <li key={idx}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {taskVerification.gaps_and_risks?.potentialRegressionsOrSecurity?.length > 0 && (
                          <div className="p-2.5 rounded bg-amber-950/20 border border-amber-500/20 space-y-1">
                            <span className="font-semibold text-amber-300 text-[11px] uppercase tracking-wider">
                              Regressions & Security Concerns:
                            </span>
                            <ul className="list-disc list-inside text-amber-200/90 text-[11px] space-y-0.5">
                              {taskVerification.gaps_and_risks.potentialRegressionsOrSecurity.map((r, idx) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {taskVerification.gaps_and_risks?.areasRequiringTesting?.length > 0 && (
                          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1">
                            <span className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
                              Testing Required:
                            </span>
                            <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-0.5">
                              {taskVerification.gaps_and_risks.areasRequiringTesting.map((t, idx) => (
                                <li key={idx}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {taskVerification.limitations && (
                          <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-300">Diff Limitations:</span>{' '}
                            {taskVerification.limitations}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Disclaimer Note */}
                  <div className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-900 flex items-center justify-between">
                    <span>
                      Verified: {new Date(taskVerification.created_at).toLocaleString()}
                      {taskVerification.triggered_by_name ? ` by ${taskVerification.triggered_by_name}` : ''}
                    </span>
                    <span>Inspection only — does not prove executed tests.</span>
                  </div>

                  {/* HUMAN REVIEW SECTION (For Project Owner & Admin) */}
                  {isOwnerOrAdmin && (
                    <div className="pt-3 border-t border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                          Human Review Decision
                        </span>
                        {taskVerification.review_decision && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                              taskVerification.review_decision === 'APPROVED'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {taskVerification.review_decision}
                          </span>
                        )}
                      </div>

                      {taskVerification.review_decision && (
                        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
                          <p className="text-[11px] text-slate-400">
                            Decision recorded by{' '}
                            <span className="font-semibold text-slate-200">
                              {taskVerification.reviewer_name || 'Reviewer'}
                            </span>{' '}
                            on {taskVerification.reviewed_at ? new Date(taskVerification.reviewed_at).toLocaleString() : ''}
                          </p>
                          {taskVerification.review_feedback && (
                            <p className="text-slate-300 italic text-[11px] pt-1 border-t border-slate-800">
                              &ldquo;{taskVerification.review_feedback}&rdquo;
                            </p>
                          )}
                        </div>
                      )}

                      {/* Review Action Form */}
                      <div className="space-y-2">
                        <Textarea
                          label="Reviewer Feedback (Optional)"
                          placeholder="Provide guidance, change requests, or notes for approval..."
                          value={reviewFeedback}
                          onChange={(e) => setReviewFeedback(e.target.value)}
                          rows={2}
                        />

                        {taskVerification.is_stale && (
                          <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer p-2 rounded bg-amber-500/10 border border-amber-500/20">
                            <input
                              type="checkbox"
                              checked={acknowledgeStale}
                              onChange={(e) => setAcknowledgeStale(e.target.checked)}
                              className="rounded border-amber-500 text-indigo-600 focus:ring-amber-500"
                            />
                            <span>I acknowledge reviewing this prior revision despite newer code changes.</span>
                          </label>
                        )}

                        {reviewError && (
                          <p className="text-xs text-rose-400 font-medium">{reviewError}</p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleSubmitReview('CHANGES_REQUESTED')}
                            disabled={isSubmittingReview || isVerifying}
                            className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                            Request Changes
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSubmitReview('APPROVED')}
                            disabled={isSubmittingReview || isVerifying || (taskVerification.is_stale && !acknowledgeStale)}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                            Approve (Mark Done)
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-slate-950/40 border border-slate-800 text-xs text-slate-400 space-y-2">
                  <p className="text-slate-300 font-medium">No verification performed yet.</p>
                  <p className="text-[11px] text-slate-400">
                    Verify actual code changes against task requirements before merging or completing the work. Gemini will evaluate commits and pull requests, check acceptance criteria, and cite concrete file diffs.
                  </p>
                </div>
              )}
            </div>

            {/* GITHUB ACTIVITY SECTION */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Github className="w-3.5 h-3.5 text-indigo-400" />
                  GitHub Activity
                </h4>
                {selectedTask.task_number && (
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    Key: ORK-{selectedTask.task_number}
                  </span>
                )}
              </div>

              {isLoadingTaskActivities ? (
                <div className="flex items-center justify-center p-4">
                  <LoadingSpinner label="Loading GitHub activity..." />
                </div>
              ) : taskActivities.length === 0 ? (
                <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 space-y-1">
                  <p className="text-slate-300 font-medium">No GitHub activity linked yet.</p>
                  <p className="text-[11px] text-slate-500">
                    Reference <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono">ORK-{selectedTask.task_number || 'X'}</code> in your branch name (e.g. <span className="font-mono text-slate-400">feature/ORK-{selectedTask.task_number || 'X'}-desc</span>) or commit message (e.g. <span className="font-mono text-slate-400">feat(ORK-{selectedTask.task_number || 'X'}): ...</span>) to link commits and PRs.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {taskActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {act.activityType === 'COMMIT' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                              <GitCommit className="w-3 h-3" /> Commit
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                              <GitPullRequest className="w-3 h-3" /> PR #{act.githubIdentifier}
                            </span>
                          )}
                          {act.branch && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded truncate max-w-[180px]">
                              {act.branch}
                            </span>
                          )}
                        </div>

                        {act.githubUrl && (
                          <a
                            href={act.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono transition-colors"
                          >
                            <span>{act.activityType === 'COMMIT' ? act.githubIdentifier.substring(0, 7) : `#${act.githubIdentifier}`}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <p className="text-slate-200 font-medium line-clamp-2">
                        {act.title}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                        <span>
                          By{' '}
                          {act.authorName ? (
                            <span className="text-slate-300 font-semibold">
                              {act.authorName} {act.authorGithubUsername ? `(@${act.authorGithubUsername})` : ''}
                            </span>
                          ) : act.authorGithubUsername ? (
                            <span className="text-slate-400 font-mono">@{act.authorGithubUsername}</span>
                          ) : (
                            <span className="italic">Unknown</span>
                          )}
                        </span>
                        <span>{new Date(act.githubCreatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              {isOwnerOrAdmin && (
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
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsTaskDetailsModalOpen(false)}
                className={!isOwnerOrAdmin ? 'ml-auto' : ''}
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
            rows={2}
          />

          <Textarea
            label="Structured Acceptance Criteria (Optional, one per line)"
            placeholder="e.g.&#10;Verify code changes against task requirements&#10;Unit tests pass with zero regressions"
            value={editTaskAcceptanceCriteria}
            onChange={(e) => setEditTaskAcceptanceCriteria(e.target.value)}
            rows={2}
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
                <option value="CHANGES_REQUESTED">Changes Requested</option>
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
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Assignee
            </label>
            <select
              value={editTaskAssigneeId}
              onChange={(e) => setEditTaskAssigneeId(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_name} ({m.user_email}) {user?.id === m.user_id ? '— You' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Only registered members of this project can be assigned.
            </p>
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

      {/* ADD MEMBER MODAL */}
      <Modal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        title="Add Project Member"
        description="Add a registered Orkestr teammate to collaborate on this project."
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {addMemberError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {addMemberError}
            </div>
          )}

          <div>
            <Input
              label="Registered Username or Email"
              placeholder="e.g. aryan, navya, or user@example.com"
              value={newMemberIdentifier}
              onChange={(e) => setNewMemberIdentifier(e.target.value)}
              helperText="Only teammates with active registered Orkestr accounts can be added"
              list="registered-teammates-datalist"
              required
              autoFocus
            />
            {registeredUsers.length > 0 && (
              <datalist id="registered-teammates-datalist">
                {registeredUsers
                  .filter((u) => !members.some((m) => m.user_id === u.id))
                  .map((c) => (
                    <option key={c.id} value={c.username}>
                      {c.name} ({c.email})
                    </option>
                  ))}
              </datalist>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Project Role
            </label>
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value as 'MEMBER' | 'ADMIN')}
              className="w-full h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="MEMBER">Member (Can view and update assigned tasks)</option>
              <option value="ADMIN">Admin (Can manage tasks, members, and AI planner)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddMemberModalOpen(false)}
              disabled={isSubmittingMember}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmittingMember}>
              Add to Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* REMOVE MEMBER MODAL */}
      <Modal
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        title="Remove Team Member"
        description="Are you sure you want to remove this member from the project?"
      >
        <div className="space-y-4">
          {removeMemberError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {removeMemberError}
            </div>
          )}
          <p className="text-xs text-slate-300 leading-relaxed">
            Removing <span className="font-semibold text-slate-100">{memberToRemove?.user_name}</span> will revoke their access to this project. Any tasks currently assigned to them will become unassigned.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMemberToRemove(null)}
              disabled={isRemovingMember}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleRemoveMember}
              isLoading={isRemovingMember}
            >
              Remove Member
            </Button>
          </div>
        </div>
      </Modal>

      {/* GITHUB REPOSITORY CONNECTION MODAL */}
      <Modal
        isOpen={isRepoModalOpen}
        onClose={() => {
          setIsRepoModalOpen(false);
          setRepoActionError(null);
          setRepoActionSuccess(null);
        }}
        title="GitHub Repository Connection"
        description="Link a GitHub repository to enable commit tracking, pull request verification, and AI code checks."
      >
        <div className="space-y-4">
          {repoActionSuccess && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{repoActionSuccess}</span>
            </div>
          )}

          {repoActionError && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{repoActionError}</span>
            </div>
          )}

          {projectRepo?.isConnected ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Github className="w-5 h-5 text-slate-200" />
                    <span className="font-semibold text-slate-100 text-sm">{projectRepo.fullName}</span>
                  </div>
                  <Badge variant="success" className="text-xs">Connected</Badge>
                </div>
                <div className="text-xs text-slate-400 space-y-1 pt-1">
                  <p>Default branch: <span className="font-mono text-slate-200">{projectRepo.defaultBranch}</span></p>
                  {projectRepo.installationId && (
                    <p>App Installation ID: <span className="font-mono text-slate-200">{projectRepo.installationId}</span></p>
                  )}
                  {projectRepo.connectedAt && (
                    <p>Connected on {new Date(projectRepo.connectedAt).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="pt-2">
                  <a
                    href={`https://github.com/${projectRepo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Open on GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {isOwnerOrAdmin && (
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRepoModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleDisconnectRepo}
                    isLoading={isDisconnectingRepo}
                  >
                    Disconnect Repository
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleConnectRepo} className="space-y-4">
              {!projectRepo?.isConfigured && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300 space-y-1">
                  <p className="font-medium text-amber-200">GitHub App Setup Required on Server</p>
                  <p className="text-slate-400">
                    GitHub App credentials are not configured in <code className="font-mono text-slate-300">backend/.env</code>. You can specify repository coordinates now for project records, or configure the GitHub App for automatic repository verification.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">
                      Repository Owner <span className="text-rose-400">*</span>
                    </label>
                    {user?.github_username && (
                      <button
                        type="button"
                        onClick={() => setRepoOwnerInput(user.github_username!)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                      >
                        Use @{user.github_username}
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="e.g. facebook or paste github.com/owner/repo"
                    value={repoOwnerInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes('/') || val.includes('github.com')) {
                        const cleanUrl = val
                          .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
                          .replace(/\.git$/i, '')
                          .replace(/^\/+|\/+$/g, '');
                        const parts = cleanUrl.split('/');
                        if (parts.length >= 2) {
                          setRepoOwnerInput(parts[0]);
                          setRepoNameInput(parts[1]);
                          return;
                        }
                      }
                      setRepoOwnerInput(val);
                    }}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">
                    Repository Name <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    placeholder="e.g. react or WebForge"
                    value={repoNameInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes('/') || val.includes('github.com')) {
                        const cleanUrl = val
                          .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
                          .replace(/\.git$/i, '')
                          .replace(/^\/+|\/+$/g, '');
                        const parts = cleanUrl.split('/');
                        if (parts.length >= 2) {
                          if (!repoOwnerInput) setRepoOwnerInput(parts[0]);
                          setRepoNameInput(parts[1]);
                          return;
                        }
                      }
                      setRepoNameInput(val);
                    }}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Default Branch</label>
                  <Input
                    placeholder="main"
                    value={repoDefaultBranchInput}
                    onChange={(e) => setRepoDefaultBranchInput(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">
                      Installation ID <span className="text-slate-500">(Optional)</span>
                    </label>
                    <a
                      href="https://github.com/settings/installations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline inline-flex items-center"
                    >
                      GitHub Apps ↗
                    </a>
                  </div>
                  <Input
                    placeholder="e.g. 12345678 or paste installation URL"
                    value={repoInstallationIdInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes('github.com') || val.includes('/')) {
                        const match = val.match(/(\d+)\/?$/);
                        if (match) {
                          setRepoInstallationIdInput(match[1]);
                          return;
                        }
                      }
                      setRepoInstallationIdInput(val);
                    }}
                  />
                  <p className="text-[10px] text-slate-500">
                    Find in GitHub Settings &gt; Installed GitHub Apps URL (e.g. settings/installations/<strong>12345678</strong>).
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRepoModalOpen(false)}
                  disabled={isConnectingRepo}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isConnectingRepo}>
                  <Github className="w-3.5 h-3.5 mr-1.5" />
                  Connect Repository
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
