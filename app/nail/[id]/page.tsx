import { notFound, permanentRedirect } from "next/navigation";
import { getSlugById } from "@/lib/db";

// Legacy design URL. Designs now live at /designs/[slug] (SEO-friendly); send
// old /nail/[id] links there with a permanent (301/308) redirect so existing
// links + saved items keep working and SEO consolidates on one URL.
export const dynamic = "force-dynamic";

export default async function LegacyNailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slug = await getSlugById(id).catch(() => null);
  if (!slug) notFound();
  permanentRedirect(`/designs/${slug}`);
}
