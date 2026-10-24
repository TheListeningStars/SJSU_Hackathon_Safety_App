// Live walking-group screen: members, split points, lifecycle actions (confirm → start → arrive)
// and live location over a private Realtime channel. Data comes from the get_group_details RPC and
// refreshes on Realtime changes to group_members / walk_groups.

import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Vibration, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ReportSheet } from '@/components/report-sheet';
import { Card, ErrorText, Screen } from '@/components/screen';
import { SafetyBar } from '@/components/safety-bar';
import { ThemedText } from '@/components/themed-text';
import { WalkMap, type MapPin, type MapZone } from '@/components/walk-map';
import { useIncidents } from '@/hooks/use-incidents';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  confirmGroup,
  getGroupDetails,
  leaveGroup,
  markArrived,
  startWalk,
  updateMyRoute,
  type GroupDetails,
  type GroupMember,
  type MemberStatus,
} from '@/lib/api';
import {
  distanceBetween,
  formatDistance,
  formatDuration,
  fromGeoJsonCoordinates,
  toGeoJsonCoordinates,
  type LatLng,
  type WalkingRoute,
} from '@/lib/directions';
import { routeSafest } from '@/lib/liveliness';
import { blockingZones, CATEGORY_LABEL, closestApproach } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

type LiveWalker = { user_id: string; first_name: string | null; lat: number; lng: number; at: number };

