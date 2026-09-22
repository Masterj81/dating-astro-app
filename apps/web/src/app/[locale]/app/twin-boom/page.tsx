// TEMPORARY diagnostic route (diag/phase2-500 branch) — NEVER in the PR.
// Twin of the exact PR SHA + a synthetic 500 trigger, to prove the shell on
// Vercel without shipping a diagnostic route. Fully synthetic.
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TwinBoomPage() {
  await headers();
  throw new Error("SYNTHETIC_TWIN_500_PROBE");
}
