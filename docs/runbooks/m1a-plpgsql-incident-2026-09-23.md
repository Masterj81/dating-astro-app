# Incident M1a — `RAISE` concaténé : échec d'exécution Production, rollback confirmé (2026-09-23)

## Statut

```
PRODUCTION INCHANGÉE — ROLLBACK CONFIRMÉ
CORRECTION M1a UNIQUEMENT — AUCUNE ACTIVATION
```

Nouvelle tentative d'application de M1a en Production : **INTERDITE** avant
(a) la fusion du correctif porté par la Draft PR de cette branche, et
(b) une **nouvelle autorisation explicite**. Aucun `migration repair` n'a été
exécuté ; aucune trace de la tentative ne figure dans
`supabase_migrations.schema_migrations`.

## 1. La tentative

- **Quand** : 23 septembre 2026, en soirée (horodatage exact côté journal
  opérateur).
- **Contenu exécuté** : `supabase/migrations/20260922000001_juno06_server_enforced_features.sql`
  au master `1aba76ad` (merge de la PR #71) — blob git
  `9adb32ab7ba8cc55b6bec381c010be3466c99c54`, vérifié identique merge/HEAD/worktree.
- **Commande** (forme exacte, hôte masqué) :
  `psql -W -h <pooler-supabase> -p 5432 -U postgres.<projet> -d postgres -f <migration>`.
- **Sortie utile** :

```text
BEGIN
SET
SELECT 15
SELECT 1
ERROR:  syntax error at or near "||"
```

`psql` tournait avec `ON_ERROR_STOP=1` : le fichier s'est interrompu **avant**
`COMMIT`, et la fermeture de la connexion a rollbacké la transaction.

## 2. Cause racine

Le premier self-check de la migration construisait son message d'exception par
**concaténation** :

```sql
RAISE EXCEPTION
  'première partie' ||
  'seconde partie',
  arg;
```

Cette syntaxe est **invalide en PL/pgSQL** : l'argument message de `RAISE`
est une chaîne de format à placeholders (`%`), pas une expression concaténée.
Le serveur rejette le **fichier entier** au parse du bloc `DO` — d'où
l'erreur dès la première exécution réelle, après `BEGIN`/`SET` et les deux
`SELECT` du pré-check (15 lignes, isolation).

**Forme corrigée** (sans ambiguïté, prescrite par la revue 2026-09-24) :

```sql
RAISE EXCEPTION USING
  MESSAGE = format('…%s…%s…%s', E'\n', v_expected, v_actual);
```

Ni le déclencheur, ni les valeurs comparées, ni le catalogue attendu n'ont
changé.

## 3. Défaut latent n°2, découvert par la nouvelle preuve

Le pipeline PostgreSQL réel (voir §5) a immédiatement attrapé un **second**
défaut jamais exécuté auparavant : la songe « aucun DEFAULT » référençait
`attnum` depuis `information_schema.columns` — cette vue expose
`ordinal_position`, pas `attnum`. L'exécution Production de l'incident était
morte **avant** d'atteindre cette ligne (le parse du premier `DO` échoue
avant tout). Corrigé par jointure directe `pg_attrdef × pg_attribute`
(`a.attname = 'enforcement_class'`), dans la migration **et** dans les
postconditions du pipeline. Le test qui a échoué avant correction : la
première exécution du pipeline (`column "attnum" does not exist`).

## 4. Preuve du rollback (lecture seule, Production)

```text
enforcement_class_exists = false
migration_recorded        = false
```

- catalogue produit **inchangé** (aucune colonne ajoutée) ;
- `supabase_migrations.schema_migrations` : `20260922000001` **absente** ;
- aucune réparation d'historique, aucun M2, aucun T1/T2, aucune Edge
  Function, aucun M1c, aucun build 131.

**Qualification exacte** : échec d'exécution **avant commit** avec rollback
vérifié. Ce n'est PAS une « migration partiellement appliquée ».

## 5. Pourquoi aucun test précédent n'exécutait le PL/pgSQL

- `edge-sources-parse.test.ts` : **parse** esbuild des sources Deno — aucune
  exécution SQL ;
- les suites `loadEdgeModule` : **extraction de déclarations** du code
  Deno, exécution des pures fonctions JS — le SQL de la migration n'est
  jamais concerné ;
- le contrat SQL `C1..C11` : documenté et exécutable **sur une base de
  test**… qui n'existait sur aucun poste ;
- les validateurs (`validate:premium-gating`, etc.) : analyse de **texte**.

Seule la Production exécutait réellement ce PL/pgSQL — et l'a découvert.

## 6. La nouvelle preuve : PostgreSQL réel, jetable, épinglé

- **CI** : `.github/workflows/ci-postgres.yml` — service
  `postgres:17.11@sha256:e31e3d53…` (même **majeure 17** que la Production,
  lecture opérateur 2026-09-24 ; tag précis + digest immuable, jamais
  `latest`), job distinct `M1a PostgreSQL (jetable)`, `permissions:
  contents: read`.
- **Pipeline** (`scripts/m1a-pg/run-m1a-pipeline.sh`) :
  1. affiche le **SHA-256** du fichier réellement exécuté ;
  2. **positif** : bootstrap fidèle → fichier **exact** (aucun sed/copie)
     avec `ON_ERROR_STOP=1`, encodage UTF-8 → exit 0, zéro `ERROR`,
     `COMMIT` atteint → postconditions **PC1..PC16** en session
     indépendante (15 lignes, snapshot Phase 0, synastry=1, classes
     exactes, 2/7/2, legacy, sans DEFAULT, NOT NULL, CHECK
     `convalidated=true`, INSERT sans classe → **23502**, données
     synthétiques inchangées, M2 absente, zéro ligne d'historique) ;
  3. **négatif A** (valeur divergente : synastry preview → NULL) : échec
     **exigé**, message `(pre)`/`Phase 0`, nouvelle connexion → colonne
     absente, divergence intacte, zéro survivant ;
  4. **négatif B** (clé inconnue `ghost_feature`) : idem, base propre ;
  5. **rollback** : bootstrap → M1a → script de rollback exact → catalogue
     revenu **exactement** au snapshot Phase 0.
  L'isolation REPEATABLE READ est **prouvée au runtime par la migration
  elle-même** (son pré-check refuse de courir autrement) — et le canari K5
  montre la CI devenir rouge si elle retombe.
- **Garde structurelle** (`scripts/validate-m1a-pipeline.mjs`, câblé
  `validate:m1a-pipeline` **et** dans le même job CI) : G1..G8 (aucun
  `RAISE||`, service présent, image épinglée, `ON_ERROR_STOP`+UTF-8,
  fichier exact non transformé, négatifs+rollback présents, vérifications
  clés présentes, fixture synthétique **et** fidèle au snapshot).
- **Fixture** (`scripts/m1a-pg/bootstrap-phase0.sql`) : types/PK/CHECK
  réels, les 15 lignes exactes de la Phase 0, tables métier minimales avec
  lignes synthétiques (UUID explicites), **aucun** identifiant/URI/secret
  de Production ; comparé littéralement au snapshot encodé dans la
  migration (G8).
- **Douze canaris** (`scripts/m1a-pg/canaries.sh`) : K1..K9 pipeline (dont
  K1 = le retour exact de la forme d'incident), K10..K12 garde — tous
  temporaires, restaurés, arbre vérifié propre.

## 7. Ce que cette branche ne fait PAS

Aucune nouvelle exécution M1a en Production, aucun `migration repair`,
aucun M2/T1/T2/E1/E2, aucun M1c, aucun `db push`, aucun build EAS/131,
aucune fusion sans nouvelle autorisation.
