# Runbook — JUNO-06 : contrôle premium mobile déplacé côté serveur (2026-09-22)

**Statut : CORRIGÉ LOCALEMENT — migration et preuve production requises.**
Aucune fusion, aucun push, aucune migration appliquée, aucun build EAS. La branche est `fix/juno-06-server-premium` (worktree `C:\temp\juno06`), base `origin/master` = `49832a0` (fermeture JUNO-05/13).

## 1. État initial réel (Phase A, lecture seule)

- `master` : fermetures JUNO-05/13 au SHA documentaire `49832a0`.
- 11 fonctionnalités dans `FEATURE_TIERS` (`apps/mobile/services/premiumUsage.ts`) ; seules `natal-chart` et `conversation-guide` avaient une décision serveur (`SERVER_ENFORCED_FEATURES`, 2 entrées).
- Neuf fonctionnalités sur le chemin legacy client : `synastry`, `daily-horoscope`, `monthly-horoscope`, `planetary-transits`, `retrograde-alerts`, `lucky-days`, `date-planner`, `weekly-tarot`, `monthly-tarot`.
- Décision legacy = `PremiumContext.canAccessFeature` (tier tenu par le téléphone, y compris entitlement RevenueCat local **prévalant sur le serveur** quand le webhook tarde) + essai gratuit compté par le client (`hasTrialRemaining` → `incrementFeatureUsage` : le client lit sa propre ligne `premium_usage` et s'incrémente lui-même — `increment` compte, il ne décide jamais).

## 2. Bypass reproduits (commit 7cf5af5 — preuve « avant », verte sur l'arbre non corrigé, ensuite retirée)

`apps/mobile/src/__tests__/premium-bypass.test.ts` (conservé dans l'historique au commit cité) :

1. **Structurel** : 2/11 mappées ; les 9 autres sans décision serveur.
2. **Décision (entitlement device)** : un tier premium tenu par le téléphone ouvre les 9 fonctionnalités avec **zéro** appel `enforce_premium_feature` (mesuré par enregistreur RPC).
3. **Décision (essai free)** : 9 grants via le chemin legacy, 0 RPC de décision, et le payload `increment_feature_usage` porte un `p_user_id` choisi par l'appelant.
4. **Données** : une lecture de tarot complète (hebdo 4 cartes + mensuelle 3, prose complète) est produite localement depuis le corpus embarqué pour un compte free, zéro appel réseau.

## 3. Matrice 11/11 et classification A/B/C

| Feature | Tier | Source des données | Décision avant | Bypass direct | Classe | Contrôle cible |
|---|---|---|---|---|---|---|
| natal-chart | celestial | edge `calculate-chart` (données propres) | serveur (enforce) | non | A | déjà fait |
| conversation-guide | celestial | corpus embarqué | serveur (enforce au tap) | relecture locale du corpus (accepté) | B | déjà fait |
| synastry | celestial | **edge `get-profile-chart` + `synastry_preview_gate` + `claim_synastry_free_grant`** (JUNO-01/aperçu) | serveur sur le flux, **absente de la carte mobile** | lecture serveur — pas de bypass calcul ; trou de carte cosmétique mais exigé | **A** | mapper `'synastry'`→`'synastry`' ; la lecture reste derrière les RPC existants ; exception documentée dans le gate (refus `insufficient_tier` ≠ fin de partie : l'aperçu par-cible ne vit pas dans `premium_usage`) |
| daily-horoscope | celestial | `profiles.sun_sign` (ligne propre, RLS) + libellés locaux déterministes | client | **oui** (reproduit) | B | `enforce daily_horoscope`, aperçu 1/jour |
| monthly-horoscope | cosmic | idem | client | oui | B | `enforce monthly_horoscope`, 1/jour |
| lucky-days | cosmic | idem | client | oui | B | `enforce lucky_days`, 1/jour |
| date-planner | cosmic | `useMemo` local (intention × signe) | client | oui | B | `enforce date_planner` (le web enforce déjà cette clé) |
| planetary-transits | cosmic | **constante statique embarquée** (états V2) | client | oui — aucune source de données | **C** | `enforce planetary_transits` : la porte protège l'ACCÈS ; les octets sont un fait public inerte, documenté tel quel |
| retrograde-alerts | cosmic | constante statique | client | oui | C | `enforce retrograde_alerts` |
| weekly-tarot | cosmic | moteur + corpus embarqués (seed déterministe) | client | **oui, prouvé en test** | B | `enforce tarot_cosmic` (clé existante 20260511000002), 1/jour |
| monthly-tarot | celestial | idem | client | oui | B | `enforce tarot_monthly`, 1/jour |

**Pourquoi 1/jour partout** : le chemin legacy accordait exactement un aperçu gratuit par fonctionnalité et par jour (`consumeTrial`, `currentUsage >= 1`). Migrer sans `free_preview_quota` supprimerait silencieusement cet aperçu — la classe exacte de régression que `validate:premium-gating` refuse.

## 4. Architecture retenue

- **La décision** : `enforce_premium_feature(p_feature_key)` — atomique (entitlement + aperçu + quota + fenêtre de rejeu 15 min, 20260823000001), `auth.uid()` (aucun `user_id` en paramètre), fail-closed, `SECURITY DEFINER`, `search_path = public`, grants `authenticated` seulement.
- **Le calcul** (catégorie B) : reste local — libellés déterministes depuis le signe solaire propre, moteur tarot partagé. Ce qui bascule côté serveur est l'AUTORISATION, courte et vérifiable. Le runbook de l'audit 20260419000006 documentait déjà cette limite structurelle : déplacer l'arithmétique exigerait d'arrêter d'embarquer les données — chantier distinct, hors périmètre.
- **La synastry** (catégorie A) : aucune nouvelle RPC — l'écran d'entrée passe par la même autorité que le flux (`preview_gate` + `claim`). Sa ligne de politique garde `free_preview_quota = NULL` à dessein : l'aperçu synastrie est un contrat **par cible** qui vit dans `synastry_free_grant`, pas dans `premium_usage` (20260915000001, « POURQUOI UNE TABLE DÉDIÉE »).
- **Le gate** : `PremiumGate` n'a plus de branche legacy ; clé non mappée ⇒ `unknown_feature` ⇒ refus (fail-closed structurel).
- **Le téléphone** : `PremiumContext.canAccessFeature` est rétrogradé en aide UX documentée (`JUNO-06 BOUNDARY`) — consulté uniquement APRÈS un refus serveur, pour lisser un état transitoire d'abonné (webhook en retard), et exiger un tier PAYANT vérifié par l'appareil. Il ne peut rien accorder à un compte free. `consumeTrial`/`hasTrialRemaining` sont supprimés de l'API.

## 5. Migration (NON appliquée)

`supabase/migrations/20260922000001_juno06_server_enforced_features.sql` :
- INSERT 6 lignes (synastry NULL/NULL ; les 5 autres avec preview dans le VALUES) + **8 UPDATE littéraux par clé** (la convention d'attribution textuelle de `validate-premium-gating`, cf. 20260828000001) ;
- DELETE des graines mortes 20260419000006 (`compatibility_details`, `priority_messages`, `likes_you_see_who`) ; l'alias défensif `'tarot''` est conservé (les clients installés l'appellent encore) ;
- auto-vérification `DO $$ … RAISE` (règle maison 20260903000003) : clés attendues, previews = 1, tiers cosmic, synastry NULL.

Contrat comportemental en base de test : `supabase/tests/juno06_server_enforced_features.test.sql` (T1–T7 : quota, abonné, non-authentifié, clé inconnue, idempotence, absence de paramètre utilisateur, téléphone sans écriture de tier).

## 6. RevenueCat et divergences

- Le webhook (seul écrivain de `subscriptions`, service role) reste l'autorité de reconciliation ; le listener optimistic ne touche que le tier UX.
- Chemins couverts : webhook en retard (lissage abonné-transitoire ci-dessus, borné), restauration d'achat (`restorePurchases` → serveur), renouvellement/expiration/remboursement/période de grâce (webhook → `subscriptions` → `get_user_tier`), panne RevenueCat (le serveur répond sur l'état connu ; refus = refus), divergence device premium / serveur free (un compte free n'est jamais lissé — le lissage exige un tier payant device).
- Le téléphone peut déclencher une synchronisation contrôlée (`refreshSubscription` → lecture serveur) ; il ne peut jamais surclasser la décision.

## 7. Quotas et atomicité

Un seul point de consommation : `enforce_premium_feature` (bump atomique `INSERT … ON CONFLICT`, verrou `FOR UPDATE`, quota vérifié APRÈS bump avec décrément de compensation, fenêtre de rejeu 15 min ⇒ retry/remont idempotent). La concurrence deux-appels-dernier-quota est sérialisée par le verrou de ligne (déjà prouvé par `free_preview_quota.test.sql` / la fenêtre de rejeu).

## 8. Validateurs (canaris prouvés, restaurés)

- `validate:premium-gating` étendu : couverture **exhaustive** exigée (chaque clé `FEATURE_TIERS` mappée), quotas attribués par UPDATE littéral, reason codes alignés. Canaris : clé démappée (exit 1), quota retiré de la migration (exit 1).
- **Nouveau `validate:premium-data-sources`** (D1–D6) : couverture bilatérale carte/catalogue, helpers legacy absents, frontière PremiumContext écrite, gate sans branche legacy + fail-closed, lectures réseau des écrans premium limitées à `profiles` (toute nouvelle table ⇒ classifier), classification A/B/C exécutable. Canaris : helper ressuscité, branche legacy réintroduite, lecture directe `subscriptions` dans un écran, clé mappée non classée — tous exit 1, restauration vérifiée.
- Câblés `package.json` + étape CI « Validate premium data sources (JUNO-06) ».

## 9. Vérifications exécutées

- shared **1542 passés** (60 skip) — 2 suites `orphan-purge*` échouent sur ce poste pour un défaut environnemental Windows préexistant (import dynamique chemin antislash), **prouvé identique sur master propre** ;
- web **78/78** ; mobile **36/36** (dont le nouveau `premium-server-gate.test.ts` 10/10, inversion du before-proof) ;
- typecheck mobile 0 erreur ; eslint workspace 0 erreur (21 warnings préexistants) ;
- validateurs : premium-gating **11/11**, premium-data-sources D1–D6, rls-contract — tous verts ; `git diff --check` propre ;
- audit grants : `enforce/can_use/increment` → `authenticated` uniquement ; `synastry_preview_gate`/`claim` REVOKE PUBLIC+anon → `authenticated` ; aucun grant client sur `subscriptions`.

## 10. Ordre de déploiement (quand autorisé)

1. Appliquer `20260922000001` (Supabase, processus revu — jamais `db push`, cf. JUNO-15) ; l'auto-vérification refuse un catalogue inattendu.
2. Déployer les edge functions si touchées (aucune ne l'est ici) ; le web n'est pas impacté (il enforce déjà ses clés).
3. Publier l'app mobile (versionCode 131, hors périmatoire présent) — **les clients 130 installés restent corrects** : ils appellent `enforce` sur natal-chart/conversation-guide (inchangé) et le chemin legacy disparaît seulement du nouveau binaire ; les lignes de politique nouvelles ne cassent rien pour eux.
4. Preuves production attendues : fumée des 9 clés (free 1er aperçu OK / 2e refusé, abonné OK), reason codes localisés à l'écran, ligne JUNO-06 de l'audit mise à jour.

## 11. Rollback

- **Sans redéploiement app** : remettre les previews à NULL et retirer les lignes ne suffit pas à restaurer l'ancien chemin (le binaire nouveau n'en a plus) — le rollback app est un revert + build. Pour un rollback OPÉRATIONNEL du catalogue : `UPDATE premium_feature_policy SET free_preview_quota = NULL WHERE feature_key IN (…)` réduit à « abonné uniquement » sans casser personne.
- Rollback code : `git revert` des commits JUNO-06 (le chemin legacy revient avec eux).

## 12. Limites restantes (honnêtes)

- **Catégorie B** : le calcul reste local ; un attaquant déterminé peut recalculer les libellés hors app. L'autorisation serveur protège l'accès produit (et la facturation), pas les octets — c'est la limite documentée depuis l'audit d'avril, assumée.
- **Catégorie C** : transits/retrogrades sont des constantes publiques ; la porte protège l'accès, pas le savoir.
- **corpus tarot embarqué** : lisible dans le bundle ; même classe B.
- Les clients 130 installés restent sur le chemin legacy jusqu'à la 131 (d'où la conservation de l'alias `'tarot'`).

## 13. Commits locaux (aucun push)

1. `7cf5af5` test(premium): reproduce client-side authorization bypasses
2. (ce runbook) feat/test/docs regroupés en commits atomiques 2–4 conformément au plan.
