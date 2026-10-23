'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError } from '@/lib/api';

const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = searchParams.get('next') || '/dashboard';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 mb-4">
            <Github className="w-6 h-6 text-indigo-300" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Orkestr</h1>
          <p className="text-sm text-slate-400 mt-2">
            {mode === 'signin'
              ? 'Sign in to monitor your pipelines with your own GitHub token.'
              : 'Create an account to start monitoring your pipelines.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl"
        >
          {mode === 'signup' && (
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              required
              autoComplete="name"
            />
          )}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={submitting}>
            {mode === 'signin' ? (
              <>
                <KeyRound className="w-4 h-4" /> Sign in
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Create account
              </>
            )}
          </Button>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span>{mode === 'signin' ? 'New to Orkestr?' : 'Already have an account?'}</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6 text-center leading-relaxed">
          Your GitHub personal access token is stored encrypted and is only used to read the
          repositories you monitor.
        </p>
      </div>
    </div>
  );
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-slate-950" />}
    >
      <LoginForm />
    </Suspense>
  );
}
