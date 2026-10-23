import { z } from 'zod';

export const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

// Planning Request Schema
export const planRequestSchema = z.object({
  description: z
    .string({ required_error: 'Project description is required' })
    .trim()
    .min(10, 'Project description must be at least 10 characters')
    .max(5000, 'Project description cannot exceed 5000 characters'),
  requirements: z
    .array(z.string().trim().max(500, 'Each requirement must be under 500 characters'))
    .max(20, 'Maximum 20 requirements allowed')
    .optional(),
  constraints: z.string().trim().max(2000, 'Constraints must be under 2000 characters').optional().nullable(),
  teamSize: z
    .number({ invalid_type_error: 'Team size must be a number' })
    .int('Team size must be an integer')
    .min(1, 'Team size must be at least 1')
    .max(50, 'Team size cannot exceed 50')
    .optional()
    .nullable(),
  experienceLevel: z.string().trim().max(50).optional().nullable(),
  preferredStack: z.string().trim().max(1000, 'Preferred stack must be under 1000 characters').optional().nullable(),
});

export type PlanRequestInput = z.infer<typeof planRequestSchema>;

// Task in a plan (temporary ID, not database UUID)
export const planTaskSchema = z.object({
  id: z.string().trim().min(1, 'Task id is required'),
  title: z.string().trim().min(1, 'Task title is required').max(255, 'Task title cannot exceed 255 characters'),
  description: z.string().trim().nullable().optional(),
  priority: taskPriorityEnum.default('MEDIUM'),
  estimatedHours: z
    .number({ invalid_type_error: 'Estimated hours must be a number' })
    .positive('Estimated hours must be greater than 0')
    .max(200, 'Estimated hours for a single task cannot exceed 200'),
  phaseId: z.string().trim().min(1, 'Phase ID is required'),
  parentTaskId: z.string().trim().nullable().optional(),
  dependsOn: z.array(z.string().trim()).default([]),
});

export type PlanTask = z.infer<typeof planTaskSchema>;

// Phase in a plan
export const planPhaseSchema = z.object({
  id: z.string().trim().min(1, 'Phase id is required'),
  name: z.string().trim().min(1, 'Phase name is required').max(100),
  description: z.string().trim().max(500),
  tasks: z.array(planTaskSchema).min(1, 'Each phase must contain at least one task'),
});

export type PlanPhase = z.infer<typeof planPhaseSchema>;

// Complete Generated Plan Schema
export const planResponseSchema = z.object({
  title: z.string().trim().min(1, 'Plan title is required').max(200),
  summary: z.string().trim().min(10, 'Plan summary must be at least 10 characters').max(3000),
  assumptions: z.array(z.string().trim().max(500)).default([]),
  phases: z.array(planPhaseSchema).min(1, 'A plan must contain at least one phase'),
});

export type PlanResponse = z.infer<typeof planResponseSchema>;

// Apply / Save Approved Plan Schema
export const applyPlanSchema = z.object({
  title: z.string().trim().min(1).optional(),
  phases: z.array(planPhaseSchema).min(1, 'At least one phase with tasks must be provided'),
});

export type ApplyPlanInput = z.infer<typeof applyPlanSchema>;
