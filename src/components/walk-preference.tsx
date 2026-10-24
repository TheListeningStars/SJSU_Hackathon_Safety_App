// "Who do you want to walk with?" Co-ed, or only students of your gender (matching enforces it in
// 0004_walking_preferences.sql). Gender is private: it's never shown to other students.

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Gender, WalkWith } from '@/lib/api';

const GENDERS: { value: Gender | null; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: null, label: 'Prefer not to say' },
];

export function WalkPreference({
  gender,
  walkWith,
  onChange,
  genderLocked,
}: {
  gender: Gender | null;
  walkWith: WalkWith;
  onChange: (next: { gender: Gender | null; walkWith: WalkWith }) => void;
  /** After ID verification gender can't be changed in the app. */
  genderLocked?: boolean;
}) {
  const genderLabel = GENDERS.find((g) => g.value === gender)?.label ?? 'Prefer not to say';
  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">Your gender</ThemedText>
      {genderLocked ? (
        <ThemedText type="small" themeColor="textSecondary">
          {genderLabel} · locked after ID verification
        </ThemedText>
      ) : (
        <View style={styles.row}>
          {GENDERS.map((g) => (
            <Chip
              key={g.label}
              label={g.label}
              selected={g.value === gender}
              onPress={() => onChange({ gender: g.value, walkWith: g.value ? walkWith : 'anyone' })}
            />
          ))}
        </View>
      )}

      <ThemedText type="smallBold" style={styles.gap}>
        Who do you want to walk with?
      </ThemedText>
      <Option
        icon="people-outline"
        title="Anyone (co-ed)"
        body="More matches, so you're less likely to walk alone."
        selected={walkWith === 'anyone'}
        onPress={() => onChange({ gender, walkWith: 'anyone' })}
      />
      <Option
        icon="person-outline"
        title="Only my gender"
        body={gender ? 'You\'ll only be grouped with students who share your gender.' : 'Pick your gender above to use this.'}
        selected={walkWith === 'same_gender'}
        disabled={!gender}
        onPress={() => onChange({ gender, walkWith: 'same_gender' })}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Private: other students never see your gender or this choice.
      </ThemedText>
    </View>
  );
}

function Option({
  icon,
  title,
  body,
  selected,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.accent : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.card,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <Ionicons name={icon} size={22} color={selected ? theme.accent : theme.textSecondary} />
      <View style={styles.flex}>
        <ThemedText type="smallBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {body}
        </ThemedText>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.accent : theme.border} />
    </Pressable>
  );
}

/** Pill-shaped toggle used across the app (filters, meetup points, departure times). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.card, borderColor: selected ? theme.accent : theme.border },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  gap: { marginTop: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
