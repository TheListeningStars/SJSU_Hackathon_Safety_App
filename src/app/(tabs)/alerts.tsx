// Community alerts (Figma screen 3): every active report on campus, live over Supabase Realtime.
// Reporter identity is never shown (incidents carry none, see 0003_incidents.sql).

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ReportSheet } from '@/components/report-sheet';
import { Card, ErrorText, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/walk-preference';
import { CATEGORY_ICON, SeverityPill, severityColor, timeAgo } from '@/components/zone-info';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useIncidents } from '@/hooks/use-incidents';
import { useTheme } from '@/hooks/use-theme';
import type { Incident } from '@/lib/api';
import { CATEGORY_LABEL } from '@/lib/safety';

const FILTERS = ['All', 'High', 'Lighting', 'Blocked', 'Other'] as const;
type Filter = (typeof FILTERS)[number];

const matches = (i: Incident, f: Filter) =>
  f === 'All' ||
  (f === 'High' && i.severity === 'high') ||
  (f === 'Lighting' && i.category === 'broken_lighting') ||
  (f === 'Blocked' && ['blocked_path', 'construction', 'fallen_tree', 'flooding'].includes(i.category)) ||
  (f === 'Other' && !['broken_lighting', 'blocked_path', 'construction', 'fallen_tree', 'flooding'].includes(i.category));

const STATUS: Record<Incident['eaiser_status'], string> = {
  submitted: 'Sent',
  in_progress: 'Being fixed',
  resolved: 'Resolved',
};

export default function AlertsScreen() {
  const theme = useTheme();
  const { incidents, error } = useIncidents();
  const [filter, setFilter] = useState<Filter>('All');
  const [reportOpen, setReportOpen] = useState(false);
  const list = incidents.filter((i) => matches(i, filter));

  return (
    <View style={styles.flex}>
      <Screen bottomInset={BottomTabInset + 72}>
        <View>
          <ThemedText type="subtitle">Community alerts</ThemedText>
          <ThemedText themeColor="textSecondary">Look out for your fellow Spartans.</ThemedText>
        </View>

        <View style={styles.rowBetween}>
          <View style={styles.live}>
            <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            <ThemedText style={[styles.liveText, { color: theme.success }]}>LIVE</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {incidents.length} active on campus
          </ThemedText>
        </View>

        <View style={styles.chips}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} selected={f === filter} onPress={() => setFilter(f)} />
          ))}
        </View>

        <ErrorText message={error} />

        {list.length === 0 && (
          <Card tone="tint">
            <ThemedText type="smallBold">All clear</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {incidents.length ? 'Nothing matches this filter.' : 'No problems reported right now. If you see one, report it below.'}
            </ThemedText>
          </Card>
        )}

        {list.map((i) => (
          <Card key={i.id}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: `${severityColor(i.severity)}22` }]}>
                <Ionicons name={CATEGORY_ICON[i.category] ?? 'alert-circle-outline'} size={22} color={severityColor(i.severity)} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{i.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {timeAgo(i.updated_at)}
                </ThemedText>
              </View>
              <SeverityPill severity={i.severity} />
            </View>
            {(i.building || CATEGORY_LABEL[i.category]) && (
              <ThemedText type="smallBold" themeColor="accent">
                {[i.building, CATEGORY_LABEL[i.category]].filter(Boolean).join(' · ')}
              </ThemedText>
            )}
            {i.summary && (
              <ThemedText type="small" themeColor="textSecondary">
                {i.summary}
              </ThemedText>
            )}
            <View style={styles.rowBetween}>
              <ThemedText style={[styles.tiny, { color: theme.textSecondary }]}>
                {i.reports_count} student{i.reports_count === 1 ? '' : 's'} · {STATUS[i.eaiser_status]} to {i.route_to ?? 'Facilities'}
                {i.eaiser_simulated ? ' (simulated)' : ''}
              </ThemedText>
              <Pressable
                hitSlop={8}
                onPress={() => router.navigate({ pathname: '/', params: { focus: i.id } })}
                accessibilityRole="link">
                <ThemedText style={[styles.tiny, styles.link, { color: theme.accent }]}>View on map ↗</ThemedText>
              </Pressable>
            </View>
          </Card>
        ))}

        <ThemedText style={[styles.tiny, { color: theme.textSecondary }]}>
          Student reports, classified by EAiSER and sent to campus staff. Not emergency monitoring: in an emergency call
          911.
        </ThemedText>
      </Screen>

      <View pointerEvents="box-none" style={[styles.bottom, { bottom: BottomTabInset + Spacing.three }]}>
        <Button title="Report an update" icon="add" onPress={() => setReportOpen(true)} />
      </View>

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} fallbackLocation={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tiny: { fontSize: 11, lineHeight: 15, flexShrink: 1 },
  link: { fontWeight: '700' },
  bottom: { position: 'absolute', left: Spacing.three, right: Spacing.three },
});
