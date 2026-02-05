"use client";

import { useState } from "react";

export function FaqAccordion({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="pr-4 font-medium text-white">{question}</span>
        <span
          className={`shrink-0 text-text-dim transition-transform ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all ${open ? "max-h-96 pb-4" : "max-h-0"}`}
      >
        <p className="text-sm leading-relaxed text-text-muted">{answer}</p>
      </div>
    </div>
  );
}
