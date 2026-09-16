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
//   3. (incidents d’application) la PK vérifiée par `attnum || attnum`
//      (42883 : l’opérateur n’existe pas pour smallint), puis aclexplode
//      alourdie d’une liste de définition de colonnes (42601 : redondante
//      pour une fonction avec paramètres OUT). Chacun a annulé proprement
//      la migration en self-verify — et chacun a sa régression ci-dessous.
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
      // aclexplode sur l’ACL réelle, défaut appliqué — la forme exacte
      // (alias nu, CROSS JOIN LATERAL) est vérifiée par le test 42601.
      expect(block).toMatch(/aclexplode\(\s*\r?\n\s*COALESCE\(/);
      expect(block).toMatch(/grantee = 0/);
    }
    // acldefault est la moitié de la preuve : sans proacl explicite, EXECUTE
    // va à PUBLIC PAR DÉFAUT, et c’est ce que le défaut encode.
    expect(migration).toContain("acldefault('f'");
    expect(migration).toContain("acldefault('r'");
  });

  it('JAMAIS de liste de définition de colonnes sur aclexplode (incident n°2, 42601)', () => {
    // aclexplode déclare ses paramètres OUT : `AS a(grantor OID, …)` est
    // REDONDANT et PostgreSQL le refuse (« a column definition list is
    // redundant for a function with OUT parameters »). Deuxième application
    // annulée proprement en self-verify pour ça. Alias nu uniquement.
    expect(migration).not.toMatch(/aclexplode[\s\S]{0,220}?AS\s+\w+\s*\(/i);
    expect(migration).not.toMatch(/AS\s+\w+\s*\(\s*grantor/i);
    for (const name of ['_acl_public_fn_privilege', '_acl_public_tbl_privilege']) {
      const block = helperBlock(name);
      expect(block).toContain('CROSS JOIN LATERAL pg_catalog.aclexplode(');
      expect(block).toContain(') AS a');
      // Les colonnes référencées viennent des OUT : elles doivent l’être
      // sans aucune redéclaration.
      expect(block).toMatch(/a\.grantee = 0/);
      expect(block).toMatch(/a\.privilege_type/);
    }
  });
});

describe('privilèges table — service_role en lecture STRICTEMENT seule', () => {
  const src = readRepoFile(MIGRATION_1);

  it('REVOKE ALL cite service_role : un GRANT ne retire rien (incident n°3)', () => {
    // Supabase accorde ALL à service_role sur toute NOUVELLE table via ses
    // default privileges (précédent 20260911000001). Le dry-run du 16 sept
    // l'a prouvé : la self-verify a refusé « service_role détient DELETE ».
    // Le REVOKE doit donc TOUJOURS nommer service_role, et le GRANT SELECT
    // vit SEUL, séparé — jamais l'un pour l'autre.
    const revokeAt = src.indexOf('REVOKE ALL ON TABLE public.synastry_free_grant');
    expect(revokeAt).toBeGreaterThan(0);
    const revokeStmt = src.slice(revokeAt, src.indexOf(';', revokeAt));
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(revokeStmt).toContain(role);
    }
    const grantAt = src.indexOf('GRANT SELECT ON TABLE public.synastry_free_grant');
    expect(grantAt).toBeGreaterThan(revokeAt); // après le REVOKE
    const grantStmt = src.slice(grantAt, src.indexOf(';', grantAt));
    expect(grantStmt).toContain('TO service_role');
    expect(grantStmt).not.toContain('REVOKE');
  });

  it('la self-verify refuse CHAQUE privilège de mutation pour service_role', () => {
    // Refuser seulement DELETE (forme d’avant l’incident) ne suffit pas :
    // la base accorde ALL par défaut. Les six privilèges de mutation sont
    // refusés individuellement, chacun capable d’échouer seul.
    const verifyAt = src.indexOf('Auto-vérification');
    const verifyBlock = src.slice(verifyAt);
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      expect(verifyBlock, `privilège ${priv} non couvert par le refus service_role`).toContain(`'${priv}'`);
    }
    expect(verifyBlock).toMatch(/has_table_privilege\('service_role', 'public\.synastry_free_grant', v_event\) IS TRUE/);
    // Le positif reste : SELECT accordé, refusé s'il manque.
    expect(verifyBlock).toMatch(/NOT has_table_privilege\('service_role', 'public\.synastry_free_grant', 'SELECT'\)/);
  });
});

