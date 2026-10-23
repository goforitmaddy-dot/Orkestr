import Link from 'next/link';

export function HeroSection() {
  return (
    <section
      id="hero"
      className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-32 overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Background grid + atmospheric glows */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(122, 181, 192, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(122, 181, 192, 0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orkestr-teal/20 blur-[120px] animate-pulse"
          style={{ animationDuration: '20s' }}
          aria-hidden="true"
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] rounded-full bg-indigo-500/10 blur-[100px] animate-pulse"
          style={{ animationDelay: '-5s', animationDuration: '18s' }}
          aria-hidden="true"
        />
      </div>

      <div className="text-center max-w-2xl">
        <h1
          id="hero-heading"
          className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-100 leading-tight mb-6"
        >
          Every failure has a cause.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orkestr-teal to-orkestr-soft-blue">
            Find it faster.
          </span>
        </h1>
        <p className="text-lg md:text-xl text-orkestr-blue-grey leading-relaxed mb-10 max-w-xl mx-auto">
          Orkestr connects your engineering workflow, detects CI/CD failures,
          and uses AI to help your team understand what broke, why it happened,
          and what to fix next.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-orkestr-yellow bg-orkestr-yellow text-[#0F1222] px-8 py-3.5 text-sm font-bold uppercase tracking-wider shadow-lg shadow-orkestr-yellow/25 hover:bg-[#d4d300] hover:shadow-orkestr-yellow/40 transition-colors focus-visible:ring-2 focus-visible:ring-orkestr-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-orkestr-navy"
          >
            Get Started
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-slate-700 bg-transparent px-8 py-3.5 text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-orkestr-teal transition-colors focus-visible:ring-2 focus-visible:ring-orkestr-teal focus-visible:ring-offset-2 focus-visible:ring-offset-orkestr-navy"
          >
            Explore the Platform
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-2"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
