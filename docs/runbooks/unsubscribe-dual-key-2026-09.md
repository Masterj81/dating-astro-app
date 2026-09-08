# Runbook — découpler les liens de désabonnement de la clé service_role

**JUNO-21** de `docs/security-audit-2026-09-07.md`. Vague 2, 8 septembre 2026.

Aucune étape de ce document n'a été exécutée. Tout ce qui touche à un secret, à
une fonction déployée ou à la base est manuel, et le reste.

---

## 1. Le problème, et pourquoi le correctif évident ne marche pas

Jusqu'au 8 septembre 2026, `send-email` et `unsubscribe` dérivaient tous deux
leur clé HMAC ainsi :

```
UNSUBSCRIBE_TOKEN_SECRET
ou, s'il est absent :
"juno-unsubscribe-v1:" + SUPABASE_SERVICE_ROLE_KEY
```

HMAC-SHA256 résiste à la préimage : la clé de service n'a jamais fui par un
jeton. Le défaut est opérationnel — **faire tourner la clé de service invalide
d'un coup tous les liens de désabonnement déjà envoyés.** Gmail et Yahoo lisent
cela comme un échec d'expéditeur (RFC 8058) ; un lecteur qui clique et reçoit
« lien invalide » est un problème de conformité CASL, pas d'ergonomie.

**Le piège.** « Poser `UNSUBSCRIBE_TOKEN_SECRET` avant la rotation » ne
fonctionne pas, et c'est la chose naturelle à essayer. L'ancien code **préfère**
cette variable quand elle existe, et Supabase injecte les secrets dans la
fonction **en cours d'exécution**. À la seconde où l'on pose la variable, la
fonction déjà déployée se met à vérifier avec une clé qui n'a jamais rien signé.
Poser le secret **est** la panne.

C'est pourquoi la nouvelle clé de signature porte un nom que l'ancien code n'a
jamais lu.

| variable | rôle | lue par l'ancien code |
|---|---|---|
| `UNSUBSCRIBE_TOKEN_SECRET_V2` | signe et vérifie les jetons v2 | **non** |
| `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` | vérifie les jetons legacy | **non** |
| `UNSUBSCRIBE_TOKEN_SECRET` | plus rien | oui — d'où le changement de nom |

Les deux nouvelles variables peuvent donc être provisionnées pendant que
l'ancienne fonction tourne encore, **sans aucun effet sur elle**. La bascule a
lieu une seule fois, au déploiement.

---

## 2. Les deux générations

```
legacy   <b64url(userId:lifecycle)>.<sig>       signé avec _PREVIOUS
v2       v2.<b64url(userId:lifecycle)>.<sig>    signé avec _V2
```

La **forme** du jeton — deux segments ou trois — choisit la clé. Aucun jeton
n'est essayé contre les deux, donc il n'existe pas de signal « quelle clé a
fonctionné ». Les nouveaux jetons sont signés exclusivement en v2.

Séparation de domaine : v2 signe `v2.<b64url(payload)>`, legacy signe le
`<payload>` décodé. Deux chaînes différentes, donc une signature d'une
génération ne peut pas valider dans l'autre — **même si un opérateur configure
par erreur la même valeur pour les deux clés.** C'est testé.

---

## 3. Phase A — déterminer la valeur legacy

C'est l'étape qui décide si les anciens liens survivent. Elle dépend d'un fait
qu'il faut établir, pas deviner.

### A.1 — `UNSUBSCRIBE_TOKEN_SECRET` est-il posé aujourd'hui ?

```
supabase secrets list
```

`secrets list` affiche les **noms** et un condensé, jamais les valeurs.

- **Le nom apparaît** → les liens déjà envoyés ont été signés avec **cette
  valeur**. `LEGACY_UNSUBSCRIBE_SECRET` = cette valeur.
