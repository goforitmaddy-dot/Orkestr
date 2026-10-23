'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Bot,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar = ({ isCollapsed, onToggleCollapse }: SidebarProps) => {
  const pathname = usePathname();

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      name: 'Projects',
      href: '/projects',
      icon: FolderKanban,
      active: pathname.startsWith('/projects'),
    },
    {
      name: 'Live Monitor',
      href: '/monitor',
      icon: Activity,
      active: pathname === '/monitor',
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      active: pathname === '/settings',
    },
  ];

  return (
    <aside
      className={clsx(
        'relative flex flex-col border-r border-slate-800 bg-slate-950 transition-all duration-300 ease-in-out z-30 shrink-0',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/20">
            <Bot className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-semibold text-slate-100 tracking-tight">
                Orkestr
              </span>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                AI Project Manager
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                item.active
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <Icon
                className={clsx(
                  'h-5 w-5 shrink-0 transition-colors',
                  item.active ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200',
                  !isCollapsed && 'mr-3'
                )}
              />
              {!isCollapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </div>

      {/* Footer / System Info */}
      <div className="p-3 border-t border-slate-800/80">
        <div
          className={clsx(
            'flex items-center rounded-lg bg-slate-900/60 p-2 text-xs text-slate-400 border border-slate-800/60',
            isCollapsed ? 'justify-center' : 'justify-between'
          )}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            {!isCollapsed && <span className="text-[11px] truncate">MVP Core v0.1.0</span>}
          </div>
          {!isCollapsed && (
            <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
              REST
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
