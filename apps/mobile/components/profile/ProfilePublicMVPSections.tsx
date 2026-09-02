// Read-only counterpart to ProfileMVPSections — renders the new MVP fields
// (intent, looking-for, lifestyle tags, prompts, icebreaker) on a viewer's
// discover card. Pure display: no save logic, no state mutation.
//
// Shared-tag highlight: the parent passes the viewer's own interests so the
// component can mark tags both profiles share with a small "in common" badge.
//
// onSendIcebreaker is the conversation-spark CTA — when the viewer taps the
// icebreaker, the parent decides what to do (open chat, prefill the message,
// etc.). Optional; if absent the icebreaker is shown but non-interactive.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  // findIntent — no longer used here: the legacy `relationship_intent`
  // pill has been removed from the public card in favor of the macro
  // `Open to` chip cluster rendered by the parent (discover.tsx,
  // profile/[id].tsx). The prop is still accepted for back-compat.
  findLifestyleTag,
  findPrompt,
  findValue,
  sanitizeLifestyleTags,
  sanitizePersonalValues,
  sanitizePromptResponses,
  type PromptResponse,
} from '../../data/profile-fields';

type Props = {
  // Raw data from get_discoverable_profiles (snake_case, possibly null).
  // The component sanitizes internally so the parent doesn't have to.
  relationshipIntent: string | null | undefined;
  personalValues: unknown;
  interests: unknown;
  lookingForText: string | null | undefined;
  prompts: unknown;
  icebreakerQuestion: string | null | undefined;

  // Viewer's own tags for shared-tag highlighting. Pass [] if unknown.
  viewerInterests: string[];

  // Optional CTA — tap on icebreaker question.
  onSendIcebreaker?: (question: string) => void;
};

export default function ProfilePublicMVPSections(props: Props) {
  const { t } = useLanguage();

  // props.relationshipIntent is still accepted for back-compat but the
  // legacy pill is no longer rendered here — see import comment above.
  const values = sanitizePersonalValues(props.personalValues);
  const tags = sanitizeLifestyleTags(props.interests);
  const lookingFor = (props.lookingForText || '').trim();
  const prompts: PromptResponse[] = sanitizePromptResponses(props.prompts).filter(
    p => p.response.trim().length > 0
  );
  const icebreaker = (props.icebreakerQuestion || '').trim();
  const viewerSet = new Set(props.viewerInterests);

  // Render nothing if everything is empty — keeps the card lean for legacy
  // profiles that haven't yet filled in any MVP field.
  if (!values.length && !tags.length && !lookingFor && !prompts.length && !icebreaker) {
    return null;
  }

  return (
    <View style={s.root}>
      {/* Looking for — short blockquote */}
      {!!lookingFor && (
        <View style={s.block}>
          <Text style={s.blockLabel}>{t('publicLookingFor') || 'Looking for'}</Text>
          <Text style={s.blockBody} numberOfLines={3}>{lookingFor}</Text>
        </View>
      )}

      {/* Personal values — chips, no highlight (no shared-value concept) */}
      {values.length > 0 && (
        <View style={s.block}>
          <Text style={s.blockLabel}>{t('publicValues') || 'Values'}</Text>
          <View style={s.chipsRow}>
            {values.map(key => {
              const v = findValue(key);
              if (!v) return null;
              return (
                <View key={key} style={s.chip}>
                  <Text style={s.chipEmoji}>{v.emoji}</Text>
                  <Text style={s.chipText}>{t(v.labelKey)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Lifestyle tags — shared ones highlighted */}
      {tags.length > 0 && (
        <View style={s.block}>
          <View style={s.blockHeader}>
            <Text style={s.blockLabel}>{t('publicLifestyle') || 'Lifestyle'}</Text>
            {(() => {
              const sharedCount = tags.filter(k => viewerSet.has(k)).length;
              return sharedCount > 0 ? (
                <Text style={s.sharedCount}>
                  {t('tagsInCommon', { count: sharedCount }) || `${sharedCount} in common`}
                </Text>
              ) : null;
            })()}
          </View>
          <View style={s.chipsRow}>
            {tags.map(key => {
              const tag = findLifestyleTag(key);
              if (!tag) return null;
              const shared = viewerSet.has(key);
              return (
                <View key={key} style={[s.chip, shared && s.chipShared]}>
                  <Text style={s.chipEmoji}>{tag.emoji}</Text>
                  <Text style={[s.chipText, shared && s.chipTextShared]}>
                    {t(tag.labelKey)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Prompts — display each as quote-card */}
      {prompts.map((p, idx) => {
        const def = findPrompt(p.key);
        if (!def) return null;
        return (
          <View key={`${p.key}-${idx}`} style={s.promptCard}>
            <Text style={s.promptQuestion}>{t(def.labelKey)}</Text>
            <Text style={s.promptResponse}>{p.response}</Text>
          </View>
        );
      })}

      {/* Icebreaker — CTA card to spark conversation */}
      {!!icebreaker && (
        <TouchableOpacity
          style={s.icebreakerCard}
          onPress={() => props.onSendIcebreaker?.(icebreaker)}
          disabled={!props.onSendIcebreaker}
          activeOpacity={props.onSendIcebreaker ? 0.85 : 1}
          accessibilityRole={props.onSendIcebreaker ? 'button' : 'text'}
        >
          <Text style={s.icebreakerLabel}>
            {t('publicIcebreakerLabel') || 'Ask me'}
          </Text>
          <Text style={s.icebreakerQuestion}>“{icebreaker}”</Text>
          {props.onSendIcebreaker && (
            <Text style={s.icebreakerCta}>
              {t('publicIcebreakerCta') || 'Tap to ask →'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 10 },

  // Intent
  intentPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(201, 134, 146, 0.15)',
    borderRadius: 14,
    gap: 4,
  },
  intentEmoji: { fontSize: 13 },
  intentText: { color: AppTheme.colors.coral, fontSize: 12, fontWeight: '600' },

  // Block (looking-for, values, lifestyle)
  block: { marginTop: 4 },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: AppTheme.colors.goldMuted,
  },
  blockBody: {
    fontSize: 13,
    color: AppTheme.colors.textPrimary,
    lineHeight: 18,
  },
  sharedCount: {
    fontSize: 11,
    color: AppTheme.colors.gold,
    fontWeight: '600',
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    gap: 4,
  },
  chipShared: {
    backgroundColor: 'rgba(218, 181, 109, 0.18)',
    borderWidth: 1,
    borderColor: AppTheme.colors.gold,
  },
  chipEmoji: { fontSize: 12 },
  chipText: { fontSize: 12, color: AppTheme.colors.textSecondary },
  chipTextShared: { color: AppTheme.colors.gold, fontWeight: '600' },

  // Prompts
  promptCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  promptQuestion: {
    fontSize: 12,
    fontWeight: '600',
    color: AppTheme.colors.textMuted,
    marginBottom: 4,
  },
  promptResponse: {
    fontSize: 13,
    color: AppTheme.colors.textPrimary,
    lineHeight: 18,
  },

  // Icebreaker
  icebreakerCard: {
    backgroundColor: 'rgba(91, 84, 168, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91, 84, 168, 0.35)',
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  icebreakerLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: AppTheme.colors.cosmic,
    marginBottom: 4,
  },
  icebreakerQuestion: {
    fontSize: 14,
    color: AppTheme.colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  icebreakerCta: {
    marginTop: 6,
    fontSize: 12,
    color: AppTheme.colors.cosmic,
    fontWeight: '600',
  },
});
