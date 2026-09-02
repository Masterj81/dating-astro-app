import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ConversationGuideOverview } from "@/components/ConversationGuideOverview";
import { getTranslations } from "next-intl/server";

// The Conversation Guide lives under /app/premium/ for URL consistency with the
// other paid surfaces, and NOTHING under that path gates on entry: there is no
// layout.tsx in the premium tree, and each feature component decides for itself.
// That is what makes this route safe for a free account to open — the one free
// situation renders with no server call at all. See the header of
// ConversationGuideOverview.tsx.
//
// The <Suspense> boundary is required, not decorative: the component reads
// `?sign=` and `?situation=` with `useSearchParams`, and Next opts the whole
// route out of static rendering without one.

export default async function ConversationGuidePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("conversationGuide")} subtitle={t("conversationGuideSubtitle")}>
      <Suspense
        fallback={
          <div className="rounded-[2rem] border border-border bg-card/90 p-8">
            <p className="text-sm text-text-muted">{t("loading")}</p>
          </div>
        }
      >
        <ConversationGuideOverview />
      </Suspense>
    </AppShell>
  );
}
