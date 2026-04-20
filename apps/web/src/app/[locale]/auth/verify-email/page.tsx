import { Suspense } from "react";
import { VerifyEmailCard } from "@/components/VerifyEmailCard";

export default function VerifyEmailPage() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<div className="mx-auto h-[420px] w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-md" />}>
          <VerifyEmailCard />
        </Suspense>
      </div>
    </section>
  );
}
