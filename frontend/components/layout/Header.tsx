
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HealthStatus } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  Activity,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  User,
  LogIn,
  UserPlus,
  Radio,
} from 'lucide-react';

export const Header = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // A verified personal token is just as valid as the server-wide fallback.
  const monitoringConfigured =
    health?.services.monitoring === 'configured' || health?.github?.userTokenConfigured === true;
  const githubAccount = health?.github?.accountLogin;
  const githubSource = health?.github?.source;

  const checkHealth = async () => {
    try {
      setLoading(true);
      const data = await api.getHealth();
      setHealth(data);
      setError(false);
    } catch {
      setError(true);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Periodically re-check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-950/70 px-6 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-slate-100 tracking-tight">
          AI Project Manager
        </h1>
        <span className="text-xs text-slate-500 font-mono">/</span>
        <span className="text-xs text-slate-400 font-medium">Hackathon MVP</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Backend / DB Status indicator */}
        <div className="flex items-center gap-2">
          {loading && !health ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-xs border border-slate-700">
              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
              <span>Connecting to API...</span>
            </div>
          ) : error ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs border border-rose-500/20 cursor-pointer"
              onClick={checkHealth}
              title="Click to retry backend connection"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>API Offline</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20"
                title={`API Server: ${health?.services.api}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>API Online</span>
              </div>

              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border ${
                  health?.services.database === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
                title={`PostgreSQL: ${health?.services.database}`}
              >
                <Database className="w-3 h-3" />
                <span className="capitalize">{health?.services.database}</span>
              </div>

              <Link
                href="/monitor"
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  monitoringConfigured
                    ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                }`}
                title={
                  monitoringConfigured
                    ? `Live monitoring: configured via ${
                        githubSource === 'user' && githubAccount
                          ? `@${githubAccount}`
                          : githubSource === 'server'
                          ? 'server token'
                          : 'GitHub'
                      } (stream ${health?.services.liveStream ?? 'idle'})`
                    : `Live monitoring: ${health?.services.monitoring ?? 'unknown'} (stream ${
                        health?.services.liveStream ?? 'idle'
                      })`
                }
              >
                <Radio className="w-3 h-3" />
                <span>
                  {monitoringConfigured
                    ? githubSource === 'user' && githubAccount
                      ? `@${githubAccount}`
                      : 'Monitoring'
                    : 'No token'}
                </span>
              </Link>
            </div>
          )}
        </div>

        <button
          onClick={checkHealth}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Refresh server status"
        >
          <Activity className="h-4 w-4" />
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* User Session Area */}
        {authLoading ? (
          <div className="h-8 w-20 bg-slate-800/60 rounded-md animate-pulse" />
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-300">
                {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-medium text-slate-200 leading-tight flex items-center gap-1.5">
                  {user.name}
                  {user.username && (
                    <span className="text-[10px] text-indigo-400 font-mono">@{user.username}</span>
                  )}
                </span>
                <span className="text-[11px] text-slate-400 leading-tight">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"
              title="Log out of session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Log out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700/80"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log in</span>
            </Link>
            <Link
              href="/register"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm shadow-indigo-600/20"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};
