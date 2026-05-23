// Public profile detail screen — opened from the discover queue's
// "View profile" button (bottom of the card). Mobile mirror of
// apps/web/src/components/ProfileOverview.tsx.
//
// What it shows: photo + name/age, sun/moon/rising trio, bio, and the
// MVP block (intent / looking for / values / lifestyle / prompts /
// icebreaker) via ProfilePublicMVPSections. The Compare charts CTA at
// the bottom of this screen routes to the canonical synastry surface
// (`/premium-screens/synastry?profileId=…`). The legacy `/match/[id]`
// route is preserved elsewhere for back-compat but no longer linked
// from here.
//
// The data flow is: discoverable_profiles view + get_my_full_profile
// RPC in parallel, same pattern as the web component. Sanitization of
// the MVP fields happens inside the section component.

import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CONNECTION_INTENTIONS,
  DEFAULT_CONNECTION_INTENTIONS,
  sanitizeConnectionIntentions,
  sanitizeLifestyleTags,
} from '@astro/shared/profile';
import ProfilePublicMVPSections from '../../components/profile/ProfilePublicMVPSections';
import {
  LuminaryGlyph,
  ZodiacGlyph,
  normalizeZodiacSign,
} from '../../components/astro/ZodiacGlyph';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { startConversationWith } from '../../services/conversations';
import { supabase } from '../../services/supabase';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';

