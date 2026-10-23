/**
 * Team Routing - configurable by service, environment, category, severity
 */
import { query } from '../../db';

export interface RoutingResult {
  team: string;
  channels: string[];
  escalationPolicy: any;
  ruleMatched?: string;
}

const DEFAULT_ROUTES: Record<string, string> = {
  deployment: 'DevOps / Platform Engineering',
  ci_cd: 'DevOps / Platform Engineering',
  build: 'DevOps / Platform Engineering',
  infrastructure: 'SRE',
  availability: 'SRE',
  network: 'SRE',
  database: 'Backend / Database team',
  db: 'Backend / Database team',
  frontend: 'Frontend Engineering',
  ui: 'Frontend Engineering',
  security: 'Security team',
  api: 'Backend / SRE',
  unknown: 'On-call Engineering'
};

export const routeToTeam = async (input: {
  service?: string | null;
  environment?: string | null;
  category?: string | null;
  severity?: string | null;
  repository?: string | null;
}): Promise<RoutingResult> => {
  try {
    const rules = await query<any>(
      `SELECT * FROM notification_rules WHERE enabled = TRUE ORDER BY priority DESC`
    );
    
    for (const rule of rules.rows) {
      const conditions = rule.conditions || {};
      let match = true;
      
      if (conditions.category && Array.isArray(conditions.category)) {
        const cats = conditions.category.map((c: string) => c.toLowerCase());
        if (!input.category || !cats.includes(input.category.toLowerCase())) match = false;
      }
      if (conditions.service && Array.isArray(conditions.service)) {
        const svcs = conditions.service.map((s: string) => String(s).toLowerCase());
        if (!input.service || !svcs.some((s: string) => String(input.service).toLowerCase().includes(s))) match = false;
      }
      if (conditions.severity && Array.isArray(conditions.severity)) {
        if (!input.severity || !conditions.severity.includes(input.severity)) match = false;
      }
      
      if (match && rule.team) {
        return {
          team: rule.team,
          channels: rule.channels || ['slack'],
          escalationPolicy: rule.escalation_policy || { timeout_minutes: 30, max_level: 3 },
          ruleMatched: rule.name
        };
      }
    }
  } catch {
    // Fall through to defaults
  }
  
  const team = DEFAULT_ROUTES[input.category || 'unknown'] || DEFAULT_ROUTES.unknown;
  return {
    team,
    channels: ['slack'],
    escalationPolicy: { timeout_minutes: 30, max_level: 3 }
  };
};

export const getDefaultTeam = (category?: string | null): string => {
  return DEFAULT_ROUTES[category || 'unknown'] || DEFAULT_ROUTES.unknown;
};
