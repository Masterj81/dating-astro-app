export function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:border-accent/30 hover:bg-card-hover hover:shadow-[0_8px_40px_rgba(232,93,117,0.08)]">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-accent/15 bg-accent/8 text-2xl" aria-hidden="true">
          {icon}
        </div>
        <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-relaxed text-text-muted">{description}</p>
      </div>
    </div>
  );
}
