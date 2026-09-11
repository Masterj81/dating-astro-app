# JUNO-09 phase C — rattrapage des médias orphelins historiques

**Runbook de production. Écrit le 11 septembre 2026, exécuté le même jour — campagne
`2026-09-11-6cb356`, `deleted=5 · already_absent=0 · failed=0`. JUNO-09 est FERMÉ ; les preuves
sont en §10.** Il reste le mode d'emploi de toute campagne future, qui exigera un plafond revu.

Conception et modèle de menace : `docs/juno-09-phase-c-design-2026-09.md`. À lire d'abord.

---

## 1. Ce qui est à supprimer, et ce qui ne l'est pas

| | objets | |
|---|---|---|
| **à supprimer** | **5** | `avatars = 4`, `voice-intros = 0`, `verifications = 1` |
| à ne pas toucher | **85** | dont **60** `seed-*`, 6 `marketing/`, 17 comptes vivants, 2 racine |

Le plus ancien orphelin date du **1ᵉʳ février 2026**. Le média de `verifications` est une **vidéo du
visage**.

**Ces compteurs sont la référence immuable.** Si la découverte ne rend pas exactement `4 / 0 / 1`, la
procédure s'arrête. Le plafond ne s'ajuste jamais automatiquement : un écart signifie que la
classification a changé, et une classification changée invalide la revue humaine sur laquelle le
manifeste repose.

**Le canari, c'est 60.** `scripts/seed-profile-photos.js` écrit `seed-{uuid}.jpg` **à la racine du
bucket** : l'UUID est dans le NOM DE FICHIER. Un prédicat `path.includes(uuid)` les supprime tous les
soixante. Ce nombre est relevé avant, et revérifié après.

---

## 2. Décision juridique requise avant de commencer

**Je n'invente aucune obligation de conservation.**

| | |
|---|---|
| obligation documentée pour la vidéo de vérification ? | **tranchée le 11 septembre 2026 : NON.** Aucune obligation de conservation identifiée ; la vidéo brute n'était plus nécessaire après la vérification et le compte avait demandé sa suppression ; elle a été incluse. |
| en l'absence d'obligation écrite | la demande de suppression du compte **commande** la suppression du média — RGPD art. 17 |
| si une obligation existe | elle doit être **écrite** (litige, fraude, exigence d'un fournisseur d'identité), l'objet retiré du manifeste, et la campagne devient `4 / 0 / 0` |

Retirer cet objet exige de **modifier le plafond à la main**, dans `CAMPAIGN_CAPS` des deux côtés et
dans la contrainte `volume_cap`. C'est une friction voulue : une exception juridique doit coûter une
migration, pas un drapeau.

Le compte a demandé sa suppression il y a plus de sept mois. Le média a été conservé depuis, sans
base légale identifiée. C'est ce fait qui rend la décision urgente, et c'est pourquoi elle ne doit
pas être improvisée.

---

## 3. Prérequis

| | |
|---|---|
| migration | `20260911000001_orphan_purge_campaigns.sql` appliquée |
| fonction edge | `purge-orphan-media` déployée, `verify_jwt = false` dans `config.toml` |
| secrets | `ORPHAN_PURGE_SECRET` **et** `ORPHAN_APPROVAL_KEY`, 64 hexadécimaux chacun |
| poste | `ORPHAN_PURGE_SECRET` dans l'environnement du shell **seulement** |
| `.gitignore` | `.juno09/` présent — le CLI **refuse de tourner** sinon |
| phase B | intacte : `validate:media-purge` vert |

**`ORPHAN_APPROVAL_KEY` ne va jamais sur le poste.** C'est ce qui rend la porte C réelle : la clé de
signature ne quitte pas la fonction edge, donc l'exploitant ne peut pas fabriquer une approbation, et
un manifeste retouché après validation est irrémédiablement non approuvé.

### Ordre de déploiement

