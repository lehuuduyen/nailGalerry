import { gradientFor } from "@/lib/gradient";
import { resolveImageSrc } from "@/lib/imageUrl";

type Props = {
  seed: string;
  imageUrl?: string;
  alt?: string;
  className?: string;
  /** Target render width — hints CDN image resizing (cards ~400px). */
  width?: number;
  children?: React.ReactNode;
};

/**
 * Visual stand-in for a nail photo. Renders a deterministic gradient block for
 * mock designs, or the real photo when an image URL exists (e.g. a post fetched
 * from Instagram). We use a plain <img> because the source is an arbitrary
 * external CDN URL (Instagram), which would otherwise need next/image remote
 * domain config and can expire.
 */
export function GradientThumb({ seed, imageUrl, alt = "", className = "", width, children }: Props) {
  const src = resolveImageSrc(imageUrl, width ? { width } : undefined);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: gradientFor(seed) }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // Soft glossy sheen so the gradient reads as a polished nail surface.
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/25 to-white/0" />
      )}
      {children}
    </div>
  );
}
