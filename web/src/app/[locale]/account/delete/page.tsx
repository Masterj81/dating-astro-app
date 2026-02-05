import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { AccountDeletionFlow } from "@/components/AccountDeletionFlow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accountDelete" });
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

export default function AccountDeletePage() {
  const t = useTranslations("accountDelete");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-2 text-center text-3xl font-bold text-white">
        {t("title")}
      </h1>
      <p className="mb-8 text-center text-text-muted">{t("subtitle")}</p>
      <AccountDeletionFlow />
    </div>
  );
}
