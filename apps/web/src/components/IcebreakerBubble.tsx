/**
 * Chat-bubble preview of an AI-generated icebreaker question.
 *
 * Used in the "Start with an icebreaker" feature card. Mirrors the
 * mobile chat bubble style: rounded with one tail-like asymmetric corner,
 * accent-tinted bg/border, small uppercase label above the message.
 */

export function IcebreakerBubble({
  question,
  caption = "Icebreaker",
  className = "",
}: {
  question: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl rounded-bl-md border border-accent/25 bg-accent/10 p-3 ${className}`}
      role="img"
      aria-label={`${caption}: ${question}`}
    >
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-accent/85">
        {caption}
      </p>
      <p className="text-xs leading-relaxed text-white/90 sm:text-[13px]">
        &ldquo;{question}&rdquo;
      </p>
    </div>
  );
}