- **Le nom n'apparaît pas** → les liens ont été signés avec la dérivation.
  `LEGACY_UNSUBSCRIBE_SECRET` = `juno-unsubscribe-v1:<ancienne service_role>`,
  concaténation littérale, sans espace, sans saut de ligne.

> Si le nom apparaît mais que sa valeur est perdue, les anciens liens sont
> irrécupérables. Ce n'est pas une raison de renoncer au correctif : c'est une
> raison de le déployer et d'accepter que les liens historiques renvoient une
> page d'erreur, en le sachant plutôt qu'en le découvrant.

### A.2 — Construire la valeur sans l'exposer

Sous Windows, PowerShell enregistre chaque commande tapée dans
`$env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`.
Une clé de service collée en ligne de commande y reste en clair, indéfiniment.

Dans une console dédiée, **avant toute autre commande** :

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing
```

Puis construire un fichier d'environnement temporaire plutôt que de passer les
valeurs en arguments :

```powershell
$dir = Join-Path $env:TEMP ("juno-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
$file = Join-Path $dir "secrets.env"

$newSigning = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })

$legacy = Read-Host "LEGACY_UNSUBSCRIBE_SECRET"

Set-Content -Path $file -Encoding utf8 -NoNewline -Value @"
UNSUBSCRIBE_TOKEN_SECRET_V2=$newSigning
UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS=$legacy
"@

supabase secrets set --env-file $file

