/**
 * FaqAccordion — native <details>/<summary> server component.
 *
 * Previous version used "use client" + useState just for open/close toggle.
 * Native HTML disclosure widget gives us the same UX with zero JS, zero
 * hydration cost, and better accessibility (keyboard / screen-reader support
 * built-in).
 */
export function FaqAccordion({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="group border-b border-border">
      <summary className="flex w-full cursor-pointer list-none items-center justify-between py-4 text-left [&::-webkit-details-marker]:hidden">
        <span className="pr-4 font-medium text-white">{question}</span>
        <span className="shrink-0 text-text-dim transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="pb-4">
        <p className="text-sm leading-relaxed text-text-muted">{answer}</p>
      </div>
    </details>
  );
}
