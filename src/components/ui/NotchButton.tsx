import type { ButtonHTMLAttributes, ReactNode } from "react";

interface NotchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Gold (default primary action) or green (the Phase 6 Fork CTA). */
  tone?: "gold" | "green";
  children: ReactNode;
}

/** Edge + fill per tone — the bronze/green rim sits behind the clipped fill. */
const TONES = {
  gold: { edge: "bg-[#7a5e2c]", fill: "bg-primary text-primary-foreground" },
  green: { edge: "bg-[#2e5e25]", fill: "bg-success text-[#0e1a08]" },
} as const;

/**
 * The v3 notch CTA: a clipped-octagon button reproducing the design's
 * `clip-path` notch (a bronze/green rim around a gold/green fill) for the single
 * primary action per screen, without forking shadcn `Button`. Standard button
 * props (onClick, type, disabled…) pass straight through.
 */
export function NotchButton({ tone = "gold", children, className, ...props }: NotchButtonProps) {
  const { edge, fill } = TONES[tone];

  return (
    <button
      className={`notch inline-block p-[2px] shadow-lg transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 ${edge} ${className ?? ""}`}
      {...props}
    >
      <span
        className={`notchIn font-display block px-[30px] py-[13px] text-[13px] font-bold tracking-[0.1em] uppercase ${fill}`}
      >
        {children}
      </span>
    </button>
  );
}
