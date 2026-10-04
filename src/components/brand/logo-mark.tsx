/** The cabas tote bag. Decorative: pair it with visible text or an aria-label on its parent. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path
        d="M23 24v-6a9 9 0 0 1 18 0v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M11 24h42l-4 30a4 4 0 0 1-4 3.5H19a4 4 0 0 1-4-3.5z" fill="var(--primary)" />
      <path d="M38.5 35.5a7.5 7.5 0 1 0 0 9" fill="none" stroke="var(--card)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
