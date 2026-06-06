import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: Props) {
  return (
    <input
      className={`h-11 w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] outline-none focus:border-accent ${className}`}
      {...props}
    />
  );
}
