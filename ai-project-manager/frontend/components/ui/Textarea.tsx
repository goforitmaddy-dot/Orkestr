import React, { TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, rows = 3, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-medium text-slate-300">
            {label}
            {props.required && <span className="text-rose-400 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          className={twMerge(
            clsx(
              'flex w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm transition-colors',
              'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
              'disabled:cursor-not-allowed disabled:opacity-50 resize-y',
              error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
              className
            )
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-400">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
