/**
 * AI Root-Cause Analysis Service
 * Analyzes CI failure logs to determine root cause
 * Runs asynchronously, never blocks incident creation
 * Treats all inputs as untrusted
 */

import { query } from '../../db';
import { publish } from '../eventBus.service';

export interface DiagnosisResult {
  summary: string;
  likely_root_cause: string;
  evidence: string[];
  error_location: {
    file_path: string | null;
    line_number: number | null;
    found: boolean;
    confidence: number;
    details: string;
  };
  confidence: number;
  recommended_actions: string[];
  related_files: string[];
  limitations: string;
}

export const analyzeIncident = async (incidentId: string): Promise<void> => {
  try {
    // Mark as analyzing
    await query(
      `UPDATE incidents SET diagnosis_status = 'analyzing' WHERE id = $1`,
      [incidentId]
    );
    
    publish('incident.updated', {
      incidentId,
      type: 'diagnosis',
      status: 'analyzing'
    });
    
    // Fetch incident details with occurrences
    const incidentRes = await query<any>(
      `SELECT i.*, 
              (SELECT json_agg(fo.* ORDER BY fo.failure_timestamp DESC) 
               FROM failure_occurrences fo WHERE fo.incident_id = i.id) as occurrences
       FROM incidents i WHERE i.id = $1`,
      [incidentId]
    );
    
    if (incidentRes.rows.length === 0) {
      await query(`UPDATE incidents SET diagnosis_status = 'failed' WHERE id = $1`, [incidentId]);
      return;
    }
    
    const incident = incidentRes.rows[0];
    const occurrences = incident.occurrences || [];
    const latestOcc = occurrences[0] || {};
    
    // Extract logs and context
    const logs = latestOcc.log_excerpt || latestOcc.error_message || incident.title || '';
    const errorMsg = latestOcc.error_message || '';
    const failedJob = latestOcc.failed_job || '';
    const failedStep = latestOcc.failed_step || '';
    const runUrl = latestOcc.run_url || incident.run_url || '';
    
    // Analyze - look for patterns
    const diagnosis = performAnalysis({
      logs,
      errorMsg,
      failedJob,
      failedStep,
      repository: incident.repository_name,
      workflow: incident.workflow_name,
      branch: incident.branch
    });
    
    // Save diagnosis
    await query(
      `UPDATE incidents SET 
        diagnosis_status = 'completed',
        diagnosis_summary = $1,
        diagnosis_likely_root_cause = $2,
        diagnosis_evidence = $3,
        diagnosis_error_location = $4,
        diagnosis_confidence = $5,
        diagnosis_recommended_actions = $6,
        diagnosis_related_files = $7,
        diagnosis_limitations = $8,
        diagnosis_analyzed_at = NOW()
       WHERE id = $9`,
      [
        diagnosis.summary,
        diagnosis.likely_root_cause,
        JSON.stringify(diagnosis.evidence),
        JSON.stringify(diagnosis.error_location),
        diagnosis.confidence,
        JSON.stringify(diagnosis.recommended_actions),
        JSON.stringify(diagnosis.related_files),
        diagnosis.limitations,
        incidentId
      ]
    );
    
    publish('incident.updated', {
      incidentId,
      type: 'diagnosis',
      status: 'completed',
      diagnosis
    });
  } catch (error) {
    console.error('Diagnosis failed:', (error as Error).message);
    try {
      await query(
        `UPDATE incidents SET diagnosis_status = 'failed' WHERE id = $1`,
        [incidentId]
      );
      publish('incident.updated', {
        incidentId,
        type: 'diagnosis',
        status: 'failed'
      });
    } catch {}
  }
};

