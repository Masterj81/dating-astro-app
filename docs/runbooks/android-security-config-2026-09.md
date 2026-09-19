# Runbook — JUNO-17 : durcissement de la configuration Android et preuve du manifeste Release

**Date : 18 septembre 2026 · Statut : PROUVÉ DANS L'AAB le 18 sept (build EAS `2ac55534-2b68-4e11-bedc-e5054a1a83a2`, profil `juno17-proof`, SHA `6a7283e`) — les cinq protections sont dans le manifeste Release fusionné et les trois ressources dans l'artefact ; AUCUNE publication effectuée. `allowBackup=true` éliminé.**

## 1. État initial reproduit (18 sept 2026)

L'artefact racine `android/` (prebuild ignoré par Git, généré précédemment en local) portait :

```
<application … android:allowBackup="true" …>
```

— et **aucun** de : `dataExtractionRules`, `fullBackupContent`, `networkSecurityConfig`, `usesCleartextTraffic` explicite ; `res/xml/` inexistant. Constat JUNO-17 reproduit à l'identique.

Contexte technique : Expo SDK 54.0.33 / React Native 0.81.5 / Gradle 8.14.3 / JDK 17 local ; SDK Android local complet (build-tools 34→36). `apps/mobile/android` n'existe pas dans Git (seul `/android` racine est ignoré).

## 2. Données locales concernées (inventaire)

| Stockage | Contenu | Classe |
|---|---|---|
| `AsyncStorage` — `utils/onboardingDraft.ts` | **brouillon d'onboarding : date, heure, ville de naissance** (pré- et post-inscription) | profil sensible — la cible du risque |
| `AsyncStorage` — `services/i18n.ts`, `settings/preferences.tsx`, `coach:preview-date` | langue, préférences, date de prévision | préférences |
| `expo-secure-store` — `services/supabase.ts`, `notifications.ts` | session Supabase, device id | authentification (déjà chiffré au repos) |
| `expo-file-system` (cache) — `services/fileUtils.ts` | copies temporaires de médias à uploader, supprimées après usage | cache reconstructible |

**Politique retenue (conservative)** : aucune donnée applicative JUNO ne doit être sauvegardée dans le cloud Android ni transférée vers un autre appareil. L'utilisateur se reconnecte ; le serveur est la source de vérité.

## 3. Le plugin — `apps/mobile/plugins/withAndroidSecurityConfig.js`

