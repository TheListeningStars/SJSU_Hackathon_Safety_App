// Live walking-group screen: members, split points, lifecycle actions (confirm → start → arrive)
// and live location over a private Realtime channel. Data comes from the get_group_details RPC and
// refreshes on Realtime changes to group_members / walk_groups.

import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card, ErrorText, Screen } from '@/components/screen';
import { SafetyBar } from '@/components/safety-bar';
import { ThemedText } from '@/components/themed-text';
import { WalkMap, type MapPin } from '@/components/walk-map';
import { Spacing, type ThemeColor } from '@/constants/theme';
import {
  confirmGroup,
  getGroupDetails,
  leaveGroup,
  markArrived,
  startWalk,
  type GroupDetails,
  type GroupMember,
  type MemberStatus,
} from '@/lib/api';
import { formatDistance, fromGeoJsonCoordinates, getWalkingRoute, type WalkingRoute } from '@/lib/directions';
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
  // (Anchors already have their full route in shared_route.)
  const soloKey =
    group && !group.is_anchor && me?.split_lat != null && me.split_lng != null
      ? `${me.split_lat},${me.split_lng},${group.my_destination.lat},${group.my_destination.lng}`
      : null;
  const [solo, setSolo] = useState<{ key: string; route: WalkingRoute } | null>(null);
  useEffect(() => {
    if (!soloKey) return;
    let cancelled = false;
    const [fromLat, fromLng, toLat, toLng] = soloKey.split(',').map(Number);
    getWalkingRoute({ latitude: fromLat, longitude: fromLng }, { latitude: toLat, longitude: toLng })
      .then((route) => !cancelled && setSolo({ key: soloKey, route }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [soloKey]);
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

  return (
    <Screen safeTop={false}>
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

      <WalkMap pins={pins} route={fromGeoJsonCoordinates(group.shared_route)} soloRoute={soloRoute?.points} />

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
