import { AuthCard } from "@/components/AuthCard";

export default function SignupPage() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <AuthCard mode="signup" />
      </div>
    </section>
  );
}
