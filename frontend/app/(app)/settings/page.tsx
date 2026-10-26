'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { GitHubConnection } from '@/types';
import {
  Settings,
  Cpu,
  Database,
  Bell,
  Github,
  Trash2,
  RefreshCw,
  Plus,
  ShieldCheck,
} from 'lucide-react';

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  valid: 'success',
  invalid: 'danger',
  unverified: 'warning',
};

const statusLabel: Record<string, string> = {
  valid: 'Verified',
  invalid: 'Invalid',
  unverified: 'Unverified',
};

const GitHubConnections = () => {
  const [connections, setConnections] = useState<GitHubConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getGitHubConnections();
      setConnections(data);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not load connections.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const result = await api.createGitHubConnection(token.trim());
      setMessage({ tone: 'success', text: result.message || 'GitHub account connected.' });
      setToken('');
      await load();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not connect the token.',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const revalidate = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const result = await api.validateGitHubConnection(id);
      setMessage({ tone: 'success', text: result.message || 'Connection verified.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not verify the connection.',
      });
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      await api.deleteGitHubConnection(id);
      setMessage({ tone: 'success', text: 'Connection removed.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Could not remove the connection.',
      });
    } finally {
      setBusyId(null);
      await load();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-slate-200" />
            <CardTitle className="text-base text-slate-200">GitHub Connection</CardTitle>
          </div>
          {connections.length > 0 && (
            <Badge variant="success" className="text-[10px]">
              Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Your personal access token is used to read the repositories you monitor. It is stored
          encrypted (AES-256-GCM) and never shown again after saving.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <LoadingSpinner label="Loading connections" />
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-5 text-sm text-slate-400">
            No GitHub account connected yet. Add a personal access token to monitor your
            pipelines.
          </div>
        ) : (
          <ul className="space-y-3">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100">
                        {connection.accountLogin ? `@${connection.accountLogin}` : 'GitHub'}
                      </span>
                      <Badge
                        variant={statusVariant[connection.status] || 'neutral'}
                        className="text-[10px]"
                      >
                        {statusLabel[connection.status] || connection.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Token {connection.tokenHint}
                      {connection.scopes.length > 0 && (
                        <> &middot; scopes: {connection.scopes.join(', ')}</>
                      )}
                    </p>
                    {connection.lastError && (
                      <p className="mt-1 text-xs text-rose-400">{connection.lastError}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={busyId === connection.id}
                      onClick={() => void revalidate(connection.id)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Verify
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={busyId === connection.id}
                      onClick={() => void remove(connection.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={connect} className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <Input
            label="GitHub personal access token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            helperText="Needs read access to the repositories you monitor (public_repo / repo)."
            autoComplete="off"
          />
          <Button type="submit" isLoading={saving} disabled={!token.trim()}>
            <Plus className="w-4 h-4" /> {connections.length > 0 ? 'Replace token' : 'Connect GitHub'}
          </Button>
        </form>

        {message && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              message.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {message.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Your account, GitHub connection and workspace preferences
        </p>
      </div>

      <div className="space-y-5">
        {/* Account */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-base text-slate-200">Account</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Signed in
              </Badge>
            </div>
            <CardDescription>
              Projects and GitHub connections are isolated to your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-400 space-y-1">
              <p>
                Name:{' '}
                <span className="text-slate-200">{user?.name || 'Not set'}</span>
              </p>
              <p>
                Email: <span className="text-slate-200">{user?.email}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* GitHub connection */}
        <GitHubConnections />

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
                  AI Model &amp; Orchestrator Providers
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">
                Future Module
              </Badge>
            </div>
            <CardDescription>
              Configure LLM provider endpoints (OpenAI, Anthropic, Gemini, or local models).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
              API keys and model routing will be stored securely and managed per project.
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
                  PostgreSQL Database &amp; Migrations
                </CardTitle>
              </div>
              <Badge variant="success" className="text-[10px]">
                Active
              </Badge>
            </div>
            <CardDescription>
              Database schema managed via migration files in{' '}
              <code className="text-slate-300 font-mono">backend/migrations/</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-400 space-y-2">
              <p>
                Migrations:{' '}
                <span className="font-mono text-slate-200">
                  001_initial_schema.sql &rarr; 004_auth_and_connections.sql
                </span>
              </p>
              <p>
                Tables:{' '}
                <span className="font-mono text-slate-300">projects</span>,{' '}
                <span className="font-mono text-slate-300">users</span>,{' '}
                <span className="font-mono text-slate-300">sessions</span>,{' '}
                <span className="font-mono text-slate-300">github_connections</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <CardTitle className="text-base text-slate-200">Notifications</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Placeholder
              </Badge>
            </div>
            <CardDescription>
              Choose how incident and runtime error notifications are delivered.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
              Notification channels will be customizable in future releases.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