| # | étape | pourquoi ici |
|---|---|---|
| 1 | générer les deux secrets, sans les afficher | §4 |
| 2 | poser `ORPHAN_PURGE_SECRET` et `ORPHAN_APPROVAL_KEY` dans les secrets Supabase | la fonction en a besoin dès son déploiement |
| 3 | copier `ORPHAN_PURGE_SECRET` **seul** dans l'environnement du shell | l'autre ne quitte pas le serveur |
| 4 | appliquer `20260911000001` | la fonction appelle ses RPC |
| 5 | déployer `purge-orphan-media` | rien ne l'appelle avant |
| 6 | `diagnose_orphan_purge.sql` — l'état AVANT | §5 |
| 7 | la campagne, portes A → D | §6 à §8 |

Aucune inversion n'est dangereuse ici : rien n'appelle cette fonction en dehors du CLI, et le CLI
échoue proprement si la fonction ou la table manquent. C'est la différence avec la phase B, dont le
garde fail-closed bloquait les suppressions de comptes.

**L'étape 4 a refusé une première fois, le 11 septembre 2026**, avec
`service_role peut supprimer une campagne : la trace ne serait pas une trace`. Ce n'était pas une
panne : c'est l'auto-vérification de la migration qui a fait son travail. Supabase accorde `ALL` à
`service_role` par défaut sur chaque nouvelle table, et un `GRANT SELECT, INSERT, UPDATE` s'ajoute
à ce `ALL` au lieu de le remplacer — `DELETE` restait. La migration révoque maintenant de
`service_role` **avant** d'accorder, et son contrôle (c) exige exactement ces trois privilèges,
`TRUNCATE` compris dans les refus. Comme la transaction a été annulée en entier, **rien de la
première tentative n'est en place** ; la vérifier avant de rejouer :

```sql
-- Lecture seule. Les trois valeurs doivent être NULL avant la ré-application.
SELECT to_regclass('public.orphan_purge_campaigns')        AS table_registre,
       to_regprocedure('public.orphan_scan_objects()')     AS rpc_balayage,
       to_regprocedure('public._orphan_counts_ok(jsonb)')  AS fn_forme;
```

Si l'une des trois n'est pas NULL, ne pas rejouer : la migration est écrite `CREATE … IF NOT EXISTS`
et `CREATE OR REPLACE`, donc elle est rejouable, mais un état partiel signifierait que l'éditeur
SQL n'a pas exécuté le fichier dans une seule transaction, et il faut comprendre pourquoi avant.

**Une deuxième tentative a refusé sur `syntax error at or near "$"`** : le correctif précédent
avait été posé par un script dont le remplacement de chaîne lit `$$` comme un seul `$`, et le
bloc d'auto-vérification commençait par `DO $`. Une erreur de syntaxe dans un script multi-
instructions est levée **à l'analyse, avant que la première instruction ne s'exécute** — pas même
le `BEGIN` — donc cette tentative n'a rien touché non plus. `validate:orphan-purge` vérifie
maintenant l'équilibre des dollar-quotes des deux fichiers SQL, que rien n'exécute localement.

---

## 4. Les deux secrets — générés une fois, jamais affichés

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

function New-JunoSecret {
  $rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 32
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $hex = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
  if ($hex.Length -ne 64 -or $hex -eq ('0' * 64)) { throw "Generation ratee" }
  return $hex
}

$purgeSecret  = New-JunoSecret
$approvalKey  = New-JunoSecret

$sha = [System.Security.Cryptography.SHA256]::Create()
$fp = { param($v) ([BitConverter]::ToString(
    $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($v))) -replace '-','').ToLower().Substring(0,16) }
