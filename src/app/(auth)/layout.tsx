import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-white lg:flex">
        <Logo light />
        <div>
          <svg viewBox="0 0 400 80" className="mb-8 w-full max-w-md" fill="none" aria-hidden>
            <path className="pulse-line" d="M0 44h96l20-34 36 66 24-48 20 16h204" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Know where every project stands before the stand-up starts.</h2>
          <ul className="mt-6 max-w-md space-y-2 text-slate-300">
            <li>Daily reports with evidence, reviewed in one queue.</li>
            <li>Tasks, milestones and timelines that update each other.</li>
            <li>Delay risks explained with the data behind them.</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">ProjectPulse</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12"><div className="w-full max-w-sm">{children}</div></div>
    </div>
  );
}
