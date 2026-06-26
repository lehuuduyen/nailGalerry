import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { GradientThumb } from "@/components/GradientThumb";
import { NailGrid } from "@/components/NailGrid";
import { Badge } from "@/components/ui/Badge";
import { LikeButton } from "@/components/LikeButton";
import { TAG_GROUPS } from "@/lib/constants";
import { getDesignBySlug, getPublishedDesigns, getPublishedSlugs } from "@/lib/db";
import { similarNails } from "@/lib/filter";
import { resolveImageSrc } from "@/lib/imageUrl";
import { designUrl, SITE_NAME } from "@/lib/site";
import type { Nail } from "@/lib/types";

// ISR: pre-render all known designs at build, render new ones on first request,
// and refresh each hourly so updated tags/likes propagate.
export const revalidate = 3600;
export const dynamicParams = true;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    return (await getPublishedSlugs()).map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

type TagFields = { style: string; color: string; shape: string; length: string; occasion: string };

/** Keyword title, e.g. "Ombre Pink Almond Nails". */
function keywordTitle(n: TagFields): string {
  const words = [n.style, n.color, n.shape].filter(Boolean).join(" ");
  return `${words} Nails`.trim();
}

/** Meta description, e.g. "Pink ombre on almond-shaped nails. Browse 500+ designs by color, shape, and occasion." */
function metaDescription(n: TagFields): string {
  const lead = `${n.color} ${n.style} on ${n.shape.toLowerCase()}-shaped nails`.trim();
  const sentence = lead.charAt(0).toUpperCase() + lead.slice(1);
  return `${sentence}. Browse 500+ designs by color, shape, and occasion.`;
}

/** Longer body description (rich, unique — from the enrich pipeline). */
function bodyDescription(n: Nail): string {
  return (
    n.description ||
    `${n.length} ${n.color} ${n.shape} nails in a ${n.style} style — a ${n.occasion.toLowerCase()} nail design idea.`
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const nail = await getDesignBySlug(slug).catch(() => null);
  if (!nail) return { title: "Design not found" };

  const title = `${keywordTitle(nail)} — ${SITE_NAME}`;
  const description = metaDescription(nail);
  const image = resolveImageSrc(nail.imageUrl, { width: 1200 });
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/designs/${slug}` },
    openGraph: {
      title,
      description,
      url: designUrl(slug),
      siteName: SITE_NAME,
      type: "article",
      images: image ? [{ url: image, alt: nail.altText ?? nail.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DesignPage({ params }: Params) {
  const { slug } = await params;
  const nail = await getDesignBySlug(slug).catch(() => null);
  if (!nail) notFound();

  const all = await getPublishedDesigns().catch(() => []);
  const similar = similarNails(nail, all, 6);
  const description = bodyDescription(nail);
  const name = keywordTitle(nail);
  const url = designUrl(slug);
  const image = resolveImageSrc(nail.imageUrl, { width: 1200 });
  const keywords = [nail.style, nail.color, nail.shape, nail.length, nail.occasion, nail.mood]
    .filter(Boolean)
    .join(", ");

  // Structured data: an ImageObject (the photo) + a CreativeWork (the design).
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageObject",
        "@id": `${url}#image`,
        name,
        caption: nail.altText ?? name,
        contentUrl: image,
        url,
      },
      {
        "@type": "CreativeWork",
        "@id": `${url}#design`,
        name,
        description,
        url,
        image,
        keywords,
        ...(nail.contributor ? { creator: { "@type": "Person", name: nail.contributor } } : {}),
      },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopAppBar title={nail.title} backHref="/" />

      <GradientThumb
        seed={nail.id}
        imageUrl={nail.imageUrl}
        alt={nail.altText ?? nail.title}
        width={800}
        className="aspect-[4/5] w-full"
      />

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--color-ink)]">{nail.title}</h1>
          <LikeButton id={nail.id} initialCount={nail.likeCount ?? 0} />
        </div>
        {nail.contributor && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">Shared by {nail.contributor}</p>
        )}

        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]">{description}</p>

        <div className="mt-4 flex flex-col gap-3">
          {TAG_GROUPS.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--color-muted)]">{g.label}</span>
              <Badge tone="soft">{nail[g.key]}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="px-4 text-sm font-bold text-[var(--color-ink)]">Similar designs</h2>
        <NailGrid nails={similar} />
      </div>
    </div>
  );
}
