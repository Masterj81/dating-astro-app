/**
 * JUNO-18 (clôture CodeQL) — contrat du sanitizer : TEXTE BRUT SANS CHEVRONS.
 *
 * POURQUOI ce fichier existe : la règle CodeQL
 * `js/incomplete-multi-character-sanitization` a signalé la sanitisation par
 * replace() multi-caractères (2026-09-19) ET a de nouveau signalé la version
 * « boucle jusqu'à stabilité » (2026-09-21) — à raison structurellement :
 * dépiler des balises est une course perdue d'avance, et une analyse statique
 * ne peut pas prouver qu'un pattern de strip est complet.
 *
 * La politique retenue (2026-09-21) est STRUCTURELLE : les biographies sont
 * du texte brut React Native — les balises n'ont AUCUN sens à préserver, donc
 * sanitizeText supprime chaque caractère '<' et '>' INDIVIDUELLEMENT (parcours
 * caractère par caractère, aucune regex de sanitization multi-caractères), puis
 * normalise les espaces. Il n'existe plus rien à contourner : les charges
 * imbriquées, les demi-balises et les attributs se réduisent toutes à du texte.
 *
 * Ces tests exécutent le VRAI sanitizeText (appelé par profile/edit.tsx via
 * validateBio avant écriture en base). Toutes les sorties attendues ont été
 * MESURÉES sur l'implémentation réelle avant d'être épinglées.
 */
import { describe, expect, it } from "vitest";

import { sanitizeText, validateBio } from "./validation";

/** L'invariant central : aucun chevron ne survit jamais au nettoyage. */
const noAngleBrackets = (out: string) => {
  expect(out).not.toContain("<");
  expect(out).not.toContain(">");
};

describe("sanitizeText · politique texte brut sans chevrons (CodeQL 2026-09-21)", () => {
  it("payload complet : « <script>alert(1)</script> » réduit à du texte inerte", () => {
    const out = sanitizeText("<script>alert(1)</script>");
    expect(out).toBe("scriptalert(1)/script");
    noAngleBrackets(out);
  });

  it("imbrication classique : « <scr<script>ipt> »", () => {
    const out = sanitizeText("<scr<script>ipt>");
    expect(out).toBe("scrscriptipt");
    noAngleBrackets(out);
  });

  it("variante fermée imbriquée : « </scr</script>script> »", () => {
    const out = sanitizeText("</scr</script>script>");
    expect(out).toBe("/scr/scriptscript");
    noAngleBrackets(out);
  });

  it("double chevron ouvrant : « <<script> »", () => {
    const out = sanitizeText("<<script>");
    expect(out).toBe("script");
    noAngleBrackets(out);
  });

  it("balises et attributs mêlés : tout se réduit, le texte visible survit", () => {
    const out = sanitizeText('Salut <b>toi</b> et <a href="x">lien</a>');
    expect(out).toBe('Salut btoi/b et a href="x"lien/a');
    noAngleBrackets(out);
  });

  it("chevrons isolés (comparaisons, émojis texte) : supprimés aussi — aucun cas particulier", () => {
    expect(sanitizeText("5 > 3 et 2 < 4")).toBe("5 3 et 2 4");
    expect(sanitizeText("a<b>c")).toBe("abc");
    expect(sanitizeText("<")).toBe("");
    expect(sanitizeText(">")).toBe("");
    expect(sanitizeText("><")).toBe("");
  });

  it("aucune entrée, si longue et hostile soit-elle, ne produit de chevron", () => {
    const hostile = "<scr<script>".repeat(500) + "<<<>>>" + "</script>".repeat(500);
    noAngleBrackets(sanitizeText(hostile));
  });

  it("idempotent : sanitize(sanitize(x)) === sanitize(x)", () => {
    const once = sanitizeText("a <i>b</i> <scr<script>ipt> c > d");
    expect(sanitizeText(once)).toBe(once);
  });

  it("normalisation conservée : espaces multiples collapsés, trim", () => {
    expect(sanitizeText("  a   b  ")).toBe("a b");
    expect(sanitizeText("aucune balise ici")).toBe("aucune balise ici");
    expect(sanitizeText("<  a  >")).toBe("a");
  });
});

describe("validateBio · le chemin réel du profil", () => {
  it("une bio piégée est stockée sans AUCUN chevron", () => {
    const res = validateBio("Ma bio <scr<script>ipt> sympa");
    expect(res.valid).toBe(true);
    expect(res.sanitized).toBe("Ma bio scrscriptipt sympa");
    noAngleBrackets(res.sanitized);
  });

  it("bio > 500 caractères toujours refusée (sur le texte nettoyé)", () => {
    const res = validateBio("<b>" + "a".repeat(501) + "</b>");
    expect(res.valid).toBe(false);
    expect(res.error).toBe("bioTooLong");
  });

  it("bio exactement 500 caractères acceptée", () => {
    const res = validateBio("a".repeat(500));
    expect(res.valid).toBe(true);
  });
});
