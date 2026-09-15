# JUNO-30 — décisions produit et désarmement du push horoscope

**Date des décisions : 14 septembre 2026 · Statut : FERMÉ pour le versant exploitation le 15 septembre 2026 (passe C conforme) — les suivis A (jetons push) et B (consentement) restent ouverts.**

Documents de référence : [`../security-audit-2026-09-07.md`](../security-audit-2026-09-07.md)
(constat JUNO-30, mesures), [`scheduled-emails-cron-2026-09.md`](scheduled-emails-cron-2026-09.md)
(pattern Vault de référence), [`expired-deletions-cron-2026-09.md`](expired-deletions-cron-2026-09.md)
(état mesuré des quatre tâches au 9 septembre).

---

## 1. Décisions produit — 14 septembre 2026

### 1a. `daily-horoscope-push` — temporairement désactivé

- La fonctionnalité est **désactivée par décision produit** ; elle ne doit envoyer
  **aucune notification**.
- La fonction edge `send-daily-horoscope` est **conservée** pour un chantier futur.
- **Le cron actif portant un secret vide n'est pas un état désactivé acceptable.** Un
  « succeeded » pg_cron par jour plus un 401 réel chaque jour à 12:00 UTC, depuis
  avril, est une panne permanente déguisée en tâche saine.
- **Interdit : poser le secret uniquement pour faire disparaître le 401.** Le secret
  `DAILY_HOROSCOPE_SECRET` existe côté fonction (posé le 20 avril) — cela ne dit
  rien de la valeur qu'envoie une commande à littéral vide, et « plus de 401 » ne
  signifie pas « le produit fonctionne ».

**Mesures à l'appui (14 septembre, lecture seule, agrégats uniquement) :**

| fait | valeur |
|---|---|
| Éligibles exacts de la fonction (jeton ∧ signe ∧ préférence) | **0** — tous segments |
| Profils réels actifs | 289, dont **187** avec préférence `dailyHoroscope` active |
| Jetons push dans toute la base | **1**, et **non au format Expo** (`ExpoPushToken[…`) |
| Backlog | **sans objet** — la fonction calcule à la volée, aucune file ne peut s'accumuler |
| Première exécution si réparée aujourd'hui | `{sent: 0, skipped: 0, reason: "No eligible users"}` → 200, zéro notification |
| Verdict supervision du jour | `CRITIQUE : secret vide, 401 garanti` ; le seul 401 de la fenêtre pg_net est à **12:00:00 UTC pile** |

Le goulot n'est ni le consentement ni le ciblage : c'est **l'enregistrement des
jetons push** (suivi A ci-dessous) et la nature du consentement par défaut (suivi B).

### 1b. `publish-scheduled-posts` — publication manuelle uniquement

- Le chemin manuel Blotato (`marketingagent` : CLI, dashboard, extension) est **le
  seul publieur autorisé**.
- **Aucun cron** ne sera créé ; **aucun `BLOTATO_API_KEY`** ne sera posé dans
  Supabase (vérifié absent des secrets de fonction le 14 septembre — le poser
  maintenant préparerait un publieur que rien ne contrôle).
- Le pipeline cloud (file `marketing_posts`) **reste non activé** tant que :
  1. le chantier `marketingagent` n'est pas fusionné (19 modifiés + 21 nouveaux
     fichiers sans branche au 14 septembre) ;
  2. l'**invariant « un seul publieur »** n'est pas conçu et décidé : soit l'agent
     cesse de publier en direct et ne fait qu'empiler la file, soit le cron
     publieur est retiré du dépôt. Deux publieurs des mêmes contenus sans garde de
     déduplication = publications en double.

