"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminIcon, HeartIcon, HomeIcon, SparkleIcon } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/favorites", label: "Saved", Icon: HeartIcon },
  { href: "/advisor", label: "Advisor", Icon: SparkleIcon },
  { href: "/admin", label: "Admin", Icon: AdminIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/nail");
  return pathname.startsWith(href);
}

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-white/95 backdrop-blur">
      <ul className="flex h-16 items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? "text-accent" : "text-[var(--color-muted)]"
                }`}
              >
                <Icon width={22} height={22} filled={active && href === "/favorites"} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
