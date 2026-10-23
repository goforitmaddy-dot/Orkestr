'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';

interface NavLink {
  name: string;
  href: string;
}

const NAV_LINKS: NavLink[] = [
  { name: 'Product', href: '#features' },
  { name: 'How It Works', href: '#preview' },
  { name: 'Integrations', href: '#features' },
];

const LOGIN_HREF = '/login';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <>
      <nav
        className="fixed inset-x-0 top-0 z-40 border-b border-slate-800/60 bg-orkestr-navy/80 backdrop-blur-md"
        aria-label="Main navigation"
      >
        <div className="mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 4v8" />
                <path d="M4 12h8" />
                <path d="M12 20v-8" />
                <path d="M20 12h-8" />
                <path d="M16.24 7.76a4 4 0 0 1 5.66 5.66l-5.66 5.66a4 4 0 0 1-5.66-5.66z" />
                <path d="M7.76 16.24a4 4 0 0 1-5.66-5.66l5.66-5.66a4 4 0 0 1 5.66 5.66z" />
              </svg>
            </div>
            <span className="text-base font-semibold text-slate-100 tracking-tight">
              Orkestr
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-slate-300 hover:text-orkestr-teal transition-colors focus-visible:ring-2 focus-visible:ring-orkestr-teal focus-visible:ring-offset-2 focus-visible:ring-offset-orkestr-navy rounded"
              >
                {link.name}
              </a>
            ))}
            <div className="flex items-center gap-3">
              <a
                href={LOGIN_HREF}
                className="text-sm font-medium text-slate-300 hover:text-orkestr-teal transition-colors"
              >
                Log in
              </a>
              <Link
                href={LOGIN_HREF}
                className="rounded-full border border-orkestr-yellow bg-orkestr-yellow text-[#0F1222] px-5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#d4d300] transition-colors focus-visible:ring-2 focus-visible:ring-orkestr-yellow"
              >
                Get Started
              </Link>
            </div>
          </div>

          <button
            onClick={toggle}
            className="lg:hidden p-2 rounded-md text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            aria-label="Open navigation menu"
          >
            {isOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        className={`fixed inset-x-0 top-16 border-b border-slate-800 bg-orkestr-navy/95 backdrop-blur-md z-40 ${
          isOpen
            ? 'max-h-[60vh] opacity-100 overflow-y-auto'
            : 'max-h-0 opacity-0 overflow-hidden'
        } transition-all duration-300 ease-in-out`}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto max-w-7xl flex flex-col items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full flex flex-col gap-4 text-center sm:text-left">
            {NAV_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-orkestr-teal rounded-lg transition-colors"
              >
                {link.name}
              </a>
            ))}
            <div className="w-full flex flex-col gap-2 pt-4 border-t border-slate-800">
              <a
                href={LOGIN_HREF}
                onClick={() => setIsOpen(false)}
                className="px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-orkestr-teal rounded-lg transition-colors"
              >
                Log in
              </a>
              <Link
                href={LOGIN_HREF}
                onClick={() => setIsOpen(false)}
                className="w-full rounded-full border border-orkestr-yellow bg-orkestr-yellow text-[#0F1222] px-5 py-3 text-xs font-bold uppercase tracking-wider text-center hover:bg-[#d4d300] transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>

          <button
            onClick={toggle}
            className="absolute top-6 right-6 p-2 rounded-md text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}
