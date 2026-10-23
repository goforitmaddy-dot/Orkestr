/**
 * Notification Policy - Severity, safety rules, escalation config
 * Deterministic rules; never depends on LLM availability
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Category =
  | 'deployment'
  | 'ci_cd'
  | 'build'
  | 'infrastructure'
  | 'availability'
  | 'network'
  | 'database'
  | 'db'
  | 'frontend'
  | 'ui'
  | 'security'
  | 'api'
  | 'unknown';

export interface IncidentPolicyInput {
  source: string;
  service?: string | null;
  environment?: string | null;
  repository?: string | null;
  errorMessage?: string | null;
  errorType?: string | null;
  category?: string | null;
  conclusion?: string | null;
  statusCode?: number | null;
}

const CRITICAL_KEYWORDS = ['outage', 'data breach', 'ransomware', 'production down', 'total failure'];
const SECURITY_KEYWORDS = ['security', 'vuln', 'exploit', 'unauthorized', 'breach', 'attack'];
const HIGH_KEYWORDS = ['500', 'connection exhaustion', 'timeout spike', 'deployment failed', 'rollback'];

export const classifySeverity = (input: IncidentPolicyInput): Severity => {
  const msg = (input.errorMessage || '').toLowerCase();
  const svc = (input.service || '').toLowerCase();
  const cat = (input.category || '').toLowerCase();
  
  if (cat === 'security' || SECURITY_KEYWORDS.some(k => msg.includes(k))) {
    return 'critical';
  }
  if (CRITICAL_KEYWORDS.some(k => msg.includes(k)) || input.statusCode === 503 && msg.includes('exhaust')) {
    return 'critical';
  }
  if (cat === 'deployment' || cat === 'ci_cd' || cat === 'build' || HIGH_KEYWORDS.some(k => msg.includes(k))) {
    return 'high';
  }
  if (input.statusCode && input.statusCode >= 500) return 'high';
  if (cat === 'database' || cat === 'db' || cat === 'infrastructure') return 'high';
  if (cat === 'frontend' || cat === 'ui') return 'medium';
  if (cat === 'api') return 'medium';
  return 'medium';
};

export const classifyCategory = (input: IncidentPolicyInput): Category => {
  const msg = (input.errorMessage || '').toLowerCase();
  const svc = (input.service || '').toLowerCase();
  const repo = (input.repository || '').toLowerCase();
  
  if (SECURITY_KEYWORDS.some(k => msg.includes(k))) return 'security';
  if (msg.includes('deploy') || msg.includes('ci') || msg.includes('workflow') || msg.includes('build')) return 'ci_cd';
  if (msg.includes('database') || msg.includes('postgres') || msg.includes('connection pool')) return 'database';
  if (msg.includes('frontend') || svc.includes('frontend')) return 'frontend';
  if (msg.includes('api') || svc.includes('api')) return 'api';
  if (msg.includes('timeout') || msg.includes('latency') || msg.includes('network')) return 'network';
  if (msg.includes('infra') || msg.includes('availability')) return 'infrastructure';
  return 'unknown';
};

export const isCriticalOrSecurity = (severity: Severity, category: Category): boolean => {
  return severity === 'critical' || category === 'security';
};

export const getEscalationTimeoutMinutes = (): number => {
  const envVal = process.env.INCIDENT_ESCALATION_TIMEOUT_MINUTES;
  const parsed = envVal ? parseInt(envVal, 10) : 30;
  return isNaN(parsed) || parsed < 1 ? 30 : parsed;
};

export const generateIncidentFingerprint = (input: {
  source: string;
  service?: string | null;
  environment?: string | null;
  repository?: string | null;
  errorSignature: string;
  resourceId?: string | null;
}): string => {
  // Stable fingerprint - no timestamps
  const parts = [
    input.source,
    input.service || 'unknown',
    input.environment || 'unknown',
    input.repository || 'unknown',
    input.resourceId || 'none',
    input.errorSignature
  ].map(p => p.toLowerCase().trim());
  // Use simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
};

export const sanitizeForNotification = (text: string | null | undefined): string => {
  if (!text) return '';
  // Remove potential secrets
  return text.replace(/(ghp_[a-zA-Z0-9]+|ghs_[a-zA-Z0-9]+|sk-[a-zA-Z0-9]+|token[=:][^\s]+)/gi, '[REDACTED]');
};
