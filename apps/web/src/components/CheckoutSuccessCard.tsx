"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function CheckoutSuccessCard() {
  const t = useTranslations("webApp");

  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-border bg-card/90 p-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/8 p-2 shadow-[0_0_30px_rgba(233,69,96,0.12)]">
        <Image
          src="/icon-192.png"
          alt="AstroDating"
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl"
          priority
        />
      </div>
      <h2 className="mt-6 text-3xl font-semibold text-white">
        {t("checkoutSuccessTitle")}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-text-muted">
        {t("checkoutSuccessBody")}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/app/profile"
          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("openProfile")}
        </Link>
        <Link
          href="/app/plans"
          className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
        >
          {t("backToPlans")}
        </Link>
      </div>
    </div>
  );
}
