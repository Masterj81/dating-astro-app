#!/usr/bin/env node
// JUNO-06 — canaries for the premium validators' NEW rules (2026-09-23).
//
// A rule that has never failed proves nothing. This script injects each
// defect the operator's reprise named, runs the validator against it, and
// expects EXIT 1 — then restores the tree. Any rule that stays green in the
// presence of its defect is decorative, and the canary says so loudly.
//
// Safety: every mutation is wrapped in try/finally with a restore-on-start
// pass (a .canary-backup file from an interrupted run is restored before
// anything else happens). Run: node scripts/canary-premium-validators.mjs

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_SUFFIX = ".canary-backup";

const TARGETS = {
  usage: "apps/mobile/services/premiumUsage.ts",
  gate: "apps/mobile/components/PremiumGate.tsx",
  ctx: "apps/mobile/contexts/PremiumContext.tsx",
  tarot: "apps/mobile/app/premium-screens/tarot.tsx",
};

// ── restore-on-start: an interrupted run must never leave a mutation ────────
for (const rel of Object.values(TARGETS)) {
  const bak = path.join(ROOT, rel + BACKUP_SUFFIX);
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, path.join(ROOT, rel));
    fs.rmSync(bak);
    console.log(`restored ${rel} from an interrupted canary run`);
  }
}

const runValidator = (script) => {
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", script)], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
    return { code: 0, output: "" };
  } catch (err) {
    // Validators report issues on stderr AND stdout; capture both.
    return { code: err.status ?? 1, output: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
};

let failures = 0;
const canary = (name, mutations, script, expectedText) => {
  const backups = [];
  try {
    for (const [target, { find, replace, all }] of Object.entries(mutations)) {
      const rel = TARGETS[target];
      const full = path.join(ROOT, rel);
      const src = fs.readFileSync(full, "utf8");
      // The worktree may be CRLF (Windows) while this script writes LF —
      // adapt the patterns to the file's own EOL so the canary never SKIPs
      // for a line-ending reason.
      const crlf = src.includes("\r\n");
      const find2 = crlf ? find.replace(/\n/g, "\r\n") : find;
      const replace2 = crlf ? replace.replace(/\n/g, "\r\n") : replace;
      if (!src.includes(find2)) {
        console.error(`  SKIP  ${name}: pattern not found in ${rel} — canary is stale, fix it`);
        failures += 1;
        return;
      }
      fs.copyFileSync(full, full + BACKUP_SUFFIX);
      backups.push(full);
      // `all`: a defect that must disappear from EVERY branch — a single
      // replace would leave the rule green on the surviving branch.
      fs.writeFileSync(full, all ? src.split(find2).join(replace2) : src.replace(find2, replace2), "utf8");
    }
    const result = runValidator(script);
    if (result.code === 0) {
      console.error(`  FAIL  ${name}: validator stayed GREEN with the defect present — decorative rule`);
      failures += 1;
    } else if (expectedText && !result.output.includes(expectedText)) {
      console.error(`  FAIL  ${name}: validator failed but not for the expected reason (wanted '${expectedText}' in output)`);
      failures += 1;
    } else {
      console.log(`  ok    ${name}: rule fires (validator exit ${result.code})`);
    }
  } finally {
    for (const full of backups) {
      fs.copyFileSync(full + BACKUP_SUFFIX, full);
      fs.rmSync(full + BACKUP_SUFFIX);
    }
  }
};

console.log("JUNO-06 canaries — every new rule must FAIL on its defect:\n");

// Blocage 2 — the phone outranking the server (PremiumContext).
canary(
  "local RC tier adopted over the server (effectiveTier = localTier)",
  {
    ctx: {
      find: "effectiveTier = sync.tier; // the tier the SERVER verified and wrote",
      replace: "effectiveTier = localTier; // CANARY: the phone decides",
    },
  },
  "validate-premium-data-sources.mjs",
  "D3c",
);

canary(
  "RC listener optimistically sets the tier (setTier(expectedTier))",
  {
    ctx: {
      find: "            const sync = await syncEntitlement();",
      replace:
        "            setTier(expectedTier); // CANARY: optimistic local grant\n            const sync = await syncEntitlement();",
    },
  },
  "validate-premium-data-sources.mjs",
  "D3d",
);

// Blocage 2 — the gate granting after a server refusal.
canary(
  "gate grants after a refusal when the device claims paid (canAccessFeature → granted)",
  {
    gate: {
      find: "        setDenialReason('sync_available');\n        setAccessState('denied');\n        return;",
      replace:
        "        setAccessState('granted'); // CANARY: the phone outranks the server\n        setTrialConsumed(false);\n        return;",
    },
  },
  "validate-premium-data-sources.mjs",
  "D4d",
);

canary(
  "sync_available path removed from the gate (every branch)",
  {
    gate: {
      find: "setDenialReason('sync_available');",
      replace: "setDenialReason('error'); // CANARY: sync offer deleted",
      all: true,
    },
  },
  "validate-premium-data-sources.mjs",
  "D4c",
);

// Blocage 1 — the producer back in the bundle.
canary(
  "tarot corpus/engine imported back into the mobile bundle",
  {
    tarot: {
      find: "import { LinearGradient } from 'expo-linear-gradient';",
      replace:
        "import { generateReading } from '@astro/shared/tarot'; // CANARY: local producer\nimport { LinearGradient } from 'expo-linear-gradient';",
    },
  },
  "validate-premium-data-sources.mjs",
  "D7",
);

canary(
  "tarot screen re-wrapped in PremiumGate (double decision)",
  {
    tarot: {
      find: "  return <TarotScreenContent />;",
      replace:
        "  return <PremiumGate feature={'weekly-tarot' as any}><TarotScreenContent /></PremiumGate>; // CANARY",
    },
  },
  "validate-premium-data-sources.mjs",
  "D7b",
);

// Security theater — the class lie, both directions.
canary(
  "a circumventable feature labeled server_enforced_data (security theater)",
  {
    usage: {
      find: "  'lucky-days': 'server_metered_ui',",
      replace: "  'lucky-days': 'server_enforced_data', // CANARY: the lie",
    },
  },
  "validate-premium-gating.mjs",
  "ENFORCEMENT_CLASS_COUNTS",
);

canary(
  "the published counts drift from the real map",
  {
    usage: {
      find: "  server_enforced_data: 2,",
      replace: "  server_enforced_data: 3, // CANARY: inflated verdict",
    },
  },
  "validate-premium-gating.mjs",
  "ENFORCEMENT_CLASS_COUNTS",
);

canary(
  "a feature without any class (new feature, undocumented protection)",
  {
    usage: {
      find: "  'planetary-transits': 'public_content',",
      replace: "  // 'planetary-transits': 'public_content', // CANARY: class removed",
    },
  },
  "validate-premium-gating.mjs",
  "ENFORCEMENT_CLASSES",
);

console.log(
  failures === 0
    ? "\nAll canaries fired: each new rule fails on its defect."
    : `\n${failures} canary(ies) did NOT fire — a green validator is proving nothing there.`,
);
process.exit(failures === 0 ? 0 : 1);
