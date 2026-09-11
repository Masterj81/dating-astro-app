# JUNO-09 — Phase C — Procédure d'exécution opérateur

- **Date de préparation : 11 septembre 2026**
- **Projet Supabase autorisé : `qtihezzbuubnyvrjdkjd`**
- **État initial attendu : 5 orphelins (`avatars=4`, `voice-intros=0`, `verifications=1`)**

Ce document accompagne le runbook de référence
`docs/runbooks/orphan-media-catchup-2026-09.md`. Il ne le remplace pas : il transforme ses quatre
portes en une checklist exécutable, adaptée à Windows PowerShell 5.1.

Ce guide décrit le protocole corrigé **v1.1.0 / manifeste v2**. Le serveur assemble et hache le
manifeste, enregistre la découverte, relit le registre, puis seulement remet le manifeste au CLI.

La phase C est destructive. Les étapes 0 à 9 ne suppriment rien. **L'étape 10 supprime
irréversiblement des objets Supabase Storage.** Il n'existe aucune restauration documentée.

---

## État de départ déjà prouvé

- [x] Phase B déployée et prouvée.
- [x] Parcours web `web_immediate` terminé avec succès.
- [x] Reprise `media-purge-resume` active toutes les 10 minutes.
- [x] Rétention `media-purge-retention` active.
- [x] Retard métier de phase B à zéro.
- [x] 60 objets témoins `seed-*` intacts.
- [x] Cinq orphelins historiques inchangés : quatre avatars et une vérification.

JUNO-09 reste ouvert tant que la phase C n'a pas été exécutée et vérifiée.

> **Exécutée le 11 septembre 2026.** Campagne `2026-09-11-6cb356`, `deleted=5 · already_absent=0 ·
> failed=0`, témoins `60 → 60`, médias des comptes vivants `17 → 17`, orphelins `5 → 0`.
> **JUNO-09 est fermé.** Le dossier de preuves est à l'étape 13. Ce guide reste la procédure de toute
> campagne future.

---

## Règles d'arrêt absolues

Arrêter immédiatement si l'une des situations suivantes se produit :

- la décision juridique de l'étape 0 n'est pas consignée ;
- un compteur initial diffère de `4 / 0 / 1` ;
- le nombre de témoins `seed-*` diffère de `60` ;
- la classification n'est pas exhaustive ;
- le projet affiché n'est pas `qtihezzbuubnyvrjdkjd` ;
- un secret, chemin Storage, UUID, nom de fichier ou URL signée apparaît dans les journaux ;
- le manifeste contient autre chose que cinq entrées `orphan_proven` ;
- le manifeste est modifié après sa création ;
- la validation signée échoue ou expire ;
- un propriétaire Auth existe de nouveau ;
- une entrée devient `ambiguous_ownership` ou `unknown_path_shape` ;
- l'exécution propose un plafond supérieur à cinq ;
- la commande destructive n'est pas exécutée dans un terminal interactif ;
- un doute subsiste sur la portée d'une commande.

Ne jamais contourner un refus en modifiant le manifeste, en relevant le plafond ou en appelant
directement Storage.

---

## Étape 0 — Décision juridique sur la vidéo de vérification

Avant toute migration ou tout secret, consigner la décision :

```text
Obligation documentée de conserver la vidéo : OUI / NON
Référence juridique ou métier, si OUI : ______________________________
Décideur : ____________________
Date UTC : ____________________
```

### Chemin normal attendu

En l'absence d'une obligation écrite, sélectionner **NON**. La campagne demeure exactement :

```text
avatars=4 | voice-intros=0 | verifications=1 | total=5
```

### Si la réponse est OUI

**Arrêter ce runbook.** Ne pas simplement retirer la vidéo du manifeste. Le plafond doit être changé
dans le schéma SQL et dans les deux constantes `CAMPAIGN_CAPS`, puis les tests et validateurs doivent
être rejoués. Une nouvelle revue de code est requise.

