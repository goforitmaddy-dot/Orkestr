import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import {
  AiVerificationOutput,
  AiVerificationOutputSchema,
  VerificationPromptInput,
} from './verification.types';

export interface VerificationProvider {
  verifyCodeChanges(input: VerificationPromptInput): Promise<AiVerificationOutput>;
}

export class GeminiVerificationProvider implements VerificationProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.ai.geminiApiKey;
  }

  async verifyCodeChanges(input: VerificationPromptInput): Promise<AiVerificationOutput> {
    const effectiveApiKey = (
      this.apiKey ||
      process.env.GEMINI_API_KEY ||
      config.ai.geminiApiKey ||
      ''
    ).trim();

    if (!effectiveApiKey) {
      throw new AppError(
        'AI Verification provider is not configured. Please set GEMINI_API_KEY in backend/.env',
        503,
        { code: 'AI_PROVIDER_UNCONFIGURED' }
      );
    }

    try {
      const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

      const systemInstructions = `
You are an expert Principal Software Engineer and Code Reviewer performing automated task verification.
Your task is to critically verify whether actual GitHub code changes (commits/pull requests) satisfy the stated requirements and acceptance criteria of a project task.

CRITICAL EVIDENCE RULES:
1. GROUND TRUTH IN ACTUAL DIFFS: You must ONLY cite files, symbols, functions, and lines that actually exist in the retrieved git diff and file list provided.
2. NEVER FABRICATE: Never invent filenames, line numbers, test results, or code snippets that are not in the provided diffs.
3. CITATION ANCHORING: In "evidence", quote the actual diff lines or cite the concrete filename and change. If line numbers are not certain, reference the file name and the exact code excerpt.
4. DIFF INSPECTION != RUNTIME EXECUTION: A diff alone cannot prove runtime correctness or that unit tests passed. Do NOT state that "all tests passed" unless test output is explicitly provided. Distinguish static code inspection from verified execution.
5. OBJECTIVE VERDICTS:
   - "SATISFIED": All criteria are directly fulfilled by the code changes with strong evidence.
   - "PARTIALLY_SATISFIED": Some criteria are implemented, but key requirements, error handling, or subtasks are missing.
   - "UNMET": The changes do not address the requirements, or implemented unrelated logic.
   - "INSUFFICIENT_EVIDENCE": The changes cannot be evaluated because diffs are missing, truncated, or only empty/unrelated files were provided.

OUTPUT FORMAT:
Return valid JSON only matching the schema below without any markdown fences.

JSON Structure:
{
  "overallVerdict": "SATISFIED" | "PARTIALLY_SATISFIED" | "UNMET" | "INSUFFICIENT_EVIDENCE",
  "summary": "Clear, concise high-level synthesis of what was implemented and what remains.",
  "confidenceScore": 0.95,
  "recommendation": "Specific actionable recommendation for the human reviewer (e.g. approve, request changes on specific file).",
  "requirementsCoverage": [
    {
      "requirement": "Description of the requirement evaluated",
      "status": "SATISFIED" | "PARTIALLY_SATISFIED" | "UNMET" | "INSUFFICIENT_EVIDENCE",
      "explanation": "Detailed rationale explaining whether and how this criterion was met.",
      "evidence": ["Exact file and diff excerpt demonstrating satisfaction"],
      "confidence": 0.95
    }
  ],
  "inspectedFiles": [
    {
      "filePath": "src/example.ts",
      "changeType": "modified" | "added" | "deleted" | "renamed",
      "relevance": "HIGH" | "MEDIUM" | "LOW" | "NONE",
      "summary": "Summary of specific logic changes in this file"
    }
  ],
  "gapsAndRisks": {
    "missingRequirements": ["Unaddressed aspects of the task"],
    "potentialRegressionsOrSecurity": ["Potential side effects, security holes, unhandled error cases"],
    "areasRequiringTesting": ["Specific manual or automated test scenarios needed"],
    "limitations": ["Any limitations in this review such as truncated diffs or binary assets"]
  }
}
`;

      // Build context of activities and diffs
      const diffSummaryBlocks: string[] = [];
      for (const activity of input.activityDiffs) {
        const fileSections = activity.files
          .map((f) => {
            const patchText = f.patch
              ? `\`\`\`diff\n${f.patch}\n\`\`\``
              : `[Diff unavailable - status: ${f.status}]`;
            return `File: ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n${patchText}`;
          })
          .join('\n\n');

        diffSummaryBlocks.push(
          `### Activity: ${activity.activityType} [${activity.identifier}]\nTitle: ${activity.title}\nUrl: ${activity.url}\n${activity.messageOrBody ? `Message: ${activity.messageOrBody}\n` : ''}Changed Files (${activity.stats.totalFiles} files, +${activity.stats.additions}/-${activity.stats.deletions}):\n\n${fileSections}`
        );
      }

      const userPrompt = `
# Task Under Verification
Title: ${input.taskTitle}
Description: ${input.taskDescription || '(No description provided)'}

## Acceptance Criteria to Evaluate:
${
  input.acceptanceCriteria.length > 0
    ? input.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'No explicit acceptance criteria provided. Evaluate the task description as the requirement criteria.'
}

${
  input.knownLimitations.length > 0
    ? `## Known Ingestion & Diff Limitations:\n${input.knownLimitations.map((l) => `- ${l}`).join('\n')}\n`
    : ''
}

## Associated GitHub Code Changes:
${
  diffSummaryBlocks.length > 0
    ? diffSummaryBlocks.join('\n\n---\n\n')
    : 'No code changes or diffs available.'
}

Evaluate the changes and return the structured JSON report now:
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
        throw new AppError('AI Verification provider returned an empty response', 502);
      }

      const cleanedText = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleanedText);
      } catch (parseErr) {
        throw new AppError(
          `AI Verification returned malformed JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          502
        );
      }

      const validationResult = AiVerificationOutputSchema.safeParse(parsedJson);
      if (!validationResult.success) {
        const errorDetails = validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new AppError(
          `AI Verification output failed schema validation: ${errorDetails}`,
          502
        );
      }

      return validationResult.data;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Gemini Verification Provider Error:', error);
      const message =
        error instanceof Error ? error.message : 'Error communicating with AI Verification service';
      throw new AppError(`AI Task Verification failed: ${message}`, 502);
    }
  }
}

/**
 * Mock Verification Provider for automated test suites
 */
export class MockVerificationProvider implements VerificationProvider {
  public customOutput?: AiVerificationOutput;
  public lastInput?: VerificationPromptInput;

  constructor(customOutput?: AiVerificationOutput) {
    this.customOutput = customOutput;
  }

  async verifyCodeChanges(input: VerificationPromptInput): Promise<AiVerificationOutput> {
    this.lastInput = input;

    if (this.customOutput) {
      return this.customOutput;
    }

    // Default mock response based on input
    const criteria =
      input.acceptanceCriteria.length > 0
        ? input.acceptanceCriteria
        : [input.taskDescription || input.taskTitle];

    const allFiles = input.activityDiffs.flatMap((a) => a.files);
    const hasFiles = allFiles.length > 0;

    return {
      overallVerdict: hasFiles ? 'SATISFIED' : 'INSUFFICIENT_EVIDENCE',
      summary: hasFiles
        ? 'Verified implementation against code changes. All criteria satisfied in inspected diffs.'
        : 'Insufficient evidence: No associated code diffs available.',
      confidenceScore: hasFiles ? 0.95 : 0.2,
      recommendation: hasFiles
        ? 'Changes look solid and align with task requirements. Ready for human approval.'
        : 'Link code changes or commits to enable code inspection.',
      requirementsCoverage: criteria.map((c) => ({
        requirement: c,
        status: hasFiles ? 'SATISFIED' : 'INSUFFICIENT_EVIDENCE',
        explanation: hasFiles
          ? `Criterion '${c}' was implemented and verified in the commit diff.`
          : 'No diff available to verify this requirement.',
        evidence: hasFiles && allFiles[0] ? [`${allFiles[0].filename}: diff matched`] : [],
        confidence: hasFiles ? 0.95 : 0.2,
      })),
      inspectedFiles: allFiles.map((f) => ({
        filePath: f.filename,
        changeType: f.status,
        relevance: 'HIGH',
        summary: `Inspected changes: +${f.additions}/-${f.deletions}`,
      })),
      gapsAndRisks: {
        missingRequirements: [],
        potentialRegressionsOrSecurity: [],
        areasRequiringTesting: ['Verify edge cases with automated integration tests.'],
        limitations: input.knownLimitations,
      },
    };
  }
}

let activeVerificationProvider: VerificationProvider = new GeminiVerificationProvider();

export const getVerificationProvider = (): VerificationProvider => activeVerificationProvider;
export const setVerificationProvider = (provider: VerificationProvider): void => {
  activeVerificationProvider = provider;
};
