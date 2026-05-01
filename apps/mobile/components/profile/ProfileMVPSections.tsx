// MVP profile sections — values, lifestyle, intent, looking-for, prompts,
// icebreaker. Controlled component: the parent (profile/edit.tsx) owns state,
// passes it in, and receives change callbacks. The parent is also responsible
// for marking isDirty and persisting on save.
//
// All copy goes through LanguageContext.t(). No literal strings outside of
// keys. Internal modal handles the prompt picker.

import { useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  LIFESTYLE_CATEGORIES,
  LIFESTYLE_TAGS,
  MAX_ICEBREAKER_LENGTH,
  MAX_LIFESTYLE_TAGS,
  MAX_LOOKING_FOR_TEXT_LENGTH,
  MAX_PROMPTS,
  MAX_PROMPT_RESPONSE_LENGTH,
  MAX_VALUES,
  PERSONAL_VALUES,
  PROMPT_CATEGORIES,
  PROMPTS,
  RELATIONSHIP_INTENTS,
  type LifestyleCategory,
  type PromptDef,
  type PromptResponse,
  type RelationshipIntent,
  findPrompt,
} from '../../data/profile-fields';

type Props = {
  values: string[];
  onValuesChange: (values: string[]) => void;
  lifestyleTags: string[];
  onLifestyleTagsChange: (tags: string[]) => void;
  intent: RelationshipIntent | null;
  onIntentChange: (intent: RelationshipIntent) => void;
  lookingForText: string;
  onLookingForTextChange: (text: string) => void;
  prompts: PromptResponse[];
  onPromptsChange: (prompts: PromptResponse[]) => void;
  icebreaker: string;
  onIcebreakerChange: (text: string) => void;
};

