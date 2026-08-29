# Conversation Guide — comment le mesurer sans analytics

**Statut :** en vigueur pour le P0 livré (28 août 2026).
**Résumé en une phrase :** l'app n'a **aucune** librairie d'analytics et
**aucun OTA** ; la table `premium_usage` est donc la seule télémétrie de cette
feature, et elle suffit à répondre aux quatre questions qui décident de la
suite.

---

## 1. Pourquoi il n'y a pas d'événements clients

Vérifié dans le repo, pas supposé :

- **Aucun SDK d'analytics.** Ni PostHog, ni Amplitude, ni Mixpanel, ni Segment,
  ni Firebase dans [apps/mobile/package.json](../apps/mobile/package.json).
  Sentry uniquement, et son identifiant utilisateur est **haché**
  (`app/_layout.tsx`) — les données Sentry ne peuvent donc pas être rattachées
  à un compte Supabase.
- **Aucune table d'événements.** `product_events` et
  `apps/mobile/services/analytics.ts` sont planifiés (P1-9 de
  [retention-day2-audit-2026-08.md](./retention-day2-audit-2026-08.md) §8.4)
  mais n'existent pas — zéro occurrence dans le repo.
- **Aucun OTA.** `expo-updates` est absent. Chaque événement client coûte un
  build complet **plus** une revue Play.

Ajouter un socle d'événements dans le même patch aurait donc signifié
construire une table, un service de batch, une politique RLS et une revue de
confidentialité **avant** de savoir si la feature intéresse qui que ce soit.
Le P0 s'en passe volontairement.

## 2. Ce qui est déjà mesurable, dès le premier jour

La feature est enregistrée dans `premium_feature_policy` sous
`conversation_guide` (migration `20260828000001_conversation_guide_policy.sql`)
et routée par `SERVER_ENFORCED_FEATURES`. Chaque déverrouillage d'une situation
verrouillée écrit donc une ligne dans `premium_usage` :

| Colonne | Contenu |
|---|---|
| `user_id` | le compte |
| `feature_key` | `'conversation_guide'` |
| `usage_date` | la date serveur |
| `view_count` | déverrouillages ce jour-là |
| `last_granted_at` | horodatage du dernier accord |

> **Ce que ces lignes ne mesurent pas, et c'est voulu.** La situation gratuite
> (« Start a conversation », 12 signes, illimitée) n'écrit **rien** : elle
> n'appelle jamais le serveur. Un compte gratuit peut lire la feature tous les
> jours sans laisser de trace. Les chiffres ci-dessous mesurent donc
> l'**intérêt pour le contenu verrouillé** — c'est-à-dire exactement le signal
> qui décide s'il faut construire le P1.

> **Sous-comptage connu, assumé.** Un abonné qui arrive par deep link
> directement sur une situation verrouillée lit la fiche **sans** écrire de
> ligne : l'écran affiche immédiatement le contenu (son droit d'accès est déjà
> connu) et l'appel RPC ne part qu'au tap d'une situation. Corriger ce
> sous-comptage exigerait un appel au montage — précisément la chose que cet
> écran ne doit jamais faire, et que `validate:coach-content` refuse. Le
> chemin dominant (ouvrir, puis toucher une situation) est bien enregistré ;
> la comparaison de §3.4 penche donc légèrement **en défaveur** du Guide, ce
> qui est le bon sens d'erreur.

## 3. Les quatre requêtes

Toutes exécutables dans le SQL Editor Supabase, sans build, sans déploiement.

### 3.1 Ouvertures verrouillées par jour

```sql
SELECT usage_date,
       COUNT(DISTINCT user_id) AS users,
       SUM(view_count)         AS unlocks
  FROM premium_usage
 WHERE feature_key = 'conversation_guide'
 GROUP BY 1
 ORDER BY 1 DESC;
```

### 3.2 Retour le lendemain sur la feature

Le proxy de `conversation_guide_returned_next_day`. **Dérivé en SQL, jamais
émis par le client** — le téléphone ne sait pas ce qu'il a fait hier.

```sql
WITH d AS (
  SELECT DISTINCT user_id, usage_date
    FROM premium_usage
   WHERE feature_key = 'conversation_guide'
)
SELECT a.usage_date,
       COUNT(DISTINCT a.user_id) AS day0,
       COUNT(DISTINCT b.user_id) AS returned_d1,
       ROUND(100.0 * COUNT(DISTINCT b.user_id)
             / NULLIF(COUNT(DISTINCT a.user_id), 0), 1) AS pct
  FROM d a
  LEFT JOIN d b
    ON b.user_id = a.user_id
   AND b.usage_date = a.usage_date + 1
 GROUP BY 1
 ORDER BY 1 DESC;
```

### 3.3 Conversion aperçu → abonnement à 7 jours

```sql
WITH preview AS (
  SELECT user_id, MIN(usage_date) AS first_preview
    FROM premium_usage
   WHERE feature_key = 'conversation_guide'
   GROUP BY user_id
)
SELECT COUNT(*)                                       AS previewed,
       COUNT(*) FILTER (WHERE s.user_id IS NOT NULL)  AS converted_7d,
       ROUND(100.0 * COUNT(*) FILTER (WHERE s.user_id IS NOT NULL)
             / NULLIF(COUNT(*), 0), 1)                AS pct
  FROM preview p
  LEFT JOIN LATERAL (
    SELECT se.user_id
      FROM subscription_events se
     WHERE se.user_id = p.user_id
       AND se.created_at >= p.first_preview
       AND se.created_at <  p.first_preview + INTERVAL '7 days'
       AND se.tier IN ('premium', 'premium_plus')
     LIMIT 1
  ) s ON TRUE;
```

