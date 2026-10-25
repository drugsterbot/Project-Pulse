export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path className="pulse-line" d="M4 17h6l3-8 5 15 3-7h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-[17px] font-semibold tracking-tight ${light ? "text-white" : "text-ink"}`}>ProjectPulse</span>
    </span>
  );
}