- [ ] Décision consignée.
- [ ] Aucun objet n'a encore été supprimé.

---

## Étape 1 — Vérifications locales avant production

Depuis la racine du dépôt :

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"
npm.cmd run validate:orphan-purge
npm.cmd run validate:media-purge
npm.cmd run validate:repo-hygiene
npm.cmd run typecheck
```

Attendu selon la livraison :

- `validate:orphan-purge` : 90 contrôles verts ;
- `validate:media-purge` : 58 contrôles verts ;
- `validate:repo-hygiene` : 75 contrôles verts ;
- typecheck : 3/3.

**Arrêt :** une seule erreur suffit pour interrompre la procédure.

- [ ] Tous les contrôles sont verts.

---

## Étape 2 — Générer les deux secrets sans les afficher

Garder cette fenêtre PowerShell ouverte jusqu'à la fin de la campagne.

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

function New-JunoSecret {
  [byte[]]$bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }

  $value = (([BitConverter]::ToString($bytes)) -replace "-", "").ToLowerInvariant()
  if ($value.Length -ne 64 -or $value -eq ("0" * 64)) {
    throw "Generation du secret invalide."
  }
  return $value
}

function Get-JunoFingerprint([string]$value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($value))
  }
  finally {
    $sha.Dispose()
  }
  return ((([BitConverter]::ToString($digest)) -replace "-", "").ToLowerInvariant()).Substring(0,16)
}

$purgeSecret = New-JunoSecret
$approvalKey = New-JunoSecret
$purgeFingerprint = Get-JunoFingerprint $purgeSecret
$approvalFingerprint = Get-JunoFingerprint $approvalKey

Write-Output "Longueur purge      : $($purgeSecret.Length)"
Write-Output "Empreinte purge     : $purgeFingerprint"
Write-Output "Longueur approbation: $($approvalKey.Length)"
Write-Output "Empreinte approbation: $approvalFingerprint"
```

Attendu : deux longueurs de `64` et deux empreintes différentes de 16 caractères.

Ne jamais imprimer `$purgeSecret` ou `$approvalKey`.

- [ ] Deux valeurs de 64 caractères.
- [ ] Empreintes notées dans le dossier de preuves.

---

## Étape 3 — Poser les secrets dans Supabase

Cette étape utilise un fichier temporaire sans BOM et le supprime même si la commande échoue.

```powershell
$tempSecretFile = Join-Path ([System.IO.Path]::GetTempPath()) (
  "juno-orphan-" + [guid]::NewGuid() + ".env"
)

try {
  [System.IO.File]::WriteAllText(
    $tempSecretFile,
    "ORPHAN_PURGE_SECRET=$purgeSecret`nORPHAN_APPROVAL_KEY=$approvalKey",
    [System.Text.UTF8Encoding]::new($false)
  )

  npx supabase secrets set `
    --env-file $tempSecretFile `
    --project-ref qtihezzbuubnyvrjdkjd

  if ($LASTEXITCODE -ne 0) {
    throw "Supabase n'a pas accepté les secrets de la phase C."
  }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
}