Remove-Item $file -Force
Remove-Item $dir -Force
Remove-Variable newSigning, legacy
```

`Read-Host` sans `-AsSecureString` affiche la saisie à l'écran mais ne la met
pas dans l'historique. Si l'écran est partagé, utiliser `-AsSecureString` et
convertir — mais alors la valeur transite par un `BSTR`, ce qui n'est pas
meilleur en pratique sur un poste personnel. Le risque réel ici est
l'historique, et c'est lui qui est traité.

**Ne pas coller la clé de service dans un gestionnaire de mots de passe
partagé, un canal Slack, ni un presse-papiers synchronisé.**

### A.3 — Vérifier que rien n'a bougé

Les deux variables portent des noms que la fonction déployée ignore. Le
comportement en production doit donc être **inchangé** à ce stade.

- ouvrir un lien de désabonnement d'un ancien courriel → il doit fonctionner ;
- `supabase secrets list` doit montrer les deux nouveaux noms.

---

## 4. Phase B — déployer

```
supabase functions deploy send-email
supabase functions deploy unsubscribe
```

Les deux ensemble, dans cet ordre ou l'inverse : elles ne partagent aucun état,
et `send-email` ne peut de toute façon plus signer sans `_V2`.

### B.1 — Lire la ligne de démarrage

Chaque fonction écrit une ligne à froid, noms et présence seulement :

```
[unsubscribe] keys: UNSUBSCRIBE_TOKEN_SECRET_V2=set UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS=set
```

Si l'ancienne variable est restée posée **et** que `_PREVIOUS` manque, la ligne
le dit explicitement :

```
UNSUBSCRIBE_TOKEN_SECRET=set-but-ignored (WARNING: links signed with it cannot be verified — copy it into UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS)
```

C'est le seul endroit du système qui signale cette configuration à moitié faite.

### B.2 — Vérifier les deux générations

| vérification | attendu |
|---|---|
| ouvrir un lien de désabonnement d'un **ancien** courriel | fonctionne ; journal `generation=legacy` |
| déclencher un courriel lifecycle et ouvrir son lien | fonctionne ; journal `generation=v2` |
| l'en-tête `List-Unsubscribe` est présent sur le nouveau courriel | oui |
| altérer un caractère du jeton | page « lien invalide », 400 |

Le journal ne porte jamais le jeton ni l'identifiant du lecteur — seulement la
génération.

### B.3 — Surveiller

Pendant 72 heures, dans les journaux de la fonction `unsubscribe` :

- **aucune** occurrence de `one-click POST with invalid token` en volume
  inhabituel — ce serait le signe que `_PREVIOUS` ne correspond pas ;
- la présence attendue de `generation=legacy`, qui prouve que la compatibilité
  fonctionne réellement plutôt que d'être seulement configurée.

Si des refus apparaissent en masse : reposer l'ancienne valeur dans
`_PREVIOUS` et redéployer. Il n'y a pas de rollback à faire côté code — l'ancien
comportement est reproductible en remettant la bonne valeur.

---

## 5. Phase C — retirer la compatibilité legacy : une décision, pas une échéance

Les jetons **n'expirent jamais**, délibérément : un lien de désabonnement périmé
est un échec de conformité, pas une amélioration de sécurité. Donc « attendre
qu'ils expirent » n'est pas une réponse.

Les faits à peser :

- chaque courriel lifecycle jamais envoyé par JUNO porte un lien legacy, et les
  lecteurs conservent leur courrier indéfiniment ;
- `generation=legacy` dans les journaux **mesure directement** si quelqu'un les
  utilise encore ;
- la valeur résiduelle de la clé legacy, une fois la service_role révoquée, est
  exactement la capacité que le jeton accorde : basculer
  `notification_preferences.lifecycleEmails` sur **un** profil.

**Recommandation : ne pas la retirer.** Le coût de la garder est un secret de
plus dans le magasin ; le coût de la retirer est qu'un lecteur qui clique
« unsubscribe » dans un courriel de 2026 reçoive une erreur — précisément le
comportement que Gmail, Yahoo et la LCAP sanctionnent. Réexaminer seulement si
`generation=legacy` est absent des journaux pendant **douze mois consécutifs**,
et alors le documenter comme une décision produit assumée.

**La clé legacy reste sensible même après la rotation.** Elle contient la
représentation dérivée de l'ancienne clé de service (`juno-unsubscribe-v1:` +
la clé). Cela ne redonne pas accès à Supabase si l'ancienne clé est réellement
révoquée — mais ne pas la traiter comme un secret ordinaire du magasin serait
une erreur.

---

## 6. Ce que le code garantit, et ce qui le vérifie

| garantie | vérifié par |
|---|---|
| un lien legacy signé par l'ancien code se vérifie encore | `unsubscribe-token.test.ts` §2, avec une copie verbatim de l'ancien signeur |
| un lien legacy signé avec la dérivation `juno-unsubscribe-v1:` se vérifie | §2b |
| aucun nouveau jeton n'est signé avec la clé legacy | §14 |
| aucun repli vers `SUPABASE_SERVICE_ROLE_KEY` ne subsiste | §13 + `validate:repo-hygiene` |
| les deux générations restent séparées même avec la même valeur des deux côtés | §4c |
| une clé absente refuse au lieu d'ouvrir | §10-12 |
| aucune erreur ne distingue les clés essayées | §16 |
| la comparaison de signature est à temps constant | §15 |

```
npm run validate:edge-security     # 43 tests sur ce module, 187 au total
npm run validate:repo-hygiene      # le garde structurel, survit à la suppression des tests
```

---

## 7. Ce qui n'est PAS dans ce runbook

`delete-account` et `cancel-account-deletion` signent leurs jetons avec
`DELETION_TOKEN_SECRET`, une variable **déjà indépendante** de la clé de
service. JUNO-21 ne les concerne pas.

En revanche `delete-account/index.ts:23` porte un `TODO (ops)` disant que cette
variable n'est peut-être pas injectée dans l'environnement de la fonction. Si
elle ne l'est pas, la fonction échoue fermé — mais cela mérite d'être vérifié
dans la même passe, avec le même `supabase secrets list`.

La rotation de la clé de service elle-même est l'objet de
`docs/runbooks/service-role-least-privilege-2026-09.md`. **Faire ce runbook-ci
en premier** : la rotation sans la compatibilité à deux clés est exactement la
panne que tout ce document existe pour éviter.
