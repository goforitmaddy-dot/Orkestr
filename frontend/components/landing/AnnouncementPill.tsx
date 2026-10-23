import Link from 'next/link';

export function AnnouncementPill() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <Link
        href="#features"
        className="inline-flex items-center gap-2 min-w-[fit-content] rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-orkestr-soft-blue hover:bg-slate-800 hover:text-orkestr-teal transition-colors focus-visible:ring-2 focus-visible:ring-orkestr-teal focus-visible:ring-offset-2 focus-visible:ring-offset-orkestr-navy"
      >
        <span>Introducing AI-powered root-cause analysis</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 12 7 7 7-7" />
        </svg>
      </Link>
    </div>
  );
}
