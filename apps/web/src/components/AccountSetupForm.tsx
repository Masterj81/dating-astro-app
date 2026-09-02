"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Session } from "@supabase/supabase-js";

type AccountProfile = {
  id: string;
  name: string | null;
  gender: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_city: string | null;
  birth_chart?: Record<string, unknown> | null;
  birth_latitude?: number | null;
  birth_longitude?: number | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  looking_for?: string[] | null;
  min_age?: number | null;
  max_age?: number | null;
  max_distance?: number | null;
  preferred_elements?: string[] | null;
  onboarding_completed?: boolean | null;
};

type SetupFormState = {
  name: string;
  gender: string;
  birthDate: string;
  birthTime: string;
  birthCity: string;
  showMe: ShowMeOption;
  minAge: number;
  maxAge: number;
  maxDistance: number;
  elementFilter: string[];
};

type BirthDatePartsState = {
  year: string;
  month: string;
  day: string;
};

type BirthTimePartsState = {
  hour: string;
  minute: string;
};

type ShowMeOption = "men" | "women" | "everyone";

/** What calculate-chart returns. `rising` is null when no birth time was given. */
type ChartResponse = {
  sun?: { sign?: string } | null;
  moon?: { sign?: string } | null;
  rising?: { sign?: string } | null;
  coordinates?: { latitude?: number; longitude?: number };
  confidence?: string;
  warnings?: string[];
} & Record<string, unknown>;

/** What the reveal card shows. Every field is nullable on purpose. */
type RevealState = {
  sun: string | null;
  moon: string | null;
  rising: string | null;
  missingBirthTime: boolean;
  missingBirthCity: boolean;
};

/**
 * The reader's own IANA zone, used ONLY as a stand-in when no birth city was
 * given. Returns null when the browser cannot tell us, in which case
 * calculate-chart keeps its own Greenwich fallback.
 */
function resolveDeviceTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // The edge function rejects anything over 64 chars and validates the id.
    return typeof zone === "string" && zone.length > 0 && zone.length <= 64 ? zone : null;
  } catch {
    return null;
  }
}

/** The session's email, or null. Never throws — a failure just skips backfill. */
async function getSessionEmail(): Promise<string | null> {
  try {
    const supabase = getSupabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const email = session?.user?.email;
    return typeof email === "string" && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

const ALL_PROFILE_ELEMENTS = ["fire", "earth", "air", "water"] as const;
const ELEMENT_OPTIONS = [
  { key: "fire" },
  { key: "earth" },
  { key: "air" },
  { key: "water" },
] as const;
const BIRTH_YEAR_START = 1900;
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0")
);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const mapLookingForToShowMe = (lookingFor?: string[] | string | null): ShowMeOption => {
  const normalized = normalizeStringArray(lookingFor).map((value) => value.toLowerCase());
  if (normalized.length === 1 && normalized[0] === "male") return "men";
  if (normalized.length === 1 && normalized[0] === "female") return "women";
  return "everyone";
};

const mapShowMeToLookingFor = (showMe: ShowMeOption) => {
  if (showMe === "men") return ["male"];
  if (showMe === "women") return ["female"];
  return ["male", "female", "non-binary", "other"];
};

const mapPreferredElementsToFilter = (preferredElements?: string[] | string | null) => {
  const normalized = normalizeStringArray(preferredElements).map((value) =>
    value.toLowerCase()
  );

  if (!normalized.length || normalized.length === ALL_PROFILE_ELEMENTS.length) {
    return [];
  }

  return normalized.map((value) => value.charAt(0).toUpperCase() + value.slice(1));
};

const getMonthOptions = (locale: string) =>
  Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(Date.UTC(2024, index, 1))
    ),
  }));

const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return Array.from(
    { length: currentYear - BIRTH_YEAR_START + 1 },
    (_, index) => String(currentYear - index)
  );
};

