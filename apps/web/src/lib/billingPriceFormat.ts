export type PriceInfo = {
  priceId: string;
  unitAmount: number | null;
  currency: string;
  interval: string | null;
} | null;

export type PriceMap = Partial<Record<string, PriceInfo>>;

/**
 * Format a Stripe price into a display string like "$4.99 / month".
 * Returns the fallback string when price data is missing.
 */
export function formatPrice(
  price: PriceInfo,
  locale: string,
  periodLabels: { monthly: string; yearly: string },
  fallback: string
): string {
  if (!price?.currency || price.unitAmount == null) {
    return fallback;
  }

  const amount = price.unitAmount / 100;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency.toUpperCase(),
  }).format(amount);

  const intervalLabel =
    price.interval === "month"
      ? periodLabels.monthly
      : price.interval === "year"
        ? periodLabels.yearly
        : null;

  return `${formatted}${intervalLabel ? ` / ${intervalLabel}` : ""}`;
}