Write-Output "EMPREINTE purge   : $(& $fp $purgeSecret)"
Write-Output "EMPREINTE approval: $(& $fp $approvalKey)"
$sha.Dispose()
```

> **`RandomNumberGenerator::Fill` n'existe pas en PowerShell 5.1** — c'est une méthode .NET Core.
> Elle échoue en `MethodNotFound`, laisse le tampon à zéro, et produit 64 zéros. D'où `Create()` et le
> garde `throw`. Ne **jamais** utiliser `Get-Random` : ce n'est pas un générateur cryptographique.

Poser les deux côté Supabase :

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
  npx supabase secrets set --env-file $tempSecretFile --project-ref qtihezzbuubnyvrjdkjd
  if ($LASTEXITCODE -ne 0) { throw "Echec de la mise a jour des secrets." }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) { Remove-Item -LiteralPath $tempSecretFile -Force }
}
```

Puis, dans **ce shell seulement**, et jamais en argument :

```powershell
$env:ORPHAN_PURGE_SECRET = $purgeSecret
Remove-Variable approvalKey            # il ne doit plus exister sur le poste
[System.GC]::Collect()
```

> `UTF8Encoding::new($false)` : `Set-Content -Encoding utf8` écrit un **BOM** en PowerShell 5.1, et le
> BOM entrerait dans la valeur du secret. Le `finally` couvre l'interruption, qui laisserait sinon les
> deux secrets en clair dans `%TEMP%`.
>
> `Remove-Variable` ne purge pas la mémoire du processus. Fermer la console après la campagne est la
> seule garantie réelle — c'est une limite, pas une précaution complète.

---

## 5. AVANT — geler l'état et confirmer les compteurs

```
supabase/tests/diagnose_orphan_purge.sql
```

**Portes d'arrêt. Si l'une échoue, ne pas continuer.**

| contrôle | attendu | si différent |
|---|---|---|
| 7 · orphelins par bucket | **`avatars=4 | verifications=1`** | **ARRÊT.** Ne pas ajuster le plafond. |
| 8 · médias de vérification orphelins | **1** | ARRÊT, et reprendre §2 |
| 9 · témoins `seed-*` | **60** | ARRÊT : le canari est déjà anormal |
| 10 · objets de comptes vivants | *noter la valeur* | c'est la référence du contrôle d'après |
| 11 · classification exhaustive | **OK** | ARRÊT : des objets échappent aux quatre classes |
| 12 · répartition par classe | `ambiguous=6 | unknown_path_shape=62 | uuid=22` | investiguer avant de continuer |
| 17 · retard métier phase B | **0** | traiter la phase B d'abord |
| 18 · travaux `manual` | ceux de la vérification contrôlée de phase B, et rien de plus | investiguer |

**Conserver cette sortie.** Elle est la moitié « avant » du dossier de preuves, et elle ne contient
aucun identifiant.

### Porte A + B — la découverte et le manifeste

```powershell
node scripts/juno09-orphan-campaign.mjs discover
```

Elle affiche des **compteurs seulement**, vérifie que la classification est exhaustive, écrit le
manifeste dans `.juno09/` en `0600`, et affiche son empreinte. Elle ne peut rien supprimer : il n'existe
aucun chemin de code pour cela dans cette sous-commande.

**Le manifeste est celui du serveur.** C'est la fonction edge qui l'assemble, le hache, enregistre
l'empreinte dans `orphan_purge_campaigns` par `record_orphan_discovery`, **relit la ligne** et ne
répond qu'ensuite. Le CLI l'écrit tel quel, après avoir recalculé l'empreinte de son côté — ce qui
prouve, à la découverte et non à la porte C, que les deux implémentations s'accordent — et après
avoir vérifié que la réponse dit `registre : discovered, empreinte identique`. Sans cette ligne, rien
n'est écrit.

Attendu à l'écran :

```text
manifeste écrit : .juno09/manifest-<id>.json  (0600, gitignoré)
empreinte       : <64 hex>
registre        : discovered, empreinte identique, plafond 5
```

Noter l'**identifiant de campagne** et l'**empreinte du manifeste**.

Si la découverte est **refusée** avec `volume_limit_exceeded`, le serveur n'a émis aucun manifeste
et n'a rien enregistré : les compteurs affichés disent ce qu'il a trouvé, et il faut comprendre
pourquoi avant toute autre chose. Ne pas adapter le plafond.

