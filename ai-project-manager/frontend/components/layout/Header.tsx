'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HealthStatus } from '@/types';
import { Activity, Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const Header = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
      </div>
    </header>
  );
};
