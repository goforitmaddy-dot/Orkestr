import React from 'react';
import { LucideIcon, FolderGit2 } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState = ({
  icon: Icon = FolderGit2,
  title,
  description,
  action,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/80 text-indigo-400 mb-4 border border-slate-700/60 shadow-inner">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-medium text-slate-200">{title}</h3>
      <p className="mt-1 text-xs text-slate-400 max-w-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
