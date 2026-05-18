"use client";

import { useMemo, useState } from "react";
import { InputPanel } from "@/components/InputPanel";
import { StrategyView } from "@/components/StrategyView";
import {
  ProjectSwitcher,
  WorkspaceTab,
  useWorkspace,
} from "@/components/WorkspacePanel";
import {
  ReviewBoardTab,
  useReviewBoard,
} from "@/components/ReviewPanel";
import { buildStrategy } from "@/lib/engine";
import { buildNextIterationPlan } from "@/lib/engine/iteration-planner";
import { generateExportBrief } from "@/lib/engine/export-brief";
import { ASTRO_DATING_EXAMPLE } from "@/lib/example";
import type { ProductInput, Strategy } from "@/types/strategy";

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
  const workspaceState = useWorkspace();

  // Latest saved run for the active project — used to seed the
  // Review & Approval board. When no run exists, the review tab
  // renders its empty state ("Save a run first to start a Review
  // Board").
  const latestRun = useMemo(() => {
    const runs = workspaceState.runs;
    if (runs.length === 0) return null;
    return runs
      .slice()
      .sort((a, b) => (a.runAt < b.runAt ? 1 : a.runAt > b.runAt ? -1 : 0))[0];
  }, [workspaceState.runs]);

  const reviewState = useReviewBoard({
    projectId: workspaceState.activeProjectId,
    run: latestRun,
  });

  // Base strategy from the engine — pure, deterministic.
  const baseStrategy = useMemo(() => buildStrategy(input), [input]);

  // Workspace-aware strategy: re-run the iteration planner with the
  // derived learning memory, re-emit the export brief with the
  // Campaign Log section. The engine itself stays pure — this is a
  // client-layer composition step.
  const strategy: Strategy = useMemo(() => {
    const memory = workspaceState.learningMemory;
    const hasMemory = memory.learnings.length > 0;
    const hasWorkspaceData =
      workspaceState.runs.length > 0 ||
      workspaceState.results.length > 0 ||
      hasMemory;

    if (!hasWorkspaceData) return baseStrategy;

    const nextIterationPlan = hasMemory
      ? buildNextIterationPlan({
          input,
          kpiLadder: baseStrategy.kpiLadder,
          creativeTestingMatrix: baseStrategy.creativeTestingMatrix,
          proofAssetPlan: baseStrategy.proofAssetPlan,
          hookLibrary: baseStrategy.hookLibrary,
          adConceptCards: baseStrategy.adConceptCards,
          learningMemory: memory,
        })
      : baseStrategy.nextIterationPlan;

    const partial: Strategy = {
      ...baseStrategy,
      nextIterationPlan,
    };

    const exportBrief = generateExportBrief(input, partial, {
      runs: workspaceState.runs,
      results: workspaceState.results,
      learningMemory: hasMemory ? memory : undefined,
    });

    return { ...partial, exportBrief };
  }, [
    input,
    baseStrategy,
    workspaceState.learningMemory,
    workspaceState.runs,
    workspaceState.results,
  ]);

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
      <div className="flex h-full w-full flex-col">
        <ProjectSwitcher
          state={workspaceState}
          currentInput={input}
          currentStrategy={strategy}
          onLoadInput={setInput}
        />
        <div className="min-h-0 flex-1">
          <StrategyView
            input={input}
            strategy={strategy}
            hasMeaningfulInput={hasMeaningfulInput}
            workspaceSlot={
              <WorkspaceTab state={workspaceState} currentStrategy={strategy} />
            }
            reviewSlot={<ReviewBoardTab state={reviewState} />}
          />
        </div>
      </div>
    </main>
  );
}
