import {
  Activity,
  AlertTriangle,
  Brain,
  Clock,
  GitBranch,
  MapPin,
  Radio,
  Terminal,
  Users,
} from 'lucide-react';

export function ProductPreview() {
  return (
    <section
      id="preview"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-24 border-y border-slate-800/50 bg-slate-900/40"
      aria-labelledby="preview-heading"
    >
      <div className="text-center mb-16">
        <h2
          id="preview-heading"
          className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-3"
        >
          See Orkestr in action
        </h2>
        <p className="text-sm text-orkestr-blue-grey max-w-md mx-auto font-medium tracking-wide uppercase letter-spacing-wider">
          Sample dashboard preview &mdash; illustrative data
        </p>
      </div>

      {/* Browser frame */}
      <div className="mx-auto max-w-4xl">
        <div className="relative rounded-2xl border border-slate-700 bg-[#0F1222] shadow-2xl overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-700/50 bg-slate-950/80">
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: i === 1 ? '#ff5f56' : i === 2 ? '#ffbd2e' : '#27c93f' }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="flex items-center gap-2 ml-4">
              <span className="text-[10px] text-slate-500 font-mono">orkestr.io</span>
              <span className="text-[10px] text-slate-600 font-mono">/monitor</span>
            </div>
            <div className="ml-auto flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
              ))}
            </div>
          </div>

          <div className="p-6 lg:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left: live monitor */}
              <div className="lg:w-1/2 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orkestr-teal" />
                    <span className="text-sm font-semibold text-slate-100">Live Monitor</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-500/40 text-[10px] text-emerald-400">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                      </span>
                      Stream live
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">sample data</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-700 bg-slate-950/60">
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Active Errors</div>
                    <div className="text-2xl font-bold text-slate-100">3</div>
                    <p className="text-xs text-slate-500 mt-1">1 CI &middot; 2 runtime</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-700 bg-slate-950/60">
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Incident Status</div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden="true" />
                      <span className="text-sm font-semibold text-rose-300">Open</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-700 bg-slate-950/60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Assigned to</div>
                    <span className="text-[10px] font-mono text-slate-400">SRE Team</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Users className="w-3 h-3" />
                    <span>sample assignment</span>
                  </div>
                </div>
              </div>

              {/* Right: failed workflow + AI diagnosis */}
              <div className="lg:w-1/2 space-y-5">
                {/* Failed workflow card */}
                <div className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-mono text-slate-300">owner/repository</span>
                    <span className="ml-auto text-[10px] font-mono text-rose-400">failed &middot; main</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-slate-100">deploy.yml failed</div>
                        <div className="text-xs text-slate-500">Build &middot; Run #248</div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0F1222] border border-slate-800 text-xs font-mono text-slate-400 overflow-x-auto max-h-32">
                      {`$ yarn build
vite build
✓ building...
✗ [ERROR] TypeError: Cannot read properties of undefined (reading 'checkout')
  at PaymentForm.onSubmit (src/components/PaymentForm.tsx:42:18)
  at Object.<anonymous> (src/components/PaymentForm.tsx:15:7)
error Command failed with exit code 1.`}
                    </div>
                  </div>
                </div>

                {/* AI diagnosis card */}
                <div className="rounded-xl border border-orkestr-teal/30 bg-orkestr-teal/10 overflow-hidden">
                  <div className="px-4 py-3 border-b border-orkestr-teal/20 flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-orkestr-teal" />
                    <span className="text-xs font-mono text-orkestr-teal">AI diagnosis</span>
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-medium text-slate-300 mb-2">Likely root cause</div>
                    <p className="text-sm text-slate-200 mb-3 leading-relaxed">
                      The <code className="font-mono text-orkestr-soft-blue">PaymentForm</code>
                      component references <code className="font-mono text-orkestr-soft-blue">checkout</code>
                      before it&rsquo;s defined, causing the build to fail on the <code className="font-mono text-orkestr-soft-blue">main</code>
                      branch.
                    </p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span>Location not identified</span>
                      </div>
                      <div className="h-3 w-px bg-slate-700" />
                      <span>Evidence-based</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600 font-mono uppercase tracking-wider">
          Illustrative preview only &mdash; not live data from your account
        </p>
      </div>
    </section>
  );
}
