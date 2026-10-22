import React, { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Card = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={twMerge(
      clsx(
        'rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm backdrop-blur-sm transition-all',
        className
      )
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={twMerge(clsx('flex flex-col space-y-1.5 p-6', className))}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={twMerge(
      clsx('text-lg font-semibold leading-none tracking-tight text-slate-100', className)
    )}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={twMerge(clsx('text-sm text-slate-400', className))}
    {...props}
  >
    {children}
  </p>
);

export const CardContent = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={twMerge(clsx('p-6 pt-0', className))} {...props}>
    {children}
  </div>
);

export const CardFooter = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={twMerge(
      clsx('flex items-center p-6 pt-0 border-t border-slate-800/60 mt-4', className)
    )}
    {...props}
  >
    {children}
  </div>
);