Config plugin Expo versionné, enregistré en dernier de `expo.plugins` dans `app.json` (style du dépôt : CommonJS, fail-fast, marqueur d'idempotence). Il impose sur **chaque** prebuild :

| Attribut imposé | Valeur |
|---|---|
| `android:allowBackup` | `false` |
| `android:usesCleartextTraffic` | `false` |
| `android:fullBackupContent` | `@xml/backup_rules` |
| `android:dataExtractionRules` | `@xml/data_extraction_rules` |
| `android:networkSecurityConfig` | `@xml/network_security_config` |

et génère les trois ressources dans `android/app/src/main/res/xml/` :
- **`data_extraction_rules.xml`** (API 31+) : `<cloud-backup>` **et** `<device-transfer>` excluent les domaines `root`, `file`, `database`, `sharedpref`, `external` ;
- **`backup_rules.xml`** (héritage ≤ Android 11) : mêmes exclusions en schéma `full-backup-content` (aucun domaine API 31+ n'y figure) ;
- **`network_security_config.xml`** : `base-config cleartextTrafficPermitted="false"`, ancres **système** uniquement, **aucun** pinning, **aucune** exception de domaine, CA utilisateur refusées partout ; un `<debug-overrides cleartextTrafficPermitted="true">` (CA système) — inerte hors `android:debuggable` — préserve Metro localhost **en debug uniquement** (le manifeste `src/debug` du template Expo porte déjà `usesCleartextTraffic="true" tools:replace`, confirmé lu).

Le plugin échoue bruyamment si le manifeste n'a pas de nœud `<application>`. L'API `withDangerousMod` de cette version prend un tuple `[platform, action]` (source vérifié) — piège documenté.

## 4. Prebuild contrôlé (§8 du brief)

`npx expo prebuild --platform android --no-install` depuis `apps/mobile` (l'artefact `apps/mobile/android` généré n'est pas ignoré par Git → inspecté puis **supprimé intégralement** après preuves ; aucun artefact commis). Résultat dans le manifeste généré :

```
<application … android:allowBackup="false" … android:usesCleartextTraffic="false"
  android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules"
  android:networkSecurityConfig="@xml/network_security_config">
```

- les trois XML présents dans `res/xml/` ;
- **idempotence prouvée** : second prebuild → manifeste stable bit-à-bit (hash identique), ressources stables (`E8330122A025` / `82EDCAC573BD` / `51AA3A263AB6`) ;
- aucun attribut existant (name, label, icon, theme…) n'est altéré ; aucune duplication.

## 5. Permissions fusionnées (audit du prebuild)

Manifeste `main` généré : `CAMERA`, `INTERNET`, `MODIFY_AUDIO_SETTINGS`, `READ_EXTERNAL_STORAGE`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `WRITE_EXTERNAL_STORAGE`, et `FOREGROUND_SERVICE_MEDIA_PLAYBACK tools:node="remove"` (le blocage déclaré dans `app.json` — preuve que la suppression demandée transige).

| Permission | Provenance | Lecture |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | manifeste **debug** du template Expo ET main RN (`com.facebook.react` l'ajoute par défaut) | sans danger Release réel à démontrer sur l'AAB (rapport merger) ; RN l'inclut au main par défaut — **à trancher sur le manifeste AAB**, pas ici |
| `READ/WRITE_EXTERNAL_STORAGE` | template RN main (plus d'usage côté JS : `expo-image-picker`/`fileUtils` n'en ont plus besoin sur SDK 54) | aucune balise `maxSdkVersion` dans le prebuild ; candidate à un retrait futur **avec test fonctionnel photo/vidéo** — hors périmètre JUNO-17 (interdiction : pas de retrait de permission requise sans preuve) |
| `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `INTERNET` | `app.json` (`CAMERA`, `RECORD_AUDIO`) + template/SDK | nécessaires : photo, vidéo de vérification, intro vocale, notifications |

Le rapport du Manifest Merger Release sera produit par le build EAS (`app/build/outputs/logs/manifest-merger-release-report.txt`) — étape post-build.

## 6. Build Release local — tenté, bloqué par un défaut environnemental Windows

- `gradlew :app:bundleRelease` : compile (585 tasks, CMake arm64 OK) puis échoue sur `:app:createBundleReleaseJsAndAssets` : la commande passe `--entry-file index.js` **relatif** (cwd `apps/mobile`) et Metro résout `./index.js` depuis une origine mal jointe `C:\…\dating-astro-app/.` en cherchant `..\..\index.js` — bug de jointure de chemin Windows (mélange `/`/`\`).
- **Le pipeline JS est sain** : la même commande `export:embed` avec `--entry-file` **absolu** produit le bundle Release complet — **8,7 Mo, 2 754 modules, 46 assets, 20 s**.
- EAS/Linux n'est pas affecté (le build 130 de production a été produit par ce même flux le 11 sept). **Aucun contournement versionné** : un patch d'artefact local (entry absolu dans le build.gradle généré) a été testé puis l'artefact entier supprimé — jamais commis, jamais proposé comme solution.

## 7. Build EAS — profil `juno17-proof` préparé et VÉRIFIÉ, AUTORISATION EXPLICITE REQUISE

**Deux risques identifiés en revue (18 sept soir) — écartés par conception du profil :**
1. le profil `production` porte `autoIncrement: true` + `appVersionSource: remote` : même sans `eas submit`, un build aurait **incrémenté le `versionCode` distant** — interdit sans autorisation ;
2. l'arbre de travail contient des changements étrangers non commités : un build lancé depuis ce workspace les embarquerait dans l'archive.

**Profil dédié** (`apps/mobile/eas.json`) :

```json
"juno17-proof": {
  "extends": "production",
  "autoIncrement": false
}
```

**Résolution effective vérifiée par la CLI** (`npx eas config --platform android --profile juno17-proof`, eas-cli, lecture seule) :

```
Build profile "juno17-proof"
{
  "credentialsSource": "remote",
  "distribution": "store",
  "autoIncrement": false,
  "env": { "APP_ENV": "production", "SENTRY_DISABLE_AUTO_UPLOAD": "true" },
  "gradleCommand": ":app:bundleRelease --stacktrace --info"
}
```

Soit exactement : **AAB Release** (bundleRelease) · **`versionCode` distant conservé** (autoIncrement=false) · **aucune soumission Play** (rien dans le profil ne soumet ; `eas submit` est une commande distincte, interdite ici) · **`SENTRY_DISABLE_AUTO_UPLOAD=true`** hérité. La config résolue confirme aussi que `./plugins/withAndroidSecurityConfig` figure dans les plugins du build.

**Procédure opérateur (après push des commits JUNO-17, CI verte) :**

```powershell
# 1. worktree PROPRE au SHA exact — jamais depuis l'arbre sale :
git worktree add C:\temp\juno17-proof <SHA-exact-du-commit-JUNO-17>
cd C:\temp\juno17-proof\apps\mobile
# 2. build sans attente ni publication :
npx eas build --platform android --profile juno17-proof --non-interactive --no-wait
# 3. JAMAIS : npx eas submit (quel que soit le profil)
# 4. AAB terminé → télécharger, puis preuve §8 (bundletool déjà en %TEMP%)
# 5. nettoyage : git worktree remove
```

## 8. Preuve AAB — 18 sept 2026, EXÉCUTÉE

Build unique sous autorisation bornée : profil `juno17-proof`, worktree propre détaché au SHA exact `6a7283e`, archive 17,6 Mo, `--no-wait`, **aucune soumission**. `bundletool.jar` 1.17.0 (officiel Google).

**Contraintes d'autorisation vérifiées** : `versionCode` de l'AAB = **130** (= le distant actuel : `autoIncrement=false` n'a RIEN modifié), `versionName` 2.1.1 ; aucun `eas submit` ; inspection lecture seule.

`bundletool dump manifest` sur l'AAB Release :

| Propriété | Expo config | Prebuild | **AAB Release** |
|---|---|---|---|
| allowBackup=false | oui (plugin) | oui (prouvé) | **`false` ✅** |
| dataExtractionRules | oui (plugin) | oui (prouvé) | **`@xml/data_extraction_rules` ✅** |
| fullBackupContent | oui (plugin) | oui (prouvé) | **`@xml/backup_rules` ✅** |
| cleartext interdit | oui (plugin) | oui (prouvé) | **`usesCleartextTraffic="false"` ✅** |
| networkSecurityConfig | oui (plugin) | oui (prouvé) | **`@xml/network_security_config` ✅** |

**Contenu compilé des ressources** (aapt2 dump xmltree sur l'universal.apk extrait de l'AAB) :
- `data_extraction_rules.xml` : `<cloud-backup>` **et** `<device-transfer>`, chacun avec les 5 exclusions `root`/`file`/`database`/`sharedpref`/`external` — vérifiés élément par élément ;
- `backup_rules.xml` : `full-backup-content` + les 5 mêmes exclusions (schéma héritage, aucun domaine API 31+) ;
- `network_security_config.xml` : `base-config cleartextTrafficPermitted=false` + ancres `system` seules ; `debug-overrides cleartextTrafficPermitted=true` + ancres `system` (aucune CA utilisateur, aucun pin-set).

**Permissions du manifeste Release fusionné** (audit §9 tranché sur l'artefact) : `FOREGROUND_SERVICE_MEDIA_PLAYBACK` **ABSENT** (le `blockedPermissions` opère bien en Release) ; `SYSTEM_ALERT_WINDOW` **présent** (défaut du template React Native main, pas du manifeste debug — sans risque de fuite de données ; son retrait est un chantier fonctionnel séparé) ; `READ/WRITE_EXTERNAL_STORAGE` présents sans `maxSdkVersion` (héritage template RN ; scoped storage les neutralise sur target actuel — retrait à étudier avec tests photo/vidéo) ; le reste = contributions SDK standard (expo-notifications : `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK` ; RevenueCat : `BILLING` ; Sentry/boot : `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE` ; bibliothèques de badges constructeurs).

Verdict : le tableau §11 du brief est **entièrement ✅ sur la colonne AAB Release**. Restent hors de ce statut : tests fonctionnels (§12) et `bmgr` (§13) sur l'artefact installé, et la publication Play — toutes deux hors périmètre du présent build.

## 9. Tests et validations exécutés

| Contrôle | Résultat |
|---|---|
| Suite plugin (`withAndroidSecurityConfig.test.js`, 16 tests : 5 attributs, conservation, idempotence ×2, fail-fast, exclusions ×2 générations, cleartext/pinning/domaines/user-CA, debug-overrides borné, 3 fichiers générés, refs↔fichiers) | **16/16** ✅ |
| Validateur `validate:android-security-config` (exécute le VRAI module + app.json ; canari : retrait du bloc device-transfer → FAIL, restauration → clean) | **clean** ✅ |
| Prebuild contrôlé + idempotence | ✅ (§4) |
| Tests mobile (désormais vitest au lieu de « No tests yet ») | 16/16 ✅ |
| Typecheck mobile / lint mobile | 0 erreur ✅ |
| Tests shared | 1602/1602 ✅ |
| `git diff --check` | propre ✅ |
| CI : `validate:android-security-config` câblé | ✅ |

Tests fonctionnels (§12) et de sauvegarde `bmgr` (§13) : **à exécuter sur l'APK/AAB autorisé**, avec profil synthétique uniquement.

## 10. Rollback

Commit explicite retirant : l'entrée `plugins` de `app.json`, les fichiers `plugins/withAndroidSecurityConfig*`, le script validateur + son câblage CI, ce runbook. Avant tout rollback : évaluer que allowBackup=true réautoriserait la sauvegarde cloud des brouillards (naissance) — **ne jamais** remettre `allowBackup="true"` en dépannage. Les installations déjà publiées ne sont pas affectées rétroactivement.

## 11. Limites et distinctions

- **Corrigé localement** (plugin + preuves prebuild) ≠ **prouvé dans l'AAB** (§8, après build autorisé) ≠ **fermé en production** (publié depuis Google Play + fumée). JUNO-17 restera « corrigé dans l'artefact Release » jusqu'à publication.
- La CI exécute le contrat du plugin, **pas** le manifeste AAB (limite documentée dans le validateur).
- `SYSTEM_ALERT_WINDOW` et le futur retrait éventuel des permissions storage : tranchés uniquement sur preuve du manifeste Release fusionné + tests fonctionnels.
