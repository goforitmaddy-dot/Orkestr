import { z } from 'zod';
import { ActivityCodeDiff } from '../github.service';

export type VerificationVerdict =
  | 'SATISFIED'
  | 'PARTIALLY_SATISFIED'
  | 'UNMET'
  | 'INSUFFICIENT_EVIDENCE'
  | 'ERROR';

export type RequirementStatus =
  | 'SATISFIED'
  | 'PARTIALLY_SATISFIED'
  | 'UNMET'
  | 'INSUFFICIENT_EVIDENCE';

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED';

export const RequirementCoverageSchema = z.object({
  requirement: z.string().min(1),
  status: z.enum(['SATISFIED', 'PARTIALLY_SATISFIED', 'UNMET', 'INSUFFICIENT_EVIDENCE']),
  explanation: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;

export const FileAnalysisSchema = z.object({
  filePath: z.string().min(1),
  changeType: z.enum(['added', 'modified', 'deleted', 'removed', 'renamed']),
  relevance: z.string().min(1),
  summary: z.string().min(1),
});

export type FileAnalysis = z.infer<typeof FileAnalysisSchema>;

export const GapsAndRisksSchema = z.object({
  missingRequirements: z.array(z.string()).default([]),
  potentialRegressionsOrSecurity: z.array(z.string()).default([]),
  areasRequiringTesting: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});

export type GapsAndRisks = z.infer<typeof GapsAndRisksSchema>;

export const AiVerificationOutputSchema = z.object({
  overallVerdict: z.enum(['SATISFIED', 'PARTIALLY_SATISFIED', 'UNMET', 'INSUFFICIENT_EVIDENCE']),
  summary: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  recommendation: z.string().min(1),
  requirementsCoverage: z.array(RequirementCoverageSchema).default([]),
  inspectedFiles: z.array(FileAnalysisSchema).default([]),
  gapsAndRisks: GapsAndRisksSchema,
});

export type AiVerificationOutput = z.infer<typeof AiVerificationOutputSchema>;

export interface VerificationPromptInput {
  taskTitle: string;
  taskDescription: string;
  acceptanceCriteria: string[];
  activityDiffs: ActivityCodeDiff[];
  knownLimitations: string[];
}

export interface TaskVerificationRecord {
  id: string;
  task_id: string;
  project_id: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  overall_verdict: VerificationVerdict;
  summary: string;
  confidence_score: number | null;
  requirements_coverage: RequirementCoverage[];
  inspected_files: FileAnalysis[];
  gaps_and_risks: GapsAndRisks;
  limitations: string | null;
  recommendation: string;
  associated_commit_shas: string[];
  associated_pr_numbers: number[];
  diff_stats: {
    totalFiles?: number;
    additions?: number;
    deletions?: number;
    totalChanges?: number;
  };
  raw_error: string | null;
  triggered_by_user_id: string | null;
  triggered_by_name?: string | null;
  reviewed_by_user_id: string | null;
  reviewer_name?: string | null;
  review_decision: ReviewDecision | null;
  review_feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  is_stale?: boolean;
}

export const ReviewSubmissionSchema = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  feedback: z.string().trim().max(2000).optional().nullable(),
  acknowledgeStale: z.boolean().default(false).optional(),
});

export type ReviewSubmissionInput = z.infer<typeof ReviewSubmissionSchema>;
