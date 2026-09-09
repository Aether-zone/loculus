/**
 * The loculus mark: a box with a lid, drawn open.
 *
 * A *loculus* is a compartment — the niche a thing is put away in — which is
 * what the service does with bytes. Inline SVG rather than a file so it
 * inherits `currentColor` and needs no network request; this is the convention
 * across the aether-zone frontends.
 */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-6 ${className}`}
    >
      {/* The lid, tilted off the front edge. */}
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      {/* The compartment below it. */}
      <path d="M3 8.5v7L12 20l9-4.5v-7" />
      <path d="M12 13v7" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className="text-primary" />
      <span className="text-base font-semibold tracking-tight">loculus</span>
    </span>
  );
}