export default function ProfileMVPSections(props: Props) {
  const { t } = useLanguage();
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  // ── Values ───────────────────────────────────────────────────────────────
  const toggleValue = (key: string) => {
    const has = props.values.includes(key);
    if (has) {
      props.onValuesChange(props.values.filter(v => v !== key));
    } else if (props.values.length < MAX_VALUES) {
      props.onValuesChange([...props.values, key]);
    }
  };

  // ── Lifestyle ────────────────────────────────────────────────────────────
  const toggleLifestyleTag = (key: string) => {
    const has = props.lifestyleTags.includes(key);
    if (has) {
      props.onLifestyleTagsChange(props.lifestyleTags.filter(t => t !== key));
    } else if (props.lifestyleTags.length < MAX_LIFESTYLE_TAGS) {
      props.onLifestyleTagsChange([...props.lifestyleTags, key]);
    }
  };

  // ── Prompts ──────────────────────────────────────────────────────────────
  // Available prompts = those not already in any slot, grouped by category
  // for the picker. Recomputed every render — cheap (≤30 entries) and props
  // identity-changes anyway, so a useMemo here would be dead memoization.
  const usedPromptKeys = new Set(props.prompts.map(p => p.key));
  const pickerSections = PROMPT_CATEGORIES
    .map(cat => ({
      title: t(cat.labelKey) || cat.id,
      data: PROMPTS.filter(p => p.category === cat.id && !usedPromptKeys.has(p.key)),
    }))
    .filter(s => s.data.length > 0);

  const handlePickPrompt = (slotIndex: number) => setPickerSlot(slotIndex);

  const handleSelectPrompt = (promptKey: string) => {
    if (pickerSlot === null) return;
    const next = [...props.prompts];
    if (pickerSlot < next.length) {
      next[pickerSlot] = { key: promptKey, response: next[pickerSlot].response };
    } else {
      next.push({ key: promptKey, response: '' });
    }
    props.onPromptsChange(next.slice(0, MAX_PROMPTS));
    setPickerSlot(null);
  };

  const handleUpdatePromptResponse = (index: number, text: string) => {
    const next = [...props.prompts];
    next[index] = { ...next[index], response: text.slice(0, MAX_PROMPT_RESPONSE_LENGTH) };
    props.onPromptsChange(next);
  };

  const handleRemovePrompt = (index: number) => {
    props.onPromptsChange(props.prompts.filter((_, i) => i !== index));
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View>
      {/* ── Relationship intent (required) ─────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('relationshipIntent') || 'What I\'m here for'}</Text>
          <Text style={s.requiredBadge}>*</Text>
        </View>
        <Text style={s.hint}>
          {t('relationshipIntentHint') || 'What you\'re looking for right now (required)'}
        </Text>
        <View style={s.intentGrid}>
          {RELATIONSHIP_INTENTS.map(intent => {
            const active = props.intent === intent.key;
            return (
              <TouchableOpacity
                key={intent.key}
                style={[s.intentCard, active && s.intentCardActive]}
                onPress={() => props.onIntentChange(intent.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={s.intentEmoji}>{intent.emoji}</Text>
                <Text style={[s.intentLabel, active && s.intentLabelActive]}>
                  {t(intent.labelKey)}
                </Text>
                <Text style={s.intentDesc} numberOfLines={2}>
                  {t(intent.descriptionKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Looking for text ──────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('lookingForText') || 'What I\'m looking for'}</Text>
          <Text style={s.charCount}>
            {props.lookingForText.length}/{MAX_LOOKING_FOR_TEXT_LENGTH}
          </Text>
        </View>
        <TextInput
          style={[s.textInput, s.textInputMultiline]}
          value={props.lookingForText}
          onChangeText={text =>
            props.onLookingForTextChange(text.slice(0, MAX_LOOKING_FOR_TEXT_LENGTH))
          }
          placeholder={t('lookingForTextPlaceholder') || 'Someone who…'}
          placeholderTextColor={AppTheme.colors.textMuted}
          multiline
          maxLength={MAX_LOOKING_FOR_TEXT_LENGTH}
          textAlignVertical="top"
        />
      </View>

      {/* ── Personal values ──────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('myValues') || 'My values'}</Text>
          <Text style={s.charCount}>{props.values.length}/{MAX_VALUES}</Text>
        </View>
        <Text style={s.hint}>{t('myValuesHint') || 'Pick up to 5 values that represent you'}</Text>
        <View style={s.chipsRow}>
          {PERSONAL_VALUES.map(v => {
            const active = props.values.includes(v.key);
            const disabled = !active && props.values.length >= MAX_VALUES;
            return (
              <TouchableOpacity
                key={v.key}
                style={[s.chip, active && s.chipActive, disabled && s.chipDisabled]}
                onPress={() => toggleValue(v.key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled }}
              >
                <Text style={s.chipEmoji}>{v.emoji}</Text>
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {t(v.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Lifestyle tags ──────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('lifestyle') || 'Lifestyle'}</Text>
          <Text style={s.charCount}>
            {props.lifestyleTags.length}/{MAX_LIFESTYLE_TAGS}
          </Text>
        </View>
        <Text style={s.hint}>
          {t('lifestyleHint') || 'Tastes, sports, music — to spark conversation'}
        </Text>
        {LIFESTYLE_CATEGORIES.map(cat => (
          <View key={cat.id} style={s.lifestyleGroup}>
            <Text style={s.lifestyleGroupTitle}>
              {cat.emoji} {t(cat.labelKey)}
            </Text>
            <View style={s.chipsRow}>
              {LIFESTYLE_TAGS.filter(tag => tag.category === (cat.id as LifestyleCategory)).map(tag => {
                const active = props.lifestyleTags.includes(tag.key);
                const disabled = !active && props.lifestyleTags.length >= MAX_LIFESTYLE_TAGS;
                return (
                  <TouchableOpacity
                    key={tag.key}
                    style={[s.chip, active && s.chipActive, disabled && s.chipDisabled]}
                    onPress={() => toggleLifestyleTag(tag.key)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled }}
                  >
                    <Text style={s.chipEmoji}>{tag.emoji}</Text>
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {t(tag.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {/* ── Prompts ─────────────────────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('myPrompts') || 'My prompts'}</Text>
        <Text style={s.hint}>
          {t('myPromptsHint') || 'Pick 3 questions and answer them. This is what makes your profile unique.'}
        </Text>

        {/* Filled slots */}
        {props.prompts.map((p, idx) => {
          const def = findPrompt(p.key);
          if (!def) return null;
          return (
            <View key={`${p.key}-${idx}`} style={s.promptSlotFilled}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.promptQuestion}>{t(def.labelKey)}</Text>
                <TouchableOpacity onPress={() => handleRemovePrompt(idx)} hitSlop={8}>
                  <Text style={s.removeText}>{t('removePrompt') || 'Remove'}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[s.textInput, s.textInputMultiline]}
                value={p.response}
                onChangeText={text => handleUpdatePromptResponse(idx, text)}
                placeholder={t('promptResponsePlaceholder') || 'Your answer…'}
                placeholderTextColor={AppTheme.colors.textMuted}
                multiline
                maxLength={MAX_PROMPT_RESPONSE_LENGTH}
                textAlignVertical="top"
              />
              <Text style={s.charCountRight}>
                {p.response.length}/{MAX_PROMPT_RESPONSE_LENGTH}
              </Text>
            </View>
          );
        })}

        {/* Empty slot ⇒ "Add a prompt" button (only if under cap) */}
        {props.prompts.length < MAX_PROMPTS && (
          <TouchableOpacity
            style={s.promptAddBtn}
            onPress={() => handlePickPrompt(props.prompts.length)}
            accessibilityRole="button"
          >
            <Text style={s.promptAddText}>+ {t('addPrompt') || 'Add a prompt'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Icebreaker ─────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('icebreakerSection') || 'Icebreaker'}</Text>
          <Text style={s.charCount}>
            {props.icebreaker.length}/{MAX_ICEBREAKER_LENGTH}
          </Text>
        </View>
        <Text style={s.hint}>
          {t('icebreakerHint') || 'A question you\'d love to be asked first'}
        </Text>
        <TextInput
          style={s.textInput}
          value={props.icebreaker}
          onChangeText={text =>
            props.onIcebreakerChange(text.slice(0, MAX_ICEBREAKER_LENGTH))
          }
          placeholder={t('icebreakerPlaceholder') || 'e.g. What\'s the last thing that made you laugh out loud?'}
          placeholderTextColor={AppTheme.colors.textMuted}
          maxLength={MAX_ICEBREAKER_LENGTH}
        />
      </View>

      {/* ── Prompt picker modal ────────────────────────────────── */}
      <Modal
        visible={pickerSlot !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerSlot(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setPickerSlot(null)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t('choosePrompt') || 'Pick a question'}</Text>
              <TouchableOpacity onPress={() => setPickerSlot(null)} hitSlop={10}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <SectionList
              sections={pickerSections}
              keyExtractor={(item: PromptDef) => item.key}
              stickySectionHeadersEnabled={false}
              renderItem={({ item }: { item: PromptDef }) => (
                <TouchableOpacity
                  style={s.modalRow}
                  onPress={() => handleSelectPrompt(item.key)}
                >
                  <Text style={s.modalRowText}>{t(item.labelKey)}</Text>
                </TouchableOpacity>
              )}
              renderSectionHeader={({ section }) => (
                <Text style={s.modalSectionHeader}>{section.title}</Text>
              )}
              ItemSeparatorComponent={() => <View style={s.modalSep} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    backgroundColor: AppTheme.colors.panel,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  hint: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
    marginBottom: 12,
  },
  charCount: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  charCountRight: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  requiredBadge: {
    color: AppTheme.colors.coral,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },

  // Inputs
  textInput: {
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: AppTheme.colors.textPrimary,
    fontSize: 15,
  },
  textInputMultiline: {
    minHeight: 80,
    paddingTop: 12,
  },

  // Intent grid (5 cards: 3 row + 2 row)
  intentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  intentCard: {
    width: '48%',
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 14,
    padding: 12,
    alignItems: 'flex-start',
  },
  intentCardActive: {
    borderColor: AppTheme.colors.coral,
    backgroundColor: 'rgba(232,93,117,0.10)',
  },
  intentEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  intentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 2,
  },
  intentLabelActive: {
    color: AppTheme.colors.coral,
  },
  intentDesc: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    lineHeight: 14,
  },

  // Chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 20,
    gap: 6,
  },
  chipActive: {
    borderColor: AppTheme.colors.coral,
    backgroundColor: 'rgba(232,93,117,0.10)',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipText: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: AppTheme.colors.coral,
  },

  // Lifestyle groups
  lifestyleGroup: {
    marginBottom: 14,
  },
  lifestyleGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textSecondary,
    marginBottom: 8,
  },

  // Prompts
  promptSlotFilled: {
    backgroundColor: AppTheme.colors.glass,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  promptQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginRight: 8,
  },
  removeText: {
    fontSize: 13,
    color: AppTheme.colors.coral,
  },
  promptAddBtn: {
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1.5,
    borderColor: AppTheme.colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  promptAddText: {
    color: AppTheme.colors.coral,
    fontSize: 14,
    fontWeight: '600',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: AppTheme.colors.canvasAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  modalClose: {
    fontSize: 22,
    color: AppTheme.colors.textMuted,
  },
  modalRow: {
    paddingVertical: 14,
  },
  modalRowText: {
    fontSize: 15,
    color: AppTheme.colors.textPrimary,
  },
  modalSep: {
    height: 1,
    backgroundColor: AppTheme.colors.border,
  },
  modalSectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: AppTheme.colors.textMuted,
    marginTop: 16,
    marginBottom: 4,
  },
});