describe('fixtures du test SQL — le trigger crée les profils (incident n°6)', () => {
  const src = readRepoFile(TEST_SQL);
  // EN PRODUCTION, trigger_create_profile_on_auth_signup (AFTER INSERT ON
  // auth.users) crée le profil de chaque compte : l'INSERT explicite dans
  // profiles provoquait « duplicate key profiles_pkey ». Le test doit suivre
  // l'architecture réelle : neuf comptes Auth → trigger → UPDATE des profils.

  const NINE_UUIDS = [
    'aaaaaaa1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000002',
    'aaaaaaa1-0000-4000-8000-000000000003', 'aaaaaaa1-0000-4000-8000-000000000004',
    'aaaaaaa1-0000-4000-8000-000000000005', 'aaaaaaa1-0000-4000-8000-000000000006',
    'aaaaaaa2-0000-4000-8000-00000000000a', 'aaaaaaa2-0000-4000-8000-00000000000b',
    'aaaaaaa2-0000-4000-8000-00000000000c',
  ];

  it('les NEUF UUID sont dans l’INSERT auth.users (lecteurs ET cibles)', () => {
    const insertAt = src.indexOf('INSERT INTO auth.users');
    expect(insertAt).toBeGreaterThan(0);
    const insertBlock = src.slice(insertAt, src.indexOf(';', insertAt));
    for (const uuid of NINE_UUIDS) {
      expect(insertBlock, `${uuid} absent de l'INSERT auth.users`).toContain(uuid);
    }
  });

  it('AUCUN INSERT INTO public.profiles dans les fixtures', () => {
    const fixturesEnd = src.indexOf('LES DIX SCÉNARIOS');
    const fixtures = src.slice(0, fixturesEnd > 0 ? fixturesEnd : src.length);
    expect(fixtures).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i);
  });

  it('les profils du trigger sont MIS À JOUR via UPDATE … FROM (VALUES)', () => {
    const fixturesEnd = src.indexOf('LES DIX SCÉNARIOS');
    const fixtures = src.slice(0, fixturesEnd > 0 ? fixturesEnd : src.length);
    expect(fixtures).toMatch(/UPDATE public\.profiles p\s+SET/i);
    expect(fixtures).toMatch(/FROM \(VALUES/i);
    // Champs exigés par profile_chart_visible, fixés explicitement.
    expect(fixtures).toMatch(/SET email = v\.email/);
    expect(fixtures).toMatch(/name\s+= v\.name/);
    expect(fixtures).toMatch(/birth_date = v\.birth_date/);
    expect(fixtures).toMatch(/gender = v\.gender/);
    expect(fixtures).toMatch(/is_active = v\.is_active/);
    expect(fixtures).toMatch(/onboarding_completed = TRUE/);
  });

  it('exactement NEUF profils préparés — GET DIAGNOSTICS refuse tout autre compte', () => {
    expect(src).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(src).toMatch(/v_updated <> 9/);
  });

  it('précontrôle de collision AVANT toute mutation, cinq tables, sans ON CONFLICT', () => {
    const preCheckAt = src.indexOf('collision préexistante');
    const insertAt = src.indexOf('INSERT INTO auth.users');
    expect(preCheckAt).toBeGreaterThan(0);
    expect(preCheckAt).toBeLessThan(insertAt);
    const preCheck = src.slice(0, insertAt);
    for (const table of ['auth.users', 'public.profiles', 'public.subscriptions',
                         'public.synastry_free_grant', 'public.product_events']) {
      expect(preCheck, `${table} absent du précontrôle`).toContain(table);
    }
    // Jamais de ON CONFLICT pour masquer une collision antérieure — sur le
    // CODE seul : le commentaire d'incident ci-dessus nomme légitimement
    // « ON CONFLICT » en prose (même piège que l'incident n°1).
    const codeOnly = src.replace(/^[ \t]*--.*$/gm, '');
    expect(codeOnly).not.toMatch(/ON CONFLICT/i);
  });

  it('le ROLLBACK final est bien là — rien ne survit au test', () => {
    const lastRollback = src.lastIndexOf('ROLLBACK;');
    expect(lastRollback).toBeGreaterThan(src.indexOf('LES DIX SCÉNARIOS'));
  });
});