### 3.4 Le verdict : le Guide bat-il le thème natal ?

`natal_chart` est le seul autre échantillon gratuit (même quota : 1/jour).
C'est donc une comparaison honnête, à conditions égales.

```sql
SELECT feature_key,
       COUNT(DISTINCT user_id)                        AS users,
       SUM(view_count)                                AS unlocks,
       ROUND(SUM(view_count)::numeric
             / NULLIF(COUNT(DISTINCT user_id), 0), 2) AS unlocks_per_user
  FROM premium_usage
 WHERE feature_key IN ('conversation_guide', 'natal_chart')
   AND usage_date >= CURRENT_DATE - 30
 GROUP BY 1;
```

**Si `unlocks_per_user` est plus élevé pour `conversation_guide`**, la thèse
produit est validée par les données : la feature se consomme plusieurs fois,
contrairement au thème natal qui se lit une fois.

## 4. Les six événements demandés, et leur statut

| Événement demandé | Statut P0 | Proxy disponible | Ce qu'il faudrait pour l'avoir vraiment |
|---|---|---|---|
| `conversation_guide_opened` | ❌ non mesuré | aucun — la situation gratuite n'écrit rien | `product_events` + un `analytics.ts` ; propriété clé : `source` (`chat` / `profile` / `hub` / `deeplink`) |
| `conversation_guide_sign_selected` | ❌ non mesuré | aucun | idem ; propriétés `sign`, `preselected` |
| `conversation_guide_situation_selected` | ⚠️ partiel | §3.1 compte les **déverrouillages**, pas la situation choisie | idem ; propriété `situation` — c'est ce qui dira quelles 4 situations écrire en P1 |
| `conversation_guide_result_viewed` | ❌ non mesuré | aucun | idem ; propriété `level` |
| `conversation_guide_preview_used` | ✅ **mesuré** | §3.1 : chaque ligne `premium_usage` **est** un aperçu consommé | rien à faire |
| `conversation_guide_premium_gate_seen` | ⚠️ partiel | l'absence de nouvelle ligne un jour où l'utilisateur était actif implique un refus, mais ce n'est pas direct | idem ; propriété `reason` (le code `PremiumGateReason` brut, pas un booléen) |

`conversation_guide_message_copied` — l'événement le plus important de la
feature, le seul qui distingue *lire* de *vouloir envoyer* — **n'est pas
mesurable sans build**. C'est la première chose à instrumenter quand
`product_events` existera.

## 5. Ordre d'implémentation recommandé

1. **Aujourd'hui, sans rien déployer :** exécuter §3.4 pour relever la ligne de
   base `natal_chart` **avant** que le Guide ne soit en production. Sans ce
   relevé, la comparaison n'aura pas de témoin.
2. **Deux semaines après la mise en production :** §3.1 → §3.2 → §3.3.
3. **Build suivant, seulement si §3.2 est encourageant :** le socle
   `product_events` (P1-9) plus **trois** événements — `..._opened` (avec
   `source`), `..._situation_selected` (avec `situation`) et
   `..._message_copied`. Trois événements qui répondent chacun à une question
   ouverte : par quelle porte entre-t-on, quelles situations écrire ensuite,
   et le contenu est-il réellement utilisable.

## 6. Seuils de décision

| Signal | Seuil | Décision si atteint | Décision sinon |
|---|---|---|---|
| Utilisateurs distincts touchant l'aperçu (§3.1) | ≥ 25 % des actifs | poursuivre | revoir la découvrabilité (les entrées Profile / chat) |
| Retour J+1 sur la feature (§3.2) | ≥ 20 % | construire le P2 (rappel push / email) | le contenu n'ancre pas — réécrire, ne pas ajouter |
| Conversion à 7 j (§3.3) | > `natal_chart` | construire le P1 (couche premium) | garder le P0 tel quel |
| `unlocks_per_user` (§3.4) | > `natal_chart` | thèse validée | thèse invalidée, arrêter d'investir |

Si les quatre sont sous les seuils, la réponse n'est **ni** P1 **ni** P2 : c'est
réécrire les 48 phrases de `packages/shared/src/coach/content.ts`. Sur cette
feature, le produit *est* la copy.

## 7. Levier opérationnel : élargir l'aperçu sans build

```sql
-- Campagne : 3 aperçus par jour au lieu d'un.
UPDATE public.premium_feature_policy
   SET free_preview_quota = 3, updated_at = NOW()
 WHERE feature_key = 'conversation_guide';

-- Fin de campagne.
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'conversation_guide';
```

C'est réversible en une seconde et **ne demande aucune soumission Play**, ce
qui compte : sans OTA, c'est le seul levier de croissance à effet immédiat dont
dispose cette feature.

**Aucune copy à changer.** `conversationGuideLockedBody` est volontairement
neutre quant au nombre — « Free accounts get a daily free preview », et son
équivalent dans les 8 locales. La formulation reste vraie à 1 et
sous-promet à 3, ce qui est le sens sûr. Sans OTA, une copy qui aurait
codé « one preview a day » en dur serait devenue fausse à la seconde où
quelqu'un aurait utilisé le levier ci-dessus, et le mensonge aurait attendu
la revue Play suivante pour être corrigé.

---

**Voir aussi :** [conversation-coach-feature-plan-2026-08.md](./conversation-coach-feature-plan-2026-08.md)
(plan complet), [premium-free-preview.md](./premium-free-preview.md) (comment
fonctionne l'aperçu serveur), [retention-day2-audit-2026-08.md](./retention-day2-audit-2026-08.md)
§8 (le plan analytics général dont cette feature est un cas particulier).
