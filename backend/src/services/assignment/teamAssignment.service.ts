/**
 * Team and Individual Assignment Service
 * Routes incidents based on priority rules
 */

import { query } from '../../db';
import { publish } from '../eventBus.service';

export interface AssignmentResult {
  teamId: string | null;
  teamName: string | null;
  individualId: string | null;
  individualName: string | null;
  ruleMatched: string;
  assignmentStatus: string;
}

export const routeAndAssign = async (incidentId: string): Promise<AssignmentResult> => {
  try {
    const incidentRes = await query<any>(
      `SELECT * FROM incidents WHERE id = $1`,
      [incidentId]
    );
    
    if (incidentRes.rows.length === 0) {
      return { teamId: null, teamName: null, individualId: null, individualName: null, ruleMatched: 'none', assignmentStatus: 'unassigned' };
    }
    
    const incident = incidentRes.rows[0];
    
    // 1. Explicit repository mapping
    const repoMapRes = await query<any>(
      `SELECT rtm.*, t.name as team_name 
       FROM repository_team_mappings rtm
       JOIN teams t ON t.id = rtm.team_id
       WHERE LOWER(rtm.repository_name) = LOWER($1) AND rtm.enabled = TRUE
       ORDER BY rtm.priority DESC
       LIMIT 1`,
      [incident.repository_name]
    );
    
    if (repoMapRes.rows.length > 0) {
      const mapping = repoMapRes.rows[0];
      await assignIncident(incidentId, mapping.team_id, mapping.team_name, null, null, 'Repository mapping');
      return {
        teamId: mapping.team_id,
        teamName: mapping.team_name,
        individualId: null,
        individualName: null,
        ruleMatched: 'repository_mapping',
        assignmentStatus: 'assigned'
      };
    }
    
    // 2. Notification rules by category
    const rulesRes = await query<any>(
      `SELECT * FROM notification_rules WHERE enabled = TRUE ORDER BY priority DESC`
    );
    
    for (const rule of rulesRes.rows) {
      const conditions = rule.conditions || {};
      let match = true;
      
      if (conditions.category && Array.isArray(conditions.category)) {
        if (!incident.category || !conditions.category.includes(incident.category)) match = false;
      }
      
      if (match && rule.team) {
        // Find team
        const teamRes = await query<any>(`SELECT * FROM teams WHERE name = $1 AND enabled = TRUE LIMIT 1`, [rule.team]);
        const team = teamRes.rows[0];
        await assignIncident(incidentId, team?.id || null, rule.team, null, null, `Rule: ${rule.name}`);
        return {
          teamId: team?.id || null,
          teamName: rule.team,
          individualId: null,
          individualName: null,
          ruleMatched: `rule:${rule.name}`,
          assignmentStatus: 'assigned'
        };
      }
    }
    
    // 3. Default on-call team
    const onCallRes = await query<any>(
      `SELECT * FROM teams WHERE on_call = TRUE AND enabled = TRUE LIMIT 1`
    );
    
    if (onCallRes.rows.length > 0) {
      const team = onCallRes.rows[0];
      await assignIncident(incidentId, team.id, team.name, null, null, 'Default on-call');
      return {
        teamId: team.id,
        teamName: team.name,
        individualId: null,
        individualName: null,
        ruleMatched: 'default_oncall',
        assignmentStatus: 'assigned'
      };
    }
    
    // 4. Unassigned - fallback
    await query(
      `UPDATE incidents SET team_assigned = $1, assignment_status = 'unassigned' WHERE id = $2`,
      ['On-call Engineering', incidentId]
    );
    
    return {
      teamId: null,
      teamName: 'On-call Engineering',
      individualId: null,
      individualName: null,
      ruleMatched: 'fallback_unassigned',
      assignmentStatus: 'unassigned'
    };
  } catch (error) {
    console.error('Routing failed:', (error as Error).message);
    return { teamId: null, teamName: 'On-call Engineering', individualId: null, individualName: null, ruleMatched: 'error_fallback', assignmentStatus: 'unassigned' };
  }
};

export const assignIncident = async (
  incidentId: string,
  teamId: string | null,
  teamName: string | null,
  individualId: string | null,
  individualName: string | null,
  reason?: string,
  assignedBy?: string
): Promise<boolean> => {
  try {
    await query(
      `UPDATE incidents SET 
        team_assigned = $1,
        assigned_individual_id = $2,
        assigned_individual_name = $3,
        assignment_status = 'assigned'
       WHERE id = $4`,
      [teamName, individualId, individualName, incidentId]
    );
    
    await query(
      `INSERT INTO incident_assignments (incident_id, assigned_team_id, assigned_team_name, assigned_individual_id, assigned_individual_name, assigned_by, assignment_status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, 'assigned', $7)`,
      [incidentId, teamId, teamName, individualId, individualName, assignedBy || null, reason || 'Manual assignment']
    );
    
    publish('incident.updated', {
      incidentId,
      type: 'assignment',
      teamAssigned: teamName,
      assignedIndividual: individualName
    });
    
    return true;
  } catch (error) {
    console.error('Assignment failed:', (error as Error).message);
    return false;
  }
};

export const getTeams = async () => {
  const result = await query<any>(`SELECT * FROM teams WHERE enabled = TRUE ORDER BY name`);
  return result.rows;
};

export const getTeamMembers = async (teamId?: string) => {
  let sql = `SELECT tm.*, t.name as team_name FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.enabled = TRUE`;
  const params: any[] = [];
  if (teamId) {
    params.push(teamId);
    sql += ` AND tm.team_id = $${params.length}`;
  }
  sql += ` ORDER BY tm.name`;
  const result = await query(sql, params);
  return result.rows;
};

export const getAssignmentHistory = async (incidentId: string) => {
  const result = await query<any>(
    `SELECT * FROM incident_assignments WHERE incident_id = $1 ORDER BY created_at DESC`,
    [incidentId]
  );
  return result.rows;
};
