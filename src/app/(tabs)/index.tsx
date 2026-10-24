// Walk planner: choose a meetup point and destination, fetch a walking route, then
// create_walk_request + find_or_create_group (matching happens in Postgres, see AGENTS.md).

import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ReportSheet } from '@/components/report-sheet';
import { Card, ErrorText, Screen } from '@/components/screen';
import { SafetyBar } from '@/components/safety-bar';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/avatar';
import { Chip } from '@/components/walk-preference';
import { WalkMap, type MapPin } from '@/components/walk-map';
import { useIncidents } from '@/hooks/use-incidents';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createWalkRequest, findOrCreateGroup, getActiveGroup, listMeetupPoints, type MeetupPoint } from '@/lib/api';
import {
  formatDistance,
  formatDuration,
  toGeoJsonCoordinates,
  type LatLng,
  type WalkingRoute,
} from '@/lib/directions';
import { blockingZones, CATEGORY_LABEL, routeAvoidingZones } from '@/lib/safety';
import { useSession } from '@/providers/session';

const DEPART_OPTIONS = [
  { label: 'Now', minutes: 0 },
  { label: 'In 15 min', minutes: 15 },
  { label: 'In 30 min', minutes: 30 },
  { label: 'In 1 hr', minutes: 60 },
];

export default function WalkScreen() {
  const { profile, refreshProfile } = useSession();
  const [points, setPoints] = useState<MeetupPoint[]>([]);
  const [meetupId, setMeetupId] = useState<string | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destLabel, setDestLabel] = useState('Dropped pin');
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [departIn, setDepartIn] = useState(0);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avoiding, setAvoiding] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const { zones, mapZones, incidents } = useIncidents();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const theme = useTheme();

  const verified = profile?.verification_status === 'verified';
  const meetup = points.find((p) => p.id === meetupId) ?? null;

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
    listMeetupPoints()
      .then((list) => {
        setPoints(list);
        setMeetupId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
      getActiveGroup()
        .then(setActiveGroup)
        .catch(() => setActiveGroup(null));
    }, [refreshProfile])
  );

  // Only the latest route request may update state, in case the user taps around quickly.
  const routeRequest = useRef(0);
  const updateRoute = async (from: MeetupPoint | null, to: LatLng | null) => {
    const requestNo = ++routeRequest.current;
    setRoute(null);
    setAvoiding([]);
    if (!from || !to) return;
    setRouteLoading(true);
    try {
      // Plan around anything already reported on the way.
      const plan = await routeAvoidingZones({ latitude: from.lat, longitude: from.lng }, to, zones);
      if (requestNo === routeRequest.current) {
        setRoute(plan.route);
        setAvoiding(plan.avoided.map((z) => CATEGORY_LABEL[z.category] ?? z.title));
      }
    } catch (e) {
      if (requestNo === routeRequest.current) setError((e as Error).message);
    } finally {
      if (requestNo === routeRequest.current) setRouteLoading(false);
    }
  };

  const selectMeetup = (id: string) => {
    setMeetupId(id);
    updateRoute(points.find((p) => p.id === id) ?? null, destination);
  };

  const pickDestination = async (coordinate: LatLng) => {
    setDestination(coordinate);
    setDestLabel('Dropped pin');
    setError(null);
    updateRoute(meetup, coordinate);
    try {
      const [place] = await Location.reverseGeocodeAsync(coordinate);
      if (place) setDestLabel([place.streetNumber, place.street].filter(Boolean).join(' ') || place.name || 'Dropped pin');
    } catch {
      // A label is nice to have; the coordinates are what matter.
    }
  };

  const findBuddies = async () => {
    if (!meetup || !destination || !route) return;
    setMatching(true);
    setError(null);
    try {
      const requestId = await createWalkRequest({
        meetupPointId: meetup.id,
        destLat: destination.latitude,
        destLng: destination.longitude,
        destLabel,
        route: toGeoJsonCoordinates(route.points),
        departAt: minutesFromNow(departIn),
      });
      const groupId = await findOrCreateGroup(requestId);
      router.push({ pathname: '/group/[id]', params: { id: groupId } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatching(false);
    }
  };

  // A new report lands on the route I'm planning: plan again around it.
  const blocked = route ? blockingZones(route.points, zones).map((z) => z.id).join(',') : '';
  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => updateRoute(meetup, destination), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  const pins: MapPin[] = [
    ...points.map<MapPin>((p) => ({
      id: p.id,
      title: p.name,
      description: p.description ?? undefined,
      latitude: p.lat,
      longitude: p.lng,
      kind: p.id === meetupId ? 'meetup-selected' : 'meetup',
    })),
    ...(destination ? [{ id: 'destination', title: destLabel, kind: 'destination' as const, ...destination }] : []),
  ];

  const high = incidents.filter((i) => i.severity === 'high').length;

  return (
    <View style={styles.flex}>
      <Screen bottomInset={BottomTabInset + 72}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <ThemedText type="subtitle">Hey, {profile?.first_name ?? 'Spartan'} 👋</ThemedText>
            <ThemedText themeColor="textSecondary">Your next walk starts here.</ThemedText>
          </View>
          <Pressable onPress={() => router.navigate('/profile')} accessibilityLabel="Your profile">
            <Avatar path={profile?.avatar_path} name={profile?.first_name} size={42} />
          </Pressable>
        </View>

        <WalkMap
          height={380}
          topInset={68}
          pins={pins}
          route={route?.points}
          zones={mapZones}
          focusZoneId={focus ?? null}
          onPinPress={(id) => points.some((p) => p.id === id) && selectMeetup(id)}
          onMapPress={pickDestination}>
          <View style={[styles.search, { backgroundColor: theme.card }]}>
            <Ionicons name="search" size={20} color={theme.accent} />
            <View style={styles.flex}>
              <ThemedText style={styles.eyebrowMuted}>WALKING TOWARD</ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {destination ? destLabel : 'Hold the map where you\'re headed'}
              </ThemedText>
            </View>
            {destination && (
              <ThemedText type="small" themeColor="textSecondary">
                {routeLoading ? '…' : route ? formatDuration(route.durationS) : ''}
              </ThemedText>
            )}
          </View>
        </WalkMap>

        {avoiding.length > 0 && (
          <Card tone="gold">
            <ThemedText type="smallBold" themeColor="warning">
              Routed around {avoiding.join(', ')} reported by other students.
            </ThemedText>
          </Card>
        )}
        {route?.isFallback && (
          <ThemedText type="small" themeColor="warning">
            No Google Maps key set, so this is a straight-line estimate. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for real walking routes.
          </ThemedText>
        )}

        {activeGroup && (
          <Card tone="tint">
            <ThemedText style={styles.eyebrow}>● WALK IN PROGRESS</ThemedText>
            <Button
              title="Return to your pack"
              icon="people-outline"
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: activeGroup } })}
            />
          </Card>
        )}

        {!verified && (
          <Card tone="gold">
            <ThemedText type="smallBold" themeColor="warning">
              Student ID under review
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You can plan a route now. Matching unlocks once your ID is approved.
            </ThemedText>
          </Card>
        )}

        <Card>
          <View style={styles.rowBetween}>
            <ThemedText style={styles.eyebrow}>● HEAD TO YOUR MEETUP</ThemedText>
            {route && (
              <ThemedText type="small" themeColor="textSecondary">
                {formatDistance(route.distanceM)} · {formatDuration(route.durationS)}
              </ThemedText>
            )}
          </View>
          <View style={styles.place}>
            <View style={[styles.badge, { backgroundColor: theme.goldSoft }]}>
              <Ionicons name="people" size={22} color={theme.navy} />
            </View>
            <View style={styles.flex}>
              <ThemedText style={styles.placeName}>{meetup?.name ?? 'Pick a meetup point'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {meetup?.description ?? 'Safe, well-lit spots where packs gather.'}
                {meetup?.is_staffed ? ' · staffed' : ''}
              </ThemedText>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {points.map((p) => (
              <Chip key={p.id} label={p.name} selected={p.id === meetupId} onPress={() => selectMeetup(p.id)} />
            ))}
          </ScrollView>

          <ThemedText type="smallBold" style={styles.gapTop}>
            Leaving
          </ThemedText>
          <View style={styles.chips}>
            {DEPART_OPTIONS.map((o) => (
              <Chip key={o.minutes} label={o.label} selected={o.minutes === departIn} onPress={() => setDepartIn(o.minutes)} />
            ))}
          </View>

          <ErrorText message={error} />
          <Button
            icon="people-outline"
            title={findButtonTitle({ verified, hasActiveGroup: !!activeGroup, hasDestination: !!destination, routeLoading, hasRoute: !!route })}
            onPress={findBuddies}
            loading={matching}
            disabled={!verified || !route || !!activeGroup}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {profile?.walk_with === 'same_gender' ? 'Matching only with students of your gender (change in Profile).' : 'Matching with anyone heading your way (change in Profile).'}
          </ThemedText>
        </Card>

        <Pressable onPress={() => router.navigate('/alerts')}>
          <Card>
            <View style={styles.rowBetween}>
              <ThemedText style={[styles.eyebrow, { color: theme.success }]}>● LIVE</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </View>
            <ThemedText type="smallBold">
              {incidents.length
                ? `${incidents.length} problem${incidents.length === 1 ? '' : 's'} reported on campus${high ? ` · ${high} high` : ''}`
                : 'No problems reported right now'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Tap a coloured zone on the map for details. Routes avoid them automatically.
            </ThemedText>
          </Card>
        </Pressable>

        <SafetyBar />
      </Screen>

      <SafeAreaView edges={[]} pointerEvents="box-none" style={[styles.fabWrap, { bottom: BottomTabInset + Spacing.three }]}>
        <Pressable
          onPress={() => setReportOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Report an incident"
          style={({ pressed }) => [styles.fab, { backgroundColor: theme.navy, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <Ionicons name="camera" size={20} color="#fff" />
          <ThemedText type="smallBold" style={styles.fabText}>
            Report incident
          </ThemedText>
        </Pressable>
      </SafeAreaView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        fallbackLocation={meetup ? { latitude: meetup.lat, longitude: meetup.lng } : null}
      />
    </View>
  );
}

/** Tells the user what's missing instead of showing a silently disabled button. */
function findButtonTitle(s: {
  verified: boolean;
  hasActiveGroup: boolean;
  hasDestination: boolean;
  routeLoading: boolean;
  hasRoute: boolean;
}) {
  if (!s.verified) return 'Waiting on ID verification';
  if (s.hasActiveGroup) return 'Walk already in progress';
  if (!s.hasDestination) return 'Set a destination on the map';
  if (s.routeLoading) return 'Finding a walking route…';
  if (!s.hasRoute) return 'No route found, try another spot';
  return 'Find my pack';
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  search: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    top: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: 14,
    borderRadius: Radius.md,
    ...shadow,
  },
  eyebrowMuted: { fontSize: 10, lineHeight: 13, letterSpacing: 0.4, opacity: 0.6 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.3, color: '#0055A2' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: Spacing.one },
  badge: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  gapTop: { marginTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chipRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one },
  fabWrap: { position: 'absolute', right: Spacing.three },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: Radius.pill,
    ...shadow,
  },
  fabText: { color: '#fff' },
});
