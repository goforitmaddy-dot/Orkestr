'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * Blocks the application until the session is known.
 *
 * Unauthenticated visitors are sent to the login page, which stays reachable
 * so they can create an account.
 */
export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  React.useEffect(() => {
    if (!loading && !user && !isAuthRoute) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
    }
  }, [loading, user, isAuthRoute, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <LoadingSpinner size="lg" label="Restoring your session" />
      </div>
    );
  }

  if (!user && !isAuthRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <LoadingSpinner size="lg" label="Redirecting to sign in" />
      </div>
    );
  }

  return <>{children}</>;
};
