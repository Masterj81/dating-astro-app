import { redirect } from "@/i18n/navigation";

// The "Likes" surface was retired when JUNO moved to a
// conversation-first product: there is no swipe/like signal to source
// "people who liked you" from anymore. The route stays so cached links
// don't 404 — it redirects back to the Celestial hub.
export default async function CelestialLikesRedirect({
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
