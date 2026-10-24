/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Pack Track palette (from the Figma design): SJSU navy and blue with gold accents.
export const Colors = {
  light: {
    text: '#172B40',
    background: '#ffffff',
    backgroundElement: '#F5F7FA',
    backgroundSelected: '#EAF2FA',
    textSecondary: '#647487',
    accent: '#0055A2',
    onAccent: '#ffffff',
    success: '#23725C',
    warning: '#94621B',
    danger: '#C62828',
    navy: '#073767',
    gold: '#E5A823',
    goldSoft: '#FFF3D7',
    border: '#DFE6ED',
    card: '#ffffff',
  },
  dark: {
    text: '#F2F5F8',
    background: '#0B1622',
    backgroundElement: '#132232',
    backgroundSelected: '#1B3550',
    textSecondary: '#9AA8B6',
    accent: '#5AA7F0',
    onAccent: '#001A33',
    success: '#4CC38A',
    warning: '#F0B54A',
    danger: '#FF6B6B',
    navy: '#073767',
    gold: '#E5A823',
    goldSoft: '#3A2E12',
    border: '#22364A',
    card: '#132232',
  },
} as const;

/** Severity colours used for danger zones and alert pills: low green, medium yellow, high red. */
export const SeverityColor = { low: '#23A26D', medium: '#E5A823', high: '#D64545' } as const;

export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** SJSU UPD Evening Guide / SafeWalk escort line — confirm the number before demoing. */
export const SafeWalkPhone = '4089242222';
export const EmergencyPhone = '911';

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
