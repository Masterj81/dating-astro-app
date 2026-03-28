import { NextResponse } from "next/server";

const PRICE_IDS = {
  celestial_monthly:
    process.env.STRIPE_PRICE_CELESTIAL_MONTHLY ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CELESTIAL_MONTHLY ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_MONTHLY ||
    "",
  celestial_yearly:
    process.env.STRIPE_PRICE_CELESTIAL_YEARLY ||
    process.env.STRIPE_PRICE_CELESTIAL_ANNUAL ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CELESTIAL_YEARLY ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_CELESTIAL_ANNUAL ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_YEARLY ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_ANNUAL ||
    "",
  cosmic_monthly:
    process.env.STRIPE_PRICE_COSMIC_MONTHLY ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_COSMIC_MONTHLY ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_MONTHLY ||
    "",
  cosmic_yearly:
    process.env.STRIPE_PRICE_COSMIC_YEARLY ||
    process.env.STRIPE_PRICE_COSMIC_ANNUAL ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_COSMIC_YEARLY ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_COSMIC_ANNUAL ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_YEARLY ||
    process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_ANNUAL ||
    "",
} as const;

type PlanKey = keyof typeof PRICE_IDS;

async function fetchStripePrice(priceId: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }

  const response = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Stripe price lookup failed with status ${response.status}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const entries = await Promise.all(
      (Object.entries(PRICE_IDS) as Array<[PlanKey, string]>).map(async ([key, priceId]) => {
        if (!priceId) {
          return [key, null] as const;
        }

        const price = await fetchStripePrice(priceId);
        return [
          key,
          {
            priceId,
            unitAmount: price.unit_amount as number | null,
            currency: price.currency as string,
            interval: (price.recurring?.interval as string | undefined) || null,
          },
        ] as const;
      })
    );

    return NextResponse.json(Object.fromEntries(entries));
  } catch (error) {
    console.error("Billing prices error:", error);
    return NextResponse.json(
      { error: "Failed to load pricing." },
      { status: 500 }
    );
  }
}
