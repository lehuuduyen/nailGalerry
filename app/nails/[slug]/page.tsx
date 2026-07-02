import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { NailGrid } from "@/components/NailGrid";
import { getPublishedDesigns } from "@/lib/db";
import { filterNails } from "@/lib/filter";
import { COLLECTIONS, getCollection, MIN_COLLECTION_DESIGNS, type Collection } from "@/lib/collections";
import { SITE_URL, SITE_NAME, designUrl } from "@/lib/site";
import type { Nail } from "@/lib/types";

// ISR: pre-render every collection at build, refresh hourly so newly approved
// designs (and like-count reordering) show up in the category grids.
export const revalidate = 3600;
export const dynamicParams = false;

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

/** Designs matching a collection's filter (newest/most-liked first from the DB). */
function selectDesigns(all: Nail[], c: Collection): Nail[] {
  return filterNails(all, c.filters, "");
}

/** Up to 8 sibling/related collections for internal linking, self excluded. */
function relatedCollections(current: Collection): Collection[] {
  const entries = Object.entries(current.filters) as [keyof Collection["filters"], string[]][];
  const shares = (c: Collection) =>
    entries.some(([k, vals]) => c.filters[k]?.some((v) => vals?.includes(v)));
  const related = COLLECTIONS.filter((c) => c.slug !== current.slug && shares(c));
  const fill = COLLECTIONS.filter((c) => c.slug !== current.slug && !related.includes(c));
  return [...related, ...fill].slice(0, 8);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = getCollection(slug);
  if (!c) return { title: "Collection not found" };
  const description = `${c.blurb} Browse the collection on ${SITE_NAME}.`;
  const url = `${SITE_URL}/nails/${slug}`;
  return {
    title: c.title,
    description,
    keywords: c.keywords,
    alternates: { canonical: `/nails/${slug}` },
    openGraph: { title: c.title, description, url, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary_large_image", title: c.title, description },
  };
}

export default async function CollectionPage({ params }: Params) {
  const { slug } = await params;
  const c = getCollection(slug);
  if (!c) notFound();

  const all = await getPublishedDesigns().catch(() => []);
  const designs = selectDesigns(all, c);

  // Gate thin categories out of the index. When the DB is unreachable at build
  // (all === []) we still render the shell so the route exists and revalidates.
  if (all.length > 0 && designs.length < MIN_COLLECTION_DESIGNS) notFound();

  const url = `${SITE_URL}/nails/${slug}`;
  const related = relatedCollections(c);

  // CollectionPage + ItemList of the designs it contains.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name: c.heading,
    description: c.blurb,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: designs.length,
      itemListElement: designs
        .filter((n) => n.slug)
        .slice(0, 30)
        .map((n, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: designUrl(n.slug!),
          name: n.title,
        })),
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TopAppBar title={c.heading} backHref="/" />

      <div className="px-4 pt-4">
        <h1 className="text-xl font-bold text-[var(--color-ink)]">{c.heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          {c.blurb} {designs.length} {designs.length === 1 ? "design" : "designs"}.
        </p>
      </div>

      <NailGrid
        nails={designs}
        emptyTitle="No designs yet"
        emptyHint="Check back soon — this collection is filling up."
      />

      {related.length > 0 && (
        <nav className="px-4 pb-8 pt-2" aria-label="Related collections">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">Browse more</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/nails/${r.slug}`}
                className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)]"
              >
                {r.heading}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
