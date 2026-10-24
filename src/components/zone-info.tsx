// Shared helpers for showing reported problems (map, Alerts tab, dashboard). Kept out of walk-map.tsx
// so web, which swaps in walk-map.web.tsx, gets them too.

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, SeverityColor } from '@/constants/theme';

export const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  broken_lighting: 'flash-off-outline',
  blocked_path: 'remove-circle-outline',
  flooding: 'water-outline',
  construction: 'construct-outline',
  fallen_tree: 'leaf-outline',
  fire_hazard: 'flame-outline',
  unsafe_conditions: 'warning-outline',
  safety_concern: 'shield-outline',
  other: 'alert-circle-outline',
};

export const severityColor = (s: string) => SeverityColor[s as keyof typeof SeverityColor] ?? SeverityColor.medium;

export function timeAgo(iso?: string) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function SeverityPill({ severity }: { severity: string }) {
  const color = severityColor(severity);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22` }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={[styles.pillText, { color }]}>{severity === 'high' ? 'High' : severity === 'low' ? 'Low' : 'Medium'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  pillText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
