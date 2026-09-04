"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  formatBirthCitySuggestion,
  hasHomonyms,
  minimumQueryLength,
  normalizeCityQuery,
  type BirthCitySuggestion,
} from "@astro/shared/geo";
import { createRemoteBirthCityProvider } from "@astro/shared/geo/provider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type BirthCityPickerProps = {
  /** The text in the field. Owned by the parent so the form stays one state. */
  value: string;
  onValueChange: (value: string) => void;
  /** The resolved city, or null. Null means "we do not know where this is". */
  selected: BirthCitySuggestion | null;
  onSelect: (suggestion: BirthCitySuggestion | null) => void;
  inputId?: string;
};

const DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 5;

/**
 * Birth city field: Geoapify, behind our own edge function, and nothing else.
 *
 * WHY ONE SOURCE
 * --------------
 * There is no bundled catalog and no on-device geocoder. A second resolution
 * path is a second set of coordinates for the same city, and a reader resolved
 * through one path today and the other tomorrow gets two different ascendants
 * for one birthplace. This repo has already shipped that bug: 69 profiles
 * stored at a fallback city's exact coordinates.
 *
 * The cost is honest and worth stating: when the endpoint is down, no city
 * resolves and onboarding cannot continue. Nothing is invented to paper over
 * it.
 *
 * WHY THE CALL GOES TO US AND NOT TO THE PROVIDER
 * -----------------------------------------------
 * Neither Geoapify nor LocationIQ can meaningfully restrict a key that ships in
 * a client. On a 3,000 credit/day free tier a stolen key is not a leak, it is
 * an off switch for our onboarding. The key stays in the edge function.
 *
 * WHY A TYPED NAME IS NOT A BIRTHPLACE
 * ------------------------------------
 * `selected` is the only thing carrying coordinates. Editing the text after
 * choosing clears it, because a field reading "Paris, Texas" while holding the
 * coordinates of Paris, France is not a cosmetic mismatch — birth longitude
 * enters local sidereal time degree for degree, so it is a different ascendant.
 * The parent gates its submit on `selected`, never on the text.
 */
export function BirthCityPicker({
  value,
  onValueChange,
  selected,
  onSelect,
  inputId,
}: BirthCityPickerProps) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const generatedId = useId();
  const listId = `${inputId ?? generatedId}-suggestions`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [remote, setRemote] = useState<BirthCitySuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<"unavailable" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalized = normalizeCityQuery(value);
  const longEnough = normalized.length >= minimumQueryLength(normalized);

  // One source: the provider, through our own endpoint. There is no bundled
  // catalog to fall back on, because a second resolution path is a second set
  // of coordinates for the same city — and this repo has already shipped 69
  // profiles stored at a fallback city's coordinates.
  const suggestions = remote ?? [];
  const hasSuggestions = suggestions.length > 0;
  const ambiguous = hasHomonyms(suggestions);
  const notFound =
    longEnough && !loading && remote !== null && !hasSuggestions && !selected && !remoteError;

  const provider = useMemo(
    () =>
      createRemoteBirthCityProvider({
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/suggest-birth-cities`,
      }),
    [],
  );

  // --- the debounced remote pass -------------------------------------------
  useEffect(() => {
    if (!longEnough || selected) {
      setRemote(null);
      setLoading(false);
      setRemoteError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setRemoteError(null);
      try {
        const session = await getSupabaseBrowser().auth.getSession();
        const token = session.data.session?.access_token;
        const result = await provider(
          // The body carries the city text and the interface language. Nothing
          // identifying: `BirthCityQuery` has nowhere to put it.
          { text: value, lang: locale.slice(0, 2), limit: MAX_SUGGESTIONS },
          controller.signal,
        );
        if (cancelled) return;
        if (result.ok) {
          setRemote(result.suggestions);
        } else if (result.reason === "invalid_query") {
          setRemote(null);
        } else {
          // No local list to fall back to. Say so plainly rather than showing
          // an empty box that reads as "your city does not exist".
          setRemote(null);
          setRemoteError("unavailable");
        }
        void token;
      } catch {
        if (!cancelled) setRemoteError("unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, longEnough, selected, locale, provider]);

  useEffect(() => {
    setHighlight(0);
  }, [remote]);

  useEffect(() => {
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  const choose = useCallback(
    (suggestion: BirthCitySuggestion) => {
      onSelect(suggestion);
      onValueChange(formatBirthCitySuggestion(suggestion));
      setOpen(false);
    },
    [onSelect, onValueChange],
  );

  const handleChange = useCallback(
    (next: string) => {
      onValueChange(next);
      // Editing after choosing invalidates the choice. A stale coordinate is
      // worse than none: it is confidently wrong.
      if (selected) onSelect(null);
      setOpen(true);
    },
    [onSelect, onValueChange, selected],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !hasSuggestions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      const picked = suggestions[highlight];
      if (picked) {
        event.preventDefault();
        choose(picked);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={inputId}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("birthCityPlaceholder")}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && hasSuggestions}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-busy={loading}
          className={`w-full rounded-[1.25rem] border bg-bg px-4 py-3 pr-12 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent ${
            selected ? "border-gold-border" : "border-border"
          }`}
        />
        {loading ? (
          <span
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-gold-border border-t-gold"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-text-dim" role="status">
          {t("birthCitySearching")}
        </p>
      ) : null}

      {selected ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-gold-muted">
          <span aria-hidden="true">✓</span>
          {t("birthCityResolved")}
        </p>
      ) : null}

      {open && hasSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-[1.25rem] border border-gold-border bg-card shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(suggestion)}
                className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                  index === highlight ? "bg-bronze text-white" : "text-text-muted hover:bg-card-hover"
                }`}
              >
                {formatBirthCitySuggestion(suggestion)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open && ambiguous && hasSuggestions ? (
        <p className="mt-2 text-xs leading-6 text-text-dim">{t("birthCityAmbiguous")}</p>
      ) : null}

      {remoteError ? (
        <p className="mt-2 text-xs leading-6 text-text-dim" role="alert">
          {t("birthCityUnavailable")}
        </p>
      ) : null}

      {notFound ? (
        <p className="mt-2 text-xs leading-6 text-text-dim">{t("birthCityNotFound")}</p>
      ) : null}

      {/* Geoapify's free plan requires visible attribution, and the data under
          it is OpenStreetMap. Both ride with the field that uses them. */}
      <p className="mt-2 text-[10px] leading-5 text-text-dim/70">{t("birthCityAttribution")}</p>
    </div>
  );
}
