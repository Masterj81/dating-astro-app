/**
 * JUNO-17 — Android security config plugin.
 *
 * WHY (audit 2026-09-07, JUNO-17)
 * --------------------------------
 * The Expo-generated manifest shipped `android:allowBackup="true"` with no
 * data-extraction rules, no backup rules and no network security config:
 * app data — including the AsyncStorage onboarding draft that carries birth
 * date, time and city — was eligible for Android cloud backup and
 * device-to-device transfer, and "no cleartext HTTP" rested on platform
 * defaults instead of an explicit policy.
 *
 * WHAT THIS PLUGIN IMPOSES ON EVERY PREBUILD
 * ------------------------------------------
 *   <application
 *     android:allowBackup="false"
 *     android:usesCleartextTraffic="false"
 *     android:fullBackupContent="@xml/backup_rules"
 *     android:dataExtractionRules="@xml/data_extraction_rules"
 *     android:networkSecurityConfig="@xml/network_security_config" />
 *
 * plus the three referenced XML resources, generated under
 * android/app/src/main/res/xml/. The policy is conservative: NO JUNO app
 * data is backed up or transferred — the user signs in again and the server
 * is the source of truth.
 *
 * DEV BUILDS KEEP WORKING: the Expo template's android/app/src/debug
 * manifest already carries `usesCleartextTraffic="true" tools:replace=...`,
 * and the network config's <debug-overrides> block (honored ONLY when
 * android:debuggable is set) keeps Metro's http://localhost bundle working.
 * Release never sees either.
 *
 * Idempotent: safe to run `expo prebuild` repeatedly. Fails fast if the
 * manifest shape is not what Expo produces. No certificate pinning (pins
 * rot would brick the app), no HTTP domain exceptions, no user-added CAs in
 * release.
 */
const {
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

/** The five attributes this plugin owns, name (no namespace prefix — the
 *  manifest mod stores them in `$` with the `android:` prefix) → value. */
const APPLICATION_ATTRIBUTES = {
  'android:allowBackup': 'false',
  'android:usesCleartextTraffic': 'false',
  'android:fullBackupContent': '@xml/backup_rules',
  'android:dataExtractionRules': '@xml/data_extraction_rules',
  'android:networkSecurityConfig': '@xml/network_security_config',
};

const RESOURCE_FILES = {
  'backup_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- JUNO-17: legacy (Android 11 and below) full-backup content.
     Every app-data domain is excluded: no JUNO data may be uploaded to
     Google cloud backup. allowBackup=false is the primary control; these
     explicit rules defend against OEM variations and document the policy. -->
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
</full-backup-content>
`,
  'data_extraction_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- JUNO-17: Android 12+ (API 31) data extraction rules.
     Both destinations — cloud-backup AND device-transfer — exclude every
     app-data domain: nothing leaves the device, not on backup, not on
     migration to a new phone. The user re-authenticates; the server is the
     source of truth. -->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="." />
    <exclude domain="file" path="." />
    <exclude domain="database" path="." />
    <exclude domain="sharedpref" path="." />
    <exclude domain="external" path="." />
  </device-transfer>
</data-extraction-rules>
`,
  'network_security_config.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- JUNO-17: network security config.
     Release policy: cleartext HTTP forbidden everywhere, system CAs only,
     no per-domain exceptions, no user-added CAs, no certificate pinning
     (a pin rotation mistake would brick every installed client).
     The <debug-overrides> block below is inert in release — Android honors
     it ONLY when android:debuggable is set — and exists solely so Metro's
     http://localhost bundle keeps working in development builds. -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <debug-overrides cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>
`,
};

/** Set the five security attributes on an xml2js-style manifest object
 *  (the shape `withAndroidManifest` exposes as modResults.manifest).
 *  Pure: mutates and returns the parsed manifest, throws on a shape this
 *  plugin does not understand — never silently guesses. Exported for tests. */
function applyApplicationAttributes(manifest) {
  const applications = manifest && manifest.application;
  if (!Array.isArray(applications) || applications.length === 0) {
    throw new Error(
      '[withAndroidSecurityConfig] AndroidManifest.xml has no <application> node — unexpected Expo prebuild output; refusing to continue.',
    );
  }
  // Expo emits exactly one <application>; the array is xml2js's default
  // representation, not a signal that several exist.
  for (const application of applications) {
    application.$ = application.$ || {};
    Object.assign(application.$, APPLICATION_ATTRIBUTES);
  }
  return manifest;
}

/** Write the three XML resources under the given res/xml directory.
 *  Pure filesystem side of the plugin; exported for tests. Returns the
 *  paths written. Overwriting with identical bytes is what makes repeated
 *  prebuilds idempotent. */
function writeResourceFiles(resXmlDir) {
  fs.mkdirSync(resXmlDir, { recursive: true });
  const written = [];
  for (const [name, contents] of Object.entries(RESOURCE_FILES)) {
    const target = path.join(resXmlDir, name);
    fs.writeFileSync(target, contents, 'utf8');
    written.push(target);
  }
  return written;
}

function withAndroidSecurityConfig(config) {
  const withManifest = withAndroidManifest(config, (cfg) => {
    applyApplicationAttributes(cfg.modResults.manifest);
    return cfg;
  });

  // This config-plugins version takes a [platform, action] tuple (see
  // withDangerousMod source); the action receives the config whose
  // `_internal` carries { platformName, projectRoot }.
  return withDangerousMod(withManifest, [
    'android',
    (cfg) => {
      const { projectRoot } = cfg._internal ?? {};
      if (!projectRoot) {
        throw new Error(
          '[withAndroidSecurityConfig] no projectRoot on the mod request — unexpected Expo internals.',
        );
      }
      const resXmlDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      writeResourceFiles(resXmlDir);
      return cfg;
    },
  ]);
}

module.exports = withAndroidSecurityConfig;
// Test surface: the raw pieces, so the suite and the repo validator can
// execute the REAL decisions instead of re-reading source text.
module.exports.applyApplicationAttributes = applyApplicationAttributes;
module.exports.writeResourceFiles = writeResourceFiles;
module.exports.APPLICATION_ATTRIBUTES = APPLICATION_ATTRIBUTES;
module.exports.RESOURCE_FILES = RESOURCE_FILES;
module.exports.ANDROID_NS = ANDROID_NS;
