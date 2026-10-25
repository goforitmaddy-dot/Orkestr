import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export interface AiPlanPromptInput {
  projectTitle: string;
  projectDescription: string;
  requirements?: string[];
  constraints?: string | null;
  teamSize?: number | null;
  experienceLevel?: string | null;
  preferredStack?: string | null;
}

export interface AiProvider {
  generatePlan(input: AiPlanPromptInput): Promise<string>;
}

export class GeminiProvider implements AiProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.ai.geminiApiKey;
  }

  async generatePlan(input: AiPlanPromptInput): Promise<string> {
    const effectiveApiKey = (this.apiKey || process.env.GEMINI_API_KEY || config.ai.geminiApiKey || '').trim();
    if (!effectiveApiKey) {
      throw new AppError(
        'AI Planning provider is not configured. Please set GEMINI_API_KEY in backend/.env',
        503,
        { code: 'AI_PROVIDER_UNCONFIGURED' }
      );
    }

    try {
      const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

      const systemInstructions = `
You are an expert Principal Software Architect and Technical Project Manager.
Your job is to analyze software project specifications and generate a realistic, structured, end-to-end execution plan.

Rules for planning quality:
1. Break large deliverables into implementable tasks covering Database/Architecture, Backend APIs, Frontend/UI, and Testing/Integration.
2. Avoid unnecessarily tiny tasks (< 1 hour) and avoid overly monolithic tasks (> 40 hours).
3. Temporary task IDs must be simple strings like "task-1", "task-2", "task-3".
4. Phase IDs must be simple strings like "phase-1", "phase-2".
5. Every task MUST have:
   - "id": string (unique across the entire plan, e.g. "task-1")
   - "title": non-empty concise action title (e.g. "Create PostgreSQL migration for tasks")
   - "description": clear technical summary of acceptance criteria
   - "priority": one of ["LOW", "MEDIUM", "HIGH", "URGENT"]
   - "estimatedHours": realistic positive number
   - "phaseId": matching its phase id
   - "parentTaskId": null or the id of another task in the same plan (subtask)
   - "dependsOn": array of task ids that must be completed BEFORE this task can start
6. DEPENDENCY RULES:
   - A task cannot depend on itself.
   - Dependencies MUST NOT form cycles (e.g., A cannot depend on B if B depends on A).
   - Only declare essential sequential blockers (e.g., frontend API integration depends on backend endpoint).
7. Adapt tasks to the requested technology stack (${input.preferredStack || 'standard modern full-stack'}).
8. Explicitly list architectural assumptions in the "assumptions" array.
9. OUTPUT FORMAT: Output valid JSON only matching the schema below without any markdown fences.

JSON Structure:
{
  "title": "string",
  "summary": "string",
  "assumptions": ["string"],
  "phases": [
    {
      "id": "phase-1",
      "name": "Phase 1: Foundation & Setup",
      "description": "string",
      "tasks": [
        {
          "id": "task-1",
          "title": "string",
          "description": "string",
          "priority": "HIGH",
          "estimatedHours": 4,
          "phaseId": "phase-1",
          "parentTaskId": null,
          "dependsOn": []
        }
      ]
    }
  ]
}
`;

      const userPrompt = `
Project Title: ${input.projectTitle}
Project Description: ${input.projectDescription}
${input.requirements && input.requirements.length > 0 ? `Specific Requirements:\n${input.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}
${input.constraints ? `Planning Constraints: ${input.constraints}` : ''}
${input.teamSize ? `Team Size: ${input.teamSize} developer(s)` : ''}
${input.experienceLevel ? `Experience Level: ${input.experienceLevel}` : ''}
${input.preferredStack ? `Preferred Technology Stack: ${input.preferredStack}` : ''}

Generate the structured execution plan in JSON:
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemInstructions}\n\n${userPrompt}` }] },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) {
        throw new AppError('AI provider returned an empty response', 502);
      }

      // Strip markdown json fences if any
      const cleanedText = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      return cleanedText;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Gemini Provider Error:', error);
      const message = error instanceof Error ? error.message : 'Error communicating with AI Planning service';
      throw new AppError(`AI Generation failed: ${message}`, 502);
    }
  }
}

// Active provider instance (can be swapped in automated tests)
let activeProvider: AiProvider = new GeminiProvider();

export const getAiProvider = (): AiProvider => activeProvider;
export const setAiProvider = (provider: AiProvider): void => {
  activeProvider = provider;
};
