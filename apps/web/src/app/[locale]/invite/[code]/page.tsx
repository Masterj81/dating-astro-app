import { Link } from "@/i18n/navigation";
import { SITE } from "@/lib/constants";

type InvitePageProps = {
  params: Promise<{ code: string; locale: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-accent/15 text-5xl">
          🎁
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white">
          You&apos;ve been invited!
        </h1>
        <p className="mt-3 text-lg text-text-muted">
          Join AstroDating and you both get <strong className="text-white">1 month of premium free</strong>.
        </p>

        {/* Code display */}
        <div className="mt-8 rounded-2xl border border-accent/20 bg-accent/8 p-6">
          <p className="text-xs uppercase tracking-widest text-text-dim">Your referral code</p>
          <p className="mt-2 text-3xl font-bold tracking-[0.2em] text-white">{upperCode}</p>
          <p className="mt-3 text-sm text-text-muted">
            Enter this code after signing up to claim your reward
          </p>
        </div>

        {/* CTAs */}
        <div className="mt-8 space-y-3">
          <a
            href={`${SITE.links.playStore}&referrer=utm_source%3Dreferral%26utm_content%3D${upperCode}`}
            className="flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            📱 Download on Google Play
          </a>
          <Link
            href="/auth/signup"
            className="flex items-center justify-center gap-2 rounded-full border border-border px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-card-hover"
          >
            🌐 Sign up on the Web
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-10 space-y-4 text-left">
          <p className="text-xs uppercase tracking-widest text-text-dim">How it works</p>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">1</span>
            <p className="text-sm text-text-muted">Download AstroDating or sign up on the web</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">2</span>
            <p className="text-sm text-text-muted">Create your profile and enter your birth details</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">3</span>
            <p className="text-sm text-text-muted">
              Go to Settings → Invite Friends and enter code <strong className="text-white">{upperCode}</strong>
            </p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">✓</span>
            <p className="text-sm text-text-muted">Both you and your friend get 1 month premium free!</p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-10 text-xs text-text-dim">
          AstroDating — Love written in the stars ✨
        </p>
      </div>
    </div>
  );
}
