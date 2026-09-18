// JUNO-17 — Android security config contract (repo gate, CI-runnable).
//
// WHY: the Expo template ships android:allowBackup="true" with no extraction
// rules and no network policy; only a versioned config plugin keeps the
// Release manifest hardened, and only a gate keeps the plugin honest. This
// validator executes the REAL plugin module (the same code expo prebuild
// runs) and the REAL app.json — never source-text matching that comments
// could fool. CI cannot build an AAB; the AAB-level proof is the operator
// procedure in docs/runbooks/android-security-config-2026-09.md.
//
// Discriminant by construction: each check asserts one protection the plugin
// must impose — remove any attribute, resource, exclusion block, or the
// plugin registration, and this gate fails.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(path.join(root, "apps/mobile/package.json"));

const plugin = require_("./plugins/withAndroidSecurityConfig.js");
const appJson = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/app.json"), "utf8"),
);

const errors = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`  FAIL  ${msg}`);
};

const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

// ── 1. Plugin registered in the Expo config ────────────────────────────────
const plugins = appJson.expo.plugins ?? [];
const registered = plugins.includes("./plugins/withAndroidSecurityConfig");
registered
  ? ok("plugin enregistré dans apps/mobile/app.json")
  : fail("plugin ABSENT de apps/mobile/app.json (expo.plugins)");

// ── 2. The five manifest attributes, from the REAL module ─────────────────
const expectedAttrs = {
  "android:allowBackup": "false",
  "android:usesCleartextTraffic": "false",
  "android:fullBackupContent": "@xml/backup_rules",
  "android:dataExtractionRules": "@xml/data_extraction_rules",
  "android:networkSecurityConfig": "@xml/network_security_config",
};
for (const [attr, value] of Object.entries(expectedAttrs)) {
  plugin.APPLICATION_ATTRIBUTES[attr] === value
    ? ok(`${attr}="${value}"`)
    : fail(`${attr}: attendu "${value}", obtenu ${JSON.stringify(plugin.APPLICATION_ATTRIBUTES[attr])}`);
}
const extraAttrs = Object.keys(plugin.APPLICATION_ATTRIBUTES).filter(
  (a) => !(a in expectedAttrs),
);
if (extraAttrs.length) fail(`attributs inattendus: ${extraAttrs.join(", ")}`);
else ok("aucun attribut supplémentaire");

// ── 3. Backup rules: both generations, all domains ─────────────────────────
const der = strip(plugin.RESOURCE_FILES["data_extraction_rules.xml"]);
for (const block of ["cloud-backup", "device-transfer"]) {
  const section = der.split(`<${block}>`)[1]?.split(`</${block}>`)[0];
  if (!section) {
    fail(`data_extraction_rules: bloc <${block}> absent`);
    continue;
  }
  ok(`data_extraction_rules: bloc <${block}> présent`);
  for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
    section.includes(`<exclude domain="${domain}" path="."`)
      ? ok(`${block}: exclusion ${domain}`)
      : fail(`${block}: exclusion ${domain} ABSENTE`);
  }
}
const br = strip(plugin.RESOURCE_FILES["backup_rules.xml"]);
if (!br.includes("<full-backup-content>")) fail("backup_rules: <full-backup-content> absent");
else {
  ok("backup_rules (héritage ≤ Android 11): <full-backup-content> présent");
  for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
    br.includes(`<exclude domain="${domain}" path="."`)
      ? ok(`legacy: exclusion ${domain}`)
      : fail(`legacy: exclusion ${domain} ABSENTE`);
  }
}

// ── 4. Network security config ─────────────────────────────────────────────
const nsc = strip(plugin.RESOURCE_FILES["network_security_config.xml"]);
const base = nsc.split("<base-config")[1]?.split("</base-config>")[0];
if (!base) fail("network_security_config: <base-config> absent");
else {
  base.includes('cleartextTrafficPermitted="false"')
    ? ok("base-config: cleartext interdit")
    : fail("base-config: cleartextTrafficPermitted ≠ false");
  base.includes('<certificates src="system"')
    ? ok("base-config: ancres système")
    : fail("base-config: <certificates src=\"system\" absent");
  base.includes('src="user"')
    ? fail("base-config: CA utilisateur acceptées en release")
    : ok("base-config: aucune CA utilisateur");
}
nsc.includes("<pin-set")
  ? fail("network_security_config: certificate pinning présent")
  : ok("aucun certificate pinning");
/<domain-config|<domain[\s>]/.test(nsc)
  ? fail("network_security_config: exception de domaine présente")
  : ok("aucune exception de domaine (aucun HTTP autorisé)");
const debugBlock = nsc.split("<debug-overrides")[1]?.split("</debug-overrides>")[0];
if (!debugBlock) {
  fail("debug-overrides absent (les builds dev ne pourront pas charger Metro)");
} else {
  debugBlock.includes('cleartextTrafficPermitted="true"')
    ? ok("debug-overrides: Metro (localhost) préservé pour les builds debug uniquement")
    : fail("debug-overrides sans cleartext=true — builds dev cassés");
  debugBlock.includes('src="user"')
    ? fail("debug-overrides: CA utilisateur autorisées")
    : ok("debug-overrides: CA système uniquement");
}

// ── 5. Fail-fast surface ───────────────────────────────────────────────────
let threw = false;
try {
  plugin.applyApplicationAttributes({ application: [] });
} catch {
  threw = true;
}
threw
  ? ok("manifeste malformé → échec clair (fail-fast)")
  : fail("un manifeste sans <application> n'échoue pas — le plugin devinerait");

// ── 6. App config must NOT carry conflicting native flags ──────────────────
const android = appJson.expo.android ?? {};
for (const k of ["allowBackup", "usesCleartextTraffic"]) {
  if (k in android) fail(`app.json android.${k} présent — conflit potentiel avec le plugin`);
}
ok("app.json: aucun conflit android.allowBackup/usesCleartextTraffic");

if (errors.length) {
  console.error(
    `\nandroid-security-config: ${errors.length} violation(s) — JUNO-17 (voir docs/runbooks/android-security-config-2026-09.md)`,
  );
  process.exit(1);
}
console.log("\nandroid-security-config contract looks clean.");
