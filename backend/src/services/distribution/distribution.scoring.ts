import { Task } from '../task.service';
import { ProjectMemberWithUser } from '../member.service';
import { DistributionCandidateScore } from './distribution.types';

export interface ScoreContext {
  task: Task;
  member: ProjectMemberWithUser;
  currentWorkloadHours: number;
  taskEstimate: number;
  prerequisiteAssigneeIds: string[];
}

export const calculateCandidateScore = (
  ctx: ScoreContext
): DistributionCandidateScore => {
  const { task, member, currentWorkloadHours, taskEstimate, prerequisiteAssigneeIds } = ctx;

  const taskSkills = (task.required_skills || []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const memberSkills = (member.user_skills || []).map((s) => s.trim().toLowerCase()).filter(Boolean);

  // 1. Skill Match Evaluation (Weight: 45)
  const matchedSkills: string[] = [];
  const unmatchedSkills: string[] = [];

  for (const tSkill of taskSkills) {
    const hasMatch = memberSkills.some(
      (mSkill) => mSkill === tSkill || mSkill.includes(tSkill) || tSkill.includes(mSkill)
    );
    if (hasMatch) {
      matchedSkills.push(tSkill);
    } else {
      unmatchedSkills.push(tSkill);
    }
  }

  let skillScore = 0;
  if (taskSkills.length > 0) {
    const matchRatio = matchedSkills.length / taskSkills.length;
    skillScore = Math.round(matchRatio * 45 * 10) / 10;
  } else {
    // Neutral baseline if task does not specify required skills
    skillScore = 25;
  }

  // 2. Workload Balance Evaluation (Weight: 35)
  // Evenly balance tasks across members; smoothly prioritize members with fewer active assigned hours
  // without artificial 40h limits, capping, or "time limit exceed" penalties.
  const projectedWorkloadHours = currentWorkloadHours + taskEstimate;

  let workloadScore = 0;
  if (!member.is_available) {
    // Member marked as unavailable
    workloadScore = -500;
  } else {
    // Smooth workload distribution: members with lower current hours receive higher preference
    workloadScore = Math.round(Math.max(0, 35 - currentWorkloadHours * 1.5) * 10) / 10;
  }

  // 3. Task Priority Multiplier (Weight: 15)
  const priorityWeights: Record<string, number> = {
    URGENT: 15,
    HIGH: 10,
    MEDIUM: 5,
    LOW: 0,
  };
  const basePriority = priorityWeights[task.priority] ?? 5;
  // Reward skilled members handling urgent tasks
  const skillFactor = taskSkills.length > 0 ? (matchedSkills.length / taskSkills.length) : 0.8;
  const priorityScore = Math.round(basePriority * skillFactor * 10) / 10;

  // 4. Dependency Alignment (Synergy: +5)
  let dependencyScore = 0;
  if (prerequisiteAssigneeIds.length > 0 && prerequisiteAssigneeIds.includes(member.user_id)) {
    // Member is already assigned to a prerequisite -> continuous flow bonus
    dependencyScore = 5;
  }

  // Total Score Calculation
  const totalScore = Math.round((skillScore + workloadScore + priorityScore + dependencyScore) * 10) / 10;

  // Human-readable explanation
  const explanationParts: string[] = [];
  if (taskSkills.length > 0) {
    explanationParts.push(
      `Skills matched: ${matchedSkills.length}/${taskSkills.length} (${matchedSkills.join(', ') || 'none'})`
    );
  } else {
    explanationParts.push('General skills accepted');
  }

  explanationParts.push(
    `Projected workload: ${projectedWorkloadHours}h`
  );

  if (!member.is_available) {
    explanationParts.push('Currently marked unavailable');
  }

  if (dependencyScore > 0) {
    explanationParts.push('Prerequisite synergy: assigned to preceding blocker task');
  }

  return {
    memberId: member.user_id,
    memberName: member.user_name,
    totalScore,
    skillScore,
    matchedSkills,
    unmatchedSkills,
    workloadScore,
    currentWorkloadHours,
    projectedWorkloadHours,
    capacityHours: member.weekly_capacity_hours || 40,
    isOverCapacity: false,
    priorityScore,
    dependencyScore,
    explanation: explanationParts.join('. ') + '.',
  };
};

export const sortCandidates = (
  candidates: DistributionCandidateScore[]
): DistributionCandidateScore[] => {
  return [...candidates].sort((a, b) => {
    // 1. Total score descending
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // 2. Current workload ascending (fairness to less loaded member)
    if (a.currentWorkloadHours !== b.currentWorkloadHours) {
      return a.currentWorkloadHours - b.currentWorkloadHours;
    }
    // 3. Member name alphabetical (deterministic)
    if (a.memberName !== b.memberName) {
      return a.memberName.localeCompare(b.memberName);
    }
    // 4. Member ID lexicographical (deterministic)
    return a.memberId.localeCompare(b.memberId);
  });
};
