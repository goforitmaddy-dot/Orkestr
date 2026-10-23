/**
 * Log Excerpt Extractor
 * Safely extracts bounded, high-signal excerpts from raw CI/CD logs,
 * avoiding the storage of multi-megabyte log files while preserving
 * critical error context, stack traces, and exit codes.
 */

export interface LogExtractOptions {
  maxLines?: number;
  maxChars?: number;
  contextLinesBefore?: number;
  contextLinesAfter?: number;
}

const DEFAULT_OPTIONS: Required<LogExtractOptions> = {
  maxLines: 40,
  maxChars: 2500,
  contextLinesBefore: 10,
  contextLinesAfter: 30,
};

const ERROR_PATTERNS = [
  /error[:\s]/i,
  /fatal[:\s]/i,
  /failed[:\s]/i,
  /failure[:\s]/i,
  /exception[:\s]/i,
  /traceback/i,
  /panic:/i,
  /exit code [1-9]\d*/i,
  /npm ERR!/i,
  /assertionerror/i,
  /command failed with exit code/i,
  /syntaxerror/i,
  /referenceerror/i,
  /compilation failed/i,
];

/**
 * Extracts a limited, relevant excerpt from raw log text.
 * Returns null explicitly if no log content is available.
 */
export const extractLogExcerpt = (
  rawLog?: string | null,
  options: LogExtractOptions = {}
): string | null => {
  if (!rawLog || typeof rawLog !== 'string' || !rawLog.trim()) {
    return null;
  }

  const { maxLines, maxChars, contextLinesBefore, contextLinesAfter } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const lines = rawLog.split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }

  // Find the most relevant error line index
  let primaryErrorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
      primaryErrorIndex = i;
      break;
    }
  }

  let startLine: number;
  let endLine: number;
  let hasEarlierTruncated = false;
  let hasLaterTruncated = false;

  if (primaryErrorIndex !== -1) {
    // Window around the detected error
    startLine = Math.max(0, primaryErrorIndex - contextLinesBefore);
    endLine = Math.min(lines.length, primaryErrorIndex + contextLinesAfter + 1);
  } else {
    // Fallback: take the tail of the log (where CI failures usually end)
    startLine = Math.max(0, lines.length - maxLines);
    endLine = lines.length;
  }

  // Ensure line count does not exceed maxLines
  if (endLine - startLine > maxLines) {
    endLine = startLine + maxLines;
  }

  hasEarlierTruncated = startLine > 0;
  hasLaterTruncated = endLine < lines.length;

  const excerptLines = lines.slice(startLine, endLine);
  let excerpt = excerptLines.join('\n');

  // Enforce max characters limit
  if (excerpt.length > maxChars) {
    excerpt = excerpt.substring(0, maxChars) + '\n[... excerpt truncated by char limit ...]';
  }

  const header = hasEarlierTruncated ? '[... earlier logs truncated ...]\n' : '';
  const footer = hasLaterTruncated ? '\n[... subsequent logs truncated ...]' : '';

  return `${header}${excerpt}${footer}`.trim();
};

/**
 * Extracts concise error message from step/job outputs or logs.
 */
export const extractErrorMessage = (
  explicitError?: string | null,
  logExcerpt?: string | null
): string | null => {
  if (explicitError && explicitError.trim()) {
    return explicitError.trim();
  }

  if (!logExcerpt) {
    return null;
  }

  const lines = logExcerpt.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed.startsWith('[...') &&
      ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))
    ) {
      // Clean up common terminal color sequences or timestamps if present
      // eslint-disable-next-line no-control-regex
      const cleaned = trimmed.replace(/\x1b\[[0-9;]*[mK]/g, '').trim();
      return cleaned.substring(0, 300);
    }
  }

  return null;
};
