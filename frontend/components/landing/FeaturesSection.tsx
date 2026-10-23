import {
  Activity,
  Bell,
  Brain,
  GitBranch,
  MapPin,
  Users,
} from 'lucide-react';

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  label?: string;
}

const FEATURES: Feature[] = [
  {
    icon: GitBranch,
    title: 'CI/CD Failure Detection',
    label: 'Detect',
    description:
      'Connects to your GitHub repositories and automatically surfaces failed Actions workflows as incidents.',
  },
  {
    icon: Brain,
    title: 'AI Root-Cause Analysis',
    label: 'Analyze',
    description:
      'Analyzes build logs and error context to surface likely causes with supporting evidence.',
  },
  {
    icon: MapPin,
    title: 'Error Location',
    label: 'Locate',
    description:
      'Shows file and line references when supported by logs or source context; otherwise reports &ldquo;Location not identified.&rdquo;',
  },
  {
    icon: Users,
    title: 'Incident Assignment',
    label: 'Assign',
    description:
      'Routes incidents to the right engineer or team, with assignment tracking and history.',
  },
  {
    icon: Bell,
    title: 'Team Notifications',
    label: 'Notify',
    description:
      'Communicates incidents through configured channels such as Slack, email, and in-app alerts.',
  },
  {
    icon: Activity,
    title: 'Live Monitoring',
    label: 'Monitor',
    description:
      'Tracks workflow runs, incidents, runtime errors, and live server health from one dashboard.',
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-24"
      aria-labelledby="features-heading"
    >
      <div className="text-center mb-16">
        <h2 id="features-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-3">
          Everything you need to resolve failures
        </h2>
        <p className="text-sm text-orkestr-blue-grey max-w-md mx-auto font-medium tracking-wide uppercase letter-spacing-wider">
          Production capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group rounded-xl border border-slate-700 bg-slate-900/60 p-6 hover:border-orkestr-teal/50 hover:bg-slate-900/80 transition-all duration-200"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-800 text-orkestr-teal group-hover:bg-orkestr-teal group-hover:text-[#0F1222] transition-colors mb-4">
                <Icon className="w-5 h-5" />
              </div>
              {feature.label && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-700 bg-slate-950/50 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-3 block">
                  {feature.label}
                </span>
              )}
              <h3 className="text-sm font-semibold text-slate-100 mb-2">
                {feature.title}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
