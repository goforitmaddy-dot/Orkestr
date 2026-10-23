'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { GitHubIdentityStatus } from '@/types';
import {
  Settings,
  Cpu,
  Database,
  Github,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Unlink,
  ExternalLink,
  ShieldCheck,
  Info,
  X,
  ArrowRightLeft,
} from 'lucide-react';

function SettingsContent() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();

  const [githubStatus, setGithubStatus] = useState<GitHubIdentityStatus | null>(null);
  const [loadingGithub, setLoadingGithub] = useState(true);
  const [linkingActionLoading, setLinkingActionLoading] = useState(false);
  const [unlinkingLoading, setUnlinkingLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Check URL query parameters for OAuth results
  useEffect(() => {
    const ghParam = searchParams.get('github');
    const msgParam = searchParams.get('message');

    if (ghParam === 'success') {
      setActionSuccess('Your GitHub account was successfully linked to Orkestr!');
      setActionError(null);
      refreshUser();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ghParam === 'error') {
      setActionError(msgParam || 'Failed to complete GitHub account linking.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, refreshUser]);

  const loadGitHubStatus = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingGithub(true);
      // NOTE: Do NOT reset actionError here to avoid wiping out OAuth errors from URL params
      const status = await api.getGitHubStatus();
      setGithubStatus(status);
    } catch (err: any) {
      console.error('Failed to load GitHub status:', err);
    } finally {
      setLoadingGithub(false);
    }
  }, [user]);

  useEffect(() => {
    loadGitHubStatus();
  }, [loadGitHubStatus]);

  const handleStartGitHubConnect = async (allowTransfer = false) => {
    try {
      setLinkingActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const { authUrl } = await api.getGitHubConnectUrl('/settings?github=success', allowTransfer);
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err: any) {
      setActionError(err.message || 'Unable to initiate GitHub connection. Check server configuration.');
      setLinkingActionLoading(false);
    }
  };

  const handleUnlinkGitHub = async () => {
    if (!window.confirm('Are you sure you want to unlink your GitHub account from Orkestr?')) {
      return;
    }

    try {
      setUnlinkingLoading(true);
      setActionError(null);
      setActionSuccess(null);

      await api.disconnectGitHub();
      setActionSuccess('Your GitHub account has been unlinked.');
      await loadGitHubStatus();
      await refreshUser();
    } catch (err: any) {
      setActionError(err.message || 'Failed to unlink GitHub account.');
    } finally {
      setUnlinkingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Account integrations, workspace preferences, and configuration
        </p>
      </div>

      {/* Action Notification Banners */}
      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 text-sm rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span className="font-medium text-rose-200">{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-slate-400 hover:text-slate-200 p-0.5 rounded transition"
              title="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {actionError.toLowerCase().includes('already linked') && (
            <div className="pt-1 flex items-center justify-between gap-3 text-xs border-t border-rose-500/20">
              <span className="text-slate-300">
                You can transfer this GitHub identity to your current account.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStartGitHubConnect(true)}
                disabled={linkingActionLoading}
                className="border-rose-400/40 hover:bg-rose-500/20 text-rose-200 text-xs py-1 h-auto"
              >
                {linkingActionLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                    Transfer to this Account
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        {/* GitHub Developer Identity Card */}
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-800 text-slate-200">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base text-slate-200">
                    GitHub Developer Identity
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Link your GitHub account to enable AI task verification and commit tracking.
                  </CardDescription>
                </div>
              </div>

              {loadingGithub ? (
                <Badge variant="outline" className="text-slate-400 text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking
                </Badge>
              ) : !githubStatus?.isConfigured ? (
                <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
                  Setup Required
                </Badge>
              ) : githubStatus?.isLinked ? (
                <Badge variant="success" className="text-xs">
                  Linked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-400 text-xs">
                  Not Linked
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingGithub ? (
              <div className="flex items-center justify-center p-6 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-400" />
                Loading GitHub integration status...
              </div>
            ) : !githubStatus?.isConfigured ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                  <Info className="w-4 h-4 text-amber-400" />
                  GitHub App Configuration Required on Server
                </div>
                <p className="text-slate-300">
                  The backend server requires <code className="font-mono text-amber-300">GITHUB_APP_CLIENT_ID</code> and{' '}
                  <code className="font-mono text-amber-300">GITHUB_APP_CLIENT_SECRET</code> in{' '}
                  <code className="font-mono text-slate-200">backend/.env</code> to enable OAuth account linking.
                </p>
                <p className="text-slate-400">
                  Once configured, developers can link their GitHub identities here with a single click.
                </p>
              </div>
            ) : githubStatus?.isLinked ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-slate-100">
                        @{githubStatus.githubUsername || 'github-user'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        (GitHub ID: {githubStatus.githubUserId})
                      </span>
                    </div>
                    {githubStatus.linkedAt && (
                      <p className="text-[11px] text-slate-400">
                        Linked on {new Date(githubStatus.linkedAt).toLocaleDateString()} at{' '}
                        {new Date(githubStatus.linkedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://github.com/${githubStatus.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline"
                    >
                      View on GitHub
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleUnlinkGitHub}
                      disabled={unlinkingLoading}
                    >
                      {unlinkingLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Unlinking...
                        </>
                      ) : (
                        <>
                          <Unlink className="w-3.5 h-3.5 mr-1.5" />
                          Unlink Account
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Your GitHub identity is linked. Commits and pull requests you author will be automatically identified for task verification.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300 space-y-2">
                  <p>
                    Connecting your GitHub account allows Orkestr to match your commits, branches, and pull requests with the tasks assigned to you.
                  </p>
                  <p className="text-slate-400">
                    We only request read access to your public profile and verified email. We never request private repo access through identity linking.
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => handleStartGitHubConnect(false)}
                  disabled={linkingActionLoading}
                >
                  {linkingActionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting to GitHub...
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 mr-2" />
                      Connect GitHub Account
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-base text-slate-200">General Preferences</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Placeholder
              </Badge>
            </div>
            <CardDescription>
              Configure workspace name, default time zones, and interface preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
              Workspace settings configuration will be customizable in future releases.
            </div>
          </CardContent>
        </Card>

        {/* AI Model Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-violet-400" />
                <CardTitle className="text-base text-slate-200">
                  AI Model & Orchestrator Providers
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">
                Active (Gemini 2.5 Flash)
              </Badge>
            </div>
            <CardDescription>
              AI task planner and distribution engine powered by Google Gemini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
              Provider configured in <code className="font-mono text-slate-300">backend/.env</code> via <code className="font-mono text-slate-300">GEMINI_API_KEY</code>.
            </div>
          </CardContent>
        </Card>

        {/* Database & Connectivity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <CardTitle className="text-base text-slate-200">
                  PostgreSQL Database & Migrations
                </CardTitle>
              </div>
              <Badge variant="success" className="text-[10px]">
                Active
              </Badge>
            </div>
            <CardDescription>
              Database schema managed via migration files in <code className="text-slate-300 font-mono">backend/migrations/</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-400 space-y-2">
              <p>Current schema version: <span className="font-mono text-slate-200">006_github_integration.sql</span></p>
              <p>Tables: <span className="font-mono text-slate-300">projects</span>, <span className="font-mono text-slate-300">users</span>, <span className="font-mono text-slate-300">project_members</span>, <span className="font-mono text-slate-300">tasks</span>, <span className="font-mono text-slate-300">github_oauth_states</span>, <span className="font-mono text-slate-300">github_webhook_events</span></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