### La revue humaine

Le manifeste **ne contient aucun chemin**. Il porte `storage.objects.id`, opaque, plus un
`ownerGroup` aveugle qui permet de compter les propriétaires distincts sans savoir qui ils sont.

Ce qu'il faut revoir :

- **5 entrées**, toutes en `category: "orphan_proven"` ;
- **5 propriétaires distincts** — un objet chacun, ce qui est cohérent avec cinq comptes supprimés ;
- les dates de création : la plus ancienne au **1ᵉʳ février 2026** ;
- `authUsersAtDiscovery` : à comparer au contrôle 19 du diagnostic.

Si quelque chose ne correspond pas, **ne pas corriger le manifeste** : le régénérer. Une correction à
la main invalide son empreinte, et la porte C refusera.

---

## 5 bis. Ce qui s'est passé le 11 septembre 2026, et ce qu'il en reste

La première campagne s'est arrêtée à la porte C : `HTTP 409 manifest_mismatch` pour un manifeste
intact. Cause : `discover` **n'appelait jamais** `record_orphan_discovery`. Le manifeste était
assemblé sur le poste — `generatedAt` de l'horloge du CLI, `projectRef` de ses arguments — donc le
serveur n'avait pas d'empreinte à enregistrer ; il ne voyait le manifeste complet qu'à la porte C,
où la base refusait à raison une campagne qu'elle n'avait jamais vue. Chaque porte avait été testée
seule, contre un double ; aucune n'avait été testée après la précédente.

État laissé : **zéro campagne enregistrée, zéro approbation, zéro suppression**, les cinq orphelins
en place, un manifeste local inutilisable.

**Le manifeste de cette première campagne est détruit, pas récupéré.** L'enregistrer après coup
reviendrait à faire accepter au registre une empreinte qu'il n'a pas calculée, fournie par le poste —
exactement l'inversion de confiance que le registre existe pour interdire. Il est de toute façon
refusé partout : le schéma est passé en `juno09-orphan-manifest/2`, et chaque porte le vérifie.

Reprise, dans cet ordre :

| # | étape | pourquoi |
|---|---|---|
| 1 | `npm run validate:orphan-purge` — 90 contrôles ; `validate:edge-security` | la chaîne est maintenant assertée |
| 2 | redéployer `purge-orphan-media` | la fonction déployée porte encore le défaut |
| 3 | `node scripts/juno09-orphan-campaign.mjs shred --campaign <ancien id>` | local seulement ; ne touche ni Storage ni la base |
| 4 | `diagnose_orphan_purge.sql` : contrôle 6 doit montrer **0 campagne** | le registre est vierge, comme attendu |
| 5 | `discover`, avec un **nouvel** identifiant | la réponse doit dire `registre : discovered` |
| 6 | contrôle 6 du diagnostic : **1 campagne, statut `discovered`**, empreinte égale à celle affichée | la preuve indépendante que la porte A a écrit |
| 7 | revue humaine, puis `validate` | la réponse doit dire `registre : approved` |

La migration `20260911000001` n'a pas changé et n'est pas à rejouer. Les secrets non plus.

---

## 6. PENDANT — porte C, la validation signée

```powershell
node scripts/juno09-orphan-campaign.mjs validate --campaign <id>
```

Ce que cette commande fait, dans l'ordre, **avant tout appel réseau** :

1. recalcule l'empreinte du manifeste et la compare ;
2. recalcule **chaque** empreinte d'entrée — une seule entrée altérée est prise ici, même si
   l'empreinte globale avait été refaite ;
3. vérifie le schéma, le projet, le nombre exact et la distribution `4 / 0 / 1`.

