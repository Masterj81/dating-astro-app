import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ContactForm } from "@/components/ContactForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

export default function ContactPage() {
  const t = useTranslations("contact");

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-8 text-text-muted">{t("subtitle")}</p>
      <ContactForm />
    </div>
  );
}
