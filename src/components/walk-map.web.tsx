import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CATEGORY_ICON, SeverityPill, severityColor, timeAgo } from '@/components/zone-info';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WalkMapProps } from '@/components/walk-map';

export type { MapPin, MapZone, WalkMapProps } from '@/components/walk-map';

// react-native-maps has no web support. On web we show the same information as a tappable list
// (reports first, then meetup points) so the flow still works in a browser demo.
export function WalkMap({ pins, zones = [], focusZoneId, onPinPress, height = 320, topInset = 0, children }: WalkMapProps) {
  const theme = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const expanded = open ?? focusZoneId ?? null;
  return (
    <View style={[styles.box, { minHeight: Math.min(height, 260), backgroundColor: theme.backgroundSelected }]}>
      <ScrollView style={{ maxHeight: height }} contentContainerStyle={[styles.list, { paddingTop: topInset + Spacing.three }]}>
        <ThemedText type="small" themeColor="textSecondary">
          The live map runs in the mobile app (Expo Go). Here&apos;s what&apos;s on it:
        </ThemedText>
        {zones.map((z) => (
          <Pressable
            key={`zone-${z.id}`}
            onPress={() => setOpen(expanded === z.id ? '' : z.id)}
            style={[styles.row, { backgroundColor: theme.card, borderColor: expanded === z.id ? severityColor(z.severity) : theme.border }]}>
            <Ionicons name={CATEGORY_ICON[z.category ?? 'other'] ?? 'alert-circle-outline'} size={18} color={severityColor(z.severity)} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{z.title}</ThemedText>
              {expanded === z.id && (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[z.description, z.reports ? `${z.reports} reports` : null, timeAgo(z.updatedAt)].filter(Boolean).join(' · ')}
                  </ThemedText>
                  <SeverityPill severity={z.severity} />
                </>
              )}
            </View>
          </Pressable>
        ))}
        {pins.map((pin) => (
          <Pressable
            key={pin.id}
            onPress={() => onPinPress?.(pin.id)}
            style={[styles.row, { backgroundColor: theme.card, borderColor: pin.kind === 'meetup-selected' ? theme.gold : theme.border }]}>
            <Ionicons
              name={pin.kind === 'destination' ? 'location' : pin.kind === 'walker' ? 'walk' : 'people-outline'}
              size={18}
              color={pin.kind === 'meetup-selected' ? theme.gold : theme.accent}
            />
            <ThemedText type={pin.kind === 'meetup-selected' ? 'smallBold' : 'small'}>{pin.title}</ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.lg, overflow: 'hidden' },
  list: { padding: Spacing.three, gap: Spacing.two },
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.md, borderWidth: 1 },
});