const MEMBER_STATUS: Record<MemberStatus, { label: string; color: ThemeColor }> = {
  joined: { label: 'Reviewing', color: 'warning' },
  confirmed: { label: 'Confirmed', color: 'accent' },
  arrived: { label: 'Home safe', color: 'success' },
  left: { label: 'Left', color: 'textSecondary' },
};

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [walkers, setWalkers] = useState<Record<string, LiveWalker>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reroute, setReroute] = useState<{ text: string; previous: LatLng[] } | null>(null);
  const { zones } = useIncidents();
  const myPosition = useRef<LatLng | null>(null);
  const handledZones = useRef(new Set<string>());
  const rerouting = useRef(false);

  const load = useCallback(() => {
    getGroupDetails(id)
      .then(setGroup)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Re-fetch whenever anyone joins, confirms, starts the walk or checks in.
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`group-db:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walk_groups', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const me = group?.members.find((m) => m.is_me);
  const isWalking = group?.status === 'walking';
  const shareMyLocation = isWalking && me?.status === 'confirmed';

  // After your split point you walk home alone; fetch a real walking route for that leg.
  // (Anchors already have their full route in shared_route.) The solo leg is private to this phone,
  // so it is also where we route around reported problems for non-anchors.
  const soloKey =
    group && !group.is_anchor && me?.split_lat != null && me.split_lng != null
      ? `${me.split_lat},${me.split_lng},${group.my_destination.lat},${group.my_destination.lng}|${zones.map((z) => z.id).join(',')}`
      : null;
  const [solo, setSolo] = useState<{ key: string; route: WalkingRoute } | null>(null);
  useEffect(() => {
    if (!soloKey) return;
    let cancelled = false;
    const [fromLat, fromLng, toLat, toLng] = soloKey.split('|')[0].split(',').map(Number);
    routeSafest({ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng }, zones)
      .then(async (plan) => {
        if (cancelled) return;
        setSolo({ key: soloKey, route: plan.route });
        const fresh = plan.avoided.find((z) => !handledZones.current.has(z.id));
        if (fresh) {
          handledZones.current.add(fresh.id);
          setReroute({
            text: `Your walk home after the split now avoids ${CATEGORY_LABEL[fresh.category] ?? 'a reported problem'}${plan.addedM > 20 ? ` (+${formatDuration(plan.addedM / 1.35)})` : ''}.`,
            previous: [],
          });
          Vibration.vibrate(400);
          await updateMyRoute(id, null, fresh.id, plan.addedM).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // zones are captured through soloKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloKey, id]);
  const soloRoute = solo?.key === soloKey ? solo.route : null;

  // Live locations go over a private broadcast channel only group members can join (see realtime.messages policies).
  useEffect(() => {
    if (!isWalking || !session) return;
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;
    const channel = supabase.channel(`group:${id}`, { config: { private: true } });
    channel.on('broadcast', { event: 'location' }, ({ payload }) => {
      const w = payload as LiveWalker;
      setWalkers((prev) => ({ ...prev, [w.user_id]: w }));
    });

    (async () => {
      await supabase.realtime.setAuth();
      channel.subscribe();
      if (!shareMyLocation) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 15 },
        (pos) => {
          myPosition.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          channel.send({
            type: 'broadcast',
            event: 'location',
            payload: {
              user_id: session.user.id,
              first_name: profile?.first_name ?? null,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              at: Date.now(),
            } satisfies LiveWalker,
          });
        }
      );
      if (cancelled) watcher.remove();
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
      supabase.removeChannel(channel);
    };
  }, [id, isWalking, shareMyLocation, session, profile?.first_name]);

  // Rerouting the shared path. The group walks the anchor's route, and only the anchor's phone knows
  // where it ends (routes are private), so the anchor's phone finds a way around a reported problem and
  // saves it; everyone's split points update and the new shared path reaches the group over Realtime.
  // Other members get a heads-up; their own solo leg is rerouted above.
  useEffect(() => {
    if (!group || rerouting.current) return;
    const mine = group.members.find((m) => m.is_me);
    if (!mine || !['joined', 'confirmed'].includes(mine.status) || !['forming', 'walking'].includes(group.status)) return;
    const route = fromGeoJsonCoordinates(group.shared_route);
    // Only the part of the path still ahead of me matters once we're walking.
    const pos = group.status === 'walking' ? myPosition.current : null;
    const ahead = pos && route.length > 1 ? [pos, ...route.slice(closestApproach(route, pos).seg + 1)] : route;
    const hits = blockingZones(ahead, zones).filter((z) => !handledZones.current.has(z.id));
    if (!hits.length) return;
    rerouting.current = true;
    hits.forEach((z) => handledZones.current.add(z.id));
    (async () => {
      try {
        const what = CATEGORY_LABEL[hits[0].category] ?? 'a reported problem';
        if (!group.is_anchor) {
          setReroute({ text: `Heads up: ${what} reported on your group's path. The route will update for everyone in a moment.`, previous: [] });
          Vibration.vibrate(400);
          return;
        }
        let from: LatLng = { latitude: group.meetup_point.lat, longitude: group.meetup_point.lng };
        if (group.status === 'walking') {
          const last = myPosition.current ?? (await Location.getLastKnownPositionAsync())?.coords;
          if (last) from = { latitude: last.latitude, longitude: last.longitude };
        }
        const to = { latitude: group.my_destination.lat, longitude: group.my_destination.lng };
        // Already standing in it (e.g. I just reported it): nothing to warn me about.
        if (hits.every((z) => distanceBetween(from, { latitude: z.lat, longitude: z.lng }) <= z.radius_m)) return;
        const plan = await routeSafest(from, to, zones);
        if (plan.avoided.length) {
          await updateMyRoute(id, toGeoJsonCoordinates(plan.route.points), plan.avoided[0].id, plan.addedM);
          setReroute({
            text: `Group route updated to avoid ${what} ahead${plan.addedM > 20 ? ` (+${formatDuration(plan.addedM / 1.35)})` : ''}.`,
            previous: route,
          });
          Vibration.vibrate(400);
          load();
        } else {
          setReroute({ text: `Heads up: ${what} reported on your way, and there's no way around it. Stay with your group.`, previous: [] });
          Vibration.vibrate(400);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        rerouting.current = false;
      }
    })();
  }, [group, zones, id, load]);

  const run = (label: string, action: () => Promise<void>) => async () => {
    setBusy(label);
    setError(null);
    try {
      await action();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmLeave = () =>
    Alert.alert('Leave this group?', 'The others will be re-matched without you.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: run('leave', async () => {
          await leaveGroup(id);
          router.back();
        }),
      },
    ]);

  if (!group || !me) {
    return (
      <Screen safeTop={false}>
        <ThemedText themeColor="textSecondary">{error ?? 'Loading your group…'}</ThemedText>
      </Screen>
    );
  }

  const others = group.members.filter((m) => !m.is_me);
  const activeMembers = group.members.filter((m) => m.status === 'joined' || m.status === 'confirmed');
  const everyoneConfirmed = activeMembers.length >= 2 && activeMembers.every((m) => m.status === 'confirmed');
  const departAt = new Date(group.depart_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const pins: MapPin[] = [
    {
      id: 'meetup',
      title: group.meetup_point.name,
      description: 'Meet here',
      latitude: group.meetup_point.lat,
      longitude: group.meetup_point.lng,
      kind: 'meetup-selected',
    },
    {
      id: 'destination',
      title: group.my_destination.label ?? 'Your destination',
      latitude: group.my_destination.lat,
      longitude: group.my_destination.lng,
      kind: 'destination',
    },
    ...group.members
      .filter((m) => m.split_lat != null && m.split_lng != null && others.length > 0)
      .map<MapPin>((m) => ({
        id: `split-${m.user_id}`,
        title: m.is_me ? 'You head off here' : `${m.first_name ?? 'Walker'} heads off here`,
        latitude: m.split_lat!,
        longitude: m.split_lng!,
        kind: m.is_me ? 'my-split' : 'split',
      })),
    ...Object.values(walkers)
      .filter((w) => w.user_id !== session?.user.id)
      .map<MapPin>((w) => ({
        id: `walker-${w.user_id}`,
        title: w.first_name ?? 'Walker',
        description: `Updated ${new Date(w.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
        latitude: w.lat,
        longitude: w.lng,
        kind: 'walker',
      })),
  ];

  const mapZones: MapZone[] = zones.map((z) => ({
    id: z.id,
    latitude: z.lat,
    longitude: z.lng,
    radius: z.radius_m,
    title: z.title,
    description: CATEGORY_LABEL[z.category],
    severity: z.severity,
  }));

  return (
    <Screen safeTop={false}>
      {reroute && (
        <Card>
          <ThemedText type="smallBold" themeColor="warning">
            {reroute.text}
          </ThemedText>
          <Button compact variant="secondary" title="Got it" onPress={() => setReroute(null)} />
        </Card>
      )}
      <Card>
        <ThemedText type="smallBold">{headline(group, others.length)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Meet at {group.meetup_point.name} · departs {departAt}
        </ThemedText>
        {others.length > 0 && me.walk_alone_m != null && (
          <ThemedText type="small" themeColor="textSecondary">
            {`You'll walk with the group, then about ${formatDistance(soloRoute?.distanceM ?? me.walk_alone_m)} on your own (dashed line). For privacy, groups split at least a block before anyone's home.`}
          </ThemedText>
        )}
      </Card>

      <WalkMap
        pins={pins}
        route={fromGeoJsonCoordinates(group.shared_route)}
        soloRoute={soloRoute?.points}
        previousRoute={reroute?.previous}
        zones={mapZones}
      />

      {(group.status === 'forming' || group.status === 'walking') && (
        <Button variant="secondary" title="Report a problem on the way" onPress={() => setReportOpen(true)} />
      )}

      <View style={styles.members}>
        {group.members.map((m) => (
          <MemberRow key={m.user_id} member={m} showOrder={others.length > 0} />
        ))}
      </View>

      {group.status === 'forming' && me.status === 'joined' && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Confirming shares your profile photo with this group only, and you&apos;ll see theirs once they confirm too.
          </ThemedText>
          <Button title="Confirm and share my photo" loading={busy === 'confirm'} onPress={run('confirm', () => confirmGroup(id))} />
        </Card>
      )}

      {group.status === 'forming' && me.status === 'confirmed' && (
        <Button
          title={everyoneConfirmed ? "Everyone's here — start walking" : 'Waiting for everyone to confirm'}
          disabled={!everyoneConfirmed}
          loading={busy === 'start'}
          onPress={run('start', () => startWalk(id))}
        />
      )}

      {isWalking && me.status === 'confirmed' && (
        <Button title="I'm home safe" loading={busy === 'arrive'} onPress={run('arrive', () => markArrived(id))} />
      )}

      {me.status === 'arrived' && (
        <Card>
          <ThemedText type="smallBold" themeColor="success">
            You&apos;re checked in as home safe.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {group.status === 'completed'
              ? 'Want to stay in touch? Your info is only shared if you both opt in.'
              : 'Contact sharing opens once everyone in the group is home.'}
          </ThemedText>
          {group.status === 'completed' && (
            <Button title="Share contact info" onPress={() => router.push({ pathname: '/share/[id]', params: { id } })} />
          )}
        </Card>
      )}

      {group.status === 'forming' && (
        <Button title="Leave group" variant="secondary" loading={busy === 'leave'} onPress={confirmLeave} />
      )}

      <ErrorText message={error} />
      <SafetyBar />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        fallbackLocation={{ latitude: group.meetup_point.lat, longitude: group.meetup_point.lng }}
      />
    </Screen>
  );
}

function headline(group: GroupDetails, otherCount: number) {
  switch (group.status) {
    case 'forming':
      return otherCount === 0
        ? 'Looking for students heading your way…'
        : `Matched with ${otherCount} ${otherCount === 1 ? 'student' : 'students'}`;
    case 'walking':
      return 'Walking — stay together until your split point';
    case 'completed':
      return 'Everyone made it home';
    case 'cancelled':
      return 'This group was cancelled';
  }
}

function MemberRow({ member, showOrder }: { member: GroupMember; showOrder: boolean }) {
  const status = MEMBER_STATUS[member.status];
  return (
    <Card>
      <View style={styles.memberRow}>
        <Avatar path={member.avatar_path} name={member.first_name} />
        <View style={styles.memberText}>
          <ThemedText type="smallBold">
            {member.first_name ?? 'Walker'}
            {member.is_me ? ' (you)' : ''}
          </ThemedText>
          {showOrder && member.split_order != null && (
            <ThemedText type="small" themeColor="textSecondary">
              Heads off {ordinal(member.split_order)}
            </ThemedText>
          )}
        </View>
        <ThemedText type="smallBold" themeColor={status.color}>
          {status.label}
        </ThemedText>
      </View>
    </Card>
  );
}

function ordinal(n: number) {
  return ['first', 'second', 'third', 'fourth'][n - 1] ?? `#${n}`;
}

const styles = StyleSheet.create({
  members: {
    gap: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  memberText: {
    flex: 1,
  },
});
