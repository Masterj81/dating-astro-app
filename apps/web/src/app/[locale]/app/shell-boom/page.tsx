// TEMPORARY diagnostic route (diag/shell-500 branch) — NEVER COMMIT to any
// PR branch. Triggers an uncaught server-render error to study the
// pre-hydration __next_error__ shell. Fully synthetic: no secret, cookie,
// token or user data is involved anywhere in this file.
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShellBoomPage() {
  // Touch request data so the render behaves like every other /app page.
  await headers();
  // SYNTHETIC_MARKER_SHELL500: the thrown value carries no sensitive data.
  throw new Error("SYNTHETIC_MARKER_SHELL500");
}
