"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Optional sticky footer (e.g. action buttons). */
  footer?: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, children, footer }: Props) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  // Mount, then flip `shown` on the next frame so the slide-up transition runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 250);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Panel, constrained to the phone frame width */}
      <div
        className={`absolute bottom-0 w-full max-w-[430px] rounded-t-3xl bg-[var(--color-page)] shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.3)] transition-transform duration-200 ${
          shown ? "translate-y-0" : "translate-y-full"
        } flex max-h-[85vh] flex-col`}
      >
        <div className="flex items-center justify-center pt-3">
          <span className="h-1.5 w-10 rounded-full bg-[var(--color-line)]" />
        </div>
        {title && (
          <div className="px-5 pb-2 pt-3 text-base font-semibold text-[var(--color-ink)]">
            {title}
          </div>
        )}
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
