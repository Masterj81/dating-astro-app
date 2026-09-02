import { Suspense } from "react";
import { ResetPasswordCard } from "@/components/ResetPasswordCard";
import { StarField } from "@/components/StarField";

export default function ResetPasswordPage() {
  return (
    <section className="relative min-h-screen bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary px-4 py-16">
      <StarField count={60} />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_30%,rgba(201,134,146,0.08),transparent)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-5xl">
        <Suspense fallback={<div className="mx-auto h-[640px] w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-md" />}>
          <ResetPasswordCard />
        </Suspense>
      </div>
    </section>
  );
}
