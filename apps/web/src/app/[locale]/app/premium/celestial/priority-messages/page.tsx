import { redirect } from "@/i18n/navigation";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// "Priority messages" never had a real backend signal — the page just
// surfaced generic chat counters under a premium label. Retired with the
// conversation-first product change. The route stays so cached links
// don't 404 — it redirects back to the Celestial hub.
export default async function CelestialPriorityMessagesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  redirect({
    href: "/app/premium/celestial",
    locale,
  });
}