npx supabase secrets list --project-ref qtihezzbuubnyvrjdkjd
```

Attendu :

- `ORPHAN_PURGE_SECRET` apparaît ;
- `ORPHAN_APPROVAL_KEY` apparaît ;
- aucune valeur n'est affichée ;
- le fichier temporaire n'existe plus.

Placer uniquement le secret de purge dans l'environnement du CLI, puis retirer la clé
d'approbation du poste :

```powershell
$env:ORPHAN_PURGE_SECRET = $purgeSecret
Remove-Variable approvalKey
$approvalKey = $null
[System.GC]::Collect()
```

`ORPHAN_APPROVAL_KEY` ne doit jamais être copiée dans l'environnement du shell, dans Vercel, dans
Vault ou dans les arguments du CLI.

- [ ] Deux noms présents dans Supabase.
- [ ] Seul `ORPHAN_PURGE_SECRET` existe dans l'environnement local.

---

## Étape 4 — Appliquer le registre de campagnes

Dans Supabase SQL Editor, ouvrir et exécuter **en entier** :

```text
supabase/migrations/20260911000001_orphan_purge_campaigns.sql
```

Attendu :

- table `public.orphan_purge_campaigns` créée ;
- RLS active, sans policy client ;
- plafond SQL compris entre 1 et 5 ;
- trois RPC d'écriture et quatre RPC de lecture limitées au `service_role` ;
- aucun champ permettant de stocker un chemin, UUID de compte ou identifiant d'objet ;
- aucun `DELETE` accordé ou exposé.

**Arrêt :** si la migration échoue, ne pas en exécuter seulement une portion et ne pas déployer la
fonction.

- [ ] Migration complète réussie.

---

## Étape 5 — Déployer la fonction de campagne

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"
npx supabase functions deploy purge-orphan-media `
  --project-ref qtihezzbuubnyvrjdkjd
