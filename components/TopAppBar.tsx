import Link from "next/link";
import { BackIcon } from "./icons";

type Props = {
  title?: React.ReactNode;
  /** When set, shows a back chevron linking here. */
  backHref?: string;
  right?: React.ReactNode;
  /** Use the brand wordmark instead of a plain title. */
  brand?: boolean;
};

export function TopAppBar({ title, backHref, right, brand }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-page)]/95 px-3 backdrop-blur">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink)] active:bg-accent-tint"
        >
          <BackIcon width={22} height={22} />
        </Link>
      ) : (
        <span className="w-1" />
      )}

      <div className="flex-1 truncate">
        {brand ? (
          <span className="text-lg font-extrabold tracking-tight">
            Nail<span className="text-accent">Lib</span>
          </span>
        ) : (
          <span className="truncate text-base font-semibold text-[var(--color-ink)]">{title}</span>
        )}
      </div>

      {right}
    </header>
  );
}