**Mesures à l'appui :** `marketing_posts` = **0 ligne** (pending 0, scheduled 0,
overdue 0) ; première exécution d'un éventuel cron = `{processed: 0, reason:
"No posts due"}` → 200, rien publié — mais dès qu'une ligne serait due et sans
`BLOTATO_API_KEY` fonctionnel, la fonction répond 500 « not configured ».
Divergence plausible à régler si le pipeline s'active : secret fonction mis à jour
le **4 mai**, entrée du coffre `cron_scheduled_posts_secret` créée le **20 avril**.

---

## 2. La fermeture opérationnelle préparée (NON APPLIQUÉE)

**Fichier : `supabase/migrations/20260914000001_juno30_intentional_cron_states.sql`** —
durci le 14 septembre (correction de revue) : **rejouable sur base neuve** (aucune
exigence de l'auto-vérification ne porte sur l'existence du job ni de son historique —
la préservation de l'historique relève du diagnostic après application, uniquement si
le job préexistait), et **refus bruyant avant toute mutation** si plusieurs tâches
portent le nom ou visent `send-daily-horoscope` (état ambigu : désarmer l'une et
laisser l'autre active serait la panne qu'on ferme, avec l'apparence d'un succès).

Trois moitiés, une transaction :

1. `public.cron_task_decisions` — registre des décisions produit sur les tâches
   cron (RLS active, lisible par `service_role` seul, aucun grant client) : c'est
   ce qui rend l'intention **observable dans la base** et pas seulement dans ce
   document. Deux lignes : `daily-horoscope-push → désactivée par décision
   produit`, `publish-scheduled-posts → publication manuelle uniquement`.
2. `cron.alter_job(…, active => false)` sur **daily-horoscope-push uniquement**,
   après le garde d'ambiguïté : planning, commande et historique
   `cron.job_run_details` intacts (les preuves survivent au désarmement). Trois
   états distingués : (a) une tâche → désarmée ; (b) zéro tâche → conforme, rien
   à faire ; (c) plusieurs (nom ou cible) → **échec avant mutation**.
3. `check_cron_edge_health()` remplacée (signature identique) pour distinguer les
   états intentionnels — et crier sur les ambiguïtés durables :

| état de la tâche | verdict supervision |
|---|---|
| désactivée + décision enregistrée | `DESACTIVEE (decision produit du 2026-09-14) — intentionnel, pas une panne` |
| **réactivée sans secret Vault valide** | `CRITIQUE : reactivee SANS secret Vault valide — 401 garanti (decision produit du … contournee)` |
| réactivée avec coffre mais décision toujours enregistrée | `ALERTE : … trancher` |
| **plusieurs tâches visant la même fonction** | `ALERTE : plusieurs taches visent … — arbitrer, une seule doit exister` |
| absente de cron.job + décision | `CONFORME : desactivee et absente de cron.job (…)` / `CONFORME : aucun cron publieur (…)` |
| publieur cron actif malgré décision manuelle | `ALERTE : publieur cron present malgre la decision « publication manuelle uniquement »` |
| les états antérieurs | inchangés (EN CLAIR, VIDE, DESARMEE, INDETERMINE, EN ATTENTE, backlog, OK) |

L'ordre des verdicts change en un point précis : un secret **EN CLAIR** reste
critique même désactivé (la valeur vivrait dans chaque sauvegarde), mais le
« secret vide » d'une tâche **désactivée par décision** ne se lit plus CRITIQUE —
sinon la décision produit se serait lue comme une panne, indéfiniment.

### Effet exact avant / après

| | AVANT (mesuré le 14 septembre) | APRÈS (si appliquée) |
|---|---|---|
| Passages pg_cron | 1/jour à 12:00 UTC, « succeeded » | **aucun** (`active = false`) |
| 401 réel | 1/jour à 12:00:00 UTC pile | **aucun** — vérifiable le lendemain dans `net._http_response` |
| Notifications envoyées | 0 (aucun éligible) | 0 (rien ne tourne) |
| Verdict supervision | `CRITIQUE : secret vide, 401 garanti` (indistinguable d'une panne) | `DESACTIVEE (decision produit du 2026-09-14) — intentionnel` |
| Réactivation sauvage | 401 silencieux quotidien | `CRITIQUE` visible en supervision |
| Historique / preuves | préservé | **préservé** (assertion dans la migration) |

### Retour arrière

- **Réarmer sans secret** (reproduire l'état d'avant — à ne pas faire sans raison) :
  `SELECT cron.alter_job(j.jobid, NULL, NULL, NULL, NULL, TRUE) FROM cron.job j
  WHERE j.jobname = 'daily-horoscope-push';` — la supervision répond alors
  `CRITIQUE : reactivee SANS secret Vault valide` : un échec **visible**, pas un
  silence. C'est voulu.
- **Annuler la décision** : `DELETE FROM cron_task_decisions WHERE jobname = …`
  (à faire dans une migration, pas à la main en production).
- **Réactivation propre** (chantier futur) : valeur **neuve** générée sans
  l'afficher, posée le même jour côté fonction (`DAILY_HOROSCOPE_SECRET`) et au
  coffre **sous un nom sans collision** (`vault.create_secret` sur un nom existant
  **duplique** le nom — mesuré : un seul exemplaire de chacun aujourd'hui) ;
  replanification sur le pattern `20260910000001` (nom seul dans la commande,
  garde `_assert_cron_secret`, unschedule-avant-schedule) ; retrait ou mise à jour
  de la ligne de décision **dans la même migration**.

### Validations (au moment d'appliquer)

1. `npm run validate:cron-secrets` — doit rester vert (la migration ne planifie
   rien, ne pose aucun secret, n'interpole aucune clé).
2. `npm run validate:rls-contract` — la nouvelle table vérifie ses privilèges.
3. Le bloc d'auto-vérification de la migration (refuse de committer sinon) :
   registre complet, RLS, aucun privilège client (lecture **ni écriture**),
   `service_role` en lecture stricte, **zéro ou une** tâche horoscope jamais
   active, supervision mesurée sur les verdicts attendus — **sans aucune
   exigence sur l'historique**, pour rester rejouable sur base neuve.
4. **Régressions comportementales** :
   `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_juno30_intentional_states.sql`
   — R1 base sans job (CONFORME absent) · R2 deux tâches visant la fonction
   (ALERTE ×2 + prédicat d'ambiguïté) · R3 registre illisible (INDETERMINE
   partout, jamais OK) · R4 réactivée sans secret (CRITIQUE) · R5 publieur cron
   malgré décision manuelle (ALERTE) · R6 désactivée = DESACTIVEE jamais OK ·
   R7 privilèges du registre. Tout le fichier vit dans une transaction
   terminée par ROLLBACK : les tâches synthétiques ne deviennent jamais
   visibles du lanceur, rien ne part, rien ne reste.
5. **Diagnostic avant/après** :
   `supabase/tests/diagnose_juno30_horoscope_closure.sql` — passe A (avant),
   passe B (après : verdict intentionnel, historique préservé **si le job
   préexistait**, privilèges ; repère noté = `2026-09-14 12:00:00`), passe C
   (lendemain après 12:00 UTC). **Passe C, preuve principale sur l'identité du
   cron désarmé** (corrigée le 14 septembre sur revue) : `passages_apres_repere
   = 0` sur le job `daily-horoscope-push` dans `cron.job_run_details`,
   `dernier_passage = 2026-09-14 12:00:00+00` — le compteur global de 401
   pg_net n'est qu'un indicateur **secondaire**, et un nouveau 401 global ne
   doit **pas** être attribué au push horoscope sans corrélation supplémentaire
   (pg_net ne relie pas une réponse à sa tâche émettrice).

### Application

Dans l'éditeur SQL (jamais `db push` — JUNO-15), d'un seul tenant, puis lire les
NOTICE et exécuter la requête de supervision. **Ne s'applique que sur mon accord
explicite : rien n'a été appliqué le 14 septembre.**

### Incidents d'application — 14 septembre 2026 (consignés, corrigés, état final conforme)

Quatre empreintes se sont succédé le jour de l'application ; l'état de production
a toujours été soit l'état antérieur (v1), soit l'état voulu avec un défaut
fail-visible (v2, v3) — jamais un faux vert. **La version appliquée finale est
v4, identique octet pour octet au commit `ff37ff8`** (git blob `6f89cdb5`).

| version | SHA-256 | sort |
|---|---|---|
| v1 | `CF253661…` | **application refusée par sa propre auto-vérification** : `NULL` non castés dans le `RETURN QUERY` de la passe « décisions sans tâche » (text vs boolean/timestamptz/integer). Transaction annulée avant COMMIT ; contrôle post-échec : registre absent, tâche active, 147 passages intacts — **rien appliqué**. |
| v2 | `0689AED8…` | appliquée, puis **régression détectée à la vérification** : la variable plpgsql `d` de la passe des décisions collisionnait avec l'alias `d` de `cron.job_run_details` — PL/pgSQL substitue la variable au même nom, la lecture d'historique échouait silencieusement pour TOUTES les tâches (verdicts `INDETERMINE`, jamais `OK` : fail-visible, sans faux apaisement). |
| v3 | `AD48CAA7…` | appliquée (collision corrigée), mais **R5 a attrapé un défaut de conception** : la décision « publication manuelle uniquement » n'était appariée que par nom de job — un publieur recréé sous un autre nom filait vers `EN ATTENTE`. |
| **v4** | **`FA6F4059…`** | ✅ **finale** : appariement par nom **ou fonction ciblée**, passe « sans tâche » ne dit CONFORME que si aucun job ne vise la fonction. Appliquée, R1–R7 vertes, commit `ff37ff8`. |

À chaque itération : empreinte publiée avant l'envoi, trois validateurs verts
(cron-secrets 29/29 · rls-contract 60/60 · repo-hygiene 75/75), application en un
seul tenant. Le harnais de test a lui-même corrigé un double `cron.unschedule`
(levée d'erreur sur nom absent — forme par jobid idempotente adoptée).

---

## 3. Suivi A — jetons push (constat séparé, sans implémentation)

**Constat mesuré (14 septembre) :** 1 seul jeton pour 289 profils réels actifs ;
aucun jeton au format Expo attendu par l'API (`ExpoPushToken[…]`).

À analyser quand le chantier ouvrira :
- où l'enregistrement du jeton casse dans l'app (permission notification refusée ?
  `notifications.ts` jamais appelé ? écriture `profiles.push_token` qui échoue
  silencieusement ?) ;
- pourquoi le jeton existant n'est pas au format Expo (jeton FCM brut ? colonne
  écrite par un ancien chemin ?) ;
- la fraîcheur des jetons (les jetons Expo expirent quand l'app est désinstallée) ;
- **interdit pendant le diagnostic : supprimer ou modifier le jeton existant.**

## 4. Suivi B — consentement `dailyHoroscope` (constat séparé, sans implémentation)

**Constat :** `dailyHoroscope` est passé à `true` **par défaut** le 24 août
(`20260824000001`) ; 187 des 289 profils actifs ont la préférence active.

À trancher avant tout envoi :
- un défaut à `true` constitue-t-il un consentement valide (juridiquement et par
  rapport aux règles des stores) pour une notification quotidienne ?
- proposition attendue : valeur par défaut (probablement `false` à la création,
  opt-in explicite dans l'écran de réglages) + migration éventuelle pour les
  comptes créés depuis le 24 août (repasser à `false` sauf opt-in prouvé —
  prouver l'opt-in des lignes existantes est le point difficile) ;
- **aucun envoi avant décision.**

---

## 5. Statut proposé pour JUNO-30

> **Décisions produit prises le 14 septembre 2026 ; fermeture opérationnelle
> EXÉCUTÉE et PROUVÉE le 15 septembre 2026.**

---

## 6. Fermeture — passe C du 15 septembre 2026 (12:43 UTC)

**Preuve principale (identité du cron désarmé) :**

| mesure | attendu | mesuré | verdict |
|---|---|---|---|
| `active` | `false` | **`false`** | ✅ |
| passages depuis le passage de midi du 15 septembre 12:00 UTC | 0 | **0** — le midi du 15 est passé **sans exécution** : `dernier_passage = 2026-09-14 12:00:00.059869+00` (hier) | ✅ |
| `dernier_passage` | `2026-09-14 12:00:00+00` | `2026-09-14 12:00:00.059869+00` | ✅ |
| indicateur secondaire : 401 globaux après le repère | — | **0** (sans attribution : pg_net ne relie pas une réponse à sa tâche) | ✅ |

**Faux positif de la première lecture, expliqué et tranché.** La requête brute
rendait `passages_apres_repere = 1` alors que la fermeture est réelle : le repère
provient de pg_net, **tronqué à la seconde** (`12:00:00`), tandis que
`cron.job_run_details.start_time` porte la **microseconde**
(`12:00:00.059869`). Le passage d'hier midi se compte donc « après » son propre
repère par 59,869 ms. Ce `1` désigne le passage-repère lui-même, pas un nouveau
passage — la preuve en est `dernier_passage` inchangé au lendemain du désarmement.
Toute NOUVELLE exécution se distinguerait par un `dernier_passage` postérieur au
repère de plus d'une période (24 h). **Correction à retenir pour le diagnostic**
(décision d'exploitation du 15 septembre) : utiliser comme repère **l'horodatage
exact en microsecondes** du dernier passage (le `start_time` lui-même) ou la
**prochaine échéance planifiée** — et non un seuil générique « repère + 1 s »,
qui pourrait masquer une véritable exécution décalée d'une seconde.

**JUNO-30 est FERMÉ pour son versant exploitation le 15 septembre 2026.** Restent
ouverts, en chantiers séparés : le suivi A (enregistrement des jetons push —
1 jeton pour 289 profils actifs, aucun au format Expo) et le suivi B
(consentement `dailyHoroscope`, `true` par défaut depuis le 24 août). La tâche
reste désarmée jusqu'à leur clôture ; toute réactivation passe par la procédure
de réactivation propre du §2.
