import Link from 'next/link';

const FOOTER_LINKS = [
  { name: 'Product', href: '#features' },
  { name: 'How It Works', href: '#preview' },
  { name: 'Log in', href: '/login' },
];

const DASHBOARD_LINKS = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Projects', href: '/projects' },
  { name: 'Live Monitor', href: '/monitor' },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-800/60 bg-orkestr-navy">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
              <svg
                width="16"
                height="16"
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
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-100 tracking-tight">Orkestr</span>
          </div>

          <div className="hidden lg:flex items-center gap-8 text-xs text-slate-500 font-medium">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="hover:text-orkestr-teal transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4 text-[10px] text-slate-600 font-mono">
            <span>AI Engineering Operations</span>
            <span className="h-4 w-px bg-slate-800" aria-hidden="true" />
            <span>&copy; {new Date().getFullYear()} Orkestr</span>
          </div>
        </div>

        <div className="mt-12 lg:mt-0 border-t border-slate-800/40 pt-8 lg:pt-0 lg:pl-12 lg:pr-12 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Product</p>
              <nav className="flex flex-col gap-2 text-xs text-slate-500">
                <a href="#features" className="hover:text-orkestr-teal transition-colors">
                  Features
                </a>
                <a href="#preview" className="hover:text-orkestr-teal transition-colors">
                  Dashboard preview
                </a>
              </nav>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Workspace</p>
              <nav className="flex flex-col gap-2 text-xs text-slate-500">
                {DASHBOARD_LINKS.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="hover:text-orkestr-teal transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <p className="text-[10px] text-slate-600">
            Sample data used in the marketing preview is illustrative and not tied to any real account.
          </p>
        </div>
      </div>
    </footer>
  );
}