```

La configuration attendue existe dans `supabase/config.toml` :

```toml
[functions.purge-orphan-media]
verify_jwt = false
```

L'absence de vérification JWT ne rend pas la fonction publique : elle exige
`ORPHAN_PURGE_SECRET`, puis applique ses propres contrôles serveur. Ne pas passer une clé
`service_role` au CLI.

Vérifier dans les logs Supabase :

- démarrage sans erreur ;
- aucune plainte sur les deux secrets ;
- aucune valeur secrète ou chemin sensible affiché.

- [ ] Fonction déployée.
- [ ] Logs de démarrage propres.

### Reprise après le défaut du 11 septembre

Si une première campagne a échoué à la validation avec `HTTP 409 manifest_mismatch` avant le
déploiement de la version 1.1.0 :

1. ne pas récupérer ou enregistrer son manifeste après coup ;
2. ne pas rejouer sa validation et ne jamais lancer sa porte D ;
3. déployer la fonction corrigée ;
4. détruire ensuite les artefacts de l'ancienne campagne :

```powershell
node scripts/juno09-orphan-campaign.mjs shred --campaign <ancien-id>
```

Cette commande est locale et ne touche ni Storage ni la base. Le manifeste v1 est refusé par le
schéma `juno09-orphan-manifest/2`. La migration et les secrets déjà posés ne sont pas à refaire.

---

## Étape 6 — Diagnostic AVANT la campagne

Dans Supabase SQL Editor, exécuter entièrement :

```text
supabase/tests/diagnose_orphan_purge.sql
```

Noter la sortie sans identifiant sensible.

| Contrôle | Attendu avant |
|---|---|
| orphelins | `avatars=4`, `voice-intros=0`, `verifications=1` |
| vérifications orphelines | `1` |
| objets `seed-*` | `60` |
| objets de comptes vivants | noter la valeur exacte : `________` |
| classification exhaustive | `OK` |
| répartition | `ambiguous=6`, `unknown_path_shape=62`, `uuid=22` |
| retard métier phase B | `0` |
| travaux manuels phase B | uniquement les deux tests déjà connus |

**Arrêt :** toute différence exige une nouvelle analyse. Ne jamais adapter le plafond aux nouveaux
chiffres.

- [ ] Référence avant archivée.
- [ ] Valeur des objets appartenant aux comptes vivants notée.

---

## Étape 7 — Porte A/B : découverte enregistrée et création du manifeste

Cette commande ne supprime aucun objet Storage. Elle crée toutefois la ligne d'audit `discovered`
dans `orphan_purge_campaigns` :

```powershell
node scripts/juno09-orphan-campaign.mjs discover
```

Noter seulement :

```text
Identifiant de campagne : ______________________________
Empreinte du manifeste : _______________________________
Nombre total           : 5
Distribution           : 4 / 0 / 1
Registre                : discovered, empreinte identique, plafond 5
```

Le manifeste est assemblé et haché par le serveur. Avant de répondre, le serveur appelle
`record_orphan_discovery`, relit la ligne, exige `status = discovered` et compare l'empreinte. Le CLI
recalcule ensuite cette empreinte avec sa propre implémentation et écrit le manifeste reçu tel quel
sous `.juno09/`. Il contient des identifiants Storage opaques, mais aucun chemin.

Ne pas :

- le committer ;
- le joindre à un ticket ;
- le coller dans cette conversation ;
- le modifier ;
- le renommer ;
- recalculer soi-même son empreinte pour masquer une modification.

- [ ] Découverte exactement `4 / 0 / 1`.
- [ ] Total exactement `5`.
- [ ] Campagne et empreinte notées.
- [ ] La sortie dit `registre : discovered, empreinte identique, plafond 5`.

### Preuve indépendante du registre

Avant la revue humaine, rejouer :

```text
supabase/tests/diagnose_orphan_purge.sql
```

Le contrôle 6 doit montrer exactement une campagne au statut `discovered`. L'empreinte tronquée du
contrôle 15 doit correspondre au début de celle affichée par `discover`.

**Arrêt :** campagne absente, statut différent ou empreinte différente. Ne pas passer à la porte C.

- [ ] Une campagne `discovered` est visible indépendamment.
- [ ] Son empreinte est identique.

---

## Étape 8 — Revue humaine du manifeste

Ouvrir le manifeste uniquement localement. Vérifier :

- exactement cinq entrées ;
- cinq entrées avec `category = orphan_proven` ;
- quatre entrées dans `avatars` ;
- aucune entrée dans `voice-intros` ;
- une entrée dans `verifications` ;
- cinq groupes de propriétaires distincts ;
- aucun propriétaire Auth présent à la découverte ;
- date la plus ancienne cohérente avec le 1er février 2026 ;
- projet `qtihezzbuubnyvrjdkjd` ;
- version et schéma attendus ;
- empreinte identique à celle affichée par `discover`.

Si une information semble incorrecte, supprimer les artefacts avec la commande `shred`, investiguer,
puis refaire une nouvelle campagne. **Ne jamais éditer le manifeste.**

- [ ] Revue humaine approuvée.
- [ ] Aucun artefact sensible copié hors de `.juno09/`.

---

## Étape 9 — Porte C : validation et approbation signée

Remplacer `<id>` par l'identifiant exact affiché à l'étape 7 :

```powershell
node scripts/juno09-orphan-campaign.mjs validate --campaign <id>
```

Cette commande ne supprime rien. Le CLI transmet le **manifeste entier**, pas seulement une
empreinte déclarée à côté d'une liste. Le serveur :

1. recalcule lui-même l'empreinte du manifeste reçu ;
2. consulte le registre et exige une campagne `discovered` portant cette empreinte ;
3. revalide chaque entrée et l'absence des propriétaires Auth ;
4. confirme la distribution exacte `4 / 0 / 1` ;
5. enregistre l'approbation, relit le registre et exige `approved` ;
6. signe une approbation valable 60 minutes.

Attendu : fichier d'approbation créé sous `.juno09/` et sortie :

```text
registre : approved, empreinte identique
```

**Arrêt :** au moindre refus, ne pas relancer `execute`. Une approbation expirée nécessite une
nouvelle validation, sans modification du manifeste.

- [ ] Approbation serveur obtenue.
- [ ] Registre relu au statut `approved` avec la même empreinte.
- [ ] Heure d'expiration notée.
- [ ] Il reste suffisamment de temps pour la vérification finale et l'étape 10.

---

## ⛔ Porte de décision avant suppression

À ce point :

- la migration et la fonction sont en production ;
- le manifeste existe ;
- l'approbation est signée ;
- **aucun média n'a encore été supprimé**.

Relire les éléments suivants avant de poursuivre :

```text
Projet                  : qtihezzbuubnyvrjdkjd
Campagne                : ______________________________
Objets à supprimer      : 5
Distribution            : avatars=4 / voice-intros=0 / verifications=1
Objets seed-* avant     : 60
Objets comptes vivants  : ______________________________
Approbation non expirée : OUI
Décision juridique      : NON, aucune conservation documentée / autre : __________
```

L'étape suivante est irréversible. Si l'utilisateur n'a pas explicitement autorisé l'exécution,
**s'arrêter ici**.

---

## Étape 10 — Porte D : exécution destructive irréversible

Exécuter uniquement dans la même console PowerShell interactive :

```powershell
node scripts/juno09-orphan-campaign.mjs execute --campaign <id> `
  --execute `
  --project qtihezzbuubnyvrjdkjd `
  --confirm-count 5
```

