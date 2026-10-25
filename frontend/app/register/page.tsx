'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Bot, UserPlus, AlertCircle, Eye, EyeOff, Check, X } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, register } = useAuth();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [skillsInput, setSkillsInput] = useState('TypeScript, Node.js');
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(40);
  const [isAvailable, setIsAvailable] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const hasMinLength = password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Full name is required');
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      setError('Username must be at least 3 characters long (letters, numbers, underscores)');
      return;
    }

    if (!email.trim()) {
      setError('Email address is required');
      return;
    }

    if (!hasMinLength) {
      setError('Password must be at least 8 characters long');
      return;
    }

    const parsedSkills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);
      await register({
        name: name.trim(),
        username: cleanUsername,
        email: email.trim(),
        password,
        skills: parsedSkills,
        weeklyCapacityHours: Number(weeklyCapacityHours) || 40,
        isAvailable,
      });

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center py-8 px-4">
      <div className="w-full max-w-lg">
        {/* Header Icon */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-3 shadow-lg shadow-indigo-500/10">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Create Developer Account
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Join Orkestr to collaborate on projects and manage assigned tasks
          </p>
        </div>

        <Card className="border-slate-800/90 bg-slate-900/60 shadow-xl backdrop-blur-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Registration</CardTitle>
            <CardDescription>
              Set up your developer profile, skills, and unique username
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  placeholder="e.g. Alex Chen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                />

                <Input
                  label="Username"
                  placeholder="e.g. alex_chen"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  autoComplete="username"
                  helperText="Unique Orkestr handle (a-z, 0-9, _)"
                />
              </div>

              <Input
                label="Email Address"
                type="email"
                placeholder="alex@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-8 text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Password Requirement Hint */}
              <div className="flex items-center gap-2 text-xs">
                {hasMinLength ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span className={hasMinLength ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
                  At least 8 characters long
                </span>
              </div>

              <Input
                label="Technical Skills"
                placeholder="TypeScript, React, Python, PostgreSQL, AWS"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                helperText="Comma-separated skills used for AI task matching & distribution"
              />

              <div className="pt-1">
                <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <input
                    type="checkbox"
                    id="isAvailable"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />
                  <label htmlFor="isAvailable" className="cursor-pointer text-xs text-slate-300 select-none">
                    <span className="font-medium text-slate-200">Available for new task assignments</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Toggle whether Orkestr AI can suggest you for project tasks
                    </span>
                  </label>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full mt-4"
                isLoading={isSubmitting}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create Account &amp; Sign In
              </Button>
            </form>

            <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
              <p className="text-xs text-slate-400">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="font-medium text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
