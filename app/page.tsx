import type { Metadata } from "next";
import { TopAppBar } from "@/components/TopAppBar";
import { HomeGallery } from "@/components/HomeGallery";
import { getPublishedDesigns } from "@/lib/db";

// Server-rendered home (ISR, 5 min). The design grid is fetched from Neon and
// rendered into the initial HTML so search engines see real content + links to
// every /designs/[slug] page.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "NailLib — Nail Design Library with AI Recommendations" },
  description:
    "Browse 500+ nail designs filtered by color, shape, style & occasion. Get AI-powered nail recommendations tailored to you.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const nails = await getPublishedDesigns().catch(() => []);

  return (
    <div>
      <TopAppBar brand />
      <HomeGallery initialNails={nails} />
    </div>
  );
}
