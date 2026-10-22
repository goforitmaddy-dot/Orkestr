import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner = ({ label = 'Loading...', size = 'md' }: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 gap-3">
      <Loader2 className={`animate-spin text-indigo-500 ${sizeClasses[size]}`} />
      {label && <p className="text-xs text-slate-400 font-medium">{label}</p>}
    </div>
  );
};
