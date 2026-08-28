# Free preview premium — comment ça marche

Statut : en place depuis la migration `20260823000001_free_preview_quota.sql`.
Portée actuelle : `natal_chart` uniquement.

## La promesse produit

Le paywall affiche « 1 free preview per day » (`freePreviewAvailable`). Un
compte gratuit doit pouvoir ouvrir la fonctionnalité une fois par jour, puis
voir le paywall. C'est le principal mécanisme de conversion : l'échantillon
gratuit est ce qui donne envie de s'abonner.

## Le bug corrigé

Deux systèmes de quota se contredisaient :

| | Clé utilisée | Décision |
|---|---|---|
| Client (`PremiumGate` → `consumeTrial`) | `natal-chart` | accorde 1 aperçu/jour et le consomme |
| Serveur (`enforce_premium_feature`) | `natal_chart` | `insufficient_tier` pour tout compte gratuit |

L'utilisateur gratuit **brûlait son aperçu quotidien puis recevait quand même
le paywall**. L'échantillon n'a jamais été rendu sur cet écran. Les deux clés
pointant vers des lignes différentes de `premium_usage`, rien ne signalait la
divergence.

## L'architecture actuelle

Le serveur est la seule autorité. `enforce_premium_feature(feature_key)` tranche
tout en un appel atomique — droit d'accès, aperçu gratuit, quota, comptage :

| `reason` | `allowed` | Signification |
|---|---|---|
| `ok` | ✅ | Accès par abonnement |
| `free_preview` | ✅ | Aperçu gratuit du jour consommé |
| `insufficient_tier` | ❌ | Pas abonné, pas d'aperçu offert sur cette feature |
| `free_preview_exhausted` | ❌ | Aperçu du jour déjà utilisé |
| `quota_exceeded` | ❌ | Abonné, mais au-delà du quota quotidien payant |
| `unauthorized` / `unknown_feature` | ❌ | Non connecté / clé inconnue |

Points structurants :

- **`premium_feature_policy.free_preview_quota`** — nombre d'aperçus quotidiens
  pour un compte *sous* `required_tier`. `NULL`/`0` = aucun aperçu, ce qui est
  la valeur par défaut : toutes les autres fonctionnalités gardent exactement
  leur comportement actuel.
- **Fenêtre de rejeu de 15 minutes** (`premium_usage.last_granted_at`) — un
  remontage d'écran, un rafraîchissement de token ou un aller-retour rapide
  rejoue la décision sans consommer une seconde unité. Une allocation de 1/jour
  serait détruite par un double appel accidentel. Un refus ne rafraîchit jamais
  la fenêtre (sinon il rouvrirait l'accès qu'il vient de refuser).
- **`premium_usage` n'est plus modifiable par son propriétaire.** La policy
  `FOR ALL` a été remplacée par un `SELECT` seul et les droits d'écriture ont
  été révoqués pour `authenticated`/`anon`. Un quota que le compte facturé peut
  réinitialiser n'est pas un quota — sans ça, « le serveur fait autorité » est
  faux. Les écritures passent exclusivement par les RPC `SECURITY DEFINER`.
- **Un seul appel par écran.** `PremiumGate` décide, l'écran fait confiance. Le
  double appel (gate + écran) était la source de la double consommation.

## Étendre l'aperçu à une autre fonctionnalité

Deux gestes, dans cet ordre :

1. SQL — donner un quota d'aperçu à la feature :
   ```sql
   UPDATE public.premium_feature_policy
      SET free_preview_quota = 1, updated_at = NOW()
    WHERE feature_key = 'synastry';
   ```
2. Client — router la feature vers le gate serveur dans
   [`apps/mobile/services/premiumUsage.ts`](../apps/mobile/services/premiumUsage.ts) :
   ```ts
   export const SERVER_ENFORCED_FEATURES: Partial<Record<FeatureKey, string>> = {
     'natal-chart': 'natal_chart',
     'synastry': 'synastry',
   };
   ```

`npm run validate:premium-gating` échoue si l'une des deux moitiés manque —
clé absente de `premium_feature_policy`, quota d'aperçu oublié, ou code `reason`
géré d'un seul côté. C'est ce garde-fou qui aurait attrapé le bug d'origine.

## Tests

- `supabase/tests/free_preview_quota.test.sql` — 10 assertions sur le
  comportement réel de la base (aperçu accordé, rejeu, épuisement, rollback du
  compteur, compte abonné, feature sans aperçu, feature inconnue, appel
  anonyme, cohérence de `can_use_premium_feature`, verrouillage RLS). Tout est
  dans une transaction terminée par `ROLLBACK` : aucune donnée n'est laissée
  derrière.
  ```
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_preview_quota.test.sql
  ```
- `npm run validate:premium-gating` — vérifie le contrat client/serveur, tourne
  en CI.

## Limite connue

Le contenu premium reste calculé côté client à partir de données que
l'utilisateur possède déjà (voir l'inventaire honnête en tête de
`20260419000006_premium_server_gating.sql`). Le gate serveur rend la décision
et la comptabilité fiables ; il ne rend pas le contenu inaccessible à quelqu'un
qui contournerait l'UI. Le vrai remède est de déplacer les calculs derrière une
edge function gatée par tier, ce qui est un chantier distinct.