Puis le **manifeste entier** part au serveur — pas une empreinte déclarée à côté d'une liste
d'identifiants, qui ne lierait l'approbation à rien. Le serveur **le hache lui-même**, compare cette
empreinte à celle que le registre a enregistrée à la découverte, refuse `campaign_unknown` s'il
n'a jamais vu la campagne et `manifest_mismatch` si l'empreinte diffère. Ensuite seulement il
re-vérifie chaque entrée — l'objet existe-t-il encore, son premier segment est-il un UUID, ce compte
est-il toujours absent — signe si les cinq sont éligibles, enregistre l'approbation, **relit la ligne**
et répond. Le CLI n'écrit l'approbation que si la réponse dit `registre : approved`.

L'approbation est valable **60 minutes**. Assez pour relire, trop court pour qu'un manifeste dorme une
semaine et soit rejoué.

**Rien n'est encore supprimé.**

---

## 7. PENDANT — porte D, l'exécution ⚠️ IRRÉVERSIBLE

```powershell
node scripts/juno09-orphan-campaign.mjs execute --campaign <id> `
  --execute --project qtihezzbuubnyvrjdkjd --confirm-count 5
```

**Six conditions simultanées, ou rien :**

| | |
|---|---|
| `--execute` | vérifié **en premier**, avant toute autre lecture |
| `--project qtihezzbuubnyvrjdkjd` | tapé en entier ; le projet ne s'infère jamais |
| `--confirm-count 5` | égal au total du manifeste |
| le manifeste | empreinte inchangée depuis la découverte |
| l'approbation | signée par le serveur, sur cette empreinte, non expirée |
| un terminal interactif | le nombre est retapé à la main |

**Sans terminal, la suppression est impossible.** C'est ce qui la rend inatteignable depuis la CI ou
un script, quels que soient les drapeaux.

Le serveur vérifie la signature, hache le manifeste reçu, puis **lit le registre avant la première
suppression** : la campagne doit y être `approved`, avec cette empreinte de manifeste et cette
empreinte d'approbation. Une campagne que le registre ne tient pas pour approuvée ne supprime rien —
jusqu'au 11 septembre, le registre n'était consulté qu'au moment d'enregistrer le résultat, une fois
les objets partis. Ensuite il re-vérifie l'absence du propriétaire **entrée par entrée**, puis supprime
**un objet à la fois**. Cinq objets ne demandent pas de lots, et un appel par objet fait qu'un échec
nomme exactement un objet au lieu d'annuler un lot.

### En cas de timeout ou d'échec partiel — une campagne, une seule passe

Le budget est de 30 secondes. Un dépassement laisse le reste en `failed / timeout`, sans avoir touché
aux objets non traités. Le résultat est enregistré tel quel et **la campagne est close** : le registre
passe en `executed` et refuse toute nouvelle exécution (`campaign_closed`), avant toute suppression.

**Ne pas rejouer la même commande.** Une version antérieure de ce runbook le conseillait ; c'était
faux : la base aurait refusé d'enregistrer la seconde passe, et les suppressions auraient eu lieu
sans trace. Ce qui reste demande une **nouvelle campagne** — découverte, manifeste, approbation — et,
parce que les plafonds ne s'ajustent jamais aux chiffres trouvés, la nouvelle découverte trouvera
moins de cinq objets et sera refusée. C'est voulu : un rattrapage partiel est un événement à
comprendre, puis un changement de plafond revu, dans le schéma et dans les deux `CAMPAIGN_CAPS`.

### Conditions d'arrêt immédiat

- une entrée en `auth_owner_exists` → **le serveur refuse toute la campagne avant la première
  suppression**. Un compte est revenu ; il faut une nouvelle découverte ;
- une entrée en `ambiguous_ownership` ou `unknown_path_shape` → même refus global ;
- `manifest_mismatch` ou `approval_mismatch` → refus, rien n'est supprimé ;
- un compte au-delà du plafond → refus.

Une campagne partielle sur un manifeste contesté est pire qu'une campagne annulée.

### Un nouvel objet exige une nouvelle campagne

L'exécution refuse d'ajouter un objet découvert après la validation. C'est explicite dans le contrat :
le chemin destructif itère sur les **entrées du manifeste**, jamais sur un bucket. Un nouvel orphelin
demande une nouvelle découverte, un nouveau manifeste, une nouvelle approbation.

---

## 8. APRÈS — les preuves

```
supabase/tests/diagnose_orphan_purge.sql
```

| # | contrôle | attendu | |
|---|---|---|---|
| 1 | résultat de la campagne | `deleted=5 already_absent=0 failed=0` | contrôle 14 |
| 2 | **orphelins restants** | **aucun** — `avatars=0`, `verifications=0` | contrôle 7 |
| 3 | médias de vérification orphelins | **0** | contrôle 8 |
| 4 | **les 60 témoins `seed-*`** | **60**, inchangé | contrôle 9 |
| 5 | **objets de comptes vivants** | **identique à la valeur notée en §5** | contrôle 10 |
| 6 | classification toujours exhaustive | OK | contrôle 11 |
| 7 | plus ancien orphelin | aucun | contrôle 13 |
| 8 | empreintes enregistrées | manifeste **et** approbation présentes | contrôle 15 |
| 9 | aucune campagne exécutée sans approbation | aucune | contrôle 16 |
| 10 | retard métier phase B | **0** | contrôle 17 |
| 11 | aucun travail historique inventé | inchangé | contrôle 18 |

**Le contrôle 5 est celui qu'on oublie.** Une baisse du nombre d'objets appartenant à des comptes
vivants est le pire résultat possible, et il ne se voit nulle part ailleurs.

### Conservation des preuves

Ce qui reste : la ligne de `orphan_purge_campaigns` — compteurs, empreintes, résultat. **Aucun chemin,
aucun identifiant d'objet, aucun UUID de compte.** Plus la sortie du diagnostic, avant et après.

### Destruction du manifeste

```powershell
node scripts/juno09-orphan-campaign.mjs shred --campaign <id>
```

Le manifeste et l'approbation portent les identifiants d'objets ; ils n'ont plus de raison d'exister.

> L'écrasement effectué par `shred` **n'est pas un effacement sûr** sur un système de fichiers
> journalisé ou copy-on-write. Pour une garantie, il faut un volume chiffré. Dit ici plutôt
> qu'implicite.

Fermer ensuite la console : c'est la seule façon de retirer `ORPHAN_PURGE_SECRET` de la mémoire du
processus.

---

## 9. Retour arrière

| moment | réversible | comment |
|---|---|---|
| avant l'étape 4 | tout | ne rien faire |
| après la migration | oui | les `DROP` sont en fin de `20260911000001` |
| après le déploiement | oui | rien ne l'appelle sauf le CLI |
| après la découverte | oui | `shred`, puis rien |
| après la validation | oui | l'approbation expire seule en 60 minutes |
| **après l'exécution** | **non** | un objet de Storage supprimé ne revient pas |

**Il n'existe pas de restauration.** Les buckets `avatars` et `voice-intros` sont publics, mais rien
ne conserve de copie ; `verifications` est privé. Si une sauvegarde de Storage existe côté
hébergeur, elle n'est pas documentée dans ce dépôt, et **ne pas la supposer**.

Ce qui est réversible, c'est **la suite** :

```sql
-- Interdire toute nouvelle campagne, sans effacer la trace des précédentes.
REVOKE EXECUTE ON FUNCTION public.record_orphan_approval(TEXT, TEXT, TEXT) FROM service_role;
```

Sans cette RPC, la porte C ne peut plus enregistrer d'approbation (`registry_unavailable`, rien
n'est signé), et la porte D refuse toute campagne que le registre ne tient pas pour `approved`.

Et pour désarmer complètement : retirer `ORPHAN_PURGE_SECRET` des secrets Supabase. La fonction
répondra alors `server_misconfigured` à tout appel.

---

## 10. Section de preuves — remplie le 11 septembre 2026

Empreintes tronquées à 16 caractères, comme le contrôle 15 du diagnostic les rend. Aucune empreinte
complète, aucun identifiant d'objet, aucun chemin, aucun UUID de compte ne figure ici ni ailleurs.

```
Campagne              : 2026-09-11-6cb356
Date                  : 11 septembre 2026
Décision juridique §2 : NON — aucune obligation de conservation identifiée ; vidéo incluse