describe('index télémétrique — preuve STRUCTURELLE, jamais textuelle (incident n°4)', () => {
  const src = readRepoFile(MIGRATION_1);
  // Le dry-run n°4 a échoué sur une comparaison textuelle de pg_get_indexdef :
  // PostgreSQL normalise « AT TIME ZONE 'utc' » en « timezone('utc'::text, …) »
  // selon sa version/son rendu. La preuve doit porter sur les TROIS clés et le
  // prédicat via les catalogues — jamais sur le formatage choisi.

  it('aucune comparaison textuelle de la définition entière de l’index', () => {
    // Les deux formes fragiles d’avant l’incident, interdites au retour.
    expect(src).not.toMatch(/NOT LIKE '%\(user_id, event_name, \(\(created_at/s);
    expect(src).not.toMatch(/NOT LIKE 'CREATE UNIQUE INDEX ux_product_events_preview_daily/s);
    expect(src).not.toContain("AT TIME ZONE ''utc''::text)::date))%");
  });

  it('la preuve passe par le catalogue : unique, exactement 3 clés', () => {
    expect(src).toMatch(/indisunique IS DISTINCT FROM TRUE/);
    expect(src).toMatch(/indnkeyatts <> 3/);
    // Et l’appartenance à product_events est dans le WHERE du catalogue,
    // pas dans un préfixe de définition textuelle.
    expect(src).toMatch(/i\.indrelid = 'public\.product_events'::regclass/);
  });

  it('les positions 1, 2 et 3 sont vérifiées SÉPARÉMENT — indkey est 0-based', () => {
    // INCIDENT PRÉVENU AVANT APPLICATION n°5 : pg_index.indkey est un
    // int2vector INDEXÉ À PARTIR DE 0. La forme 1-based ([1]/[2]/[3]) lit
    // event_name en clé 1, résout attnum 0 en clé 2 (NULL) et sort des
    // bornes en clé 3 (NULL) — faux négatif certain. Les bons indices :
    // [0] = user_id, [1] = event_name, [2] = 0 (expression).
    expect(src).toMatch(/i\.indkey\[0\]/);
    expect(src).toMatch(/i\.indkey\[1\]/);
    expect(src).toMatch(/i\.indkey\[2\]/);
    // Le mauvais indice est INTERDIT : aucun indkey[3] ne doit exister.
    expect(src).not.toMatch(/i\.indkey\[3\]/);
    // Chaque rôle, nommé selon sa base réelle.
    expect(src).toMatch(/first_key_column IS DISTINCT FROM 'user_id'/);
    expect(src).toMatch(/second_key_column IS DISTINCT FROM 'event_name'/);
    // La résolution des colonnes utilise les mêmes indices 0-based.
    expect(src).toMatch(/a\.attnum = i\.indkey\[0\]/);
    expect(src).toMatch(/a\.attnum = i\.indkey\[1\]/);
  });

  it('la clé 3 est vérifiée EXPRESSIONNELLE (indkey[2] = 0), puis sémantique', () => {
    expect(src).toMatch(/third_key_attnum IS DISTINCT FROM 0/);
    // pg_get_indexdef(regclass, 3, true) : 1-BASED, une AUTRE convention que
    // indkey — son « 3 » désigne bien la TROISIÈME clé et reste correct.
    expect(src).toContain("pg_get_indexdef('public.ux_product_events_preview_daily'::regclass, 3, true)");
    // Trois marqueurs sémantiques, insensibles à la forme rendue.
    expect(src).toMatch(/v_norm NOT LIKE '%created_at%'/);
    expect(src).toMatch(/v_norm NOT LIKE '%utc%'/);
    expect(src).toMatch(/v_norm NOT LIKE '%date%'/);
  });

  it('le prédicat est prouvé par pg_get_expr, avec ses cinq événements exactement', () => {
    expect(src).toMatch(/pg_get_expr\(i\.indpred, i\.indrelid\)/);
    expect(src).toMatch(/pred_expr NOT LIKE '%' \|\| v_event \|\| '%'/);
    // Compte exact des constantes : un sixième événement ajouté
    // silencieusement change le compte et fait échouer.
    expect(src).toMatch(/replace\(v_ix\.pred_expr, '''::text', ''\)/);
    expect(src).toMatch(/length\('''::text'\) <> 5/);
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
