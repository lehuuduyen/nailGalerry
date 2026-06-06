import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function HeartIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 20s-7-4.35-9.5-8.5C1 8.5 2.5 5 6 5c2 0 3 1.2 4 2.5C11 6.2 12 5 14 5c3.5 0 5 3.5 3.5 6.5C19 15.65 12 20 12 20Z" />
    </svg>
  );
}

export function SparkleIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M12 3v4M12 17v4M4 12h4M16 12h4" />
      <path d="M12 8.5 13.2 11l2.3 1-2.3 1L12 15.5 10.8 13l-2.3-1 2.3-1L12 8.5Z" />
    </svg>
  );
}

export function AdminIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}

export function SearchIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function FilterIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  );
}

export function BackIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function CloseIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function CheckIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function InstagramIcon({ filled, ...props }: IconProps) {
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  );
}
