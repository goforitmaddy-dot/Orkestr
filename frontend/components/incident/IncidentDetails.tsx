'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { 
  AlertTriangle, 
  GitBranch, 
  ExternalLink,
  Users,
  Bell,
  Brain,
  RefreshCw,
  Send
} from 'lucide-react';

interface IncidentDetailsProps {
  incident: any;
  latestRun?: any;
  occurrences?: any[];
  onRefresh?: () => void;
}

export default function IncidentDetails({ incident, latestRun, occurrences = [], onRefresh }: IncidentDetailsProps) {
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [triggeringAnalysis, setTriggeringAnalysis] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedMember, setSelectedMember] = useState('');

  useEffect(() => {
    loadDiagnosis();
    loadAssignments();
    loadNotifications();
    loadAssignmentOptions();
  }, [incident.id]);

  const loadDiagnosis = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/incidents/${incident.id}/diagnosis`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosis(data.data);
      }
    } catch (e) {}
  };

  const loadAssignments = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/incidents/${incident.id}/assignments`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.data || []);
      }
    } catch (e) {}
  };

  const loadNotifications = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/incidents/${incident.id}/notifications`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data || []);
      }
    } catch (e) {}
  };

  const loadAssignmentOptions = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/incidents/assign/options`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data.data?.teams || []);
        setMembers(data.data?.members || []);
      }
    } catch (e) {}
  };

  const triggerAnalysis = async () => {
    try {
      setTriggeringAnalysis(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`/api/incidents/${incident.id}/diagnosis/trigger`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      setTimeout(loadDiagnosis, 2000);
    } catch (e) {
    } finally {
      setTriggeringAnalysis(false);
    }
  };

  const assignIncident = async () => {
    try {
      setAssigning(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const team = teams.find(t => t.id === selectedTeam);
      await fetch(`/api/incidents/${incident.id}/assign`, {
        method: 'POST',
        headers: { 
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          teamId: selectedTeam,
          teamName: team?.name,
          individualId: selectedMember || null,
          individualName: members.find(m => m.id === selectedMember)?.name || null
        })
      });
      loadAssignments();
      onRefresh?.();
    } catch (e) {
    } finally {
      setAssigning(false);
    }
  };

  const retryNotification = async (attemptId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`/api/incidents/${incident.id}/notifications/${attemptId}/retry`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      loadNotifications();
    } catch (e) {}
  };

  const sendNotification = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      await fetch(`/api/incidents/${incident.id}/notify`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      loadNotifications();
      onRefresh?.();
    } catch (e) {}
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'critical') return 'danger';
    if (severity === 'high') return 'warning';
    return 'neutral';
  };

  const occurrence = occurrences[0] || {};
  const runUrl = incident.run_url || occurrence.run_url || latestRun?.html_url;

  return (
    <div className="space-y-4 mt-4">
      {/* Error Summary */}
      <Card className="border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Error Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-slate-500">Severity</div>
              <Badge variant={getSeverityColor(incident.severity) as any} className="mt-1">
                {(incident.severity || 'medium').toUpperCase()}
              </Badge>
            </div>
            <div>
              <div className="text-slate-500">Category</div>
              <div className="text-slate-200 mt-1">{incident.category || 'unknown'}</div>
            </div>
            <div>
              <div className="text-slate-500">Occurrences</div>
              <div className="text-slate-200 mt-1">{incident.failure_count || 1}</div>
            </div>
            <div>
              <div className="text-slate-500">Status</div>
              <div className="text-slate-200 mt-1">{incident.status}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div>
              <div className="text-slate-500">Repository</div>
              <div className="text-slate-200 mt-1 font-mono">{incident.repository_name}</div>
            </div>
            <div>
              <div className="text-slate-500">Branch</div>
              <div className="text-slate-200 mt-1 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {incident.branch || 'default'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Workflow</div>
              <div className="text-slate-200 mt-1">{incident.workflow_name}</div>
            </div>
            <div>
              <div className="text-slate-500">Commit</div>
              <div className="text-slate-200 mt-1 font-mono">{(incident.commit_sha || occurrence.commit_sha || '').substring(0, 7) || 'N/A'}</div>
            </div>
          </div>
          
          {(incident.job_name || occurrence.failed_job) && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-slate-500">Failed Job / Step</div>
              <div className="text-rose-300 mt-1">
                {incident.job_name || occurrence.failed_job} / {incident.step_name || occurrence.failed_step || 'N/A'}
              </div>
            </div>
          )}
          
          {runUrl && (
            <a href={runUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 pt-2">
              <ExternalLink className="w-3 h-3" />
              View GitHub Actions Run
            </a>
          )}
        </CardContent>
      </Card>

      {/* AI Root Cause Analysis */}
      <Card className="border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              AI Root-Cause Analysis
              {diagnosis?.diagnosis_status && (
                <Badge variant="neutral" className="text-[10px]">
                  {diagnosis.diagnosis_status}
                </Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={triggerAnalysis} isLoading={triggeringAnalysis}>
              <RefreshCw className="w-3 h-3" /> Re-analyze
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {!diagnosis || diagnosis?.diagnosis_status === 'pending' ? (
            <div className="text-slate-400">
              Analysis pending. <button onClick={triggerAnalysis} className="text-indigo-400 hover:underline">Trigger analysis</button>
            </div>
          ) : diagnosis?.diagnosis_status === 'analyzing' ? (
            <div className="text-slate-400">Analyzing failure logs and context...</div>
          ) : diagnosis?.diagnosis_status === 'failed' ? (
            <div className="text-rose-400">Analysis failed. Try re-analyzing.</div>
          ) : diagnosis?.diagnosis_status === 'completed' ? (
            <div className="space-y-3">
              {diagnosis.diagnosis_summary && (
                <div>
                  <div className="text-slate-500 mb-1">Summary</div>
                  <div className="text-slate-200">{diagnosis.diagnosis_summary}</div>
                </div>
              )}
              {diagnosis.diagnosis_likely_root_cause && (
                <div>
                  <div className="text-slate-500 mb-1">Likely Root Cause</div>
                  <div className="text-slate-200">{diagnosis.diagnosis_likely_root_cause}</div>
                </div>
              )}
              {diagnosis.diagnosis_confidence !== null && (
                <div>
                  <div className="text-slate-500 mb-1">Confidence</div>
                  <div className="text-slate-200">{Math.round(diagnosis.diagnosis_confidence * 100)}%</div>
                </div>
              )}
              {diagnosis.diagnosis_evidence && Array.isArray(diagnosis.diagnosis_evidence) && diagnosis.diagnosis_evidence.length > 0 && (
                <div>
                  <div className="text-slate-500 mb-1">Evidence</div>
                  <ul className="space-y-1">
                    {diagnosis.diagnosis_evidence.map((e: string, i: number) => (
                      <li key={i} className="text-slate-300">• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {diagnosis.diagnosis_error_location && (
                <div>
                  <div className="text-slate-500 mb-1">Error Location</div>
                  <div className="text-slate-300">
                    {diagnosis.diagnosis_error_location.found ? (
                      <span>{diagnosis.diagnosis_error_location.file_path}:{diagnosis.diagnosis_error_location.line_number}</span>
                    ) : (
                      <span className="text-amber-400">{diagnosis.diagnosis_error_location.details}</span>
                    )}
                  </div>
                </div>
              )}
              {diagnosis.diagnosis_recommended_actions && Array.isArray(diagnosis.diagnosis_recommended_actions) && diagnosis.diagnosis_recommended_actions.length > 0 && (
                <div>
                  <div className="text-slate-500 mb-1">Recommended Actions</div>
                  <ul className="space-y-1">
                    {diagnosis.diagnosis_recommended_actions.map((a: string, i: number) => (
                      <li key={i} className="text-slate-300">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {diagnosis.diagnosis_limitations && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-slate-500 mb-1">Limitations</div>
                  <div className="text-slate-400 italic">{diagnosis.diagnosis_limitations}</div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Assignment */}
      <Card className="border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            Team & Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Assigned Team</div>
              <div className="text-slate-200 mt-1">{incident.team_assigned || 'Unassigned'}</div>
            </div>
            <div>
              <div className="text-slate-500">Assigned To</div>
              <div className="text-slate-200 mt-1">{incident.assigned_individual_name || 'None'}</div>
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="text-slate-500">Reassign</div>
            <div className="flex gap-2 flex-wrap">
              <select 
                value={selectedTeam} 
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="flex-1 min-w-[120px] bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="">Select team...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select 
                value={selectedMember} 
                onChange={(e) => setSelectedMember(e.target.value)}
                className="flex-1 min-w-[120px] bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="">Select member...</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button size="sm" onClick={assignIncident} disabled={!selectedTeam || assigning} isLoading={assigning}>
                Assign
              </Button>
            </div>
          </div>
          
          {assignments.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-slate-500 mb-2">Assignment History</div>
              <div className="space-y-1">
                {assignments.slice(0, 5).map((a, i) => (
                  <div key={i} className="text-slate-400">
                    {a.assigned_team_name} {a.assigned_individual_name ? `→ ${a.assigned_individual_name}` : ''} - {new Date(a.created_at).toLocaleString()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="border-slate-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Notifications
            </CardTitle>
            <Button size="sm" variant="outline" onClick={sendNotification}>
              <Send className="w-3 h-3" /> Send Notification
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {notifications.length === 0 ? (
            <div className="text-slate-400">No notifications sent yet.</div>
          ) : (
            notifications.map((n, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-800/50 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={n.status === 'sent' ? 'success' : n.status === 'failed' ? 'danger' : 'neutral'} className="text-[10px]">
                      {n.status}
                    </Badge>
                    <span className="text-slate-300">{n.channel} ({n.provider})</span>
                    {n.recipient && <span className="text-slate-500">→ {n.recipient}</span>}
                  </div>
                  <div className="text-slate-500 mt-1">
                    {new Date(n.created_at).toLocaleString()} • Attempts: {n.attempt_count || 1}
                  </div>
                  {n.error_message && <div className="text-rose-400 mt-1">{n.error_message}</div>}
                </div>
                {n.status === 'failed' && n.retryable !== false && (
                  <Button size="sm" variant="outline" onClick={() => retryNotification(n.id)}>
                    <RefreshCw className="w-3 h-3" /> Retry
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Log Excerpt */}
      {occurrence.log_excerpt && (
        <Card className="border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Log Excerpt</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-950 p-3 rounded overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
              {occurrence.log_excerpt}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
