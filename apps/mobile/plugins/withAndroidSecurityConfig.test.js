/**
 * JUNO-17 — tests for the Android security config plugin.
 *
 * WHY THIS EXISTS (audit 2026-09-07, JUNO-17)
 * -------------------------------------------
 * The Expo-generated manifest shipped `android:allowBackup="true"`, no
 * data-extraction rules, no backup rules and no network security config.
 * The AsyncStorage onboarding draft carries birth date, time and city —
 * it must never leave the device via Android backup or device transfer,
 * and cleartext HTTP must be forbidden by explicit policy, not default.
 *
 * These tests execute the REAL plugin functions (imported from
 * ./withAndroidSecurityConfig) — the same code `expo prebuild` runs. Every
 * protection is asserted; removing any of them fails the suite.
 */
import fs from "node:fs";
import mk from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import plugin, {
  APPLICATION_ATTRIBUTES,
  RESOURCE_FILES,
  applyApplicationAttributes,
  writeResourceFiles,
} from "./withAndroidSecurityConfig";

/** A manifest in the exact shape `withAndroidManifest` exposes — xml2js
 *  arrays — with a few pre-existing attributes the plugin must PRESERVE
 *  (mirrors the real prebuild output, incl. allowBackup=true). */
const sampleManifest = () => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    application: [
      {
        $: {
          "android:name": ".MainApplication",
          "android:label": "@string/app_name",
          "android:icon": "@mipmap/ic_launcher",
          "android:allowBackup": "true",
          "android:theme": "@style/AppTheme",
        },
      },
    ],
    "uses-permission": [{ $: { "android:name": "android.permission.CAMERA" } }],
  },
});

