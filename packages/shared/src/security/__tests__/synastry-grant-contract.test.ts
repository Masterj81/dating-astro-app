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

  it('subscriptions : source = stripe — JAMAIS test (incident n°8, CHECK réelle)', () => {
    // subscriptions_source_check (20260312) : source IN (stripe, app_store,
    // play_store). 'test' violait la CHECK — la contrainte de production ne
    // se plie jamais à un test. Code seul : le commentaire d'incident
    // nomme « test » en prose.
    const codeOnly = src.replace(/^[ \t]*--.*$/gm, '');
    expect(codeOnly).not.toMatch(/'test'/);
    expect(codeOnly).toMatch(/'stripe'/);
  });

  it('le CHECK canonique autorise stripe (lu depuis 20260312, pas supposé)', () => {
    const canonical = readRepoFile('supabase/migrations/20260312_unified_subscriptions.sql');
    expect(canonical).toContain("CHECK (source IN ('stripe', 'app_store', 'play_store'))");
    // …et la fixture n'utilise QUE des valeurs de cette liste.
    const fixtureBlock = src.slice(
      src.indexOf('INSERT INTO public.subscriptions'),
      src.indexOf(';', src.indexOf('INSERT INTO public.subscriptions')),
    );
    expect(fixtureBlock).toContain("'stripe'");
    expect(fixtureBlock).not.toMatch(/'(test|demo|synthetic)'/);
  });

  it('audit verrouillé : adultes, gender légal, une ligne par utilisateur', () => {
    // enforce_adult_profile (20260325000001) refuse < 18 ans : toutes les
    // dates de naissance des fixtures doivent être bien antérieures à 2008.
    const fixtures = src.slice(0, src.indexOf('LES DIX SCÉNARIOS'));
    const birthDates = fixtures.match(/'(19\d{2})-\d{2}-\d{2}'::date/g) ?? [];
    expect(birthDates.length).toBeGreaterThanOrEqual(9);
    for (const d of birthDates) {
      const year = Number(d.match(/(19\d{2})/)![1]);
      expect(year).toBeLessThan(2008);
    }
    // gender CHECK (full_schema) : female ∈ valeurs légales, et c'est ce que
    // les fixtures écrivent — jamais autre chose.
    expect(fixtures).not.toMatch(/'prefer-not-to-say'/);
    const genders = fixtures.match(/'(?:male|female|non-binary|other|prefer-not-to-say)'/g) ?? [];
    for (const g of genders) expect(g).toBe("'female'");
    // UNIQUE (user_id) + UNIQUE (user_id, source) : exactement une ligne
    // d'abonnement par utilisateur de fixture.
    const u2 = "aaaaaaa1-0000-4000-8000-000000000002";
    const u3 = "aaaaaaa1-0000-4000-8000-000000000003";
    expect((fixtureBlock2(src, u2).match(new RegExp(u2, 'g')) ?? []).length).toBe(1);
    expect((fixtureBlock2(src, u3).match(new RegExp(u3, 'g')) ?? []).length).toBe(1);
  });
});

function fixtureBlock2(src: string, _uuid: string): string {
  const at = src.indexOf('INSERT INTO public.subscriptions');
  return src.slice(at, src.indexOf(';', at));
}

