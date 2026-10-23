'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  ProjectMemberWithUser,
  DistributionPreviewResponse,
  ProposedAssignment,
  TaskPriority,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Users2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  X,
  UserCheck,
  ShieldAlert,
  UserPlus,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Loader2,
} from 'lucide-react';

interface TaskDistributionWorkbenchProps {
  projectId: string;
  onDistributionApplied: () => void;
  tasksCount: number;
}

export const TaskDistributionWorkbench: React.FC<TaskDistributionWorkbenchProps> = ({
  projectId,
  onDistributionApplied,
  tasksCount,
}) => {
  // Members State
  const [members, setMembers] = useState<ProjectMemberWithUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Add Member Modal State
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberSkillsInput, setMemberSkillsInput] = useState('');
  const [memberCapacity, setMemberCapacity] = useState(40);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Workbench Expansion & Options
  const [isOpen, setIsOpen] = useState(false);
  const [redistributeAssigned, setRedistributeAssigned] = useState(false);

  // Preview & Execution State
  const [isCalculating, setIsCalculating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<DistributionPreviewResponse | null>(null);

  // User-adjusted proposed assignments (taskId -> chosen assigneeId)
  const [selectedAssignees, setSelectedAssignees] = useState<Record<string, string>>({});
  const [expandedCandidates, setExpandedCandidates] = useState<Record<string, boolean>>({});

  // Fetch Project Members
  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoadingMembers(true);
      const data = await api.getProjectMembers(projectId);
      setMembers(data);
    } catch (err: unknown) {
      console.error('Failed to load project members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Handle Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);

    const skills = memberSkillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      setIsSubmittingMember(true);
      await api.addProjectMember(projectId, {
        name: memberName.trim(),
        email: memberEmail.trim(),
        role: 'MEMBER',
        skills,
        weeklyCapacityHours: Number(memberCapacity) || 40,
        isAvailable: true,
      });

      setMemberName('');
      setMemberEmail('');
      setMemberSkillsInput('');
      setMemberCapacity(40);
      setIsAddMemberModalOpen(false);
      await fetchMembers();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setMemberError(err.message);
      } else {
        setMemberError(err instanceof Error ? err.message : 'Failed to add member');
      }
    } finally {
      setIsSubmittingMember(false);
    }
  };

  // Run Distribution Preview
  const handleCalculateDistribution = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (members.length === 0) {
      setErrorMessage('Please add at least one team member to this project before distributing tasks.');
      return;
    }

    try {
      setIsCalculating(true);
      const res = await api.previewTaskDistribution(projectId, {
        redistributeAssigned,
        defaultEstimatedHours: 4,
      });

      setPreview(res);

      // Pre-fill user selected assignees with algorithm's recommendations
      const initialChosen: Record<string, string> = {};
      res.proposedAssignments.forEach((a) => {
        initialChosen[a.taskId] = a.proposedAssigneeId;
      });
      setSelectedAssignees(initialChosen);
      setIsOpen(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to calculate task distribution');
      }
    } finally {
      setIsCalculating(false);
    }
  };

  // Change assignee for a task in preview
  const handleAssigneeChange = (taskId: string, newAssigneeId: string) => {
    setSelectedAssignees((prev) => ({
      ...prev,
      [taskId]: newAssigneeId,
    }));
  };

  // Toggle candidate score table
  const toggleCandidateBreakdown = (taskId: string) => {
    setExpandedCandidates((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  // Apply Distribution
  const handleApplyDistribution = async () => {
    if (!preview || preview.proposedAssignments.length === 0) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Build complete assignment list from proposed assignments and user overrides
    const assignments = preview.proposedAssignments
      .map((a) => ({
        taskId: a.taskId,
        assigneeId: selectedAssignees[a.taskId] || a.proposedAssigneeId,
      }))
      .filter((a) => Boolean(a.taskId && a.assigneeId));

    if (assignments.length === 0) {
      setErrorMessage('No valid task assignments to apply.');
      return;
    }

    try {
      setIsApplying(true);
      const res = await api.applyTaskDistribution(projectId, { assignments });
      setSuccessMessage(res.message);
      setPreview(null);
      setSelectedAssignees({});
      await fetchMembers();
      onDistributionApplied();
    } catch (err: unknown) {
      console.error('Failed to apply task distribution:', err);
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to apply assignments');
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscard = () => {
    setPreview(null);
    setSelectedAssignees({});
    setErrorMessage(null);
  };

  const priorityColor = (p: TaskPriority) => {
    switch (p) {
      case 'URGENT':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'HIGH':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'MEDIUM':
        return 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10';
      case 'LOW':
        return 'text-slate-400 border-slate-700 bg-slate-800/40';
    }
  };

  return (
    <Card className="border-indigo-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950 shadow-xl overflow-hidden">
      <CardHeader className="border-b border-slate-800/80 bg-slate-900/40 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-slate-100">
                  Task Distribution Engine V1
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-indigo-300 border-indigo-500/40 bg-indigo-500/10">
                  Deterministic Balancer
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Balance assignments across team members using skills, weekly capacity, task priority, and dependency graphs.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddMemberModalOpen(true)}
              className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Add Member
            </Button>

            {!isOpen && !preview && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/40"
              >
                <Sliders className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                Configure Distribution
              </Button>
            )}

            {isOpen && !preview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Collapse
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-5">
        {/* Success Alert */}
        {successMessage && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300">
              <p className="font-semibold text-emerald-200">Assignments Saved Successfully</p>
              <p className="mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-300">
                <span className="font-semibold text-rose-200">Distribution Error: </span>
                {errorMessage}
              </div>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Team Members Roster Bar */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Project Team ({members.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Members evaluated for task qualification and workload
              </span>
            </div>
            {members.length === 0 && (
              <Badge variant="warning" className="text-[10px]">
                No Members Configured
              </Badge>
            )}
          </div>

          {members.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              No team members assigned to this project yet.{' '}
              <button
                type="button"
                onClick={() => setIsAddMemberModalOpen(true)}
                className="text-indigo-400 hover:underline font-medium"
              >
                Add your first team member
              </button>{' '}
              to enable automated task distribution.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        {member.user_name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                        {member.user_email}
                      </div>
                    </div>
                    <Badge variant="neutral" className="text-[9px]">
                      {member.weekly_capacity_hours}h/wk
                    </Badge>
                  </div>

                  {/* Skills Pills */}
                  <div className="flex flex-wrap gap-1">
                    {member.user_skills && member.user_skills.length > 0 ? (
                      member.user_skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-950 border border-slate-800 text-slate-300"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">No specific skills listed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 1: DISTRIBUTION OPTIONS (When no preview is currently active) */}
        {!preview && (
          <div>
            {!isOpen ? (
              <div
                onClick={() => setIsOpen(true)}
                className="cursor-pointer rounded-lg border border-dashed border-indigo-500/20 hover:border-indigo-500/40 bg-slate-950/40 p-4 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500/20">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white">
                        Click here to distribute project tasks
                      </p>
                      <p className="text-xs text-slate-400">
                        Algorithm balances workloads, checks skill requirements, and respects task dependency order.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={redistributeAssigned}
                      onChange={(e) => setRedistributeAssigned(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-200">
                        Redistribute already assigned tasks
                      </span>
                      <p className="text-[11px] text-slate-400">
                        When unchecked, existing assignments are preserved and only unassigned tasks are allocated.
                      </p>
                    </div>
                  </label>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="text-xs text-slate-400"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCalculateDistribution}
                      disabled={isCalculating || members.length === 0}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4"
                    >
                      {isCalculating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Calculating Balancing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          Generate Distribution Preview
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: DISTRIBUTION PREVIEW WORKBENCH */}
        {preview && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {errorMessage && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3.5 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-300">
                    <span className="font-semibold text-rose-200">Failed to apply assignments: </span>
                    {errorMessage}
                  </div>
                </div>
                <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Header / Stats Summary */}
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Task Distribution Preview</span>
                  <Badge variant="success" className="text-[10px]">
                    Preview Ready
                  </Badge>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Evaluated {preview.evaluatedTasksCount} task(s): {preview.proposedAssignmentsCount} proposed,{' '}
                  {preview.unassignedTasksCount} unassigned. Review assignments and adjust before saving.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isApplying}
                  className="text-xs text-slate-400 hover:text-rose-400 border-slate-800"
                >
                  Discard Preview
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyDistribution}
                  disabled={isApplying || preview.proposedAssignments.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving Assignments...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Approve & Save ({preview.proposedAssignments.length} Assignments)
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Team Workload Balancer Bar Visualizer */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Team Workload Distribution
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {preview.memberWorkloadSummaries.map((summary) => (
                  <div
                    key={summary.memberId}
                    className="rounded-md border border-slate-800/80 bg-slate-900/40 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        {summary.memberName}
                      </span>
                      <Badge
                        variant="neutral"
                        className="text-[9px]"
                      >
                        {summary.proposedWorkloadHours}h allocated ({summary.assignedTaskCount} tasks)
                      </Badge>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full transition-all duration-500 bg-indigo-500"
                        style={{
                          width: `${Math.min(100, Math.max(10, summary.proposedWorkloadHours * 5))}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Initial: {summary.initialWorkloadHours}h</span>
                      <span>Assigned: +{summary.proposedWorkloadHours - summary.initialWorkloadHours}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Proposed Task Assignments List */}
            {preview.proposedAssignments.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Proposed Task Allocations ({preview.proposedAssignments.length})</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    You can override any proposed assignee using the selector.
                  </span>
                </div>

                <div className="space-y-2.5">
                  {preview.proposedAssignments.map((assignment) => {
                    const isCandidateExpanded = expandedCandidates[assignment.taskId] || false;
                    const chosenAssigneeId = selectedAssignees[assignment.taskId] || assignment.proposedAssigneeId;

                    return (
                      <div
                        key={assignment.taskId}
                        className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 space-y-3 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Task Info */}
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${priorityColor(assignment.taskPriority)}`}>
                                {assignment.taskPriority}
                              </span>
                              <span className="text-xs font-bold text-slate-100">
                                {assignment.taskTitle}
                              </span>
                              <Badge variant="neutral" className="text-[10px] font-mono">
                                <Clock className="w-3 h-3 mr-1 text-slate-400" />
                                {assignment.estimatedHours}h
                              </Badge>
                            </div>

                            {/* Required Skills */}
                            {assignment.requiredSkills.length > 0 && (
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-[10px] text-slate-400">Required:</span>
                                {assignment.requiredSkills.map((s, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-indigo-300"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Rationale */}
                            <p className="text-[11px] text-slate-400 italic pt-0.5">
                              {assignment.rationale}
                            </p>
                          </div>

                          {/* Assignee Selector Override */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-400">Assign To:</span>
                            <select
                              value={chosenAssigneeId}
                              onChange={(e) => handleAssigneeChange(assignment.taskId, e.target.value)}
                              className="h-8 rounded bg-slate-900 border border-slate-700 px-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 font-medium"
                            >
                              {members.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {m.user_name} ({m.weekly_capacity_hours}h/wk)
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Dependency Warnings */}
                        {assignment.dependencyWarnings.length > 0 && (
                          <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                            {assignment.dependencyWarnings.map((dw, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                                <GitBranch className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                <span>{dw}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Candidate Breakdown Toggle */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleCandidateBreakdown(assignment.taskId)}
                            className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                          >
                            {isCandidateExpanded ? (
                              <ChevronDown className="w-3 h-3 text-indigo-400" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-500" />
                            )}
                            View candidate scoring comparison ({assignment.candidateScores.length} evaluated)
                          </button>

                          {isCandidateExpanded && (
                            <div className="mt-2 rounded bg-slate-950 p-2.5 border border-slate-800 space-y-1.5 overflow-x-auto text-[11px]">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="border-b border-slate-800 text-[10px] text-slate-500">
                                    <th className="pb-1">Candidate</th>
                                    <th className="pb-1 text-center">Skill (45)</th>
                                    <th className="pb-1 text-center">Workload (35)</th>
                                    <th className="pb-1 text-center">Priority (15)</th>
                                    <th className="pb-1 text-right">Total Score</th>
                                    <th className="pb-1 pl-3">Reasoning</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {assignment.candidateScores.map((c) => (
                                    <tr
                                      key={c.memberId}
                                      className={`border-b border-slate-900/60 ${
                                        c.memberId === chosenAssigneeId
                                          ? 'text-indigo-300 font-semibold'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      <td className="py-1">{c.memberName}</td>
                                      <td className="py-1 text-center">{c.skillScore}</td>
                                      <td className="py-1 text-center">{c.workloadScore}</td>
                                      <td className="py-1 text-center">{c.priorityScore}</td>
                                      <td className="py-1 text-right font-bold text-slate-200">
                                        {c.totalScore}
                                      </td>
                                      <td className="py-1 pl-3 text-[10px] text-slate-500">
                                        {c.explanation}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unassigned Tasks Section */}
            {preview.unassignedTasks.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Unassigned Tasks ({preview.unassignedTasks.length})
                </div>
                <p className="text-xs text-slate-400">
                  These tasks could not be assigned confidently because no available team member met the required criteria.
                </p>

                <div className="space-y-2">
                  {preview.unassignedTasks.map((uTask) => (
                    <div
                      key={uTask.taskId}
                      className="rounded bg-slate-950 p-2.5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-200">
                          {uTask.taskTitle}
                        </div>
                        <div className="text-[11px] text-rose-300/90 mt-0.5">
                          {uTask.reason}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] self-start sm:self-center">
                        {uTask.estimatedHours}h
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Confirming will assign all proposed tasks to selected team members.
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isApplying}
                  className="text-xs text-slate-400 hover:text-rose-400 border-slate-800"
                >
                  Discard Preview
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyDistribution}
                  disabled={isApplying || preview.proposedAssignments.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving Assignments...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Confirm & Apply ({preview.proposedAssignments.length} Assignments)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Team Member Modal */}
      <Modal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        title="Add Project Team Member"
        description="Add a developer or engineer with skills and weekly capacity to enable intelligent task distribution."
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {memberError && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {memberError}
            </div>
          )}

          <Input
            label="Full Name"
            placeholder="e.g. Sarah Connor"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. sarah@example.com"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Technical Skills (Comma-separated)
            </label>
            <Input
              placeholder="e.g. react, next.js, typescript, tailwind"
              value={memberSkillsInput}
              onChange={(e) => setMemberSkillsInput(e.target.value)}
            />
            <p className="text-[10px] text-slate-400">
              Skills are matched deterministically against task skill requirements.
            </p>
          </div>


          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddMemberModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingMember}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isSubmittingMember ? 'Adding Member...' : 'Add Member'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};
