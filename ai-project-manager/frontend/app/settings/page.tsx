'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Settings, Cpu, Database, KeyRound, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          Settings
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Workspace preferences and configuration placeholders
        </p>
      </div>

      <div className="space-y-5">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-base text-slate-200">
                  General Preferences
                </CardTitle>
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
              <p>Current schema version: <span className="font-mono text-slate-200">001_initial_schema.sql</span></p>
              <p>Tables: <span className="font-mono text-slate-300">projects</span>, <span className="font-mono text-slate-300">users</span>, <span className="font-mono text-slate-300">project_members</span></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