type Profile = {
  id: string;
  name: string | null;
  age: number | null;
  bio: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  image_url: string | null;
  images: string[] | null;
  current_city: string | null;
  relationship_intent: string | null;
  personal_values: string[] | null;
  interests: string[] | null;
  looking_for_text: string | null;
  prompts: unknown;
  icebreaker_question: string | null;
  is_verified: boolean | null;
  connection_intentions: string[] | null;
};

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useLanguage();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [profileResult, viewerResult] = await Promise.all([
          supabase
            .from('discoverable_profiles')
            .select(
              'id, name, age, bio, sun_sign, moon_sign, rising_sign, image_url, images, current_city, relationship_intent, personal_values, interests, looking_for_text, prompts, icebreaker_question, is_verified, connection_intentions',
            )
            .eq('id', id)
            .maybeSingle(),
          supabase.rpc('get_my_full_profile'),
        ]);

        if (profileResult.error) throw profileResult.error;
        setProfile((profileResult.data as Profile | null) || null);

        const viewerRows = viewerResult.data;
        const viewerRow = Array.isArray(viewerRows) ? viewerRows[0] : null;
        setViewerInterests(sanitizeLifestyleTags(viewerRow?.interests));
      } catch (err: any) {
        console.error('[profile/[id]] load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleStartConversation = async (prefill?: string) => {
    if (!profile?.id || startingChat) return;
    try {
      setStartingChat(true);
      const conversationId = await startConversationWith(profile.id);
      const target = prefill?.trim()
        ? `/chat/${conversationId}?prefill=${encodeURIComponent(prefill.trim())}`
        : `/chat/${conversationId}`;
      router.push(target as any);
    } catch (err: any) {
      Alert.alert(
        t('error') || 'Error',
        err?.message || t('startConversationFailed') || 'Could not start conversation.',
      );
    } finally {
      setStartingChat(false);
    }
  };

  const handleFindCompatibility = () => {
    if (!profile?.id) return;
    // Canonical synastry route accepts profileId. The old /match/[id] route is
    // kept for back-compat by other surfaces, but the profile screen now
    // sends viewers straight to the celestial Compare charts experience.
    router.push(`/premium-screens/synastry?profileId=${encodeURIComponent(profile.id)}` as any);
  };

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT as any} style={styles.container}>
        <ActivityIndicator size="large" color={AppTheme.colors.coral} />
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT as any} style={styles.container}>
        <Text style={styles.unavailableTitle}>
          {t('profileUnavailableTitle') || 'Profile unavailable'}
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backCta}>
          <Text style={styles.backCtaText}>{t('back') || 'Back'}</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const imageSrc = resolveProfileImage(profile) || DEFAULT_PROFILE_IMAGE;

  return (
    <LinearGradient colors={SCREEN_GRADIENT as any} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.photoWrap}>
          <Image source={{ uri: imageSrc }} style={styles.photo} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.photoGradient}
          >
            <Text style={styles.name}>
              {profile.name || t('unknown') || '—'}
              {profile.age ? `, ${profile.age}` : ''}
            </Text>
            {profile.current_city ? (
              <Text style={styles.city}>{profile.current_city}</Text>
            ) : null}
          </LinearGradient>
        </View>

        <View style={styles.body}>
          <View style={styles.signsRow}>
            <View style={styles.signPill}>
              <LuminaryGlyph kind="sun" size="sm" />
              {(() => {
                const k = normalizeZodiacSign(profile.sun_sign);
                return k ? (
                  <ZodiacGlyph sign={k} variant="inline" size="sm" />
                ) : null;
              })()}
              <Text style={styles.signText}>{profile.sun_sign || '?'}</Text>
            </View>
            <View style={styles.signPill}>
              <LuminaryGlyph kind="moon" size="sm" />
              {(() => {
                const k = normalizeZodiacSign(profile.moon_sign);
                return k ? (
                  <ZodiacGlyph sign={k} variant="inline" size="sm" />
                ) : null;
              })()}
              <Text style={styles.signText}>{profile.moon_sign || '?'}</Text>
            </View>
            <View style={styles.signPill}>
              <LuminaryGlyph kind="rising" size="sm" />
              {(() => {
                const k = normalizeZodiacSign(profile.rising_sign);
                return k ? (
                  <ZodiacGlyph sign={k} variant="inline" size="sm" />
                ) : null;
              })()}
              <Text style={styles.signText}>{profile.rising_sign || '?'}</Text>
            </View>
          </View>

          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Macro connection intentions chip cluster — rendered only when
              the profile signals more than the default 'love' set. */}
          {(() => {
            const intentions = sanitizeConnectionIntentions(profile.connection_intentions);
            const isDefaultOnly =
              intentions.length === DEFAULT_CONNECTION_INTENTIONS.length &&
              intentions.every((k) => DEFAULT_CONNECTION_INTENTIONS.includes(k));
            if (isDefaultOnly) return null;
            return (
              <View style={styles.intentionChipCluster}>
                <Text style={styles.intentionChipPrefix}>
                  {t('discoverChipOpenTo') || 'Open to:'}
                </Text>
                {intentions.map((key) => {
                  const def = CONNECTION_INTENTIONS.find((i) => i.key === key);
                  if (!def) return null;
                  return (
                    <View key={key} style={styles.intentionChip}>
                      <Text style={styles.intentionChipText}>{t(def.labelKey)}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          <View style={styles.mvpWrap}>
            <ProfilePublicMVPSections
              relationshipIntent={profile.relationship_intent}
              personalValues={profile.personal_values}
              interests={profile.interests}
              lookingForText={profile.looking_for_text}
              prompts={profile.prompts}
              icebreakerQuestion={profile.icebreaker_question}
              viewerInterests={viewerInterests}
              onSendIcebreaker={(q) => handleStartConversation(q)}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => handleStartConversation()}
              disabled={startingChat}
            >
              <Text style={styles.primaryButtonText}>
                {startingChat
                  ? t('starting') || 'Starting…'
                  : t('publicStartConversation') || t('sendMessage') || 'Start conversation'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleFindCompatibility}>
              <Text style={styles.secondaryButtonText}>
                {t('publicCompareCharts') || t('findYourCompatibility') || 'Compare charts'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tertiaryButton} onPress={() => router.back()}>
              <Text style={styles.tertiaryButtonText}>{t('back') || 'Back'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40 },
  unavailableTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 80,
    textAlign: 'center',
  },
  backCta: {
    alignSelf: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: AppTheme.colors.coral,
  },
  backCtaText: { color: '#fff', fontWeight: '700' },

  photoWrap: { width: '100%', height: 480, position: 'relative' },
  photo: { width: '100%', height: '100%' },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 80,
  },
  name: { color: '#fff', fontSize: 28, fontWeight: '700' },
  city: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 },

  body: { padding: 20, gap: 16 },
  signsRow: { flexDirection: 'row', gap: 8 },
  signPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  signText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  bio: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 4,
  },

  mvpWrap: { marginTop: 4 },

  intentionChipCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  intentionChipPrefix: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  intentionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  intentionChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  actions: { gap: 12, marginTop: 8 },
  primaryButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    backgroundColor: 'rgba(124,108,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,108,255,0.4)',
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tertiaryButton: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tertiaryButtonText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 14 },
});
