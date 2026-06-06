import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: "soft" | "solid" | "outline";
};

const TONES = {
  soft: "bg-accent-soft text-accent",
  solid: "bg-accent text-white",
  outline: "border border-[var(--color-line)] text-[var(--color-muted)] bg-white/70",
} as const;

export function Badge({ tone = "soft", className = "", ...props }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}