describe('diagnostic préalable — STRICTEMENT lecture seule', () => {
  const PREFLIGHT = 'supabase/tests/diagnose_synastry_free_grant_test_preflight.sql';
  const src = readRepoFile(PREFLIGHT);

  it('aucune écriture : ni DML, ni DDL, ni GRANT/REVOKE (code sans commentaires)', () => {
    const codeOnly = src.replace(/^[ \t]*--.*$/gm, '');
    for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
                        'GRANT', 'REVOKE', 'TRUNCATE', 'COPY', 'MERGE']) {
      expect(codeOnly, `le diagnostic contient ${verb}`).not.toMatch(new RegExp(`\\b${verb}\\b`));
    }
    // Aucun appel RPC de la mission (rien qui consomme, même innocemment).
    expect(codeOnly).not.toMatch(/\bpublic\.(synastry_preview_gate|claim_synastry_free_grant|get_synastry_candidate_profiles|record_product_event)\s*\(/);
  });

  it('les treize familles de contrôles sont présentes, verdict BLOQUANT sur écart', () => {
    // Un contrôle absent = le diagnostic ne couvre plus ce qu'il prétend.
    for (const marker of [
      'trigger_create_profile_on_auth_signup', 'subscriptions_source_check',
      'subscriptions_tier_check', 'product_events',           // CHECKs (3a-3c, 12)
      'synastry_preview_gate', 'claim_synastry_free_grant',
      'get_synastry_candidate_profiles', 'get_user_tier',
      'tier_at_least', 'profile_chart_visible',                // signatures (4a-4d)
      'information_schema.columns',                            // colonnes (5)
      'required_tier', 'free_preview_quota',                   // politique (6-8)
      'to_regclass(\'public.synastry_free_grant\')', 'idx_synastry_free_grant_purge', // 9
      'aaaaaaa1-0000-4000-8000-000000000001',                  // les neuf UUID (10)
      'rpe_overloads',                                         // surcharge record_product_event (11)
      'schedule_onboarding_emails',                            // trigger welcome (13a)
      'female',                                                // gender CHECK (13b)
    ]) {
      expect(src, `contrôle absent du diagnostic : ${marker}`).toContain(marker);
    }
    expect(src).toContain('BLOQUANT');
    // Jamais de « OK par défaut » : chaque verdict est un CASE explicite.
    expect(src.match(/BLOQUANT/g)?.length ?? 0).toBeGreaterThanOrEqual(15);
    // to_regclass partout où l'objet peut manquer — '::regclass' hard-cast
    // ferait ERREUR au lieu de rapporter BLOQUANT.
    expect(src).not.toMatch(/'public\.synastry_free_grant'::regclass/);
  });
});