describe("JUNO-17 · attributs du <application>", () => {
  it("impose les cinq attributs de sécurité", () => {
    const manifest = applyApplicationAttributes(sampleManifest().manifest);
    const app = manifest.application[0].$;
    expect(app["android:allowBackup"]).toBe("false");
    expect(app["android:usesCleartextTraffic"]).toBe("false");
    expect(app["android:fullBackupContent"]).toBe("@xml/backup_rules");
    expect(app["android:dataExtractionRules"]).toBe("@xml/data_extraction_rules");
    expect(app["android:networkSecurityConfig"]).toBe("@xml/network_security_config");
  });

  it("conserve les attributs Android existants (name, label, icon, theme, permissions)", () => {
    const manifest = applyApplicationAttributes(sampleManifest().manifest);
    const app = manifest.application[0].$;
    expect(app["android:name"]).toBe(".MainApplication");
    expect(app["android:label"]).toBe("@string/app_name");
    expect(app["android:icon"]).toBe("@mipmap/ic_launcher");
    expect(app["android:theme"]).toBe("@style/AppTheme");
    expect(manifest["uses-permission"]).toHaveLength(1);
  });

  it("écrase allowBackup=true hérité du template", () => {
    const manifest = applyApplicationAttributes(sampleManifest().manifest);
    expect(manifest.application[0].$["android:allowBackup"]).not.toBe("true");
  });

  it("idempotent : deux applications successives produisent le même objet", () => {
    const once = applyApplicationAttributes(sampleManifest().manifest);
    const twice = applyApplicationAttributes(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it("échoue clairement si le manifeste est malformé (pas de <application>)", () => {
    expect(() => applyApplicationAttributes({ manifest: {} })).toThrow(
      /no <application>/,
    );
    expect(() =>
      applyApplicationAttributes({ manifest: { application: [] } }),
    ).toThrow(/no <application>/);
    expect(() => applyApplicationAttributes(null)).toThrow();
  });
});

describe("JUNO-17 · règles de sauvegarde", () => {
  it("data_extraction_rules exclut les cinq domaines de cloud-backup ET device-transfer", () => {
    const xml = RESOURCE_FILES["data_extraction_rules.xml"];
    for (const block of ["<cloud-backup>", "<device-transfer>"]) {
      expect(xml).toContain(block);
    }
    const domains = ["root", "file", "database", "sharedpref", "external"];
    for (const block of ["cloud-backup", "device-transfer"]) {
      const section = xml.split(`<${block}>`)[1].split(`</${block}>`)[0];
      for (const domain of domains) {
        expect(
          section,
          `${block} doit exclure le domaine ${domain}`,
        ).toContain(`<exclude domain="${domain}" path="."`);
      }
    }
  });

  it("backup_rules (héritage Android ≤11) exprime les mêmes exclusions avec des domaines valides", () => {
    const xml = RESOURCE_FILES["backup_rules.xml"];
    expect(xml).toContain("<full-backup-content>");
    expect(xml).not.toContain("<data-extraction-rules"); // schéma API 31+ interdit ici
    for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
      expect(xml).toContain(`<exclude domain="${domain}" path="."`);
    }
  });
});

describe("JUNO-17 · configuration réseau", () => {
  // Leçon du dépôt : parser le SANS-commentaires — la documentation du
  // fichier mentionne les éléments qu'on cherche (un split naïf matcherait
  // le commentaire, pas l'élément).
  const xml = RESOURCE_FILES["network_security_config.xml"].replace(
    /<!--[\s\S]*?-->/g,
    "",
  );

  it("interdit le cleartext dans la base-config", () => {
    const base = xml.split("<base-config")[1].split("</base-config>")[0];
    expect(base).toContain('cleartextTrafficPermitted="false"');
  });

  it("ancre la confiance sur les CA système uniquement (release)", () => {
    const base = xml.split("<base-config")[1].split("</base-config>")[0];
    expect(base).toContain('<certificates src="system"');
    expect(base).not.toContain('src="user"');
  });

  it("aucun certificate pinning, aucun domaine HTTP autorisé", () => {
    expect(xml).not.toContain("<pin-set");
    expect(xml).not.toContain("<domain-config");
    expect(xml).not.toMatch(/<domain[^>]*>/);
  });

  it("les CA utilisateur ne sont pas ajoutées (même en debug-overrides)", () => {
    expect(xml).not.toContain('src="user"');
  });

  it("debug-overrides ne touche que le cleartext (Metro localhost) — inertes en Release", () => {
    const debug = xml.split("<debug-overrides")[1]?.split("</debug-overrides>")[0];
    expect(debug).toBeDefined();
    expect(debug).toContain('cleartextTrafficPermitted="true"');
    // Rien d'autre ne doit être relâché pour le debug.
    expect(debug).not.toContain('src="user"');
    // Et la base-config reste strict — le bloc debug ne la remplace pas.
    expect(xml.indexOf('<base-config')).toBeLessThan(xml.indexOf("<debug-overrides"));
  });
});

describe("JUNO-17 · écriture des ressources", () => {
  let dir;
  beforeEach(async () => {
    dir = await mk.mkdtemp(path.join(os.tmpdir(), "juno17-res-"));
  });
  afterEach(async () => {
    await mk.rm(dir, { recursive: true, force: true });
  });

  it("génère exactement les trois fichiers XML référencés par le manifeste", () => {
    const written = writeResourceFiles(dir);
    expect(written.map((p) => path.basename(p)).sort()).toEqual([
      "backup_rules.xml",
      "data_extraction_rules.xml",
      "network_security_config.xml",
    ]);
    for (const [name, contents] of Object.entries(RESOURCE_FILES)) {
      expect(fs.readFileSync(path.join(dir, name), "utf8")).toBe(contents);
    }
  });

  it("chaque référence manifeste pointe vers un fichier réellement généré", () => {
    const written = writeResourceFiles(dir).map((p) =>
      path.basename(p).replace(/\.xml$/, ""),
    );
    for (const attr of [
      "android:fullBackupContent",
      "android:dataExtractionRules",
      "android:networkSecurityConfig",
    ]) {
      const ref = APPLICATION_ATTRIBUTES[attr].replace("@xml/", "");
      expect(written, `${attr} → ${ref}`).toContain(ref);
    }
  });

  it("idempotent : deux exécutions produisent des octets identiques", () => {
    writeResourceFiles(dir);
    const first = Object.keys(RESOURCE_FILES).map((n) =>
      fs.readFileSync(path.join(dir, n), "utf8"),
    );
    writeResourceFiles(dir);
    const second = Object.keys(RESOURCE_FILES).map((n) =>
      fs.readFileSync(path.join(dir, n), "utf8"),
    );
    expect(second).toEqual(first);
  });
});

describe("JUNO-17 · surface du plugin", () => {
  it("le module exporte une fonction Expo config-plugin", () => {
    expect(typeof plugin).toBe("function");
  });
});
