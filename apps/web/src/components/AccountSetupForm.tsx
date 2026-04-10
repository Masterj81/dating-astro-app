"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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

  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select(
      "id, name, gender, birth_date, birth_time, birth_city, birth_chart, birth_latitude, birth_longitude, sun_sign, moon_sign, rising_sign, looking_for, min_age, max_age, max_distance, preferred_elements, onboarding_completed"
    )
    .eq("id", session.user.id)
    .maybeSingle();

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

  const { error: insertError } = await supabase.from("profiles").insert({
    id: session.user.id,
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
  const monthOptions = useMemo(() => getMonthOptions(locale), [locale]);
  const yearOptions = useMemo(() => getYearOptions(), []);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
          router.replace("/auth/login");
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

    const requiredFieldsPresent =
      form.name.trim() &&
      form.gender &&
      form.birthDate &&
      form.birthTime &&
      form.birthCity.trim() &&
      form.elementFilter.length > 0;

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
      setSuccess(null);

      const supabase = getSupabaseBrowser();
      const { data, error: chartError } = await supabase.functions.invoke("calculate-chart", {
        body: {
          action: "calculate_chart",
          birthDate: form.birthDate,
          birthTime: form.birthTime,
          birthCity: form.birthCity.trim(),
        },
      });

      if (chartError) {
        throw chartError;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to calculate birth chart.");
      }

      const chart = data.data as {
        sun: { sign: string };
        moon: { sign: string };
        rising: { sign: string };
        coordinates?: { latitude?: number; longitude?: number };
      } & Record<string, unknown>;

      const payload = {
        name: form.name.trim(),
        gender: form.gender,
        birth_date: form.birthDate,
        birth_time: form.birthTime,
        birth_city: form.birthCity.trim(),
        birth_chart: chart,
        birth_latitude: chart.coordinates?.latitude ?? null,
        birth_longitude: chart.coordinates?.longitude ?? null,
        sun_sign: chart.sun?.sign ?? null,
        moon_sign: chart.moon?.sign ?? null,
        rising_sign: chart.rising?.sign ?? null,
        age: Number.isFinite(age) ? age : null,
        looking_for: mapShowMeToLookingFor(form.showMe),
        min_age: form.minAge,
        max_age: form.maxAge,
        max_distance: form.maxDistance,
        preferred_elements: form.elementFilter.map((value) => value.toLowerCase()),
        onboarding_completed: true,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profileId);

      if (updateError) {
        throw updateError;
      }

      setSuccess(t("profilePreferencesSaveSuccess"));
      router.replace("/app");
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

  const completionSteps = useMemo(() => {
    const steps = [
      { key: "name", done: !!form.name.trim() },
      { key: "gender", done: !!form.gender },
      { key: "birthDate", done: !!form.birthDate },
      { key: "birthTime", done: !!form.birthTime },
      { key: "birthCity", done: !!form.birthCity.trim() },
      { key: "elements", done: form.elementFilter.length > 0 },
    ];
    return steps;
  }, [form]);

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

  const birthDayOptions = getDayOptions(birthDateParts.year, birthDateParts.month);

  return (
    <section className="rounded-[2rem] border border-border bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md md:p-8">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
          {/* Dynamic motivation text based on the current incomplete step */}
          <p className="mt-2 text-xs text-text-muted">
            {completionPercent === 100
              ? t("setupAllDone")
              : completionSteps.filter((s) => !s.done).length === 1
                ? t("setupAlmostThere")
                : t(`setupStepMotivation_${completionSteps.find((s) => !s.done)?.key || "name"}`)}
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
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
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
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
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
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
              </span>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
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
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
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
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.06)] px-4 py-3">
              <span className="mt-0.5 text-sm">💡</span>
              <div>
                <p className="text-xs font-medium text-[#fde68a]">{t("setupWhyBirthTime")}</p>
                <p className="mt-1 text-[11px] leading-5 text-text-muted">{t("setupWhyBirthTimeBody")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("profilePreferencesLabel")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{t("profilePreferencesTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("profilePreferencesBody")}
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

      {success ? (
        <p role="status" className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-text-dim">
          {completionPercent < 100 ? t("setupIncompleteHint") : t("setupReadyHint")}
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
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