const getDayOptions = (year: string, month: string) => {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeMonth = Number(month) || 1;
  const dayCount = new Date(safeYear, safeMonth, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => String(index + 1).padStart(2, "0"));
};

const parseBirthDateParts = (birthDate: string): BirthDatePartsState => {
  const [year = "", month = "", day = ""] = birthDate.split("-");
  return { year, month, day };
};

const parseBirthTimeParts = (birthTime: string): BirthTimePartsState => {
  const [hour = "", minute = ""] = birthTime.split(":");
  return { hour, minute };
};

const getAgeFromBirthDate = (birthDate: string) => {
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const now = new Date();
  const birthDateValue = new Date(year, month - 1, day);
  let age = now.getFullYear() - birthDateValue.getFullYear();
  const monthDiff = now.getMonth() - birthDateValue.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDateValue.getDate())) {
    age -= 1;
  }
  return age;
};

async function ensureWebProfileExists(session: Session) {
  const supabase = getSupabaseBrowser();

  // Phase 3-B: own profile via SECURITY DEFINER RPC. Reads sensitive birth_*
  // and survives Phase 3-C column-level REVOKEs.
  const { data: rows, error: selectError } = await supabase.rpc("get_my_full_profile");
  const existingProfile = Array.isArray(rows) ? rows[0] : null;

  if (selectError) {
    throw selectError;
  }

  if (existingProfile) {
    return existingProfile as AccountProfile;
  }

  const fallbackName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email?.split("@")[0] ||
    "User";

  // `email` is not optional bookkeeping: send-email/index.ts skips any account
  // whose profile has no email with `{ skipped: true, reason: "No email on
  // profile" }`, silently and forever. The auth trigger
  // (20260319_create_profiles_on_auth_signup) normally fills it, but this
  // insert only runs when that row is missing — a trigger failure, an account
  // predating the trigger, a deleted row — which is exactly the case where the
  // column would otherwise stay null and the reader would never hear from JUNO
  // again. `?? null` never clobbers an existing value: this is an INSERT, and
  // the row provably did not exist a moment ago.
  const { error: insertError } = await supabase.from("profiles").insert({
    id: session.user.id,
    email: session.user.email ?? null,
    name: fallbackName,
  });

  if (insertError) {
    throw insertError;
  }

  return {
    id: session.user.id,
    name: fallbackName,
    gender: null,
    birth_date: null,
    birth_time: null,
    birth_city: null,
    birth_chart: null,
    birth_latitude: null,
    birth_longitude: null,
    sun_sign: null,
    moon_sign: null,
    rising_sign: null,
    looking_for: ["male", "female", "non-binary", "other"],
    min_age: 18,
    max_age: 99,
    max_distance: 100,
    preferred_elements: [...ALL_PROFILE_ELEMENTS],
    onboarding_completed: false,
  } satisfies AccountProfile;
}