Le programme demande ensuite de retaper le nombre exact dans le terminal. Taper :

```text
5
```

Conditions requises simultanément :

- `--execute` présent ;
- projet exact ;
- confirmation exacte de cinq objets ;
- terminal interactif ;
- manifeste intact ;
- approbation signée et non expirée ;
- cinq objets toujours classés orphelins par le serveur ;
- aucun propriétaire Auth réapparu.

Attendu au premier passage :

```text
deleted=5 | already_absent=0 | failed=0
```

### Timeout, interruption ou résultat partiel : ne jamais rejouer

Une campagne a droit à **une seule passe destructive**. Le serveur lit le registre avant la première
suppression et exige `approved`. Après la passe, même partielle, la campagne est close au statut
`executed`. Toute seconde tentative doit être refusée avec `campaign_closed` avant une suppression.

En cas de timeout ou de résultat partiel :

1. ne pas rejouer la même commande ;
2. ne pas modifier le manifeste ou le plafond ;
3. archiver les compteurs obtenus ;
4. exécuter immédiatement le diagnostic APRÈS ;
5. analyser les objets restants ;
6. préparer une nouvelle campagne et un changement de plafond soumis à revue.

La nouvelle découverte trouvera moins de cinq objets et sera refusée par les plafonds actuels. Cette
friction est volontaire : une passe partielle exige une décision explicite.

- [ ] Résultat numérique noté.
- [ ] Aucun chemin ou identifiant sensible affiché.

---

## Étape 11 — Diagnostic APRÈS

Rejouer intégralement :

```text
supabase/tests/diagnose_orphan_purge.sql
```

| Contrôle | Attendu après |
|---|---|
| résultat de campagne | `deleted=5`, `already_absent=0`, `failed=0` sur l'unique passage |
| orphelins avatars | `0` |
| orphelins voice-intros | `0` |
| orphelins verifications | `0` |
| médias de vérification orphelins | `0` |
| objets `seed-*` | `60`, inchangé |
| objets de comptes vivants | strictement identique à l'étape 6 |
| classification exhaustive | `OK` |
| plus ancien orphelin | aucun |
| empreintes enregistrées | manifeste et approbation présentes |
| campagne sans approbation | aucune |
| retard métier phase B | `0` |
| travaux historiques inventés dans `media_purge_jobs` | aucun |

**Incident critique :** si le nombre d'objets appartenant aux comptes vivants baisse, arrêter toute
nouvelle campagne et conserver les preuves. Ce résultat est plus grave qu'un orphelin restant.

- [ ] Diagnostic après archivé.
- [ ] Témoins et objets des comptes vivants inchangés.
- [ ] Aucun orphelin historique restant.

---

## Étape 12 — Détruire les artefacts locaux et fermer la session

Seulement après archivage des preuves non sensibles :

```powershell
node scripts/juno09-orphan-campaign.mjs shred --campaign <id>
```

Puis :

```powershell
Set-Clipboard -Value "-"
Remove-Item Env:ORPHAN_PURGE_SECRET -ErrorAction SilentlyContinue
$purgeSecret = $null
$purgeFingerprint = $null
$approvalFingerprint = $null
[System.GC]::Collect()
```