describe('harnais de course — fixtures par le trigger, nettoyage POSSÉDÉ (incident n°7)', () => {
  const src = readRepoFile(RACE_MJS);
  // TROIS identités (viewer, cible A, cible B). Le harnais contournait le
  // trigger Auth (INSERT direct dans profiles = collision pkey + profils
  // incomplets → target_ineligible au lieu de la course) et son finally
  // pouvait SUPPRIMER une collision préexistante. Corrigé : précontrôle,
  // trigger, UPDATE des profils, et nettoyage conditionné à ce que CE harnais
  // ait commité ses fixtures.

  const RACE_UUIDS = [
    'd17a5ace-0000-4000-8000-00000000f001',
    'd17a5ace-0000-4000-8000-00000000f00a',
    'd17a5ace-0000-4000-8000-00000000f00b',
  ];

  /** Code fonctionnel : commentaires JS et SQL retirés (les commentaires
   *  d'incident nomment légitimement les motifs interdits au code). */
  const codeOnly = src.replace(/^[ \t]*(\/\/|--).*$/gm, '');

  it('les TROIS identités sont déclarées et insérées via auth.users', () => {
    for (const uuid of RACE_UUIDS) {
      expect(src).toContain(uuid);
    }
    const insertAt = codeOnly.indexOf('INSERT INTO auth.users');
    expect(insertAt).toBeGreaterThan(0);
    const insertBlock = codeOnly.slice(insertAt, codeOnly.indexOf(';', insertAt));
    for (const ref of ['${SYNTH.viewer}', '${SYNTH.targetA}', '${SYNTH.targetB}']) {
      expect(insertBlock).toContain(ref);
    }
  });

  it('AUCUN INSERT direct dans profiles — UPDATE … FROM (VALUES), trois profils', () => {
    expect(codeOnly).not.toMatch(/INSERT\s+INTO\s+public\.profiles/i);
    expect(codeOnly).toMatch(/UPDATE public\.profiles p\s+SET/i);
    expect(codeOnly).toMatch(/FROM \(VALUES/i);
    for (const field of ['email = v.email', 'name  = v.name', 'birth_date = v.birth_date',
                         'gender = v.gender', 'is_active = v.is_active', 'onboarding_completed = TRUE']) {
      expect(src).toContain(field);
    }
    expect(src).toContain('v_updated <> 3');
  });

  it('AUCUN ON CONFLICT dans le code fonctionnel, précontrôle AVANT mutation', () => {
    expect(codeOnly).not.toMatch(/ON CONFLICT/i);
    // MÊME système de coordonnées pour les deux recherches (codeOnly) :
    // comparer un offset « src brut » à un offset « codeOnly » est toujours
    // faux — les commentaires gonflent les premiers.
    const preCheckAt = codeOnly.indexOf('collision préexistante');
    const insertAt = codeOnly.indexOf('INSERT INTO auth.users');
    expect(preCheckAt).toBeGreaterThan(0);
    expect(preCheckAt).toBeLessThan(insertAt);
    // Cinq surfaces, grants inspectés viewer ET target.
    const preCheck = codeOnly.slice(0, insertAt);
    for (const surface of ['auth.users', 'public.profiles', 'public.subscriptions',
                           'public.synastry_free_grant', 'public.product_events']) {
      expect(preCheck).toContain(surface);
    }
    expect(preCheck).toMatch(/viewer_user_id IN/);
    expect(preCheck).toMatch(/target_user_id IN/);
  });

  it('fixturesCommitted : false à l’origine, true APRÈS le COMMIT des fixtures', () => {
    expect(src).toMatch(/let fixturesCommitted = false;/);
    const commitAt = src.indexOf("COMMIT;`, 'fixtures')");
    const flagTrueAt = src.indexOf('fixturesCommitted = true;');
    expect(commitAt).toBeGreaterThan(0);
    expect(flagTrueAt).toBeGreaterThan(commitAt);
    // Une seule passe à true : jamais ailleurs.
    expect((src.match(/fixturesCommitted = true;/g) ?? []).length).toBe(1);
  });

  it('nettoyage CONDITIONNÉ à fixturesCommitted, complet et borné aux trois UUID', () => {
    const guardAt = src.indexOf('if (fixturesCommitted) {');
    expect(guardAt).toBeGreaterThan(0);
    const guardBlock = src.slice(guardAt, src.indexOf('} else if', guardAt));
    expect(guardBlock).toContain('psqlScript(CLEANUP_SQL');
    // Le nettoyage n'est appelé NULLE PART ailleurs.
    expect((src.match(/psqlScript\(CLEANUP_SQL/g) ?? []).length).toBe(1);
    // Grants purgés viewer ET target ; auth.users pour les trois.
    expect(src).toMatch(/DELETE FROM public\.synastry_free_grant[\s\S]{0,120}viewer_user_id IN/);
    expect(src).toMatch(/OR target_user_id IN/);
    expect(src).toMatch(/DELETE FROM auth\.users WHERE id IN/);
    // Résidu : les mêmes cinq surfaces, les mêmes trois UUID.
    const residueAt = src.indexOf('const RESIDUE_SQL');
    const residueBlock = src.slice(residueAt, src.indexOf(';', src.indexOf('(SELECT COUNT(*) FROM public.product_events', residueAt)));
    for (const surface of ['auth.users', 'public.profiles', 'public.subscriptions',
                           'public.synastry_free_grant', 'public.product_events']) {
      expect(residueBlock).toContain(surface);
    }
  });

  it('NÉGATIF : un finally ne supprime JAMAIS les fixtures d’une collision préexistante', () => {
    // La branche collision est explicite, annoncée, et ne contient AUCUN
    // appel de nettoyage — le seul psqlScript(CLEANUP_SQL du fichier vit
    // dans le garde if (fixturesCommitted), atteint uniquement après un
    // COMMIT réussi des fixtures de CETTE exécution.
    const collisionAt = src.indexOf('NETTOYAGE NON EXÉCUTÉ');
    expect(collisionAt).toBeGreaterThan(0);
    const collisionBranch = src.slice(collisionAt, src.indexOf('if (failure)', collisionAt));
    expect(collisionBranch).not.toContain('psqlScript');
    expect(collisionBranch).not.toContain('CLEANUP_SQL');
    expect(collisionBranch).not.toContain('DELETE FROM');
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

describe('préflight 13b — preuve STRUCTURELLE de profiles.gender (incident n°9)', () => {
  const PREFLIGHT = 'supabase/tests/diagnose_synastry_free_grant_test_preflight.sql';
  const src = readRepoFile(PREFLIGHT);

  it('JAMAIS de recherche textuelle de female dans la concaténation des CHECK', () => {
    // La preuve invalide : prof_checks (TOUTES les CHECK de profiles)
    // LIKE '%female%' — verdissait sur profiles_looking_for_values_check
    // sans rien prouver sur gender. Interdite au retour, sous toute forme.
    expect(src).not.toMatch(/prof_checks\)?[^;]{0,80}LIKE '%female%'/s);
    expect(src).not.toMatch(/COALESCE\(def,? ?''?\) FROM prof_checks[^;]*LIKE/i);
    // Le contrôle 13b ne lit plus prof_checks du tout.
    const arm13b = src.slice(src.indexOf('13b.'), src.indexOf('13b.') + 700);
    expect(arm13b).not.toContain('prof_checks');
  });

  it('borné à gender par les CATALOGUES : pg_depend (contrainte→colonne)', () => {
    // La dépendance contrainte→colonne vit dans pg_depend (refobjsubid =
    // attnum) : c'est ELLE qui décide quelles contraintes comptent, jamais
    // une recherche de mot dans une définition.
    const scoped = src.slice(src.indexOf('gender_checks AS'), src.indexOf('gender_enum_labels AS'));
    expect(scoped).toContain("dep.refobjsubid");
    expect(scoped).toContain("ga.attname = 'gender'");
    expect(scoped).toContain('pg_get_expr(c.conbin, c.conrelid)');
    expect(scoped).toContain("classid = 'pg_constraint'::regclass");
    // Type par pg_attribute/pg_type, pas par devinette.
    expect(src).toContain("a.attname = 'gender'");
    expect(src).toMatch(/JOIN pg_type t ON t\.oid = a\.atttypid/);
  });

  it('la matrice de scénarios existe, chaque branche avec SON verdict', () => {
    // (a) female seulement dans looking_for : impossible de verdir — le
    //     bornage pg_depend EST la garantie (looking_for n'est pas gender).
    // (b) contrainte dédiée à gender acceptant female → OK.
    expect(src).toMatch(/gender_checks WHERE expr LIKE '%female%'\) > 0 THEN 'OK'/);
    // (c) contrainte dédiée refusant female (allow-list complète sans lui) → BLOQUANT.
    expect(src).toMatch(/'% IN \(%'\)\s*\r?\n?\s*= gc\.n THEN 'BLOQUANT'/);
    // (d) texte sans restriction : OK SEULEMENT parce que la structure accepte.
    expect(src).toMatch(/WHEN COALESCE\(gc\.n, 0\) = 0 THEN 'OK'/);
    // (e) enum : female doit être un label ; domaine : SES contraintes à lui.
    expect(src).toMatch(/enumlabel = 'female'\) = 1\s*\r?\n?\s*THEN 'OK' ELSE 'BLOQUANT'/);
    expect(src).toContain('gender_domain_checks');
    // Forme illisible ou trigger non prouvé → INDETERMINE, JAMAIS OK.
    expect(src.match(/'INDETERMINE'/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Colonne absente → BLOQUANT, jamais un verdict NULL silencieux
    // (gender_final rend toujours une ligne : h garantit le join).
    expect(src).toMatch(/CASE WHEN g\.full_type IS NULL THEN 'COLONNE ABSENTE'/);
    expect(src).toMatch(/WHEN g\.full_type IS NULL THEN 'BLOQUANT'/);
    expect(src).toMatch(/FROM \(SELECT count\(\*\) AS has_col FROM gender_col\) h/);
  });

  it('le trigger éventuel sur gender est CONSERVATIF : trouvé → INDETERMINE', () => {
    // L'exact inverse du faux positif : une présence non prouvée ne peut
    // JAMAIS rendre vert — la direction du doute est bloquante.
    expect(src).toMatch(/WHEN \(SELECT n FROM gender_triggers\) > 0 THEN 'INDETERMINE'/);
    // Le balayage des triggers est borné à LEUR définition, pas à la table.
    expect(src).toMatch(/pg_get_triggerdef\(oid\) LIKE '%gender%'/);
  });

  it('INDETERMINE est traité comme bloquant par la grille du runbook', () => {
    // Le verdict INDETERMINE n'est pas un vert différé : le runbook fixe la
    // grille d'acceptation — seuls des OK authentiques rouvrent le test.
    const runbook = readRepoFile('docs/runbooks/synastry-free-preview-2026-09.md');
    expect(runbook).toMatch(/incident n°9|13b/i);
    expect(runbook).toContain('INDETERMINE');
  });
});

describe('porte — scalaires, jamais INTO sur champs d’un RECORD (incident n°10)', () => {
  // v_policy RECORD recevait un SELECT INTO CHAMP PAR CHAMP avant toute
  // structure : PostgreSQL refuse (« record … has no field … »). Découvert
  // par le test comportemental — la self-verify de la migration d'origine
  // ne pouvait pas l'attraper, elle n'APPELLE pas la porte. La migration
  // d'origine étant APPLIQUÉE, le correctif est une migration DISTINCTE ;
  // c'est la DERNIÈRE définition (ordre des fichiers) qui doit être saine.

  const files = [
    'supabase/migrations/20260915000001_synastry_free_grant.sql',
    'supabase/migrations/20260916000001_synastry_preview_gate_scalars.sql',
  ];
  const corrective = readRepoFile(files[1]);

  it('une migration corrective DISTINCTE existe, postérieure à l’originale', () => {
    expect(files[1] > files[0]).toBe(true); // ordre lexicographique = ordre d'application
    expect(corrective).toContain('CREATE OR REPLACE FUNCTION public.synastry_preview_gate()');
    // Le CORPS de la fonction corrigée ne référence plus v_policy — le
    // fichier, lui, cite le défaut en tête (documentation d'incident) : le
    // bannissement porte sur le corps, pas sur la prose (leçon n°1/n°6).
    const body = corrective.slice(
      corrective.indexOf('CREATE OR REPLACE FUNCTION public.synastry_preview_gate()'),
      corrective.indexOf('$$;', corrective.indexOf('AS $$')),
    );
    expect(body).not.toContain('v_policy');
    expect(body).toContain('v_required_tier');
    expect(body).toContain('v_free_preview_quota');
    expect(body).toMatch(/INTO\s*\r?\n?\s*v_rows,/);
  });

  it('la définition GAGNANTE (dernière par nom de fichier) est la corrigée', () => {
    // L'originale conservée telle quelle (historique livré), la corrective
    // la remplace : la dernière définition l'emporte à l'application.
    const winners = files.filter((f) =>
      readRepoFile(f).includes('CREATE OR REPLACE FUNCTION public.synastry_preview_gate()'),
    );
    expect(winners.length).toBe(2);
    expect(winners[winners.length - 1]).toBe(files[1]);
  });

  it('AUCUN INTO champ-de-RECORD dans la définition gagnante ni dans le claim', () => {
    // Formes interdites : INTO … v_x.field (record vierge). La clause INTO
    // est examinée LIGNE PAR LIGNE : un accès de champ s'y voit par un point.
    const gateDef = corrective.slice(
      corrective.indexOf('CREATE OR REPLACE FUNCTION public.synastry_preview_gate()'),
      corrective.indexOf('$$;', corrective.indexOf('AS $$')),
    );
    const intoLines = gateDef.split('\n').filter((l) => /\bINTO\b/.test(l) || /^\s*v_(rows|required_tier|free_preview_quota),?\s*$/.test(l));
    expect(intoLines.join('\n')).not.toMatch(/[a-z_]+\.[a-z_]+/);
    // Le claim (jamais touché par l'incident) reste sain lui aussi.
    const claim = readRepoFile(files[0]).slice(
      readRepoFile(files[0]).indexOf('CREATE OR REPLACE FUNCTION public.claim_synastry_free_grant'),
      readRepoFile(files[0]).indexOf('$$;', readRepoFile(files[0]).indexOf('AS $$', readRepoFile(files[0]).indexOf('claim_synastry_free_grant'))),
    );
    expect(claim).not.toMatch(/INTO[^;\n]*\s[a-z_]+\.[a-z_]+/);
  });

  it('la self-verify de la corrective borne la clause INTO avant d’y chercher un point', () => {
    // Leçon des incidents 4 et 9 : un regex non borné verdissait ou
    // refusait à tort. La preuve extraire INTO→FROM AVANT de chercher '.'.
    expect(corrective).toMatch(/v_at := position\('INTO' in v_def\)/);
    expect(corrective).toMatch(/substring\(v_def from v_at for v_from - v_at\)/);
    expect(corrective).toMatch(/IF v_into LIKE '%\.%' THEN/);
    // Et l'ACL reste prouvée par inspection réelle.
    expect(corrective).toMatch(/_acl_public_fn_privilege\('public\.synastry_preview_gate\(\)'::regprocedure\) IS NOT FALSE/);
  });
});
