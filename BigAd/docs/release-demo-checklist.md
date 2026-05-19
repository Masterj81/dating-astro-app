# CampaignOS — Release Demo Checklist

A pre-demo walkthrough to verify everything works before showing a buyer.

## Pre-flight (5 min)
- [ ] Pull latest `master`. Confirm `git status` is clean.
- [ ] `cd BigAd && npm install` if dependencies changed.
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:logic` — all tests passing.
- [ ] `npm run build` — Next.js build clean.
- [ ] Launch dev server: `npm run dev`. Open http://localhost:3000.

## First-run sanity (2 min)
- [ ] OnboardingWelcomePanel renders for a fresh browser (clear localStorage if needed).
- [ ] Goal selector shows 7 goals.
- [ ] Demo selector shows 3 demos.

## Demo flow — AstroDating Launch (8 min)
- [ ] Click "Load demo: AstroDating Launch".
- [ ] Project switcher shows the new project.
- [ ] Workspace tab shows the saved run + Next-Best-Action + Progress Checklist.
- [ ] Score tab shows Input Assistant warnings + rewritten hints.
- [ ] Positioning / Awareness / Avatars / Offer Architecture render.
- [ ] Calendar shows campaign windows + dips.
- [ ] Economics tab: status viable/tight (not unviable).
- [ ] Forecast tab: 3 scenarios + spend allocation + decision checkpoints.
- [ ] Simulator tab: 5 scenarios + sensitivities + recommendations.
- [ ] Benchmarks tab: at least 1 selected planning profile + comparison table.
- [ ] Assets tab: production queue + readiness score.
- [ ] Execution tab: first test batch with kill/scale rules.
- [ ] Review tab: 5/6 critical approved, 1 needs-changes.
- [ ] Results tab: logged actuals + decision recommendations.
- [ ] Agency tab: template + role + package selected.
- [ ] Playbooks tab: applied playbook highlighted.
- [ ] Report tab → "Open report" → /report renders with all sections.
- [ ] Report → "Print / Save as PDF" → print preview shows clean layout.
- [ ] Report → "Download Markdown" → saves `campaignos-report-<slug>.md`.
- [ ] Agency or Report → "Open client portal" → /portal renders.
- [ ] Portal section toggles work.
- [ ] Portal → "Print / Save as PDF" → clean layout.
- [ ] Portal → "Download Markdown" → saves `campaignos-portal-<slug>.md`.
- [ ] Portal → "Copy client summary" → clipboard contains a 3-line snippet.

## Naming + brand (2 min)
- [ ] Tab labels say CampaignOS (no visible BigAd).
- [ ] Report and Portal headings say CampaignOS.
- [ ] Export markdown body says CampaignOS.
- [ ] Internal references (folder path, package name) say BigAd — this is intentional.

## Storytelling (talk-track)
- [ ] Open with the input brief; show how a single brief produces a full strategy.
- [ ] Walk Score → Avatars → Offer to anchor the story.
- [ ] Show Economics + Forecast to address "is it worth running?".
- [ ] Show Simulator to address "what if I'm wrong about X?".
- [ ] Show Benchmarks to address "are my numbers realistic?".
- [ ] Show Assets + Review to address "how do I get this to launch?".
- [ ] Show Results to address "what do I do after launch?".
- [ ] Close with Report or Portal — "this is what you send the client."

## Post-demo cleanup
- [ ] Reset onboarding from the welcome panel if you want a fresh state.
- [ ] OR clear localStorage for a fully clean state.