AVANT
  orphelins avatars              : 4      (attendu 4)
  orphelins voice-intros         : 0      (attendu 0)
  orphelins verifications        : 1      (attendu 1)
  témoins seed-*                 : 60     (attendu 60)
  objets de comptes vivants      : avatars=17   (référence)
  classification exhaustive      : oui — 90 objets ; ambiguous=6, unknown_path_shape=62, uuid=22
  plus ancien orphelin           : 2026-02-01
  retard métier phase B          : 0 ; travaux manual = 2 (vérification contrôlée de phase B)
  comptes Auth                   : 365
  empreinte du manifeste         : e8dd5a11993f2127…

CHAÎNE (diagnostic relu entre les portes)
  discover → registre discovered, empreinte identique, manifeste v2 assemblé et haché par le serveur
  validate → approbation signée par le serveur, registre approved, empreinte identique
  execute  → registre vérifié avant la première suppression, une seule passe
  empreinte de l'approbation     : a0ed3fd80f994ac9…

APRÈS
  deleted / already_absent / failed : 5 / 0 / 0
  classe d'erreur                  : aucune ; enregistré = oui
  campagnes au registre            : executed=1 ; aucune sans approbation
  orphelins avatars                : 0      (attendu 0)
  orphelins voice-intros           : 0      (attendu 0)
  orphelins verifications          : 0      (attendu 0)
  témoins seed-*                   : 60     (attendu 60)
  objets de comptes vivants        : avatars=17   (égale la référence)
  classification exhaustive        : oui — 85 objets ; ambiguous=6, unknown_path_shape=62, uuid=17
  plus ancien orphelin             : aucun
  retard métier phase B            : 0 ; travaux manual = 2, inchangé
  comptes Auth                     : 365
  artefacts détruits               : oui — manifeste et approbation par shred, presse-papiers
                                     écrasé, ORPHAN_PURGE_SECRET retiré, console fermée

