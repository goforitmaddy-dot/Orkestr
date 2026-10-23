'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { PersonalTask, Project, TaskStatus, TaskPriority, TaskVerification, ReviewDecision } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
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
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  GitBranch,
  AlertTriangle,
  User,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Search,
  RotateCcw,
  Check,
  Briefcase,
  ChevronRight,
  TrendingUp,
  Play,
  ShieldCheck,
  FileText,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Core Data State
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<PersonalTask[]>([]);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [taskScope, setTaskScope] = useState<'assigned' | 'all' | 'unassigned'>('assigned');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick Status Update State
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');

  // Task Details Modal State
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [modalTab, setModalTab] = useState<'details' | 'verification'>('details');
  const [verificationSubTab, setVerificationSubTab] = useState<'criteria' | 'files' | 'risks'>('criteria');
  const [taskVerification, setTaskVerification] = useState<TaskVerification | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [acknowledgeStale, setAcknowledgeStale] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Create Project Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [projectFormError, setProjectFormError] = useState<string | null>(null);

  // Fetch Dashboard Data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [userAssigned, scopedData, unassignedData, userProjects] = await Promise.all([
        api.getMyTasks('assigned'),
        taskScope === 'assigned' ? Promise.resolve(null) : api.getMyTasks(taskScope),
        api.getMyTasks('unassigned'),
        api.getProjects(),
      ]);
      setAssignedTasks(userAssigned);
      setTasks(scopedData || userAssigned);
      setUnassignedCount(unassignedData.length);
      setProjects(userProjects);
    } catch (err: any) {
      setError(err.message || 'Failed to load personal dashboard data');
    } finally {
      setLoading(false);
    }
  }, [taskScope]);

  // Authentication Guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, fetchDashboardData]);

  // Quick Task Status Change
  const handleQuickStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      setUpdatingTaskId(taskId);
      setStatusUpdateError(null);

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      await api.updateTask(taskId, { status: newStatus });

      // Refresh to ensure server-side dependency recalculations (e.g. unblocking) sync cleanly
      await fetchDashboardData();
    } catch (err: any) {
      setStatusUpdateError(err.message || 'Failed to update task status');
      await fetchDashboardData().catch(() => null);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Claim unassigned task for current user
  const handleClaimTask = async (taskId: string) => {
    if (!user) return;
    try {
      setUpdatingTaskId(taskId);
      setStatusUpdateError(null);
      await api.updateTask(taskId, { assigneeId: user.id });
      await fetchDashboardData();
    } catch (err: any) {
      setStatusUpdateError(err.message || 'Failed to claim task');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Submit task for AI Verification
  const handleSubmitVerification = async (taskId: string) => {
    try {
      setSubmittingTaskId(taskId);
      setStatusUpdateError(null);
      const report = await api.verifyTask(taskId);
      if (selectedTask?.id === taskId) {
        setTaskVerification(report);
      }
      await fetchDashboardData();
    } catch (err: any) {
      setStatusUpdateError(err.message || 'Failed to submit task for verification');
    } finally {
      setSubmittingTaskId(null);
    }
  };

  // Submit Human Review (Owner / Admin)
  const handleSubmitReview = async (decision: ReviewDecision) => {
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
      setSelectedTask((prev) => (prev ? { ...prev, status: decision === 'APPROVED' ? 'DONE' : 'CHANGES_REQUESTED' } : null));
      await fetchDashboardData();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Fetch Verification Report when Selected Task changes
  useEffect(() => {
    if (selectedTask) {
      setLoadingVerification(true);
      setReviewError(null);
      setReviewFeedback('');
      setAcknowledgeStale(false);
      api
        .getTaskVerification(selectedTask.id)
        .then((v) => {
          setTaskVerification(v);
        })
        .catch(() => {
          setTaskVerification(null);
        })
        .finally(() => {
          setLoadingVerification(false);
        });
    } else {
      setTaskVerification(null);
      setModalTab('details');
      setVerificationSubTab('criteria');
    }
  }, [selectedTask]);

  // Create Project Action
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setProjectFormError('Project name is required');
      return;
    }

    try {
      setIsSubmittingProject(true);
      setProjectFormError(null);
      await api.createProject({
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
      });

      setProjectName('');
      setProjectDescription('');
      setIsProjectModalOpen(false);
      await fetchDashboardData();
    } catch (err: any) {
      setProjectFormError(err.message || 'Failed to create project');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  // Metric Calculations based on personal assigned work
  // 1. Active: In Progress & To Do
  const activeTasks = useMemo(
    () => assignedTasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS'),
    [assignedTasks]
  );
  const inProgressCount = useMemo(
    () => assignedTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    [assignedTasks]
  );
  const todoCount = useMemo(
    () => assignedTasks.filter((t) => t.status === 'TODO').length,
    [assignedTasks]
  );

  // 2. In Review
  const inReviewTasks = useMemo(
    () => assignedTasks.filter((t) => t.status === 'IN_REVIEW'),
    [assignedTasks]
  );

  // 3. Completed
  const completedTasks = useMemo(
    () => assignedTasks.filter((t) => t.status === 'DONE'),
    [assignedTasks]
  );

  // 4. Remaining Effort: sum of estimated_hours for all unfinished tasks (status !== 'DONE')
  const unfinishedTasks = useMemo(
    () => assignedTasks.filter((t) => t.status !== 'DONE'),
    [assignedTasks]
  );
  const remainingHours = useMemo(() => {
    return unfinishedTasks.reduce(
      (sum, t) => sum + (typeof t.estimated_hours === 'number' ? t.estimated_hours : 0),
      0
    );
  }, [unfinishedTasks]);

  // Filtered Tasks for Section B
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Search Query
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(queryLower);
        const matchesProject = task.project_name.toLowerCase().includes(queryLower);
        const matchesDesc = (task.description || '').toLowerCase().includes(queryLower);
        if (!matchesTitle && !matchesProject && !matchesDesc) return false;
      }

      // Status Filter
      if (statusFilter !== 'ALL' && task.status !== statusFilter) {
        return false;
      }

      // Priority Filter
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) {
        return false;
      }

      // Project Filter
      if (projectFilter !== 'ALL' && task.project_id !== projectFilter) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter, projectFilter]);

  // Status Badge Component
  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'TODO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Circle className="w-3 h-3 text-slate-400" />
            To Do
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Clock3 className="w-3 h-3 text-indigo-400" />
            In Progress
          </span>
        );
      case 'IN_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Eye className="w-3 h-3 text-amber-400" />
            In Review
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Changes Requested
          </span>
        );
      case 'DONE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Done
          </span>
        );
    }
  };

  // Priority Badge Component
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
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400 animate-pulse">
            URGENT
          </span>
        );
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

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner label="Resolving developer session..." />
      </div>
    );
  }

  const weeklyCapacity = user.weekly_capacity_hours || 40;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Welcome back, {user.name}
            </h1>
            {user.username && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-700/50 text-indigo-300">
                @{user.username}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
              <User className="w-3 h-3 text-indigo-400" />
              {user.email}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Personal Developer Dashboard. Track deliverables, update statuses, and monitor cross-project work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            isLoading={loading}
            title="Refresh dashboard"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Sync
          </Button>
          <Button onClick={() => setIsProjectModalOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Project
          </Button>
        </div>
      </div>

      {/* Global Error Notice if API load failed */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-rose-200">Unable to load dashboard data</p>
              <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            className="text-xs border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Status Update Error Notice */}
      {statusUpdateError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{statusUpdateError}</span>
          </div>
          <button
            onClick={() => setStatusUpdateError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION A: Real Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Tasks */}
        <Card className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Active Tasks
            </CardTitle>
            <Clock3 className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">
              {loading ? '—' : activeTasks.length}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>{inProgressCount} in progress</span>
              <span>•</span>
              <span>{todoCount} to do</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Tasks in Review */}
        <Card className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              In Review
            </CardTitle>
            <Eye className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">
              {loading ? '—' : inReviewTasks.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Awaiting verification or code review
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Completed Tasks */}
        <Card className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Completed
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">
              {loading ? '—' : completedTasks.length}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Shipped and verified tasks
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Estimated Remaining Effort */}
        <Card className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Remaining Effort
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">
              {loading ? '—' : `${remainingHours.toFixed(1)}h`}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Across {unfinishedTasks.length} unfinished tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SECTION D: Workload & Contribution Context */}
      <Card className="border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Workload & Contribution Summary
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Total estimated effort currently assigned across your active initiatives is{' '}
              <span className="font-semibold text-slate-200">{remainingHours.toFixed(1)} hours</span> across{' '}
              <span className="font-semibold text-slate-200">{unfinishedTasks.length} active tasks</span>.
              Orkestr tracks total effort and completed tasks to recognize high contributors.
            </p>
          </div>

          <div className="flex items-center gap-6 self-start md:self-center shrink-0 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
            <div>
              <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                Completed Work
              </div>
              <div className="text-base font-bold text-emerald-400">
                {completedTasks.length} <span className="text-xs font-normal text-slate-400">tasks done</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                Active Backlog
              </div>
              <div className="text-base font-bold text-indigo-400">
                {unfinishedTasks.length} <span className="text-xs font-normal text-slate-400">tasks</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION B & E: My Tasks with Scope Switcher & Quick Status Updates */}
      <div className="space-y-4">
        {/* Section Header with Scope Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center gap-2">
                My Tasks
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {filteredTasks.length} of {tasks.length}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {taskScope === 'assigned'
                ? 'Work items assigned directly to you across all authorized projects. Update statuses inline.'
                : taskScope === 'unassigned'
                ? 'Open work items across your projects awaiting assignment. Claim tasks with 1 click.'
                : 'All work items across projects where you have authorized membership.'}
            </p>
          </div>

          {/* Scope Selector Pills */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setTaskScope('assigned')}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                taskScope === 'assigned'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Assigned to Me
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                taskScope === 'assigned' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
              }`}>
                {assignedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setTaskScope('all')}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                taskScope === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              All Project Tasks
            </button>
            <button
              onClick={() => setTaskScope('unassigned')}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                taskScope === 'unassigned'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Unassigned Backlog
              {unassignedCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  taskScope === 'unassigned' ? 'bg-indigo-700 text-white' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {unassignedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by title or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1">
              {['ALL', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'DONE'].map((st) => (
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
                    : st === 'CHANGES_REQUESTED'
                    ? 'Changes Req'
                    : 'Done'}
                </button>
              ))}
            </div>

            {/* Priority Select */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="font-medium">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Project Select */}
            {projects.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="font-medium">Project:</span>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1 focus:border-indigo-500 focus:outline-none max-w-[150px] truncate"
                >
                  <option value="ALL">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Task Cards List */}
        {loading ? (
          <Card className="border-slate-800 bg-slate-900/60 p-8">
            <LoadingSpinner label="Loading tasks..." />
          </Card>
        ) : tasks.length === 0 ? (
          <EmptyState
            title={
              taskScope === 'assigned'
                ? 'No tasks assigned directly to you yet'
                : taskScope === 'unassigned'
                ? 'No unassigned tasks found'
                : 'No tasks found in your projects'
            }
            description={
              taskScope === 'assigned' && unassignedCount > 0
                ? `You have ${unassignedCount} unassigned tasks across your active projects available in the backlog.`
                : taskScope === 'assigned'
                ? 'You currently have no tasks assigned directly to you. Once team members assign tasks or you claim work, it will appear right here.'
                : 'All work items in your projects currently have assigned owners.'
            }
            action={
              taskScope === 'assigned' && unassignedCount > 0 ? (
                <Button onClick={() => setTaskScope('unassigned')} size="sm">
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Browse Unassigned Backlog ({unassignedCount})
                </Button>
              ) : taskScope === 'assigned' && projects.length > 0 ? (
                <Button onClick={() => setTaskScope('all')} variant="outline" size="sm">
                  View All Project Tasks
                </Button>
              ) : undefined
            }
          />
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title="No matching tasks"
            description="No tasks matched your current filter criteria."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setPriorityFilter('ALL');
                  setProjectFilter('ALL');
                }}
              >
                Clear Filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map((task) => {
              const isUpdatingThisTask = updatingTaskId === task.id;
              const isAssignedToCurrentUser = task.assignee_id === user?.id;
              const isUnassigned = !task.assignee_id;
              const nextStatusMap: Record<TaskStatus, TaskStatus> = {
                TODO: 'IN_PROGRESS',
                IN_PROGRESS: 'IN_REVIEW',
                IN_REVIEW: 'DONE',
                CHANGES_REQUESTED: 'IN_PROGRESS',
                DONE: 'TODO',
              };

              return (
                <Card
                  key={task.id}
                  className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all p-4 group"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Task Identity & Info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Status Badge */}
                        <span title={`Status: ${task.status}`}>
                          {getStatusBadge(task.status)}
                        </span>

                        {/* Task Key */}
                        {task.task_number ? (
                          <span
                            onClick={() => setSelectedTask(task)}
                            className="inline-flex items-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 cursor-pointer shrink-0 transition-colors shadow-sm"
                            title={`Task Key: ORK-${task.task_number}`}
                          >
                            ORK-{task.task_number}
                          </span>
                        ) : null}

                        {/* Title (opens Details modal) */}
                        <h3
                          onClick={() => setSelectedTask(task)}
                          className={`text-sm font-semibold hover:text-indigo-400 cursor-pointer transition-colors truncate ${
                            task.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-100'
                          }`}
                        >
                          {task.title}
                        </h3>

                        {/* Priority Badge */}
                        {getPriorityBadge(task.priority)}

                        {/* Subtask tag */}
                        {task.parent_task_id && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                            <Layers className="w-2.5 h-2.5" />
                            Subtask
                          </span>
                        )}

                        {/* Blocked / Dependency Indicator */}
                        {task.is_blocked ? (
                          <span
                            onClick={() => setSelectedTask(task)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded cursor-pointer hover:bg-rose-500/25 transition-colors"
                            title="Task is blocked by unfinished prerequisite tasks"
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            Blocked ({task.dependencies.filter((d) => !d.is_completed).length} pending)
                          </span>
                        ) : task.dependencies.length > 0 ? (
                          <span
                            onClick={() => setSelectedTask(task)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded cursor-pointer"
                            title="All prerequisites completed"
                          >
                            <Check className="w-2.5 h-2.5" />
                            Prerequisites met ({task.dependencies.length}/{task.dependencies.length})
                          </span>
                        ) : null}
                      </div>

                      {/* Description Preview */}
                      {task.description && (
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {task.description}
                        </p>
                      )}

                      {/* Changes Requested Banner */}
                      {task.status === 'CHANGES_REQUESTED' && (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                          <span className="flex-1 min-w-0 truncate">
                            Changes requested: Missing requirements or feedback identified.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTask(task);
                              setModalTab('verification');
                            }}
                            className="underline hover:text-amber-200 font-medium shrink-0 text-[11px]"
                          >
                            View Findings
                          </button>
                        </div>
                      )}

                      {/* Metadata Row */}
                      <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 flex-wrap">
                        {/* Project Name Link */}
                        <Link
                          href={`/projects/${task.project_id}`}
                          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                        >
                          <FolderKanban className="w-3 h-3" />
                          <span>{task.project_name}</span>
                        </Link>

                        {/* Estimated Hours */}
                        {task.estimated_hours !== null && (
                          <div className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{task.estimated_hours}h estimated</span>
                          </div>
                        )}

                        {/* Assignee Information */}
                        {isUnassigned ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            Unassigned
                          </span>
                        ) : isAssignedToCurrentUser ? (
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

                        <div>Created {formatDate(task.created_at)}</div>
                      </div>
                    </div>

                    {/* Right: Quick Status Actions & Links */}
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      {/* Unassigned: Quick Claim Button */}
                      {isUnassigned && (
                        <Button
                          size="sm"
                          onClick={() => handleClaimTask(task.id)}
                          isLoading={isUpdatingThisTask}
                          className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Claim Task
                        </Button>
                      )}

                      {/* Action-Oriented Developer Controls */}
                      {isAssignedToCurrentUser && (
                        <>
                          {task.status === 'TODO' && (
                            <Button
                              size="sm"
                              onClick={() => handleQuickStatusChange(task.id, 'IN_PROGRESS')}
                              isLoading={isUpdatingThisTask}
                              className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm"
                              title="Start working on this task"
                            >
                              <Play className="w-3.5 h-3.5 mr-1" />
                              Start Working
                            </Button>
                          )}

                          {task.status === 'IN_PROGRESS' && (
                            <Button
                              size="sm"
                              onClick={() => handleSubmitVerification(task.id)}
                              isLoading={submittingTaskId === task.id}
                              className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm"
                              title="Submit code changes for AI verification"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              Submit for Verification
                            </Button>
                          )}

                          {task.status === 'CHANGES_REQUESTED' && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickStatusChange(task.id, 'IN_PROGRESS')}
                                isLoading={isUpdatingThisTask}
                                className="h-8 text-xs px-2.5 text-amber-300 border-amber-500/40 hover:bg-amber-500/10"
                                title="Resume working on this task to address feedback"
                              >
                                <Play className="w-3 h-3 mr-1 text-amber-400" />
                                Resume Work
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSubmitVerification(task.id)}
                                isLoading={submittingTaskId === task.id}
                                className="h-8 text-xs px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                                title="Resubmit changes for AI verification"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Resubmit
                              </Button>
                            </div>
                          )}

                          {task.status === 'IN_REVIEW' && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-1 rounded-md">
                                <Sparkles className="w-3 h-3 text-purple-400" />
                                In Review
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setModalTab('verification');
                                }}
                                className="h-8 text-xs px-2.5 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10"
                              >
                                <FileText className="w-3.5 h-3.5 mr-1" />
                                Report
                              </Button>
                            </div>
                          )}

                          {task.status === 'DONE' && (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 rounded-md">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Completed
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setModalTab('verification');
                                }}
                                className="h-8 text-xs px-2 text-slate-400 hover:text-slate-200"
                                title="View verification report and history"
                              >
                                <FileText className="w-3.5 h-3.5 mr-1" />
                                Report
                              </Button>
                            </div>
                          )}
                        </>
                      )}

                      {/* View Details Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTask(task)}
                        className="h-8 text-xs px-2.5"
                      >
                        Details
                      </Button>

                      {/* Open Project Button */}
                      <Link href={`/projects/${task.project_id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Open project">
                          <ArrowUpRight className="w-4 h-4 text-slate-400 hover:text-slate-200" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION C: My Projects */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center gap-2">
              My Projects
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {projects.length}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Workspaces where you have active authorized membership.
            </p>
          </div>
          <Link
            href="/projects"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            All projects
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <Card className="border-slate-800 bg-slate-900/60 p-6">
            <LoadingSpinner label="Loading your projects..." />
          </Card>
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects joined yet"
            description="You are not a member of any project yet. Create your first project to get started."
            action={
              <Button onClick={() => setIsProjectModalOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Project
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group block focus:outline-none"
              >
                <Card className="h-full border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900 transition-all p-4">
                  <div className="flex flex-col h-full justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-1">
                          {project.name}
                        </CardTitle>
                        {project.role && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              project.role === 'OWNER'
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : project.role === 'ADMIN'
                                ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {project.role}
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-xs text-slate-400 line-clamp-2 min-h-[2rem]">
                        {project.description || 'No description provided.'}
                      </CardDescription>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Created {formatDate(project.created_at)}</span>
                      </div>
                      <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-[11px] font-medium">
                        Open Project <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* TASK DETAILS MODAL */}
      <Modal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask ? (selectedTask.task_number ? `[ORK-${selectedTask.task_number}] ${selectedTask.title}` : selectedTask.title) : 'Task Details'}
        description={selectedTask ? (selectedTask.task_number ? `Key: ORK-${selectedTask.task_number} • ${selectedTask.project_name}` : selectedTask.project_name) : ''}
      >
        {selectedTask && (
          <div className="space-y-4">
            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`text-xs pb-1 px-2.5 font-medium border-b-2 transition-colors ${
                  modalTab === 'details'
                    ? 'border-indigo-500 text-indigo-300 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Task Details
              </button>
              <button
                type="button"
                onClick={() => setModalTab('verification')}
                className={`text-xs pb-1 px-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === 'verification'
                    ? 'border-indigo-500 text-indigo-300 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                AI Verification & Review
                {taskVerification && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                      taskVerification.overall_verdict === 'SATISFIED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : taskVerification.overall_verdict === 'UNMET'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {taskVerification.overall_verdict}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: DETAILS */}
            {modalTab === 'details' && (
              <div className="space-y-4">
                {/* Task Status & Priority Header */}
                <div className="flex items-center justify-between gap-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedTask.task_number ? (
                      <span className="inline-flex items-center text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 shadow-sm">
                        ORK-{selectedTask.task_number}
                      </span>
                    ) : null}
                    {getStatusBadge(selectedTask.status)}
                    {getPriorityBadge(selectedTask.priority)}
                  </div>
                  {selectedTask.estimated_hours !== null && (
                    <div className="flex items-center gap-1 text-xs text-slate-300 font-mono">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{selectedTask.estimated_hours} hours estimated</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Description
                  </h4>
                  <p className="text-xs text-slate-200 bg-slate-950/40 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap">
                    {selectedTask.description || 'No description provided for this task.'}
                  </p>
                </div>

                {/* Prerequisites / Dependencies */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                      Prerequisites (Depends On)
                    </h4>
                    {selectedTask.is_blocked && (
                      <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                        Blocked
                      </span>
                    )}
                  </div>

                  {selectedTask.dependencies.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded border border-slate-800/60">
                      No prerequisites. This task is unblocked.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedTask.dependencies.map((dep) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-2.5 rounded bg-slate-950/70 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {getStatusBadge(dep.status)}
                            <span className="text-slate-200 truncate">{dep.title}</span>
                          </div>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              dep.is_completed
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : 'text-amber-400 bg-amber-500/10'
                            }`}
                          >
                            {dep.is_completed ? 'Complete' : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: AI VERIFICATION & REVIEW */}
            {modalTab === 'verification' && (
              <div className="space-y-4">
                {loadingVerification ? (
                  <div className="p-8 text-center bg-slate-950/40 rounded-lg border border-slate-800">
                    <LoadingSpinner label="Loading verification report..." />
                  </div>
                ) : !taskVerification ? (
                  <div className="p-6 text-center bg-slate-950/40 rounded-lg border border-slate-800 space-y-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center mx-auto text-indigo-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">No Verification Report Yet</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Code changes associated with{' '}
                        <span className="font-mono text-indigo-300">ORK-{selectedTask.task_number}</span> will be
                        evaluated against task requirements upon submission.
                      </p>
                    </div>
                    {selectedTask.status === 'IN_PROGRESS' && selectedTask.assignee_id === user?.id && (
                      <Button
                        size="sm"
                        onClick={() => handleSubmitVerification(selectedTask.id)}
                        isLoading={submittingTaskId === selectedTask.id}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white mt-2"
                      >
                        <ShieldCheck className="w-4 h-4 mr-1.5" />
                        Submit for Verification
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Stale Warning Banner */}
                    {taskVerification.is_stale && (
                      <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-amber-200">Report Outdated</p>
                            <p className="text-[11px] text-amber-300/80">
                              New GitHub commits have been pushed since this verification was run. Re-verify to evaluate latest changes.
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSubmitVerification(selectedTask.id)}
                          disabled={submittingTaskId === selectedTask.id}
                          className="h-6 text-[11px] px-2 shrink-0 border border-amber-500/30 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                        >
                          Re-verify
                        </Button>
                      </div>
                    )}

                    {/* Verdict & Confidence Header */}
                    <div className="flex items-center justify-between gap-2 flex-wrap p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
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
                          <Sparkles className="w-3 h-3 text-indigo-400" /> Recommendation:
                        </p>
                        <p className="text-[11px] text-indigo-300/90">{taskVerification.recommendation}</p>
                      </div>
                    )}

                    {/* Report Subtabs */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-3 border-b border-slate-800/80 pb-1">
                        <button
                          type="button"
                          onClick={() => setVerificationSubTab('criteria')}
                          className={`text-xs pb-1 px-2 font-medium border-b-2 transition-colors ${
                            verificationSubTab === 'criteria'
                              ? 'border-indigo-500 text-indigo-300'
                              : 'border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Requirements ({taskVerification.requirements_coverage?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVerificationSubTab('files')}
                          className={`text-xs pb-1 px-2 font-medium border-b-2 transition-colors ${
                            verificationSubTab === 'files'
                              ? 'border-indigo-500 text-indigo-300'
                              : 'border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Files ({taskVerification.inspected_files?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVerificationSubTab('risks')}
                          className={`text-xs pb-1 px-2 font-medium border-b-2 transition-colors ${
                            verificationSubTab === 'risks'
                              ? 'border-indigo-500 text-indigo-300'
                              : 'border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Gaps & Risks
                        </button>
                      </div>

                      {/* Criteria Checklist */}
                      {verificationSubTab === 'criteria' && (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {!taskVerification.requirements_coverage || taskVerification.requirements_coverage.length === 0 ? (
                            <p className="text-xs text-slate-500 italic p-2">No discrete criteria evaluated.</p>
                          ) : (
                            taskVerification.requirements_coverage.map((req, idx) => (
                              <div key={idx} className="p-2.5 rounded bg-slate-900/70 border border-slate-800 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-200">
                                    <span className="text-indigo-400 font-mono text-[11px] mr-1.5">{idx + 1}.</span>
                                    {req.requirement}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                      req.status === 'SATISFIED'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : req.status === 'PARTIALLY_SATISFIED'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    }`}
                                  >
                                    {req.status}
                                  </span>
                                </div>
                                <p className="text-slate-300 text-[11px]">{req.explanation}</p>
                                {req.evidence && req.evidence.length > 0 && (
                                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                                    Evidence: {req.evidence.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Inspected Files */}
                      {verificationSubTab === 'files' && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {!taskVerification.inspected_files || taskVerification.inspected_files.length === 0 ? (
                            <p className="text-xs text-slate-500 italic p-2">No files inspected.</p>
                          ) : (
                            taskVerification.inspected_files.map((file, idx) => (
                              <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between">
                                <div className="truncate">
                                  <span className="font-mono text-slate-200">{file.filePath}</span>
                                  <p className="text-[11px] text-slate-400">{file.summary}</p>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0 ml-2">
                                  {file.changeType}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Gaps & Risks */}
                      {verificationSubTab === 'risks' && (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {taskVerification.gaps_and_risks?.missingRequirements?.length ? (
                            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/25 space-y-1">
                              <p className="text-xs font-semibold text-rose-300">Missing Requirements:</p>
                              <ul className="list-disc list-inside text-[11px] text-rose-200/90 space-y-0.5">
                                {taskVerification.gaps_and_risks.missingRequirements.map((m, i) => (
                                  <li key={i}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-xs text-emerald-400 italic p-2">No missing requirements identified.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Human Review Decision Banner (if already reviewed) */}
                    {taskVerification.review_decision && (
                      <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">
                            Reviewer Decision recorded by{' '}
                            <span className="font-semibold text-slate-200">
                              {taskVerification.reviewer_name || 'Reviewer'}
                            </span>
                            {taskVerification.reviewed_at ? ` on ${new Date(taskVerification.reviewed_at).toLocaleDateString()}` : ''}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                              taskVerification.review_decision === 'APPROVED'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {taskVerification.review_decision}
                          </span>
                        </div>
                        {taskVerification.review_feedback && (
                          <p className="text-slate-300 italic text-[11px] pt-1 border-t border-slate-800">
                            &ldquo;{taskVerification.review_feedback}&rdquo;
                          </p>
                        )}
                      </div>
                    )}

                    {/* OWNER / ADMIN Human Review Decision Actions */}
                    {(() => {
                      const projectObj = projects.find((p) => p.id === selectedTask.project_id);
                      const isOwnerOrAdmin = projectObj?.role === 'OWNER' || projectObj?.role === 'ADMIN';

                      if (!isOwnerOrAdmin || selectedTask.status === 'DONE') {
                        return null;
                      }

                      return (
                        <div className="pt-3 border-t border-slate-800 space-y-2.5">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                            Reviewer Action (Owner / Admin)
                          </span>

                          <Textarea
                            label="Review Feedback (Optional)"
                            placeholder="Add notes for approval or specific instructions for requested changes..."
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
                              <span>I acknowledge reviewing prior revision despite newer commits.</span>
                            </label>
                          )}

                          {reviewError && (
                            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400">
                              {reviewError}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSubmitReview('CHANGES_REQUESTED')}
                              isLoading={isSubmittingReview}
                              className="text-amber-300 border-amber-500/40 hover:bg-amber-500/10"
                            >
                              Request Changes
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSubmitReview('APPROVED')}
                              isLoading={isSubmittingReview}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              Approve (Mark DONE)
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <Link href={`/projects/${selectedTask.project_id}`}>
                <Button variant="outline" size="sm">
                  View in Project Workspace
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
              <Button size="sm" onClick={() => setSelectedTask(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* CREATE PROJECT MODAL */}
      <Modal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        title="Create New Project"
        description="Set up a new project space to organize tasks and workflows."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          {projectFormError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {projectFormError}
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
              onClick={() => setIsProjectModalOpen(false)}
              disabled={isSubmittingProject}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmittingProject}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
