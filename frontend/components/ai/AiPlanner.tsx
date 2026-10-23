'use client';

import React, { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Project, PlanResponse, PlanPhase, PlanTask, TaskPriority } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  Sparkles,
  Bot,
  Layers,
  Clock,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sliders,
  Send,
  X,
  Plus,
  KeyRound,
  Loader2,
} from 'lucide-react';

interface AiPlannerProps {
  projectId: string;
  project: Project | null;
  onPlanApplied: () => void;
}

export const AiPlanner: React.FC<AiPlannerProps> = ({
  projectId,
  project,
  onPlanApplied,
}) => {
  // Expansion & Form State
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState(project?.description || '');
  const [preferredStack, setPreferredStack] = useState('Next.js, Express, PostgreSQL, TypeScript');
  const [constraints, setConstraints] = useState('Deliver MVP within 3 weeks, prioritize robust database schema');
  const [requirementsInput, setRequirementsInput] = useState('');
  const [teamSize, setTeamSize] = useState<number>(2);

  // Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Draft Plan for Review & Editing
  const [planDraft, setPlanDraft] = useState<PlanResponse | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});

  // Reset or initialize description when project changes
  React.useEffect(() => {
    if (project?.description && !description) {
      setDescription(project.description);
    }
  }, [project, description]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  };

  const handleGeneratePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setIsApiKeyMissing(false);
    setSuccessMessage(null);

    const descToUse = description.trim() || project?.description?.trim() || project?.name || '';
    if (descToUse.length < 10) {
      setErrorMessage('Please provide a project description of at least 10 characters.');
      return;
    }

    const reqs = requirementsInput
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    try {
      setIsGenerating(true);
      const generated = await api.generateProjectPlan(projectId, {
        description: descToUse,
        preferredStack: preferredStack.trim() || null,
        constraints: constraints.trim() || null,
        requirements: reqs.length > 0 ? reqs : undefined,
        teamSize: Number(teamSize) || 1,
      });

      setPlanDraft(generated);
      // Auto expand all phases
      const initExp: Record<string, boolean> = {};
      generated.phases.forEach((p) => {
        initExp[p.id] = true;
      });
      setExpandedPhases(initExp);
      setIsOpen(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.statusCode === 503 || err.message.includes('GEMINI_API_KEY')) {
          setIsApiKeyMissing(true);
          setErrorMessage('GEMINI_API_KEY is not configured in backend/.env');
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to generate plan');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPlan = async () => {
    if (!planDraft) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      setIsApplying(true);
      const res = await api.applyProjectPlan(projectId, planDraft);
      setSuccessMessage(res.message);
      setPlanDraft(null); // Clear draft after saving
      onPlanApplied(); // Trigger task refresh in parent
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to apply plan');
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscardPlan = () => {
    setPlanDraft(null);
    setErrorMessage(null);
  };

  // Editing Draft Tasks
  const handleUpdateTaskField = (
    phaseId: string,
    taskId: string,
    field: keyof PlanTask,
    value: any
  ) => {
    if (!planDraft) return;

    setPlanDraft({
      ...planDraft,
      phases: planDraft.phases.map((phase) => {
        if (phase.id !== phaseId) return phase;
        return {
          ...phase,
          tasks: phase.tasks.map((task) => {
            if (task.id !== taskId) return task;
            return {
              ...task,
              [field]: value,
            };
          }),
        };
      }),
    });
  };

  const handleDeleteTask = (phaseId: string, taskId: string) => {
    if (!planDraft) return;

    setPlanDraft({
      ...planDraft,
      phases: planDraft.phases.map((phase) => {
        if (phase.id !== phaseId) return phase;
        return {
          ...phase,
          tasks: phase.tasks
            .filter((task) => task.id !== taskId)
            .map((task) => ({
              ...task,
              // Remove reference from dependencies if this task was deleted
              dependsOn: task.dependsOn.filter((depId) => depId !== taskId),
              // Clear parentTaskId if this task was the parent
              parentTaskId: task.parentTaskId === taskId ? null : task.parentTaskId,
            })),
        };
      }),
    });
  };

  const handleAddTaskToPhase = (phaseId: string) => {
    if (!planDraft) return;
    const newTaskId = `task-${Date.now().toString().slice(-4)}`;
    const newTask: PlanTask = {
      id: newTaskId,
      title: 'New custom task',
      description: '',
      priority: 'MEDIUM',
      estimatedHours: 4,
      phaseId: phaseId,
      parentTaskId: null,
      dependsOn: [],
    };

    setPlanDraft({
      ...planDraft,
      phases: planDraft.phases.map((phase) => {
        if (phase.id !== phaseId) return phase;
        return {
          ...phase,
          tasks: [...phase.tasks, newTask],
        };
      }),
    });
  };

  const totalEstimatedHours = planDraft?.phases.reduce((acc, p) => {
    return acc + p.tasks.reduce((tAcc, t) => tAcc + (Number(t.estimatedHours) || 0), 0);
  }, 0) || 0;

  const totalTasksCount = planDraft?.phases.reduce((acc, p) => acc + p.tasks.length, 0) || 0;

  return (
    <Card className="border-violet-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950 shadow-xl overflow-hidden">
      <CardHeader className="border-b border-slate-800/80 bg-slate-900/40 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold text-slate-100">
                  AI Project Planning Engine
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-violet-300 border-violet-500/40 bg-violet-500/10">
                  Gemini 3.5 Flash
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400 mt-0.5">
                Decompose software requirements into actionable phases, subtasks, and dependency graphs.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOpen && !planDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="text-xs border-violet-500/30 text-violet-300 hover:bg-violet-950/40"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-violet-400" />
                Configure Planner
              </Button>
            )}
            {isOpen && !planDraft && (
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
        {/* Success Banner */}
        {successMessage && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300">
              <p className="font-semibold text-emerald-200">Plan Persisted Successfully</p>
              <p className="mt-0.5">{successMessage}</p>
            </div>
          </div>
        )}

        {/* API Key Missing Notice */}
        {isApiKeyMissing && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
              <KeyRound className="w-4 h-4" />
              Gemini API Key Required
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              To enable automated planning, configure your Google Gemini API key in your backend environment file:
            </p>
            <div className="rounded bg-slate-950 p-2 text-xs font-mono text-amber-200/90 border border-slate-800">
              # backend/.env<br />
              GEMINI_API_KEY=your_actual_gemini_api_key_here
            </div>
            <p className="text-[11px] text-slate-400">
              After adding the key to <code>backend/.env</code>, restart your backend server.
            </p>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && !isApiKeyMissing && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3.5 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-300">
                <span className="font-semibold text-rose-200">Planning Error: </span>
                {errorMessage}
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SECTION 1: PLANNING INPUT FORM (When no plan is currently under review) */}
        {!planDraft && (
          <div className="space-y-4">
            {!isOpen ? (
              <div
                onClick={() => setIsOpen(true)}
                className="cursor-pointer rounded-lg border border-dashed border-violet-500/20 hover:border-violet-500/40 bg-slate-950/40 p-4 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:bg-violet-500/20">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200 group-hover:text-white">
                        Click here to generate a comprehensive project plan
                      </p>
                      <p className="text-xs text-slate-400">
                        Specify tech stack, scope, and team constraints to let AI decompose requirements.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ) : (
              <form onSubmit={handleGeneratePlan} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Project Scope & Objectives <span className="text-violet-400">*</span>
                  </label>
                  <Textarea
                    placeholder="Describe the application goals, core user journeys, and desired features..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Target Tech Stack
                    </label>
                    <Input
                      placeholder="e.g. Next.js 14, Express, PostgreSQL, TailwindCSS"
                      value={preferredStack}
                      onChange={(e) => setPreferredStack(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Team Capacity & Velocity
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={teamSize}
                        onChange={(e) => setTeamSize(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-xs text-slate-400">
                        developer(s) working concurrently
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Planning Constraints (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Maximum 4-week timeline, must include PostgreSQL migration tests"
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Specific Feature Requirements (One per line)
                  </label>
                  <Textarea
                    placeholder={`e.g.\nRole-based access control\nTask dependency cycle detection\nPostgreSQL transactional plan commit`}
                    value={requirementsInput}
                    onChange={(e) => setRequirementsInput(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[11px] text-slate-400">
                    AI generated tasks are fully editable before being committed to your database.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="text-xs text-slate-400"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isGenerating}
                      className="bg-violet-600 hover:bg-violet-500 text-white text-xs px-4"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Analyzing & Decomposing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          Generate Execution Plan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* SECTION 2: PLAN REVIEW & EDITING WORKBENCH */}
        {planDraft && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Plan Overview Card */}
            <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>{planDraft.title}</span>
                    <Badge variant="success" className="text-[10px]">
                      Draft Generated
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {planDraft.summary}
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 shrink-0 text-center">
                  <div>
                    <div className="text-xs text-slate-400">Phases</div>
                    <div className="text-sm font-bold text-slate-200">{planDraft.phases.length}</div>
                  </div>
                  <div className="w-px h-6 bg-slate-800" />
                  <div>
                    <div className="text-xs text-slate-400">Tasks</div>
                    <div className="text-sm font-bold text-slate-200">{totalTasksCount}</div>
                  </div>
                  <div className="w-px h-6 bg-slate-800" />
                  <div>
                    <div className="text-xs text-slate-400">Est. Hours</div>
                    <div className="text-sm font-bold text-violet-400">{totalEstimatedHours}h</div>
                  </div>
                </div>
              </div>

              {/* Assumptions */}
              {planDraft.assumptions && planDraft.assumptions.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Architectural Assumptions
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {planDraft.assumptions.map((assumption, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300"
                      >
                        • {assumption}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Phases and Tasks Workbench */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  Phased Breakdown & Task Dependency Graph
                </h4>
                <span className="text-[11px] text-slate-400">
                  You can edit titles, priorities, hours, or remove tasks before saving.
                </span>
              </div>

              {planDraft.phases.map((phase, pIdx) => {
                const isExpanded = expandedPhases[phase.id] !== false;
                const phaseHours = phase.tasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);

                return (
                  <div
                    key={phase.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden transition-all"
                  >
                    {/* Phase Header */}
                    <div
                      onClick={() => togglePhase(phase.id)}
                      className="cursor-pointer px-4 py-3 bg-slate-900/60 hover:bg-slate-900/90 flex items-center justify-between border-b border-slate-800/60 select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-violet-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-200">
                              {phase.name}
                            </span>
                            <Badge variant="neutral" className="text-[10px]">
                              {phase.tasks.length} task{phase.tasks.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {phase.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1 font-mono text-slate-300">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {phaseHours}h
                        </span>
                      </div>
                    </div>

                    {/* Phase Tasks List */}
                    {isExpanded && (
                      <div className="p-3 space-y-2.5">
                        {phase.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-md border border-slate-800/80 bg-slate-900/40 p-3 hover:border-slate-700/80 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              {/* Task Title & Details */}
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  {task.parentTaskId && (
                                    <Badge variant="outline" className="text-[9px] text-indigo-400 border-indigo-500/30">
                                      Subtask
                                    </Badge>
                                  )}
                                  <input
                                    type="text"
                                    value={task.title}
                                    onChange={(e) =>
                                      handleUpdateTaskField(phase.id, task.id, 'title', e.target.value)
                                    }
                                    className="bg-transparent text-xs font-medium text-slate-200 hover:bg-slate-950/60 focus:bg-slate-950 px-1.5 py-0.5 rounded border border-transparent focus:border-slate-700 outline-none w-full max-w-lg"
                                  />
                                </div>

                                {task.description && (
                                  <p className="text-[11px] text-slate-400 pl-1.5 leading-relaxed">
                                    {task.description}
                                  </p>
                                )}

                                {/* Dependencies Preview */}
                                {task.dependsOn && task.dependsOn.length > 0 && (
                                  <div className="flex items-center gap-1.5 pl-1.5 pt-1 text-[10px] text-slate-400">
                                    <GitBranch className="w-3 h-3 text-amber-400" />
                                    <span>Blocked by:</span>
                                    {task.dependsOn.map((depId) => (
                                      <span
                                        key={depId}
                                        className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-amber-300"
                                      >
                                        {depId}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Task Metadata & Controls */}
                              <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                                {/* Priority Selector */}
                                <select
                                  value={task.priority}
                                  onChange={(e) =>
                                    handleUpdateTaskField(
                                      phase.id,
                                      task.id,
                                      'priority',
                                      e.target.value as TaskPriority
                                    )
                                  }
                                  className="h-7 text-[11px] rounded bg-slate-950 border border-slate-800 text-slate-200 px-2 outline-none focus:border-violet-500"
                                >
                                  <option value="LOW">Low</option>
                                  <option value="MEDIUM">Medium</option>
                                  <option value="HIGH">High</option>
                                  <option value="URGENT">Urgent</option>
                                </select>

                                {/* Hours Input */}
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0.5"
                                    max="200"
                                    step="0.5"
                                    value={task.estimatedHours}
                                    onChange={(e) =>
                                      handleUpdateTaskField(
                                        phase.id,
                                        task.id,
                                        'estimatedHours',
                                        Number(e.target.value)
                                      )
                                    }
                                    className="w-14 h-7 text-xs text-center rounded bg-slate-950 border border-slate-800 text-slate-200 outline-none focus:border-violet-500 font-mono"
                                  />
                                  <span className="text-[11px] text-slate-400">h</span>
                                </div>

                                {/* Delete Task */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(phase.id, task.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors"
                                  title="Delete task from plan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddTaskToPhase(phase.id)}
                          className="w-full py-2 border border-dashed border-slate-800 hover:border-slate-700 rounded text-[11px] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Task to {phase.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions: Approve / Discard */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Saving will create all tasks and dependencies in your database transactionally.
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscardPlan}
                  disabled={isApplying}
                  className="text-xs text-slate-400 hover:text-rose-400 border-slate-800"
                >
                  Discard Draft
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGeneratePlan()}
                  disabled={isGenerating || isApplying}
                  className="text-xs border-violet-500/30 text-violet-300 hover:bg-violet-950/30"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Regenerate
                </Button>

                <Button
                  size="sm"
                  onClick={handleApplyPlan}
                  disabled={isApplying || totalTasksCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving to Project...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Approve & Save Plan ({totalTasksCount} Tasks)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
