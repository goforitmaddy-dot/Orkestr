import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'Orkestr | AI-Powered Engineering Operations',
  description: 'From code failure to root cause. Automatically. Orkestr connects your engineering workflow, detects CI/CD failures, and uses AI to help your team understand what broke, why it happened, and what to fix next.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
