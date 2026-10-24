import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Button({ title, variant = 'primary', loading, compact, disabled, icon, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundSelected,
    outline: theme.card,
    danger: theme.danger,
  }[variant];
  const foreground = variant === 'secondary' || variant === 'outline' ? theme.accent : theme.onAccent;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        variant === 'outline' && { borderWidth: 1, borderColor: theme.border },
        {
          backgroundColor: background,
          opacity: isDisabled ? 0.5 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={compact ? 16 : 20} color={foreground} />}
          <ThemedText type="smallBold" style={{ color: foreground, fontSize: compact ? 14 : 16 }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    gap: 6,
  },
});
