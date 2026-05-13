"use client";

import { useMemo, useState } from "react";
import { InputPanel } from "@/components/InputPanel";
import { StrategyView } from "@/components/StrategyView";
import { buildStrategy } from "@/lib/engine";
import { ASTRO_DATING_EXAMPLE } from "@/lib/example";
import type { ProductInput } from "@/types/strategy";

const EMPTY_INPUT: ProductInput = {
  name: "",
  category: "",
  description: "",
  price: "",
  businessModel: "subscription",
  audience: "",
  audiencePain: "",
  competitors: "",
  differentiator: "",
  goal: "",
  awareness: "problem-aware",
  sophistication: "amplified-claims",
};

export default function Page() {
  const [input, setInput] = useState<ProductInput>(EMPTY_INPUT);

  const strategy = useMemo(() => buildStrategy(input), [input]);

  // Workspace stays usable even with thin inputs, but we want the empty
  // state for a completely empty form so the first impression is not
  // generic placeholder text.
  const hasMeaningfulInput = Boolean(
    input.name.trim() || input.audience.trim() || input.differentiator.trim()
  );

  return (
    <main className="grid h-dvh min-h-dvh w-full grid-rows-[auto_1fr] bg-ink-950 text-ink-100 md:grid-cols-[380px_1fr] md:grid-rows-1">
      <InputPanel
        value={input}
        onChange={setInput}
        onLoadExample={() => setInput(ASTRO_DATING_EXAMPLE)}
        onReset={() => setInput(EMPTY_INPUT)}
      />
      <StrategyView
        input={input}
        strategy={strategy}
        hasMeaningfulInput={hasMeaningfulInput}
      />
    </main>
  );
}
