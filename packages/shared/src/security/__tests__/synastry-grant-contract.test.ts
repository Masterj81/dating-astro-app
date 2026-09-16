// Contrat SQL de la synastrie offerte — tests STATIQUES exécutables.
//
// POURQUOI CE FICHIER EXISTE (revue 4, 16 sept 2026)
// -----------------------------------------------
// Les migrations et tests SQL de la mission ne tournent pas sous vitest :
// rien ne les garde tant qu'ils n'ont pas été appliqués à une base. Or la
// revue aattrapé DEUX défauts qui rendaient un contrôle de sécurité « vert
// parce qu'il n'avait rien vérifié » :
//
//   1. `_acl_public_tbl_privilege(p_oid, p_privilege DEFAULT NULL)` déclarée
//      STRICT : tout appel mono-argument retournait NULL SANS exécuter la
//      requête, et `IF NULL` ne lève pas en PL/pgSQL — faux vert intégral.
//   2. les appels en condition booléenne nue (`IF helper(...)`), où un NULL
//      éventuel passe pour un faux.
//
// Ces tests relisent les sources du dépôt et refusent le retour de l'un ou
// l'autre : pas de STRICT sur les helpers ACL, aucune condition booléenne
// nue aux sites d'appel, comparaisons IS NOT FALSE / IS FALSE / IS TRUE
// exigées, prédicat de rétention jour+6, et le harnais de course sans argv
// ni sortie prématurée. Ce n'est PAS l'exécution SQL — c'est le garde-fou
// qui tient jusqu'à ce qu'une base exécute le reste.

import { describe, expect, it } from 'vitest';

import { readRepoFile } from '../../testing/edge-source';

const MIGRATION_1 = 'supabase/migrations/20260915000001_synastry_free_grant.sql';
const MIGRATION_2 = 'supabase/migrations/20260915000002_synastry_picker_free_preview.sql';
const TEST_SQL = 'supabase/tests/synastry_free_grant.test.sql';
const RACE_MJS = 'supabase/tests/synastry-free-grant.race.mjs';

describe('ACL helpers — jamais STRICT, jamais de condition nullable', () => {
  const migration = readRepoFile(MIGRATION_1);

  const helperBlock = (name: string) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start).toBeGreaterThan(0);
    const end = migration.indexOf('$$;', start);
    return migration.slice(start, end);
  };

  it('le helper fonction n’est pas STRICT (DEFAULT + STRICT = NULL silencieux)', () => {
    const block = helperBlock('_acl_public_fn_privilege');
    expect(block).not.toContain('STRICT');
    // …et un privilège inconnu lève, il ne répond pas FALSE en silence.
    expect(block).toContain('privilège de fonction inconnu');
  });

  it('le helper table n’est pas STRICT : l’appel mono-argument exécute la requête', () => {
    const block = helperBlock('_acl_public_tbl_privilege');
    expect(block).not.toContain('STRICT');
    expect(block).toContain('privilège de table inconnu');
    // NULL = n’importe quel privilège : la sémantique « global » vit dans le corps.
    expect(block).toContain('p_privilege IS NULL OR a.privilege_type = p_privilege');
  });

  it('les deux helpers retournent BOOLEAN en lisant l’ACL réelle, défaut inclus', () => {
    for (const name of ['_acl_public_fn_privilege', '_acl_public_tbl_privilege']) {
      const block = helperBlock(name);
      expect(block).toContain('aclexplode(COALESCE(');
      expect(block).toMatch(/grantee = 0/);
    }
    // acldefault est la moitié de la preuve : sans proacl explicite, EXECUTE
    // va à PUBLIC PAR DÉFAUT, et c’est ce que le défaut encode.
    expect(migration).toContain("acldefault('f'");
    expect(migration).toContain("acldefault('r'");
  });
});

describe('sites d’appel — comparaisons explicites, jamais une condition nue', () => {
  for (const file of [MIGRATION_1, MIGRATION_2]) {
    const src = readRepoFile(file);
    it(`${file} : aucun appel ACL en condition booléenne nue`, () => {
      // `IF helper(...) THEN` sans IS NOT FALSE : un NULL y passerait pour
      // un faux — exactement le faux vert de la revue 4.
      const bare = src.match(/IF public\._acl_public_(fn|tbl)_privilege\([^\n]*\)\s*THEN/g) ?? [];
      expect(bare, `appels nus : ${bare.join(' | ')}`).toEqual([]);
      const guarded = src.match(
        /IF public\._acl_public_(fn|tbl)_privilege\([^\n]*\)\s+IS NOT FALSE THEN/g,
      ) ?? [];
      expect(guarded.length).toBeGreaterThan(0);
    });
  }

  it('le test SQL prouve baseline IS FALSE et injection IS TRUE, pas des IF nus', () => {
    const src = readRepoFile(TEST_SQL);
    expect(src).toMatch(/IS FALSE THEN/);
    expect(src).toMatch(/IS TRUE THEN/);
    expect(src).toMatch(/IS NOT FALSE THEN/);
    // Privilège inconnu => EXCEPTION attrapée et exigée (R5) : pas de faux vert.
    expect(src).toContain("'NOT_A_PRIVILEGE'");
    expect(src).toMatch(/privilège.{0,30}inconnu accepté en silence/);
    // REVOKE => retour strict à FALSE (R4).
    expect(src).toMatch(/REVOKE SELECT ON public\.synastry_free_grant FROM PUBLIC/);
  });
});

