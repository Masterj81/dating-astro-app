"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { SITE } from "@/lib/constants";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { BillingSettingsPanel } from "@/components/BillingSettingsPanel";
import { AccountDeletionFlow } from "@/components/AccountDeletionFlow";
import type { Session } from "@supabase/supabase-js";

type AccountProfile = {
  id: string;
  name: string | null;
  bio: string | null;
  gender?: string | null;
  photos: string[] | null;
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

type FormState = {
  name: string;
  bio: string;
  gender: string;
};

type BirthFormState = {
  birthDate: string;
  birthTime: string;
  birthCity: string;
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

type PreferencesFormState = {
  showMe: ShowMeOption;
  minAge: number;
  maxAge: number;
  maxDistance: number;
  elementFilter: string[];
};

type PasswordFormState = {
  nextPassword: string;
  confirmPassword: string;
};

type EditingSection = "summary" | "birth" | "preferences" | "security" | null;

const MAX_BIO_LENGTH = 500;
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

const parseBirthDateParts = (birthDate: string) => {
  const [year = "", month = "", day = ""] = birthDate.split("-");
  return { year, month, day };
};

const parseBirthTimeParts = (birthTime: string) => {
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
    .select("*")
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
    gender:
      typeof session.user.user_metadata?.gender === "string"
        ? session.user.user_metadata.gender
        : null,
  });

  if (insertError) {
    throw insertError;
  }

  return {
    id: session.user.id,
    name: fallbackName,
    bio: null,
    gender:
      typeof session.user.user_metadata?.gender === "string"
        ? session.user.user_metadata.gender
        : null,
    photos: null,
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
  } satisfies AccountProfile;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M13.96 2.5a1.75 1.75 0 0 1 2.47 2.47l-8.3 8.3-3.13.66.66-3.13 8.3-8.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.5 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SectionAction({
  editing,
  onClick,
  label,
  cancelLabel,
}: {
  editing: boolean;
  onClick: () => void;
  label: string;
  cancelLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
    >
      {editing ? cancelLabel : label}
    </button>
  );
}

export function AccountProfileWorkspace({
  mode = "profile",
}: {
  mode?: "profile" | "setup";
}) {
  const t = useTranslations("webApp");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const isSetupMode = mode === "setup";
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [sessionEmail, setSessionEmail] = useState("");
  const [form, setForm] = useState<FormState>({ name: "", bio: "", gender: "" });
  const [birthForm, setBirthForm] = useState<BirthFormState>({
    birthDate: "",
    birthTime: "",
    birthCity: "",
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
  const [preferencesForm, setPreferencesForm] = useState<PreferencesFormState>({
    showMe: "everyone",
    minAge: 18,
    maxAge: 99,
    maxDistance: 100,
    elementFilter: [],
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    nextPassword: "",
    confirmPassword: "",
  });
  const [editingSection, setEditingSection] = useState<EditingSection>(
    mode === "setup" ? "summary" : null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBirth, setSavingBirth] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const loadProfile = async () => {
    setLoading(true);
    resetMessages();

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setProfile(null);
        setSessionEmail("");
        setLoading(false);
        return;
      }

      setSessionEmail(session.user.email || "");
      const nextProfile = await ensureWebProfileExists(session);
      setProfile(nextProfile);
      setForm({
        name:
          nextProfile.name ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          "",
        bio: nextProfile.bio || "",
        gender: nextProfile.gender || "",
      });
      setBirthForm({
        birthDate: nextProfile.birth_date || "",
        birthTime: nextProfile.birth_time || "",
        birthCity: nextProfile.birth_city || "",
      });
      setBirthDateParts(parseBirthDateParts(nextProfile.birth_date || ""));
      setBirthTimeParts(parseBirthTimeParts(nextProfile.birth_time || ""));
      setPreferencesForm({
        showMe: mapLookingForToShowMe(nextProfile.looking_for),
        minAge: nextProfile.min_age ?? 18,
        maxAge: nextProfile.max_age ?? 99,
        maxDistance: nextProfile.max_distance ?? 100,
        elementFilter: mapPreferredElementsToFilter(nextProfile.preferred_elements),
      });
      setEditingSection(null);
    } catch (loadFailure) {
      console.error("[AccountProfileWorkspace] Failed to load profile", loadFailure);
      setError(t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!profile?.id) return;

    try {
      setSaving(true);
      resetMessages();

      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          name: form.name.trim() || null,
          bio: form.bio.trim() || null,
          gender: form.gender || null,
        })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile((current) =>
        current
          ? {
              ...current,
              name: form.name.trim() || null,
              bio: form.bio.trim() || null,
              gender: form.gender || null,
            }
          : current
      );
      setEditingSection(isSetupMode ? "birth" : null);
      setSuccess(t("profileSaveSuccess"));
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : t("unknownError"));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !profile?.id) return;

    try {
      setUploadingPhoto(true);
      resetMessages();

      const supabase = getSupabaseBrowser();
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${profile.id}/avatar-web.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      const existingPhotos = Array.isArray(profile.photos) ? [...profile.photos] : [];
      const nextPhotos = existingPhotos.length ? [photoUrl, ...existingPhotos.slice(1)] : [photoUrl];

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ photos: nextPhotos })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile((current) => (current ? { ...current, photos: nextPhotos } : current));
      setSuccess(t("profilePhotoUpdated"));
    } catch (uploadFailure) {
      setError(uploadFailure instanceof Error ? uploadFailure.message : t("profilePhotoError"));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadingPhoto(false);
    }
  };

  const handleBirthSave = async () => {
    if (!profile?.id || !birthForm.birthDate) {
      setError("Birth date is required.");
      return;
    }

    const age = getAgeFromBirthDate(birthForm.birthDate);
    if (age !== null && age < 18) {
      setError(t("mustBe18"));
      return;
    }

    try {
      setSavingBirth(true);
      resetMessages();

      const supabase = getSupabaseBrowser();
      const { data, error: chartError } = await supabase.functions.invoke("calculate-chart", {
        body: {
          action: "calculate_chart",
          birthDate: birthForm.birthDate,
          birthTime: birthForm.birthTime || undefined,
          birthCity: birthForm.birthCity || undefined,
        },
      });

      if (chartError) throw chartError;
      if (!data?.success) throw new Error(data?.error || "Unable to calculate birth chart.");

      const chart = data.data as {
        sun: { sign: string };
        moon: { sign: string };
        rising: { sign: string };
        coordinates?: { latitude?: number; longitude?: number };
      } & Record<string, unknown>;

      const payload = {
        birth_date: birthForm.birthDate,
        birth_time: birthForm.birthTime || null,
        birth_city: birthForm.birthCity || null,
        birth_chart: chart,
        birth_latitude: chart.coordinates?.latitude ?? null,
        birth_longitude: chart.coordinates?.longitude ?? null,
        sun_sign: chart.sun?.sign ?? null,
        moon_sign: chart.moon?.sign ?? null,
        rising_sign: chart.rising?.sign ?? null,
        age: Number.isFinite(age) ? age : null,
        onboarding_completed: isSetupMode ? false : true,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile((current) => (current ? { ...current, ...payload } : current));
      setEditingSection(isSetupMode ? "preferences" : null);
      setSuccess(t("profileBirthSaveSuccess"));
    } catch (saveFailure) {
      if (saveFailure instanceof Error && saveFailure.message.includes("at least 18")) {
        setError(t("mustBe18"));
      } else {
        setError(saveFailure instanceof Error ? saveFailure.message : t("unknownError"));
      }
    } finally {
      setSavingBirth(false);
    }
  };

  const handlePreferencesSave = async () => {
    if (!profile?.id) return;

    try {
      setSavingPreferences(true);
      resetMessages();

      const supabase = getSupabaseBrowser();
      const payload = {
        looking_for: mapShowMeToLookingFor(preferencesForm.showMe),
        min_age: preferencesForm.minAge,
        max_age: preferencesForm.maxAge,
        max_distance: preferencesForm.maxDistance,
        preferred_elements: preferencesForm.elementFilter.length
          ? preferencesForm.elementFilter.map((value) => value.toLowerCase())
          : [...ALL_PROFILE_ELEMENTS],
        onboarding_completed: true,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile((current) => (current ? { ...current, ...payload } : current));
      setEditingSection(null);
      setSuccess(t("profilePreferencesSaveSuccess"));
      if (isSetupMode) {
        router.replace("/app");
        return;
      }
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : t("unknownError"));
    } finally {
      setSavingPreferences(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!passwordForm.nextPassword || !passwordForm.confirmPassword) {
      setError(t("profilePasswordFieldsRequired"));
      return;
    }

    if (passwordForm.nextPassword.length < 8) {
      setError(t("profilePasswordMinLength"));
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setError(t("profilePasswordMismatch"));
      return;
    }

    try {
      setSavingPassword(true);
      resetMessages();

      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.nextPassword,
      });

      if (updateError) throw updateError;

      setPasswordForm({ nextPassword: "", confirmPassword: "" });
      setEditingSection(null);
      setSuccess(t("profilePasswordSaveSuccess"));
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : t("unknownError"));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("notSignedIn")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("profileWorkspaceUnavailable")}
        </p>
      </div>
    );
  }

  const imageSrc = resolveImageSrc(profile.photos?.[0]);
  const isEditingSummary = isSetupMode || editingSection === "summary";
  const isEditingBirth = isSetupMode || editingSection === "birth";
  const isEditingPreferences = isSetupMode || editingSection === "preferences";
  const isEditingSecurity = editingSection === "security";
  const monthOptions = getMonthOptions(locale);
  const yearOptions = getYearOptions();
  const { year: birthYear, month: birthMonth, day: birthDay } = birthDateParts;
  const { hour: birthHour, minute: birthMinute } = birthTimeParts;
  const dayOptions = getDayOptions(birthYear, birthMonth);

  const updateBirthDatePart = (part: "year" | "month" | "day", value: string) => {
    const nextParts = {
      ...birthDateParts,
      [part]: value,
    };

    setBirthDateParts(nextParts);

    if (!nextParts.year || !nextParts.month || !nextParts.day) {
      setBirthForm((current) => ({ ...current, birthDate: "" }));
      return;
    }

    const maxDay = new Date(Number(nextParts.year), Number(nextParts.month), 0).getDate();
    const normalizedDay = Math.min(Number(nextParts.day), maxDay);

    setBirthForm((current) => ({
      ...current,
      birthDate: `${nextParts.year}-${nextParts.month}-${String(normalizedDay).padStart(2, "0")}`,
    }));
  };

  const updateBirthTimePart = (part: "hour" | "minute", value: string) => {
    const nextParts = {
      ...birthTimeParts,
      [part]: value,
    };

    setBirthTimeParts(nextParts);

    setBirthForm((current) => ({
      ...current,
      birthTime: nextParts.hour && nextParts.minute ? `${nextParts.hour}:${nextParts.minute}` : "",
    }));
  };

  return (
    <section className="rounded-[2rem] border border-border bg-card/90 p-6">
      {isSetupMode ? (
        <div className="mb-6 rounded-[1.5rem] border border-accent/25 bg-accent/10 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("profileSummaryLabel")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("profileWorkspaceTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("profileWorkspaceSubtitle")}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 overflow-hidden rounded-3xl bg-bg-secondary">
            <Image
              src={imageSrc}
              alt={profile.name || t("unknownUser")}
              fill
              sizes="96px"
              unoptimized={shouldBypassImageOptimization(imageSrc)}
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label={t("profilePhotoUpload")}
            >
              <PencilIcon />
            </button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("profileSummaryLabel")}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {profile.name || t("unknownUser")}
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              {sessionEmail || t("emailPlaceholder")}
            </p>
          </div>
        </div>

        {uploadingPhoto ? (
          <div className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-white">
            {t("loading")}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelected}
          className="hidden"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-accent/20 bg-accent/8 p-3 text-center">
          <p className="text-lg">☀️</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverSun")}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"}
          </p>
        </div>
        <div className="rounded-2xl border border-purple/20 bg-purple/8 p-3 text-center">
          <p className="text-lg">🌙</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverMoon")}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {profile.moon_sign ? translateSign(profile.moon_sign, locale) : "?"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white/[0.04] p-3 text-center">
          <p className="text-lg">⬆️</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverRising")}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {profile.rising_sign ? translateSign(profile.rising_sign, locale) : "?"}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("profileSummaryTitle")}
            </p>
            {!isEditingSummary ? (
              <p className="mt-4 text-sm leading-7 text-white/85">
                {profile.bio || t("discoverNoBio")}
              </p>
            ) : null}
          </div>
          {!isSetupMode ? (
            <SectionAction
              editing={isEditingSummary}
              onClick={() => {
                resetMessages();
                setEditingSection(isEditingSummary ? null : "summary");
              }}
              label={t("profileEditLabel")}
              cancelLabel={t("cancel")}
            />
          ) : null}
        </div>

        {isEditingSummary ? (
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">{t("name")}</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
                placeholder={t("namePlaceholder")}
                maxLength={50}
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

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">
                {t("profileBioLabel")}
              </span>
              <textarea
                value={form.bio}
                onChange={(event) =>
                  setForm((current) => ({ ...current, bio: event.target.value }))
                }
                className="min-h-[160px] w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
                placeholder={t("profileBioPlaceholder")}
                maxLength={MAX_BIO_LENGTH}
              />
              <div className="mt-2 flex justify-between text-xs text-text-dim">
                <span>{t("profileBioHint")}</span>
                <span>{form.bio.length}/{MAX_BIO_LENGTH}</span>
              </div>
            </label>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? t("loading") : t("profileSave")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("birthDetailsLabel")}
            </p>
            {!isEditingBirth ? (
              <div className="mt-4 space-y-3 text-sm text-white/85">
                <p>
                  {t("genderLabel")}:{" "}
                  {profile.gender
                    ? t(`genderOption_${profile.gender === "non-binary" ? "nonBinary" : profile.gender}`)
                    : t("statusUnknown")}
                </p>
                <p>{t("birthDateLabel")}: {profile.birth_date || t("statusUnknown")}</p>
                <p>{t("birthTimeLabel")}: {profile.birth_time || t("statusUnknown")}</p>
                <p>{t("birthCityLabel")}: {profile.birth_city || t("statusUnknown")}</p>
              </div>
            ) : null}
          </div>
          {!isSetupMode ? (
            <SectionAction
              editing={isEditingBirth}
              onClick={() => {
                resetMessages();
                setEditingSection(isEditingBirth ? null : "birth");
              }}
              label={t("profileEditLabel")}
              cancelLabel={t("cancel")}
            />
          ) : null}
        </div>

        {isEditingBirth ? (
          <div className="mt-6">
            <h3 className="text-xl font-semibold text-white">{t("profileBirthSectionTitle")}</h3>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t("profileBirthSectionBody")}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
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
                      value={birthDay}
                      onChange={(event) => updateBirthDatePart("day", event.target.value)}
                      className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                    >
                      <option value="">{t("statusUnknown")}</option>
                      {dayOptions.map((day) => (
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
                      value={birthMonth}
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
                      value={birthYear}
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
                      value={birthHour}
                      onChange={(event) => updateBirthTimePart("hour", event.target.value)}
                      className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                    >
                      <option value="">{t("statusUnknown")}</option>
                      {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map(
                        (hour) => (
                          <option key={hour} value={hour}>
                            {hour}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-text-dim">
                      {t("birthMinuteLabel")}
                    </span>
                    <select
                      value={birthMinute}
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
              <span className="mb-2 block text-sm font-medium text-text-muted">{t("birthCityLabel")}</span>
              <input
                value={birthForm.birthCity}
                onChange={(event) =>
                  setBirthForm((current) => ({ ...current, birthCity: event.target.value }))
                }
                placeholder={t("birthCityPlaceholder")}
                className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              />
            </label>

            <p className="mt-3 text-xs leading-6 text-text-dim">
              {t("profileBirthSectionHint")}
            </p>

            <button
              type="button"
              onClick={handleBirthSave}
              disabled={savingBirth}
              className="mt-5 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingBirth ? t("loading") : t("profileBirthSave")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6">
        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("profilePreferencesLabel")}
              </p>
              {!isEditingPreferences ? (
                <div className="mt-4 grid gap-3 text-sm text-white/85 md:grid-cols-2">
                  <p>{t("profilePreferencesShowMe")}: {t(`profileShowMe_${preferencesForm.showMe}`)}</p>
                  <p>{t("profilePreferencesAgeRange")}: {preferencesForm.minAge} - {preferencesForm.maxAge}</p>
                  <p>{t("profilePreferencesMaxDistance")}: {preferencesForm.maxDistance} km</p>
                  <p>
                    {t("profilePreferencesElements")}:{" "}
                    {preferencesForm.elementFilter.length
                      ? preferencesForm.elementFilter.map((value) => t(`profileElement_${value.toLowerCase()}`)).join(", ")
                      : t("profilePreferencesAll")}
                  </p>
                </div>
              ) : null}
            </div>
            {!isSetupMode ? (
              <SectionAction
                editing={isEditingPreferences}
                onClick={() => {
                  resetMessages();
                  setEditingSection(isEditingPreferences ? null : "preferences");
                }}
                label={t("profileEditLabel")}
                cancelLabel={t("cancel")}
              />
            ) : null}
          </div>

          {isEditingPreferences ? (
            <>
              <h3 className="mt-3 text-xl font-semibold text-white">{t("profilePreferencesTitle")}</h3>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t("profilePreferencesBody")}
              </p>

              <div className="mt-5">
                <p className="mb-3 text-sm font-medium text-text-muted">{t("profilePreferencesShowMe")}</p>
                <div className="flex flex-wrap gap-3">
                  {([
                    ["men", t("profileShowMe_men")],
                    ["women", t("profileShowMe_women")],
                    ["everyone", t("profileShowMe_everyone")],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setPreferencesForm((current) => ({
                          ...current,
                          showMe: value,
                        }))
                      }
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        preferencesForm.showMe === value
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
                  <span className="mb-2 block text-sm font-medium text-text-muted">{t("profilePreferencesMinAge")}</span>
                  <input
                    type="number"
                    min={18}
                    max={98}
                    value={preferencesForm.minAge}
                    onChange={(event) =>
                      setPreferencesForm((current) => ({
                        ...current,
                        minAge: Number(event.target.value) || 18,
                      }))
                    }
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text-muted">{t("profilePreferencesMaxAge")}</span>
                  <input
                    type="number"
                    min={19}
                    max={99}
                    value={preferencesForm.maxAge}
                    onChange={(event) =>
                      setPreferencesForm((current) => ({
                        ...current,
                        maxAge: Number(event.target.value) || 99,
                      }))
                    }
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text-muted">{t("profilePreferencesMaxDistance")}</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={preferencesForm.maxDistance}
                    onChange={(event) =>
                      setPreferencesForm((current) => ({
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
                <div className="flex flex-wrap gap-3">
                  {ELEMENT_OPTIONS.map((element) => {
                    const label = t(`profileElement_${element.key}`);
                    const normalizedKey =
                      element.key.charAt(0).toUpperCase() + element.key.slice(1);
                    const isActive = preferencesForm.elementFilter.includes(normalizedKey);
                    return (
                      <button
                        key={element.key}
                        type="button"
                        onClick={() =>
                          setPreferencesForm((current) => ({
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

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handlePreferencesSave}
                  disabled={savingPreferences || preferencesForm.minAge >= preferencesForm.maxAge}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingPreferences ? t("loading") : t("profilePreferencesSave")}
                </button>
                <Link
                  href="/app/discover"
                  className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
                >
                  {isSetupMode ? t("openDiscover") : t("backToDiscover")}
                </Link>
              </div>
            </>
          ) : null}
        </div>

        {!isSetupMode ? (
        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("profileSecurityLabel")}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white">{t("profilePasswordTitle")}</h3>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t("profilePasswordBody")}
              </p>
            </div>
            <SectionAction
              editing={isEditingSecurity}
              onClick={() => {
                resetMessages();
                setEditingSection(isEditingSecurity ? null : "security");
              }}
              label={t("profileEditLabel")}
              cancelLabel={t("cancel")}
            />
          </div>

          {isEditingSecurity ? (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text-muted">
                    {t("profilePasswordNew")}
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordForm.nextPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        nextPassword: event.target.value,
                      }))
                    }
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text-muted">
                    {t("profilePasswordConfirm")}
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                    className="w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
                >
                  {showPassword ? t("profilePasswordHide") : t("profilePasswordShow")}
                </button>
                <button
                  type="button"
                  onClick={handlePasswordSave}
                  disabled={savingPassword}
                  className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingPassword ? t("loading") : t("profilePasswordSave")}
                </button>
              </div>
            </>
          ) : null}
        </div>
        ) : null}

        {!isSetupMode ? (
        <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("profileSupportLabel")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{t("profileSupportTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("profileSupportBody")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={`mailto:${SITE.email.support}`}
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {tCommon("contactSupport")}
            </a>
            <span className="self-center text-sm text-text-dim">{SITE.email.support}</span>
          </div>
        </div>
        ) : null}

        {!isSetupMode ? (
        <div className="rounded-[1.5rem] border border-accent/30 bg-accent/10 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[#ffd0d7]">
            {t("profileDangerLabel")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{t("profileDeleteTitle")}</h3>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("profileDeleteBody")}
          </p>
          <div className="mt-5">
            <AccountDeletionFlow />
          </div>
        </div>
        ) : null}

        {!isSetupMode ? <BillingSettingsPanel /> : null}
      </div>

      {success ? (
        <p className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
