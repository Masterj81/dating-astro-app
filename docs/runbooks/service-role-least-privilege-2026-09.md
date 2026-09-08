# Runbook — retirer la clé service_role de marketingagent, puis décider de la rotation

**JUNO-04** de `docs/security-audit-2026-09-07.md`. Vague 2, 8 septembre 2026.

Aucune étape de ce document n'a été exécutée. Aucune clé n'a été créée, posée,
tournée ni révoquée. Aucune fonction n'a été déployée.

---

## 0. Ordre de déploiement — la séquence de référence

Les deux vagues sont sur `master` et le CI est vert. **Cela ne veut pas dire que
la vague 2 est en production** : la base est partiellement prête, et
`send-email`, `unsubscribe` et `marketing-agent` ne sont pas déployées. Rien
ci-dessous ne doit être sauté ni réordonné.

| # | étape | porte de contrôle |
|---|---|---|
| 1 | attendre la fin du déploiement Vercel | le build est vert dans le tableau de bord |
| 2 | tester une **synastrie autorisée** et le **paywall gratuit** | le compte abonné voit la lecture ; le compte gratuit voit le paywall, pas une erreur |
| 3 | ouvrir un **checkout annuel sans payer** | voir la liste ci-dessous |
| 4 | **confirmer que `20260908000001` est appliquée** | `verify_20260908`, énoncé 1 : 13/13 |
| 5 | préparer la transition dual-key (§3 de l'autre runbook) | une valeur candidate **vérifiée**, pas devinée |
| 6 | déployer `send-email` **et** `unsubscribe` | les deux, dans la même passe |
| 7 | tester **un ancien** lien et **un nouveau** | `generation=legacy` puis `generation=v2` dans les journaux |
| 8 | poser `MARKETING_AGENT_TOKEN` | des deux côtés : `.env` local **et** secret Supabase |
| 9 | déployer `marketing-agent` | l'étape 4 doit être verte, sinon la fonction refuse tout |
| 10 | tester ses **4 opérations autorisées** et **plusieurs interdites** | phase B, les deux tableaux |
| 11 | retirer `SUPABASE_SERVICE_ROLE_KEY` de `marketingagent/.env` | refaire les 4 opérations après le retrait |
| 12 | **seulement alors**, considérer JUNO-04 et JUNO-21 comme fermés | — |

L'étape 4 avant l'étape 9 n'est pas une précaution de style : `marketing-agent`
appelle les trois RPC de `20260908000001`, et échoue fermé.

### Étape 3 — ce qu'il faut vérifier sur le checkout annuel

Aucun paiement n'est à finaliser. Ouvrir la page Stripe suffit.

- [ ] le **mode** Stripe — test ou live ; savoir lequel avant de lire un montant
- [ ] le **produit** et la **périodicité annuelle**, pas mensuelle
- [ ] le **montant avant et après remise** — c'est le seul témoin de
      `STRIPE_ANNUAL_COUPON_ID` ; s'il n'est pas posé côté serveur,
      `resolveAutomaticCoupon` rend `null`, la session se crée normalement au
      **prix plein**, et **rien n'échoue**
- [ ] la **devise**
- [ ] l'**absence de `couponId`** dans la requête réseau du navigateur — le
      serveur l'ignore déjà, mais son absence prouve que le nouveau bundle est
      bien servi
- [ ] **ne rien finaliser**

---

## 1. Ce que le constat est, et ce qu'il n'est pas

`marketingagent/.env` contient `SUPABASE_SERVICE_ROLE_KEY` : un JWT valide
jusqu'en 2036 qui ignore RLS sur toutes les tables, lit `profiles` en entier
(PII, données de naissance) et `messages`, et peut supprimer n'importe quel
compte via l'API d'administration `auth`.

**Analyse d'exposition, faite le 8 septembre 2026, sur le dépôt uniquement :**

| question | méthode | résultat |
|---|---|---|
| le fichier est-il suivi par git ? | `git ls-files` | non |
| l'a-t-il jamais été ? | `git log --all --diff-filter=A` | **0 ajout** sur toutes les refs |
| `.gitignore` le couvre-t-il ? | `git check-ignore -v` | oui, `.gitignore:34` |
| un fichier suivi contient-il un JWT ? | balayage de tous les fichiers suivis | aucun |
| un diff `marketingagent/` a-t-il jamais porté un JWT ? | `git log --all -p` | 0 occurrence |
| le CI reçoit-il la variable ? | `.github/workflows/` | aucune référence |
| du code imprime-t-il `process.env` en bloc ? | recherche de `JSON.stringify(process.env)` et variantes | aucun |
| les messages d'erreur portent-ils la valeur ? | revue des `console.*` de marketingagent | noms de variables seulement |

**Conclusion : aucune exposition démontrée.** Le constat n'est donc pas « la clé
a fuité », c'est **« un processus local détient un privilège administratif
général sur la production »**. Ce sont deux problèmes distincts et un seul se
corrige par une rotation.

Vocabulaire, parce que la suite en dépend :

- **exposition confirmée** — aucune ;
- **exposition possible** — la clé vit en clair sur un poste de travail qui fait
  aussi tourner un navigateur et d'autres logiciels ; JUNO-25 montre par
  ailleurs qu'une clé de signature Apple `.p8` est rangée dans un dossier de
  cours sur cette même machine, ce qui renseigne sur l'hygiène du poste, pas sur
  cette clé-ci ;
- **privilège excessif** — **confirmé**, et c'est le vrai constat ;
- **rotation préventive** — justifiée par la durée de vie (dix ans, jamais
  tournée), pas par une preuve de compromission.

> **Une rotation seule ne ferme pas JUNO-04.** Elle remplacerait une clé
> omnipotente par une autre clé omnipotente dans le même fichier en clair.
> Déplacer le `.env` vers un gestionnaire de secrets ne le ferme pas non plus.

---

## 2. Ce que marketingagent fait réellement

Inventaire exhaustif, lu dans `cloud-scheduler.ts` et `upload-image.ts` :

| # | opération | cible | fréquence |
|---|---|---|---|
| 1 | téléverser une image | Storage | à chaque publication programmée |
| 2 | insérer une ligne | `marketing_posts` | idem |
| 3 | lister la file (≤30 lignes) | `marketing_posts` | `npm run agent -- cloud-list` |
| 4 | relire des statuts par id | `marketing_posts` | synchronisation manuelle |

Quatre opérations, une table, un bucket. Aucune ne nécessite de contourner RLS
au-delà de cette table — `marketing_posts` refuse tout accès direct
(`USING (false)`) et n'autorise que `service_role`, ce qui est la raison
historique du choix.

### Options évaluées

| option | verdict |
|---|---|
| **1. Fonction edge dédiée + jeton propre** | **retenue.** Frontière naturelle : la clé de service passe au magasin de secrets Supabase, où elle vit déjà pour quinze fonctions. Le poste ne garde qu'un jeton à quatre capacités. |
| 2. RPC `SECURITY DEFINER` étroites | **retenue en complément.** Ne résout pas le Storage à elle seule, et une RPC exposée à `authenticated` serait une régression. Utile derrière la fonction edge. |
| 3. Rôle Postgres dédié | écarté. Demande une chaîne de connexion directe ; `supabase-js` parle à PostgREST. Le mot de passe du rôle resterait un secret large sur le poste. |
| 4. Clé serveur dans le magasin de secrets de l'exécution | c'est ce que fait l'option 1. Seule, sans réduction de privilège, elle ne ferme pas le constat. |
| 5. URL signées pour le Storage | écarté pour l'instant. Meilleur si les images grossissent ; `createSignedUploadUrl` est l'alternative documentée. Aujourd'hui les images font ~1 Mo et passer les octets par la fonction est plus simple et entièrement testable hors ligne. |

### L'interface retenue

`supabase/functions/marketing-agent/` — quatre opérations, jamais davantage :

| opération | entrée | validation |
|---|---|---|
| `POST /upload` | octets bruts + `Content-Type` | type sur liste blanche ; **chemin choisi par le serveur** (`marketing/<année>/<uuid>.<ext>`) ; 8 Mo maximum, vérifié deux fois ; `upsert: false` |
| `schedule_post` | texte, sujet, score, plateformes, date, URL d'image | liste blanche de plateformes ; longueurs bornées ; date dans une fenêtre ; URL d'image obligatoirement dans le bucket marketing |
| `list_queue` | limite, statut | statut sur liste blanche ; limite bornée à 100 ; colonnes et tri fixes |
| `sync_status` | identifiants | UUID validés ; 200 maximum |

Propriétés structurelles :

- authentification par `MARKETING_AGENT_TOKEN`, comparé en **temps constant**,
  refusé si plus court que 32 caractères ;
- **aucun en-tête CORS** — le seul appelant est un processus Node, donc aucun
  navigateur ne peut lire une réponse, quelle que soit l'origine ;
- limite de débit **avant** la comparaison du jeton, pour qu'elle puisse borner
  une tentative de devinette, et **fail-closed** ;
- aucune requête arbitraire : aucun paramètre ne nomme une table, une colonne,
  un opérateur, un bucket ou un rôle ;
- journal d'audit sans donnée sensible : `op`, taille, nombre d'identifiants.

Côté base, `20260908000001_marketing_agent_narrow_rpcs.sql` : trois fonctions
`SECURITY DEFINER`, `search_path = ''`, objets qualifiés, `REVOKE` de PUBLIC,
`anon` et `authenticated`, `GRANT` à `service_role` seul, aucun SQL dynamique,
et une auto-vérification qui **échoue** plutôt que d'annoncer un succès.

---

## 3. Phase A — préparer

**Prérequis : le runbook `unsubscribe-dual-key-2026-09.md` doit être terminé.**
Sans lui, la rotation de la phase D invalide tous les liens de désabonnement
déjà envoyés.

0. **D'abord `supabase/tests/diagnose_rate_limiting.sql`.**

   `marketing-agent` échoue **fermé** sur `check_edge_rate_limit` : si cette
   fonction manque, elle refuse 100 % des requêtes avec 503 et rien de la phase
   B ne fonctionnera.

   Le 8 septembre 2026, elle **manquait** — `20260420000004_rate_limiting.sql`
   est dans le dépôt depuis avril et n'a jamais été appliquée (JUNO-15). Trois
   fonctions déployées l'appellent et échouent *ouvert*, donc leur limite de
   débit était morte sans que rien ne le signale.

   Si le diagnostic la donne absente, appliquer
   `supabase/migrations/20260908000002_edge_rate_limits_present.sql`. Elle est
   idempotente et sans effet si la fonction existe déjà.

   > Après cela, `calculate-chart`, `claim-referral` et `claim-promo-code`
   > retrouvent leur limite **sans redéploiement**. Des 429 qui apparaissent
   > alors ne sont pas une régression : c'est le limiteur qui fonctionne pour la
   > première fois depuis avril.

1. Appliquer la migration dans l'éditeur SQL :
   `supabase/migrations/20260908000001_marketing_agent_narrow_rpcs.sql`.
   Elle est idempotente et son bloc final lève une exception si le résultat
   n'est pas celui annoncé.

2. Exécuter `supabase/tests/verify_20260908_marketing_least_privilege.sql`.
   Attendu : 13/13 en posture, 9/9 en refus de validation, et la file lisible.

   > **L'éditeur SQL de Supabase n'affiche que le dernier résultat d'un script.**
   > Ce fichier contient trois énoncés : les lancer **un par un** (sélectionner
   > l'énoncé, puis exécuter), sinon seuls les trois derniers chiffres
   > s'affichent et les treize contrôles de posture passent inaperçus. Le
   > deuxième bloc — `CREATE FUNCTION pg_temp.juno_probe` suivi de son `SELECT` —
   > doit être lancé **entier**, la fonction temporaire vivant le temps de la
   > session.
   >
   > `diagnose_rate_limiting.sql` n'a pas ce problème : une seule requête.

3. Générer le jeton de l'agent, sans le laisser dans l'historique PowerShell :

   ```powershell
   Set-PSReadLineOption -HistorySaveStyle SaveNothing

   $token = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })

   $dir  = Join-Path $env:TEMP ("juno-" + [guid]::NewGuid())
   New-Item -ItemType Directory -Path $dir | Out-Null
   $file = Join-Path $dir "secrets.env"
   Set-Content -Path $file -Encoding utf8 -NoNewline -Value "MARKETING_AGENT_TOKEN=$token"

   supabase secrets set --env-file $file
   Remove-Item $file -Force ; Remove-Item $dir -Force
   ```

   Puis mettre **la même valeur** dans `marketingagent/.env`, sous
   `MARKETING_AGENT_TOKEN=`. Ne pas encore retirer l'ancienne clé.

   `Get-Random` n'est pas cryptographiquement sûr. Pour un jeton partagé
   destiné à durer, préférer :
   ```powershell
   $bytes = [byte[]]::new(32)
   [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   $token = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
   ```

4. Déployer la fonction :
   ```
   supabase functions deploy marketing-agent
   ```

---

## 4. Phase B — réduire le privilège

Les quatre opérations, une par une, **avant** de retirer quoi que ce soit.

| # | commande | attendu |
|---|---|---|
| 1 | `npm run agent -- cloud-list` | la file s'affiche, ≤30 lignes |
| 2 | `npm run agent -- cloud-schedule <id> "demain 19:00"` | un identifiant serveur revient ; l'image est téléversée |
| 3 | vérifier l'URL d'image renvoyée | commence par `.../object/public/marketing-images/marketing/<année>/` |
| 4 | synchronisation (`cloud-sync` / dashboard) | les statuts remontent |

Puis les refus, qui comptent autant :

| # | tentative | attendu |
|---|---|---|
| 5 | appeler la fonction sans `Authorization` | 401 `unauthorized` |
| 6 | appeler avec un jeton faux | 401 `unauthorized`, **identique** au précédent |
| 7 | `{"op":"delete_all"}` | 400 `unknown_op` |
| 8 | téléverser un `text/html` | 415 `unsupported_content_type` |

**Ensuite seulement** : retirer la ligne `SUPABASE_SERVICE_ROLE_KEY` de
`marketingagent/.env`, et refaire les vérifications 1 à 4. Rien dans ce projet
ne lit plus cette variable — c'est vérifié par recherche sur tout le code de
`marketingagent/`.

À ce stade **JUNO-04 est fermé pour marketingagent**, indépendamment de toute
rotation.

---

## 5. Phase C — décider de la rotation

La rotation est **obligatoire** si l'une de ces conditions est vraie :

| condition | état au 8 sep 2026 |
|---|---|
| la clé a été suivie par git | non (0 ajout sur toutes les refs) |
| elle apparaît dans un artefact ou un journal suivi | non |
| elle a été partagée | **à confirmer par vous** — hors dépôt |
| elle a été envoyée à un service tiers | **à confirmer par vous** — hors dépôt |
| le poste ou un compte a pu être compromis | **à confirmer par vous** |
| son historique d'exposition ne peut être établi | **à confirmer par vous** |

Les quatre dernières lignes ne se répondent pas depuis le dépôt. Ce sont les
seules questions ouvertes de ce runbook.

**Si aucune n'est vraie**, la rotation est **préventive**, pas corrective. Elle
reste recommandée pour une raison simple : la clé a une durée de vie de dix ans
et n'a jamais été tournée. Calendrier proposé — une rotation maintenant, puis
tous les douze mois, et systématiquement au départ de toute personne ayant eu
accès au poste.

---

## 6. Phase D — rotation manuelle

### Porte d'entrée — sept conditions, toutes vraies

Ne rien exécuter ici tant que ces sept lignes ne sont pas cochées. Ce n'est pas
une liste de bonnes pratiques : chacune correspond à une panne observable si on
tourne la clé sans elle.

- [ ] un **ancien** lien de désabonnement fonctionne
- [ ] un **nouveau** lien v2 fonctionne
- [ ] les nouveaux courriels sont signés **uniquement** en v2
- [ ] les **quatre** opérations de `marketing-agent` fonctionnent
- [ ] les opérations **hors périmètre** sont refusées
- [ ] **aucun consommateur local** de l'ancienne clé ne subsiste
- [ ] l'**inventaire des consommateurs distants** est terminé (§6.2)

Les deux premières sont celles qui coûtent le plus cher si on les saute : la
rotation invalide alors, d'un coup et sans erreur visible, tous les liens de
désabonnement déjà envoyés.

1. **Confirmer que la compatibilité legacy des désabonnements est active.**
   `supabase secrets list` doit montrer `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS`, et
   un ancien lien doit encore fonctionner — **testé**, pas supposé. Rappel :
   `secrets list` prouve la présence du nom, jamais la justesse de la valeur.
   Seul `npm run check:unsubscribe-legacy-key`, ou un vrai clic sur un vrai
   lien, prouve la seconde.

2. **Inventorier les consommateurs.** Au 8 septembre 2026, **dix-neuf** fonctions
   edge (`marketing-agent` comprise) et une bibliothèque web lisent la clé :

   ```
   supabase/functions/  backfill-revenuecat, cancel-account-deletion,
                        claim-promo-code, claim-referral,
                        create-checkout-session, create-portal-session,
                        delete-account, get-profile-chart, marketing-agent,
                        process-expired-deletions, publish-scheduled-posts,
                        revenuecat-webhook, send-daily-horoscope, send-email,
                        send-notification, send-report-email,
                        send-scheduled-emails, stripe-webhook, unsubscribe
   apps/web/            src/lib/supabase-admin.ts   (variable Vercel)
   scripts/             fix-seed-photos.js, seed-profile-photos.js,
                        upload-tarot-images.js      (clé passée en argument,
                                                     jamais lue d'un fichier)
   turbo.json           globalEnv                   (participe au hachage de
                                                     cache ; à retirer, voir §8)
   ```

   Les fonctions edge lisent `SUPABASE_SERVICE_ROLE_KEY` depuis l'environnement
   **fourni par la plateforme**, pas depuis un secret posé à la main : Supabase
   l'injecte. Une rotation dans le tableau de bord les met donc toutes à jour
   d'un coup. Le point à traiter séparément est **Vercel**.

3. Créer la nouvelle clé dans le tableau de bord Supabase.

4. Mettre à jour Vercel (`SUPABASE_SERVICE_ROLE_KEY`) sur les trois
   environnements, puis **redéployer** — une variable modifiée ne prend effet
   qu'au déploiement suivant.

5. Vérifier chaque consommateur avant de révoquer :

   | consommateur | vérification |
   |---|---|
   | `stripe-webhook` | un événement de test arrive à `succeeded` |
   | `send-email` | un courriel lifecycle part |
   | `unsubscribe` | un **ancien** lien fonctionne encore |
   | `get-profile-chart` | un thème s'ouvre pour un compte abonné |
   | `apps/web` suppression de compte | le parcours démarre |
   | `publish-scheduled-posts` | le cron publie |
   | `marketing-agent` | les quatre opérations de la phase B |

6. **Révoquer l'ancienne clé seulement après** que les sept lignes ci-dessus
   sont vertes.

7. Récupération : garder l'ancienne clé accessible hors ligne pendant 24 heures
   après la révocation. Si un consommateur oublié tombe, la remise en service
   passe par la régénération d'une clé dans le tableau de bord, pas par la
   restauration de l'ancienne — d'où l'importance de l'inventaire de l'étape 2.

---

## 7. Définition de terminé

**JUNO-04 est fermé quand :**

- [ ] `marketingagent` n'utilise plus `service_role` — *fait dans le code au
      8 sep 2026 ; à confirmer par la phase B en environnement réel*
- [ ] ses opérations passent par des interfaces à privilèges minimaux — *fait*
- [ ] la clé est retirée de son environnement — **phase B, manuelle**
- [ ] l'analyse d'exposition est documentée — *fait, §1*
- [ ] la rotation a été exécutée si jugée nécessaire — **phase C/D, manuelle**

**JUNO-21 est fermé dans le code quand :**

- [x] les nouveaux jetons utilisent une clé indépendante
- [x] les anciens jetons restent vérifiables
- [x] aucun repli vers `service_role` ne subsiste
- [x] les tests couvrent les deux générations
- [x] un runbook de transition existe

---

## 8. Observations connexes, hors périmètre de cette vague

**`turbo.json` liste `SUPABASE_SERVICE_ROLE_KEY` dans `globalEnv`.** Sa valeur
participe donc au hachage du cache Turbo, et chaque développeur qui lance
`turbo` doit l'avoir dans son environnement. Aucune tâche du monorepo n'en a
besoin à la compilation — `apps/web/src/lib/supabase-admin.ts` la lit à
l'exécution, sur Vercel. La retirer de `globalEnv` invaliderait les caches
existants, ce qui est sans danger mais mérite d'être fait délibérément.

**`scripts/seed-profile-photos.js`, `fix-seed-photos.js` et
`upload-tarot-images.js`** prennent la clé en **argument de ligne de commande**.
Sous Windows, cela la place dans l'historique PowerShell. Ces scripts sont des
outils ponctuels ; s'ils resservent, les faire lire une variable
d'environnement.

**`delete-account/index.ts:23`** porte un `TODO (ops)` indiquant que
`DELETION_TOKEN_SECRET` n'est peut-être pas injecté. À vérifier avec le même
`supabase secrets list`.