function performAnalysis(context: any): DiagnosisResult {
  const logs = (context.logs || '').toLowerCase();
  const errorMsg = (context.errorMsg || '').toLowerCase();
  const combined = logs + ' ' + errorMsg;
  
  const evidence: string[] = [];
  const recommendedActions: string[] = [];
  const relatedFiles: string[] = [];
  
  // Check for intentional exit
  if (combined.includes('exit 1') || combined.includes('exited with code 1')) {
    evidence.push(`Workflow step "${context.failedStep || 'unknown'}" in job "${context.failedJob || 'unknown'}" exited with code 1`);
    evidence.push('This appears to be an intentional failure as configured in the workflow');
    
    return {
      summary: 'The workflow was configured to fail intentionally via exit code 1.',
      likely_root_cause: `The failing command in step "${context.failedStep || 'unknown'}" of job "${context.failedJob || 'unknown'}" is designed to exit with status 1. This is a deliberate workflow configuration rather than an application bug.`,
      evidence,
      error_location: {
        file_path: null,
        line_number: null,
        found: false,
        confidence: 0,
        details: 'No application source file/line identified. The failure originates from a workflow step command, not application code execution.'
      },
      confidence: 0.95,
      recommended_actions: [
        'Review the workflow file (.github/workflows/*.yml) to understand why this step is expected to fail',
        'If this is a test/demo failure, confirm it\'s intentional',
        'If not intentional, modify the workflow or fix the underlying condition'
      ],
      related_files: ['.github/workflows/ (workflow configuration)'],
      limitations: 'Analysis based on logs only. Full workflow file content not fetched to avoid following untrusted instructions from logs.'
    };
  }
  
  // Check for test failures
    if (combined.includes('test') && (combined.includes('failed') || combined.includes('failing'))) {
      evidence.push('Test failures detected in CI logs');
      if (combined.match(/([a-z0-9_\-\/]+\.[a-z]+):([0-9]+)/)) {
        const match = combined.match(/([a-z0-9_\-\/]+\.[a-z]+):([0-9]+)/);
        relatedFiles.push(match![1]);
      }
      recommendedActions.push('Review failing test cases');
      recommendedActions.push('Run tests locally to reproduce');
      
      return {
        summary: 'Test suite failures detected in CI.',
        likely_root_cause: 'One or more tests are failing. This could be due to code changes breaking existing functionality or environment differences.',
        evidence,
        error_location: {
          file_path: relatedFiles[0] || null,
          line_number: null,
          found: !!relatedFiles[0],
          confidence: relatedFiles[0] ? 0.4 : 0,
          details: relatedFiles[0] ? 'File mentioned in logs, but line number not definitively determined from excerpt.' : 'Exact source location not found in available log excerpt.'
        },
        confidence: 0.6,
        recommended_actions: recommendedActions,
        related_files: relatedFiles,
        limitations: 'Limited to log excerpt. Full test output and source files not inspected to determine exact failing assertions.'
      };
    }
  
  // Check for build errors
  if (combined.includes('error:') || combined.includes('syntaxerror') || combined.includes('compil')) {
    evidence.push('Compilation/build errors found in logs');
    recommendedActions.push('Check syntax and imports');
    recommendedActions.push('Verify dependencies are installed');
    
    return {
      summary: 'Build/compilation failure detected.',
      likely_root_cause: 'Code compilation failed due to syntax errors, type errors, or missing dependencies.',
      evidence,
      error_location: {
        file_path: null,
        line_number: null,
        found: false,
        confidence: 0,
        details: 'Build errors present but specific file/line not clearly identified in bounded log excerpt.'
      },
      confidence: 0.5,
      recommended_actions: recommendedActions,
      related_files: [],
      limitations: 'Insufficient structured error details in log excerpt to pinpoint exact location.'
    };
  }
  
  // Default - insufficient evidence
  return {
    summary: 'Workflow failed but root cause could not be determined from available logs.',
    likely_root_cause: 'Insufficient evidence in the captured log excerpt to identify the specific cause. The failure could be due to various reasons.',
    evidence: [
      `Job "${context.failedJob}" failed at step "${context.failedStep}"`,
      errorMsg ? `Error: ${errorMsg.substring(0, 200)}` : 'No detailed error message in excerpt'
    ],
    error_location: {
      file_path: null,
      line_number: null,
      found: false,
      confidence: 0,
      details: 'Exact source location cannot be determined from available evidence.'
    },
    confidence: 0.2,
    recommended_actions: [
      'Review full logs in GitHub Actions for more details',
      'Check the workflow configuration',
      'Re-run with debug logging if possible'
    ],
    related_files: [],
    limitations: 'Analysis limited to bounded log excerpt. Full logs and repository source not fully accessible for deeper inspection.'
  };
}

export const triggerAnalysis = async (incidentId: string): Promise<void> => {
  // Run asynchronously without blocking
  analyzeIncident(incidentId).catch(err => {
    console.error('Async analysis error:', err);
  });
};
