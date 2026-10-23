'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  // The sign-in page is a full screen experience without the app chrome.
  if (pathname === '/login' || pathname === '/signup') {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
