import { AuthCard } from "@/components/AuthCard";
import { StarField } from "@/components/StarField";

export default function LoginPage() {
  return (
    <section className="relative min-h-screen bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary px-4 py-16">
      <StarField count={60} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_30%,rgba(118,129,255,0.08),transparent)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl">
        <AuthCard mode="login" />
      </div>
    </section>
  );
}
