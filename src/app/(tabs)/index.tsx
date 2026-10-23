// Walk planner: choose a meetup point and destination, fetch a walking route, then
// create_walk_request + find_or_create_group (matching happens in Postgres, see AGENTS.md).

import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, ErrorText, Screen } from '@/components/screen';
import { SafetyBar } from '@/components/safety-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WalkMap, type MapPin } from '@/components/walk-map';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { createWalkRequest, findOrCreateGroup, getActiveGroup, listMeetupPoints, type MeetupPoint } from '@/lib/api';
import {
  formatDistance,
  formatDuration,
  getWalkingRoute,
  toGeoJsonCoordinates,
  type LatLng,
  type WalkingRoute,
} from '@/lib/directions';
import { useSession } from '@/providers/session';

const DEPART_OPTIONS = [
  { label: 'Now', minutes: 0 },
  { label: 'In 15 min', minutes: 15 },
  { label: 'In 30 min', minutes: 30 },
  { label: 'In 1 hr', minutes: 60 },
];

export default function WalkScreen() {
  const { profile } = useSession();
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
      getActiveGroup()
        .then(setActiveGroup)
        .catch(() => setActiveGroup(null));
    }, [])
  );

  // Only the latest route request may update state, in case the user taps around quickly.
  const routeRequest = useRef(0);
  const updateRoute = async (from: MeetupPoint | null, to: LatLng | null) => {
    const requestNo = ++routeRequest.current;
    setRoute(null);
    if (!from || !to) return;
    setRouteLoading(true);
    try {
      const r = await getWalkingRoute({ latitude: from.lat, longitude: from.lng }, to);
      if (requestNo === routeRequest.current) setRoute(r);
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

  return (
    <Screen bottomInset={BottomTabInset}>
      <ThemedText type="subtitle">Walk home together</ThemedText>

      {!verified && (
        <Card>
          <ThemedText type="smallBold" themeColor="warning">
            ID verification pending
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            You can plan a route now. Matching with other students unlocks once your ID is approved.
          </ThemedText>
        </Card>
      )}

      {activeGroup && (
        <Card>
          <ThemedText type="smallBold">You have a walk in progress</ThemedText>
          <Button
            title="Return to your group"
            onPress={() => router.push({ pathname: '/group/[id]', params: { id: activeGroup } })}
          />
        </Card>
      )}

      <ThemedText type="smallBold">1. Pick a safe meetup point</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {points.map((p) => (
          <Chip key={p.id} label={p.is_staffed ? `${p.name} · staffed` : p.name} selected={p.id === meetupId} onPress={() => selectMeetup(p.id)} />
        ))}
      </ScrollView>

      <ThemedText type="smallBold">2. Tap the map where you&apos;re headed</ThemedText>
      <WalkMap pins={pins} route={route?.points} onPinPress={(id) => points.some((p) => p.id === id) && selectMeetup(id)} onMapPress={pickDestination} />

      {destination && (
        <Card>
          <ThemedText type="smallBold">{destLabel}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {routeLoading
              ? 'Finding a walking route…'
              : route
                ? `${formatDistance(route.distanceM)} · about ${formatDuration(route.durationS)} from ${meetup?.name}`
                : 'No route yet'}
          </ThemedText>
          {route?.isFallback && (
            <ThemedText type="small" themeColor="warning">
              No Google Maps key set, so this is a straight-line estimate. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for real walking routes.
            </ThemedText>
          )}
        </Card>
      )}

      <ThemedText type="smallBold">3. When are you leaving?</ThemedText>
      <View style={styles.chips}>
        {DEPART_OPTIONS.map((o) => (
          <Chip key={o.minutes} label={o.label} selected={o.minutes === departIn} onPress={() => setDepartIn(o.minutes)} />
        ))}
      </View>

      <ErrorText message={error} />
      <Button
        title={verified ? 'Find walking buddies' : 'Waiting on ID verification'}
        onPress={findBuddies}
        loading={matching}
        disabled={!verified || !route || !!activeGroup}
      />

      <SafetyBar />
    </Screen>
  );
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
        <ThemedText type={selected ? 'smallBold' : 'small'} themeColor={selected ? 'accent' : 'text'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
});
