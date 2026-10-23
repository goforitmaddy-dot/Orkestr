import React, { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'neutral' | 'outline';
}

export const Badge = ({
  className,
  variant = 'default',
  children,
  ...props
}: BadgeProps) => {
  const variants = {
    default: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    outline: 'bg-transparent text-slate-400 border-slate-700',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide transition-colors',
          variants[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
};
