import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /** Extra bottom padding so content clears the native tab bar. */
  bottomInset?: number;
  /** Set false when a native header already handles the top safe area. */
  safeTop?: boolean;
}>;

export function Screen({ children, bottomInset = 0, safeTop = true }: ScreenProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={safeTop ? ['top', 'left', 'right'] : ['left', 'right']}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing.five }]}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function Card({ children, tone = 'card' }: PropsWithChildren<{ tone?: 'card' | 'tint' | 'gold' }>) {
  const theme = useTheme();
  const backgroundColor = { card: theme.card, tint: theme.backgroundSelected, gold: theme.goldSoft }[tone];
  return (
    <View style={[styles.card, { backgroundColor, borderColor: tone === 'card' ? theme.border : 'transparent' }]}>
      {children}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
        {...props}
      />
    </View>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <ThemedText type="small" themeColor="danger">
      {message}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    height: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
});