JUNO-09 peut être fermé : OUI — fermé le 11 septembre 2026
```

La baisse de 90 à 85 est exactement les cinq objets autorisés ; la classe `uuid` passe de 22 à 17,
soit les 17 objets des comptes vivants, seuls. Une première campagne le même jour s'était arrêtée
à la porte C sans rien supprimer ni enregistrer (§5 bis) ; celle-ci est la seule qui ait supprimé.

---

## 11. Ce que ce runbook ne prouve pas

- **Les tests utilisent des doubles.** 60 tests — 49 par porte, 11 pour la chaîne — exercent les
  décisions réelles extraites du code déployé, mais Storage et la base sont simulés. Ils ne prouvent pas que Supabase Storage se comporte
  comme modélisé — seule cette campagne le fera, et elle est destructive par nature.
- **Aucune vérification contrôlée non destructive n'est possible ici.** Contrairement à la phase B, on
  ne peut pas fabriquer un compte jetable *déjà supprimé depuis sept mois*. Le premier essai réel est
  la campagne elle-même, et c'est précisément pourquoi elle passe par quatre portes.
- **Les quatre portes protègent contre l'accident, pas contre un acteur qui contrôle le poste.**
  Celui-là peut lire le secret dans l'environnement et appeler la fonction directement. Ce qu'il ne
  peut pas faire, c'est faire supprimer un objet que le serveur ne classe pas indépendamment comme
  orphelin prouvé. Le pire cas reste borné à cinq objets.
- **JUNO-09 n'est pas fermé par la préparation.** Il l'a été par l'exécution du 11 septembre 2026,
  dont le diagnostic montre zéro orphelin, les soixante témoins intacts, et les dix-sept médias des
  comptes vivants inchangés — §10.