Fermer entièrement la console PowerShell. L'écrasement de fichiers n'est pas une garantie
d'effacement physique sur un système journalisé ; la fermeture du processus reste nécessaire pour
retirer le secret de sa mémoire active.

- [ ] Manifeste supprimé.
- [ ] Approbation supprimée.
- [ ] Presse-papiers écrasé.
- [ ] Variable d'environnement retirée.
- [ ] Console fermée.

---

## Étape 13 — Dossier de preuves et fermeture

Compléter sans inclure de chemin, UUID ou identifiant Storage :

```text
Campagne                    : 2026-09-11-6cb356
Date                        : 11 septembre 2026
Décision juridique          : NON — aucune obligation de conservation identifiée ; la vidéo brute
                              n'était plus nécessaire après la vérification et le compte avait
                              demandé sa suppression ; incluse

AVANT
  avatars orphelins         : 4
  voice-intros orphelins    : 0
  verifications orphelines  : 1
  seed-*                    : 60
  objets comptes vivants    : avatars=17
  classification exhaustive : oui — 90 objets (ambiguous=6, unknown_path_shape=62, uuid=22)
  comptes Auth              : 365
  empreinte manifeste       : e8dd5a11993f2127… (tronquée)

CHAÎNE
  discover : registre discovered, empreinte identique, manifeste v2 assemblé et haché par le serveur
  validate : approbation signée par le serveur, registre approved, empreinte identique
  execute  : registre vérifié avant la première suppression, une seule passe
  empreinte approbation     : a0ed3fd80f994ac9… (tronquée)

EXÉCUTION
  deleted                   : 5
  already_absent            : 0
  failed                    : 0
  classe d'erreur           : aucune — enregistré : oui

APRÈS
  avatars orphelins         : 0       (attendu 0)
  voice-intros orphelins    : 0       (attendu 0)
  verifications orphelines  : 0       (attendu 0)
  seed-*                    : 60      (attendu 60)
  objets comptes vivants    : avatars=17   (identique à AVANT)
  classification exhaustive : oui — 85 objets (ambiguous=6, unknown_path_shape=62, uuid=17)
  campagnes                 : executed=1 ; aucune sans approbation
  retard métier phase B     : 0       (attendu 0) ; travaux manual = 2, inchangé
  comptes Auth              : 365
  artefacts détruits        : OUI — shred, presse-papiers écrasé, secret retiré, console fermée

JUNO-09 peut être fermé      : OUI — fermé le 11 septembre 2026
```

JUNO-09 ne peut être fermé que si :

- les cinq orphelins ont disparu ;
- les 60 témoins sont intacts ;
- le nombre d'objets appartenant aux comptes vivants n'a pas baissé ;
- aucun échec ne subsiste ;
- le retard métier de phase B demeure à zéro ;
- les artefacts locaux sensibles ont été détruits ;
- la migration, la fonction, les tests et les preuves sont versionnés.

Une campagne partielle ne peut pas fermer JUNO-09 et ne doit jamais être rejouée.

---

## Retour arrière avant l'étape 10

Avant l'exécution destructive, tout peut encore être arrêté :

```powershell
node scripts/juno09-orphan-campaign.mjs shred --campaign <id>
Remove-Item Env:ORPHAN_PURGE_SECRET -ErrorAction SilentlyContinue
```

L'approbation expire seule après 60 minutes.

Pour empêcher toute nouvelle approbation côté base sans supprimer l'historique :

```sql
REVOKE EXECUTE ON FUNCTION public.record_orphan_approval(TEXT, TEXT, TEXT)
FROM service_role;
```

Pour désarmer complètement la fonction, retirer `ORPHAN_PURGE_SECRET` des secrets Supabase.

Après l'étape 10, aucun retour arrière des objets Storage n'est documenté.
