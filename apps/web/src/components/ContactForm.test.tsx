/**
 * JUNO-07 (suite) — le formulaire Contact doit envoyer la VALEUR CANONIQUE,
 * pas la traduction affichée.
 *
 * POURQUOI CE FICHIER EXISTE (défaut de production, 17 sept 2026)
 * ----------------------------------------------------------------
 * Fusionné via PR #39, `/fr/contact` répondait HTTP 400 `invalid_request` :
 * le rendu était `<option value={t(key)}>{t(key)}</option>` — l'étiquette
 * LOCALISÉE servait de valeur HTML, donc le navigateur soumettait
 * « Question générale » alors que l'API n'accepte que les valeurs
 * canoniques anglaises. Toutes les locales non anglaises étaient rejetées
 * avant même la validation Turnstile.
 *
 * Le contrat épinglé ici :
 *   - l'étiquette visible est la traduction (« Question générale ») ;
 *   - la valeur HTML et le corps soumis sont la valeur canonique
 *     (« General Question ») ;
 *   - les huit locales rendent une étiquette non vide pour chacune des
 *     sept catégories, avec les MÊMES valeurs canoniques ;
 *   - aucune traduction n'est utilisée comme valeur métier.
 *
 * TRANCHANT : le premier test ÉCHOUE contre l'ancien rendu (la valeur de
 * l'option serait « Question générale ») et réussit après correction.
 *
 * Aucun envoi réel : fetch est mocké, aucune clé Turnstile n'est posée (le
 * widget ne se charge pas), ni Resend, ni Cloudflare, ni Supabase.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock next-intl : dictionnaire réel injecté par locale ───────────────────
// La clé composée «<namespace>.<clé>» est résolue dans le dictionnaire du
// fichier de locale chargé depuis messages/ — on teste donc les VRAIES
// traductions, pas un dictionnaire inventé.
const state = vi.hoisted(() => ({ dict: {} as Record<string, string> }));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => state.dict[`${ns}.${key}`] ?? key,
}));

import { ContactForm } from "@/components/ContactForm";
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_VALUES,
} from "@/lib/contact-categories";

const MESSAGES_DIR = path.resolve(process.cwd(), "messages");
const LOCALE_FILES = [
  "ar.json", "de.json", "en.json", "es.json",
  "fr.json", "ja.json", "pt.json", "zh.json",
] as const;

function loadLocale(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), "utf8"));
}

/** Injecte un fichier de locale complet dans le mock next-intl. */
function useLocale(file: string) {
  const json = loadLocale(file) as Record<string, Record<string, unknown>>;
  state.dict = {};
  for (const ns of ["contact", "common"]) {
    for (const [k, v] of Object.entries(json[ns] ?? {})) {
      state.dict[`${ns}.${k}`] = String(v);
    }
  }
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function getCategorySelect(): HTMLSelectElement {
  return document.querySelector("#category") as HTMLSelectElement;
}

describe("ContactForm · FR — étiquette localisée, valeur canonique", () => {
  it("TRANCHANT: l'option affiche « Question générale » mais sa valeur HTML est « General Question »", () => {
    useLocale("fr.json");
    render(<ContactForm />);

    const select = getCategorySelect();
    // placeholder + 7 catégories
    expect(select.options.length).toBe(CONTACT_CATEGORIES.length + 1);
    // Valeurs : exactement les canoniques, dans l'ordre, sans traduction.
    expect(Array.from(select.options).slice(1).map((o) => o.value)).toEqual([
      ...CONTACT_CATEGORY_VALUES,
    ]);

    const frOption = Array.from(select.options).find(
      (o) => o.textContent === "Question générale",
    );
    expect(frOption, "l'étiquette française doit être rendue").toBeDefined();
    expect(frOption!.value).toBe("General Question");

    // Aucune valeur d'option n'est une traduction française.
    for (const o of Array.from(select.options).slice(1)) {
      expect(o.value).not.toBe(o.textContent);
    }
  });

  it("la soumission envoie category: « General Question » (jamais la traduction)", async () => {
    useLocale("fr.json");
    const { container } = render(<ContactForm />);

    fireEvent.change(document.querySelector("#name")!, {
      target: { value: "Jean Dupont" },
    });
    fireEvent.change(document.querySelector("#email")!, {
      target: { value: "visiteur@example.net" },
    });
    fireEvent.change(getCategorySelect(), {
      target: { value: "General Question" },
    });
    fireEvent.change(document.querySelector("#message")!, {
      target: { value: "Message de test synthétique." },
    });

    // Le bouton est désactivé sans clé Turnstile (fail-closed voulu) : on
    // soumet via l'événement du formulaire pour observer le contrat du corps.
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/contact");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.category).toBe("General Question");
    expect(body.category).not.toBe("Question générale");
    expect(body.name).toBe("Jean Dupont");
    expect(body.email).toBe("visiteur@example.net");
  });
});

describe("ContactForm · les 8 locales — étiquettes non vides, valeurs stables", () => {
  it.each(LOCALE_FILES)("locale %s : 7 étiquettes non vides, 7 valeurs canoniques, aucune traduction comme valeur", (file) => {
    useLocale(file);
    render(<ContactForm />);
    const select = getCategorySelect();
    const options = Array.from(select.options).slice(1);

    expect(options).toHaveLength(CONTACT_CATEGORIES.length);
    for (const { labelKey } of CONTACT_CATEGORIES) {
      const label = state.dict[`contact.${labelKey}`];
      expect(label, `${file}: ${labelKey} doit exister et être non vide`).toBeTruthy();
      expect(label.trim().length, `${file}: ${labelKey} non vide`).toBeGreaterThan(0);
    }
    // Les valeurs restent EXACTEMENT les canoniques, dans l'ordre.
    expect(options.map((o) => o.value)).toEqual([...CONTACT_CATEGORY_VALUES]);

    if (file !== "en.json") {
      // Garde anti-vide : dans une locale non anglaise, au moins une
      // étiquette diffère de sa valeur — sinon le test serait vain.
      const differing = options.filter((o) => o.value !== o.textContent);
      expect(differing.length, `${file} doit localiser ses étiquettes`).toBeGreaterThan(0);
    }
  });
});

describe("ContactForm · structure — la valeur métier ne revient jamais à t()", () => {
  it("le source ne contient plus value={t(...)} pour les catégories", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/ContactForm.tsx"),
      "utf8",
    );
    expect(source).not.toContain("value={t(");
    expect(source).toContain("CONTACT_CATEGORIES.map");
    expect(source).not.toContain("CATEGORY_KEYS");
  });
});