describe('vérification PK portable — l’incident 42883 ne doit pas revenir', () => {
  const src = readRepoFile(MIGRATION_1);

  it('aucune concaténation d’attnum (smallint || smallint n’existe pas)', () => {
    // Première application en production : ERROR 42883, annulation propre.
    // Le motif fautif reliait deux pg_attribute.attnum par || — refusé ici
    // sur le texte SANS commentaires : l’incident est documenté dans la
    // migration elle-même, et la prose « attnum … || » y est légitime ;
    // c’est le SQL qui ne doit plus jamais concaténer.
    const codeOnly = src.replace(/^[ \t]*--.*$/gm, '');
    expect(codeOnly).not.toMatch(/attnum[^;]*\|\|[^;]*attnum/);
    // Et aucun || dans le bloc PK une fois la prose retirée.
    const pkAt = src.indexOf('PK exacte');
    const pkEnd = src.indexOf('IF NOT v_pk_ok THEN', pkAt);
    const pkBlock = src.slice(pkAt, pkEnd).replace(/^[ \t]*--.*$/gm, '');
    expect(pkBlock).not.toContain('||');
  });

  it('aucune comparaison directe de indkey à des scalaires concaténés', () => {
    // `i.indkey = ( … || … )` : même idée, autre frappe — indkey est un
    // int2vector, pas un scalaire. Sur le code seul, pour les mêmes raisons.
    const codeOnly = src.replace(/^[ \t]*--.*$/gm, '');
    expect(codeOnly).not.toMatch(/indkey\s*=\s*\(/);
  });

  it('la vérification utilise unnest … WITH ORDINALITY', () => {
    const pkAt = src.indexOf('PK exacte');
    const pkEnd = src.indexOf('IF NOT v_pk_ok THEN', pkAt);
    const pkBlock = src.slice(pkAt, pkEnd);
    expect(pkBlock).toContain('WITH ORDINALITY');
    expect(pkBlock).toContain('pg_catalog.unnest(i.indkey)');
    expect(pkBlock).toContain('ORDER BY key_col.ordinality');
    expect(pkBlock).toContain('array_agg');
  });

  it('les deux colonnes attendues, dans l’ordre, nommées textuellement', () => {
    const pkAt = src.indexOf('PK exacte');
    const pkEnd = src.indexOf('IF NOT v_pk_ok THEN', pkAt);
    const pkBlock = src.slice(pkAt, pkEnd);
    expect(pkBlock).toContain("ARRAY['viewer_user_id', 'usage_date_utc']::name[]");
  });

  it('le refus en cas de PK erronée est toujours là', () => {
    expect(src).toContain(
      "'PK de synastry_free_grant != (viewer_user_id, usage_date_utc)'",
    );
  });
});

describe('rétention — jour courant + six jours précédents, ni plus ni moins', () => {
  it('le prédicat installé est < v_today − 6 jours (J−7 et plus anciens purgés)', () => {
    const src = readRepoFile(MIGRATION_1);
    expect(src).toContain("usage_date_utc < v_today - INTERVAL '6 days'");
    expect(src).not.toContain("usage_date_utc < v_today - INTERVAL '7 days'");
    expect(src).toContain('LIMIT 200');
  });

  it('le test SQL prouve aujourd’hui/J−6 conservés et J−7/J−10 purgés', () => {
    const src = readRepoFile(TEST_SQL);
    expect(src).toMatch(/v_today - 6,\s+tA/);
    expect(src).toMatch(/v_today - 7,\s+tB/);
    expect(src).toMatch(/v_today - 10,\s+tB/);
    expect(src).toMatch(/J−6 supprimé/); // message d’échec si la régression revient
    expect(src).toMatch(/J−7 conservé/);
  });
});

describe('harnais de course — argv interdit, sortie contrôlée, staging only', () => {
  const src = readRepoFile(RACE_MJS);

  it('aucune chaîne de connexion en argument de commande', () => {
    expect(src).not.toContain('process.argv');
    expect(src).toContain('JUNO_STAGING_DATABASE_URL');
    expect(src).toContain('JUNO_STAGING_PROJECT_REF');
    expect(src).toContain("JUNO_ALLOW_STAGING_RACE_TEST") ;
  });

  it('la production est refusée par ref de projet', () => {
    expect(src).toContain("const PRODUCTION_REF = 'qtihezzbuubnyvrjdkjd'");
    expect(src).toMatch(/refCandidates\.has\(PRODUCTION_REF\)/);
    expect(src).toMatch(/Staging uniquement|staging-only/i);
  });

  it('fail() jette au lieu d’exiter ; le nettoyage est garanti par la structure', () => {
    expect(src).toMatch(/const fail = \(msg\) => \{\s*throw new Error\(msg\);/);
    // Aucun exit(1) direct : la seule sortie d’échec passe par process.exitCode.
    expect(src).not.toMatch(/process\.exit\(1\)/);
    expect(src).toContain('await teardownWorkers();');
    expect(src).toContain('INCIDENT CRITIQUE DE NETTOYAGE');
    expect(src).toMatch(/process\.exitCode = \(failure \|\| incidents\.length > 0\) \? 1 : 0/);
  });

  it('teardown : ROLLBACK, fermeture stdin, attente bornée, kill en dernier recours', () => {
    const at = src.indexOf('async function teardownWorkers()');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf('async function runRace()'));
    expect(block).toContain("c.stdin.write('ROLLBACK;\\n')");
    expect(block).toContain('c.stdin.end()');
    expect(block).toContain('c.kill()');
    expect(block).toMatch(/exitCode !== null/); // idempotence
  });

  it('nettoyage et résidus BORNÉS aux UUID synthétiques, exécutés même après échec', () => {
    expect(src).toMatch(/const CLEANUP_SQL = `BEGIN;/);
    expect(src).toContain("viewer_user_id = '${SYNTH.viewer}'");
    expect(src).toContain("id IN ('${SYNTH_IDS.join(\"','\")}')");
    expect(src).toContain('const RESIDUE_SQL');
    expect(src).toMatch(/residue !== '0'/);
  });
});