export function AccountSetupForm() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const monthOptions = useMemo(() => getMonthOptions(locale), [locale]);
  const yearOptions = useMemo(() => getYearOptions(), []);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Replaces the old `success` string: the reveal IS the success state now.
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [form, setForm] = useState<SetupFormState>({
    name: "",
    gender: "",
    birthDate: "",
    birthTime: "",
    birthCity: "",
    showMe: "everyone",
    minAge: 18,
    maxAge: 99,
    maxDistance: 100,
    elementFilter: [],
  });
  const [birthDateParts, setBirthDateParts] = useState<BirthDatePartsState>({
    year: "",
    month: "",
    day: "",
  });
  const [birthTimeParts, setBirthTimeParts] = useState<BirthTimePartsState>({
    hour: "",
    minute: "",
  });

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) {
          return;
        }

        if (!session?.user?.id) {
          router.replace({
            pathname: "/auth/login",
            query: { next: pathname.startsWith("/app") ? pathname : "/app/setup" },
          });
          return;
        }

        const profile = await ensureWebProfileExists(session);

        if (!active) {
          return;
        }

        if (profile.onboarding_completed) {
          router.replace("/app");
          return;
        }

        setProfileId(profile.id);
        setForm({
          name:
            profile.name ||
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            "",
          gender: profile.gender || "",
          birthDate: profile.birth_date || "",
          birthTime: profile.birth_time || "",
          birthCity: profile.birth_city || "",
          showMe: mapLookingForToShowMe(profile.looking_for),
          minAge: profile.min_age ?? 18,
          maxAge: profile.max_age ?? 99,
          maxDistance: profile.max_distance ?? 100,
          elementFilter: mapPreferredElementsToFilter(profile.preferred_elements),
        });
        setBirthDateParts(parseBirthDateParts(profile.birth_date || ""));
        setBirthTimeParts(parseBirthTimeParts(profile.birth_time || ""));
      } catch (loadFailure) {
        console.error("[AccountSetupForm] Failed to load setup form", loadFailure);
        setError(t("unknownError"));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [router, t]);

  const updateBirthDatePart = (part: keyof BirthDatePartsState, value: string) => {
    setBirthDateParts((current) => {
      const next = { ...current, [part]: value };
      const shouldUpdateBirthDate = next.year && next.month && next.day;
      const nextBirthDate = shouldUpdateBirthDate
        ? `${next.year}-${next.month}-${next.day}`
        : "";

      setForm((currentForm) => ({
        ...currentForm,
        birthDate: nextBirthDate,
      }));

      return next;
    });
  };

  const updateBirthTimePart = (part: keyof BirthTimePartsState, value: string) => {
    setBirthTimeParts((current) => {
      const next = { ...current, [part]: value };
      const shouldUpdateBirthTime = next.hour && next.minute;
      const nextBirthTime = shouldUpdateBirthTime ? `${next.hour}:${next.minute}` : "";

      setForm((currentForm) => ({
        ...currentForm,
        birthTime: nextBirthTime,
      }));

      return next;
    });
  };

  const handleSubmit = async () => {
    if (!profileId) {
      return;
    }

    // Only three fields block the first payoff: who you are, how you show up
    // in discovery, and the one date the chart cannot be computed without.
    //
    // birthTime, birthCity and elementFilter used to block too, which meant a
    // reader could not reach a single piece of value without supplying an
    // exact birth minute and a dating filter. Android already treats the first
    // two as optional and encourages skipping them ("Don't worry if you're not
    // sure"); the web asking MORE than the native app is backwards, especially
    // as the web is the iOS channel. See docs/retention-day2-audit-2026-08.md
    // §4 on how late this pushes the Aha moment.
    const requiredFieldsPresent = form.name.trim() && form.gender && form.birthDate;

    if (!requiredFieldsPresent) {
      setError(t("fillAllFields"));
      return;
    }

    if (form.minAge >= form.maxAge) {
      setError(t("fillAllFields"));
      return;
    }

    const age = getAgeFromBirthDate(form.birthDate);
    if (age !== null && age < 18) {
      setError(t("mustBe18"));
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const birthTime = form.birthTime.trim();
      const birthCity = form.birthCity.trim();
      const hasBirthTime = birthTime.length > 0;
      const hasBirthCity = birthCity.length > 0;

      // With no birth city the edge function falls back to Greenwich, which is
      // a worse guess than the device's own zone for almost everybody. Passing
      // the device zone gets a materially better UTC instant — but it is still
      // a GUESS, and calculate-chart would score a guessed zone as 'input' and
      // report high confidence. We downgrade that below rather than let the
      // stored chart claim a precision nobody gave us.
      const deviceTimezone = !hasBirthCity ? resolveDeviceTimezone() : null;

      const supabase = getSupabaseBrowser();
      const { data, error: chartError } = await supabase.functions.invoke("calculate-chart", {
        body: {
          action: "calculate_chart",
          birthDate: form.birthDate,
          // Omit rather than send "" — the function branches on
          // `birthTime.trim().length > 0` to decide whether an ascendant can
          // exist at all, and an empty string is the honest "unknown".
          ...(hasBirthTime ? { birthTime } : {}),
          ...(hasBirthCity ? { birthCity } : {}),
          ...(deviceTimezone ? { birthTimezone: deviceTimezone } : {}),
        },
      });

      if (chartError) {
        throw chartError;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to calculate birth chart.");
      }

      const chart = data.data as ChartResponse;

      // The ascendant needs an exact birth minute. calculate-chart already
      // returns `rising: null` without one — unlike the mobile wrapper, which
      // substitutes Aries in hard (services/astrology.ts:125) and is why one
      // account in twelve is told a true rising sign and the rest are told
      // Aries. Never write, never render, what we do not have.
      const risingSign = hasBirthTime ? chart.rising?.sign ?? null : null;

      // Record the uncertainty we introduced instead of hiding it. Kept in the
      // JSONB the client owns; calculate-chart is untouched.
      const storedChart: ChartResponse = deviceTimezone
        ? {
            ...chart,
            confidence: "low",
            warnings: [
              ...(Array.isArray(chart.warnings) ? chart.warnings : []),
              "timezone_guessed_from_device",
            ],
          }
        : chart;

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        gender: form.gender,
        birth_date: form.birthDate,
        birth_time: hasBirthTime ? birthTime : null,
        birth_city: hasBirthCity ? birthCity : null,
        birth_chart: storedChart,
        // Without a city these would be Greenwich — a fabricated birthplace in
        // a column named birth_latitude. get-profile-chart already applies the
        // same fallback for a null (index.ts:289), so null costs nothing
        // downstream and stores "unknown" instead of a made-up fact.
        birth_latitude: hasBirthCity ? chart.coordinates?.latitude ?? null : null,
        birth_longitude: hasBirthCity ? chart.coordinates?.longitude ?? null : null,
        sun_sign: chart.sun?.sign ?? null,
        moon_sign: chart.moon?.sign ?? null,
        rising_sign: risingSign,
        age: Number.isFinite(age) ? age : null,
        looking_for: mapShowMeToLookingFor(form.showMe),
        min_age: form.minAge,
        max_age: form.maxAge,
        max_distance: form.maxDistance,
        // An empty selection means "no element filter", which the rest of the
        // app expresses as all four (see mapPreferredElementsToFilter and the
        // ensureProfile default). Writing [] instead would read as "wants
        // nobody" to anything that filters on this column.
        preferred_elements:
          form.elementFilter.length > 0
            ? form.elementFilter.map((value) => value.toLowerCase())
            : [...ALL_PROFILE_ELEMENTS],
        onboarding_completed: true,
      };

      // Backfill the email if this profile row never got one. Guarded on a
      // truthy session email so an anonymous/edge case can never overwrite a
      // good address with null — the failure mode is permanent silence from
      // every lifecycle email.
      const sessionEmail = await getSessionEmail();
      if (sessionEmail) {
        payload.email = sessionEmail;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profileId);

      if (updateError) {
        throw updateError;
      }

      // Do NOT redirect. The chart has just been computed and the reader has
      // not seen a single thing they came for; sending them straight to /app
      // spends the whole onboarding and shows nothing for it. Android reveals
      // the chart here (birth-info.tsx ChartRevealOverlay) and the web should
      // too — this is the Aha moment.
      setReveal({
        sun: chart.sun?.sign ?? null,
        moon: chart.moon?.sign ?? null,
        rising: risingSign,
        missingBirthTime: !hasBirthTime,
        missingBirthCity: !hasBirthCity,
      });
    } catch (saveFailure) {
      if (saveFailure instanceof Error && saveFailure.message.includes("at least 18")) {
        setError(t("mustBe18"));
      } else {
        setError(saveFailure instanceof Error ? saveFailure.message : t("unknownError"));
      }
    } finally {
      setSaving(false);
    }
  };

  // Progress reflects what actually blocks the button. birthTime, birthCity
  // and elements still count — they genuinely improve the chart and the
  // discovery feed — but they are marked optional so the bar stops implying
  // that a reader at 50 % cannot continue. They can.
  const completionSteps = useMemo(() => {
    const steps = [
      { key: "name", done: !!form.name.trim(), required: true },
      { key: "gender", done: !!form.gender, required: true },
      { key: "birthDate", done: !!form.birthDate, required: true },
      { key: "birthTime", done: !!form.birthTime, required: false },
      { key: "birthCity", done: !!form.birthCity.trim(), required: false },
      { key: "elements", done: form.elementFilter.length > 0, required: false },
    ];
    return steps;
  }, [form]);

  const canSubmit = useMemo(
    () => completionSteps.filter((step) => step.required).every((step) => step.done),
    [completionSteps]
  );

  const completionPercent = useMemo(() => {
    const done = completionSteps.filter((s) => s.done).length;
    return Math.round((done / completionSteps.length) * 100);
  }, [completionSteps]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
        <p className="mt-5 text-sm font-medium text-white">{t("setupLoading")}</p>
        <p className="mt-2 text-xs text-text-dim">{t("setupLoadingBody")}</p>
      </div>
    );
  }

  // The reveal replaces the form once the chart exists. Deliberately NOT a
  // modal over the form: the profile is already saved at this point, so there
  // is nothing left to go back to, and a dismissible overlay invites a reader
  // to swipe past the one screen the whole flow was for.
  //
  // It renders whatever it has. A chart with only a Sun sign still produces a
  // complete card — nothing here waits on Moon or Rising, so an incomplete
  // chart can never block the reader from reaching /app.
  if (reveal) {
    const placements = [
      { key: "sun" as const, sign: reveal.sun, desc: t("revealSunDesc") },
      { key: "moon" as const, sign: reveal.moon, desc: t("revealMoonDesc") },
      // Rising is present ONLY when a birth time was given. calculate-chart
      // returns null without one; we never substitute a sign, which is the
      // bug that tells eleven mobile accounts out of twelve they are Aries
      // rising (docs/retention-day2-audit-2026-08.md §3.5).
      { key: "rising" as const, sign: reveal.rising, desc: t("revealRisingDesc") },
    ].filter((placement) => Boolean(placement.sign));

    return (
      <section
        className="rounded-[2rem] border border-border bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md md:p-8"
        data-testid="setup-reveal"
      >
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("revealLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">{t("revealTitle")}</h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">{t("revealSubtitle")}</p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {placements.map((placement) => (
            <div
              key={placement.key}
              data-testid={`setup-reveal-${placement.key}`}
              className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
            >
              <div className="flex items-center gap-2 text-text-dim">
                <ZodiacGlyph sign={placement.sign} className="text-lg leading-none" />
                <span className="text-xs uppercase tracking-[0.18em]">
                  {t(`natalPlanet_${placement.key}`)}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">
                {translateSign(placement.sign, locale)}
              </p>
              <p className="mt-2 text-xs leading-5 text-text-muted">{placement.desc}</p>
            </div>
          ))}
        </div>

        {/* Say what is missing and why, instead of quietly showing less. Two
            separate notes: a missing time costs the rising sign outright, a
            missing city only costs precision. */}
        {reveal.missingBirthTime || reveal.missingBirthCity ? (
          <div className="mt-5 rounded-[1.25rem] border border-[rgba(250, 204, 21, 0.18)] bg-[rgba(250, 204, 21, 0.06)] px-5 py-4">
            <p className="text-xs font-medium text-[#fde68a]">{t("revealRefineTitle")}</p>
            <p className="mt-1 text-[13px] leading-6 text-text-muted">
              {reveal.missingBirthTime
                ? t("revealRefineMissingTime")
                : t("revealRefineMissingCity")}
            </p>
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-6 text-text-dim">{t("revealDisclaimer")}</p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/app"
            data-testid="setup-reveal-open"
            className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-bg transition-all hover:bg-gold-soft hover:shadow-[0_0_20px_rgba(201, 134, 146, 0.3)]"
          >
            {t("revealOpenApp")}
          </Link>
          <Link
            href="/app/settings"
            className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("revealCompleteProfile")}
          </Link>
        </div>
      </section>
    );
  }

  const birthDayOptions = getDayOptions(birthDateParts.year, birthDateParts.month);

  return (
    <section className="rounded-[2rem] border border-border bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md md:p-8">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("profileSummaryLabel")}
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-white">{t("setupWorkspaceTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("setupWorkspaceSubtitle")}
        </p>

        {/* Progress bar with motivational microcopy */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-text-dim">
            <span id="setup-progress-label">{t("setupProgress")}</span>
            <span className={completionPercent === 100 ? "font-semibold text-emerald-400" : ""}>
              {completionPercent}%
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-white/8"
            role="progressbar"
            aria-valuenow={completionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-labelledby="setup-progress-label"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                completionPercent === 100
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : "bg-gradient-to-r from-accent to-purple"
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          {/* Motivation text. Once the three required fields are in, stop
              nagging about the optional ones — the reader can continue, and a
              line telling them what is still "missing" next to a button that
              works reads as a wall that is not there. */}
          <p className="mt-2 text-xs text-text-muted">
            {completionPercent === 100
              ? t("setupAllDone")
              : canSubmit
                ? t("setupReadyHint")
                : t(
                    `setupStepMotivation_${
                      completionSteps.find((s) => s.required && !s.done)?.key || "name"
                    }`
                  )}
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("profileSummaryLabel")}
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">{t("name")}</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={t("namePlaceholder")}
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("genderLabel")}
              </span>
              <select
                value={form.gender}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gender: event.target.value }))
                }
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
              >
                <option value="">{t("genderPlaceholder")}</option>
                <option value="male">{t("genderOption_male")}</option>
                <option value="female">{t("genderOption_female")}</option>
                <option value="non-binary">{t("genderOption_nonBinary")}</option>
                <option value="other">{t("genderOption_other")}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("birthDetailsLabel")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{t("profileBirthSectionTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-text-muted">{t("profileBirthSectionBody")}</p>

          <div className="mt-5 grid gap-4 md:grid-cols-[1.55fr_1fr]">
            <div className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("birthDateLabel")}
              </span>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gold-muted">
                    {t("birthDayLabel")}
                  </span>
                  <select
                    value={birthDateParts.day}
                    onChange={(event) => updateBirthDatePart("day", event.target.value)}
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  >
                    <option value="">{t("statusUnknown")}</option>
                    {birthDayOptions.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gold-muted">
                    {t("birthMonthLabel")}
                  </span>
                  <select
                    value={birthDateParts.month}
                    onChange={(event) => updateBirthDatePart("month", event.target.value)}
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  >
                    <option value="">{t("statusUnknown")}</option>
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gold-muted">
                    {t("birthYearLabel")}
                  </span>
                  <select
                    value={birthDateParts.year}
                    onChange={(event) => updateBirthDatePart("year", event.target.value)}
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  >
                    <option value="">{t("statusUnknown")}</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("birthTimeLabel")}
                <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-muted">
                  {t("setupOptionalTag")}
                </span>
              </span>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gold-muted">
                    {t("birthHourLabel")}
                  </span>
                  <select
                    value={birthTimeParts.hour}
                    onChange={(event) => updateBirthTimePart("hour", event.target.value)}
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  >
                    <option value="">{t("statusUnknown")}</option>
                    {HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gold-muted">
                    {t("birthMinuteLabel")}
                  </span>
                  <select
                    value={birthTimeParts.minute}
                    onChange={(event) => updateBirthTimePart("minute", event.target.value)}
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  >
                    <option value="">{t("statusUnknown")}</option>
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-text-muted">
              {t("birthCityLabel")}
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-muted">
                {t("setupOptionalTag")}
              </span>
            </span>
            <input
              value={form.birthCity}
              onChange={(event) =>
                setForm((current) => ({ ...current, birthCity: event.target.value }))
              }
              placeholder={t("birthCityPlaceholder")}
              className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
            />
          </label>

          <p className="mt-3 text-xs leading-6 text-text-dim">{t("profileBirthSectionHint")}</p>

          {/* Birth time importance nudge */}
          {!form.birthTime && form.birthDate && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-[rgba(250, 204, 21, 0.18)] bg-[rgba(250, 204, 21, 0.06)] px-4 py-3">
              <span className="mt-0.5 text-sm">💡</span>
              <div>
                <p className="text-xs font-medium text-[#fde68a]">{t("setupWhyBirthTime")}</p>
                <p className="mt-1 text-[11px] leading-5 text-text-muted">{t("setupWhyBirthTimeBody")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("profilePreferencesLabel")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{t("profilePreferencesTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("profilePreferencesBody")}
          </p>
          {/* These are discovery filters, not chart inputs. They used to block
              the submit; now they only shape the feed, so say so. */}
          <p className="mt-2 text-xs leading-6 text-text-dim">
            {t("setupPreferencesLater")}
          </p>

          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-text-muted">{t("profilePreferencesShowMe")}</p>
            <div className="flex flex-wrap gap-3" role="group" aria-label={t("profilePreferencesShowMe")}>
              {([
                ["men", t("profileShowMe_men")],
                ["women", t("profileShowMe_women")],
                ["everyone", t("profileShowMe_everyone")],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.showMe === value}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      showMe: value,
                    }))
                  }
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    form.showMe === value
                      ? "border-accent bg-accent/15 text-white"
                      : "border-border text-white hover:bg-card-hover"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("profilePreferencesMinAge")}
              </span>
              <input
                type="number"
                min={18}
                max={98}
                value={form.minAge}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minAge: Number(event.target.value) || 18,
                  }))
                }
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("profilePreferencesMaxAge")}
              </span>
              <input
                type="number"
                min={19}
                max={99}
                value={form.maxAge}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxAge: Number(event.target.value) || 99,
                  }))
                }
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("profilePreferencesMaxDistance")}
              </span>
              <input
                type="number"
                min={1}
                max={500}
                value={form.maxDistance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxDistance: Number(event.target.value) || 100,
                  }))
                }
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-text-muted">{t("profilePreferencesElements")}</p>
            <div className="flex flex-wrap gap-3" role="group" aria-label={t("profilePreferencesElements")}>
              {ELEMENT_OPTIONS.map((element) => {
                const label = t(`profileElement_${element.key}`);
                const normalizedKey = element.key.charAt(0).toUpperCase() + element.key.slice(1);
                const isActive = form.elementFilter.includes(normalizedKey);

                return (
                  <button
                    key={element.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        elementFilter: isActive
                          ? current.elementFilter.filter((value) => value !== normalizedKey)
                          : [...current.elementFilter, normalizedKey],
                      }))
                    }
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "border-accent bg-accent/15 text-white"
                        : "border-border text-white hover:bg-card-hover"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-text-dim">
          {canSubmit ? t("setupReadyHint") : t("setupIncompleteHint")}
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex shrink-0 items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-bg transition-all hover:bg-gold-soft hover:shadow-[0_0_20px_rgba(201, 134, 146, 0.3)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t("setupCalculating")}
            </>
          ) : (
            <>
              {t("openDiscover")}
              <span className="text-base">&#8594;</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
