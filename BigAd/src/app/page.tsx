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
import { AgencyTab, useAgencySelection } from "@/components/AgencyPanel";
import { PlaybookTab, usePlaybookSelection } from "@/components/PlaybookPanel";
import { AssetTab, useAssetProduction } from "@/components/AssetPanel";
import { PLAYBOOKS } from "@/lib/playbook/catalog";
import {
  OnboardingGoalPill,
  OnboardingWelcomePanel,
  useOnboarding,
} from "@/components/OnboardingWelcomePanel";
import { NextBestActionCard } from "@/components/NextBestActionCard";
import { ProgressChecklistCard } from "@/components/ProgressChecklistCard";
import {
  buildProgressChecklist,
  getNextBestAction,
} from "@/lib/onboarding/onboarding";
import { summarizeReviewBoard } from "@/lib/review/review-board";
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

  const agencyState = useAgencySelection({
    projectId: workspaceState.activeProjectId,
  });

  const playbookState = usePlaybookSelection({
    projectId: workspaceState.activeProjectId,
  });

  const selectedPlaybook = playbookState.applied
    ? PLAYBOOKS[playbookState.applied]
    : undefined;

  const onboarding = useOnboarding();

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

  // Onboarding visibility: render the welcome panel ONLY when the user
  // has no saved projects AND has not dismissed it.
  const showWelcome =
    workspaceState.projects.length === 0 && !onboarding.state.dismissed;

  // Onboarding derivation — pure, no Date.now. Feeds NextBestActionCard
  // and ProgressChecklistCard inside the Workspace tab.
  const latestRunForCtx = workspaceState.runs[workspaceState.runs.length - 1];
  const reviewSummary =
    reviewState.run && reviewState.items.length > 0
      ? summarizeReviewBoard({
          projectId: workspaceState.activeProjectId ?? "",
          runId: reviewState.run.id,
          items: reviewState.items,
          comments: reviewState.comments,
        })
      : undefined;

  const assetRunId = latestRun?.id ?? workspaceState.activeProjectId ?? null;

  const assetProductionState = useAssetProduction({
    runId: assetRunId,
    strategy,
    selectedPlaybook,
    reviewSummary,
  });
  const onboardingCtx = {
    project: workspaceState.activeProject ?? undefined,
    latestRun: latestRunForCtx,
    strategy,
    reviewSummary,
    proofAssetPlan: strategy.proofAssetPlan,
    trackingReadiness: strategy.trackingReadiness,
    inputQuality: strategy.inputQuality,
    onboardingState: onboarding.state,
  };
  const progress = buildProgressChecklist(onboardingCtx);
  const nextAction = getNextBestAction(onboardingCtx);

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
        {onboarding.state.goalId ? (
          <OnboardingGoalPill onboarding={onboarding} />
        ) : null}
        {showWelcome ? (
          <OnboardingWelcomePanel
            onboarding={onboarding}
            onLoadInput={setInput}
            onCreateEmpty={() => setInput(EMPTY_INPUT)}
          />
        ) : null}
        <div className="min-h-0 flex-1">
          <StrategyView
            input={input}
            strategy={strategy}
            hasMeaningfulInput={hasMeaningfulInput}
            workspaceSlot={
              <WorkspaceTab
                state={workspaceState}
                currentStrategy={strategy}
                onboardingSlot={
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <NextBestActionCard action={nextAction} />
                    <ProgressChecklistCard items={progress} />
                  </div>
                }
              />
            }
            reviewSlot={<ReviewBoardTab state={reviewState} />}
            agencySlot={
              <AgencyTab
                state={agencyState}
                strategy={strategy}
                reviewBoard={
                  reviewState.run
                    ? {
                        items: reviewState.items,
                        comments: reviewState.comments,
                        summary: reviewState.summary,
                      }
                    : undefined
                }
                learningMemory={workspaceState.learningMemory}
              />
            }
            playbookSlot={
              <PlaybookTab
                state={playbookState}
                input={input}
                strategy={strategy}
                agencySelection={agencyState.selection}
              />
            }
            assetSlot={
              <AssetTab
                state={assetProductionState}
                input={input}
                strategy={strategy}
              />
            }
          />
        </div>
      </div>
    </main>
  );
}
