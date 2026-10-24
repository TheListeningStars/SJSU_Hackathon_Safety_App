// Interactive campus map: route + solo leg, meetup points, walkers, and reported problems as
// danger zones coloured by severity (green / yellow / red).
//   * tap a zone (or anywhere inside it) for details; long-press the map to drop a destination
//   * buttons: centre on me, fit everything, show/hide reports
//   * `focusZoneId` flies to a zone and opens it (used by the Alerts tab's "View on map")

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, type LongPressEvent, type MapPressEvent } from 'react-native-maps';

import { ThemedText } from '@/components/themed-text';
import { CATEGORY_ICON, SeverityPill, severityColor, timeAgo } from '@/components/zone-info';
import { Radius, SeverityColor, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceBetween, type LatLng } from '@/lib/directions';

export type MapPin = LatLng & {
  id: string;
  title: string;
  description?: string;
  kind: 'meetup' | 'meetup-selected' | 'destination' | 'split' | 'my-split' | 'walker';
};

/** A reported problem drawn as a danger zone (see src/lib/safety.ts). */
export type MapZone = {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | string;
  category?: string;
  reports?: number;
  /** ISO time of the latest report. */
  updatedAt?: string;
};

export type WalkMapProps = PropsWithChildren<{
  pins: MapPin[];
  route?: LatLng[];
  /** Leg walked alone after leaving the group; drawn dashed. */
  soloRoute?: LatLng[];
  /** The route before a reroute, drawn faded so people can see what changed. */
  previousRoute?: LatLng[];
  zones?: MapZone[];
  focusZoneId?: string | null;
  onPinPress?: (id: string) => void;
  /** Tap outside any zone, or long-press anywhere. */
  onMapPress?: (coordinate: LatLng) => void;
  height?: number;
  /** Space reserved at the top for an overlay (e.g. a search card) so controls don't collide. */
  topInset?: number;
}>;

// Default view: SJSU main campus.
const CAMPUS = { latitude: 37.3352, longitude: -121.8811, latitudeDelta: 0.015, longitudeDelta: 0.015 };
const EDGE = { top: 72, right: 56, bottom: 56, left: 40 };

export function WalkMap({
  pins,
  route,
  soloRoute,
  previousRoute,
  zones = [],
  focusZoneId,
  onPinPress,
  onMapPress,
  height = 320,
  topInset = 0,
  children,
}: WalkMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const selected = showZones ? zones.find((z) => z.id === selectedId) ?? null : null;

  const everything = (): LatLng[] => [
    ...(route ?? []),
    ...(soloRoute ?? []),
    ...pins,
    ...(route?.length || pins.length ? [] : zones),
  ];

  // Keep the route and pins in view when they change.
  const fitKey = [...(route ?? []), ...(soloRoute ?? []), ...pins].map((p) => `${p.latitude},${p.longitude}`).join('|');
  useEffect(() => {
    const coords = everything();
    if (coords.length > 1) mapRef.current?.fitToCoordinates(coords, { edgePadding: EDGE, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // "View on map" from the Alerts tab.
  useEffect(() => {
    const z = zones.find((x) => x.id === focusZoneId);
    if (!z) return;
    const t = setTimeout(() => {
      setShowZones(true);
      setSelectedId(z.id);
      mapRef.current?.animateCamera({ center: { latitude: z.latitude, longitude: z.longitude }, zoom: 17 }, { duration: 600 });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusZoneId, zones.length]);

  const zoneAt = (p: LatLng) =>
    showZones ? zones.find((z) => distanceBetween(p, { latitude: z.latitude, longitude: z.longitude }) <= z.radius) : undefined;

  const handlePress = (e: MapPressEvent) => {
    // On Android a marker tap also fires a map press; ignore it.
    if (e.nativeEvent.action === 'marker-press') return;
    const p = e.nativeEvent.coordinate;
    const z = zoneAt(p);
    if (z) {
      setSelectedId(z.id);
      return;
    }
    setSelectedId(null);
    onMapPress?.(p);
  };

  const handleLongPress = (e: LongPressEvent) => {
    setSelectedId(null);
    onMapPress?.(e.nativeEvent.coordinate);
  };

  const centerOnMe = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({}));
      mapRef.current?.animateCamera(
        { center: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, zoom: 17 },
        { duration: 500 }
      );
    } catch {
      // Location is optional here.
    }
  };

  const fitAll = () => {
    const coords = [...everything(), ...(showZones ? zones : [])];
    if (coords.length > 1) mapRef.current?.fitToCoordinates(coords, { edgePadding: EDGE, animated: true });
    else mapRef.current?.animateToRegion(CAMPUS, 500);
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={CAMPUS}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onPress={handlePress}
        onLongPress={onMapPress ? handleLongPress : undefined}>
        {showZones &&
          zones.map((z) => {
            const color = severityColor(z.severity);
            const on = z.id === selectedId;
            return (
              <Circle
                key={`zone-${z.id}`}
                center={{ latitude: z.latitude, longitude: z.longitude }}
                radius={z.radius}
                strokeColor={color}
                strokeWidth={on ? 3 : 2}
                fillColor={`${color}${on ? '55' : '33'}`}
              />
            );
          })}
        {showZones &&
          zones.map((z) => (
            <Marker
              key={`zone-pin-${z.id}`}
              coordinate={{ latitude: z.latitude, longitude: z.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => setSelectedId(z.id)}>
              <View style={[styles.zonePin, { borderColor: severityColor(z.severity), backgroundColor: theme.card }]}>
                <Ionicons name={CATEGORY_ICON[z.category ?? 'other'] ?? 'alert-circle-outline'} size={15} color={severityColor(z.severity)} />
              </View>
            </Marker>
          ))}
        {previousRoute && previousRoute.length > 1 && (
          <Polyline coordinates={previousRoute} strokeColor={theme.textSecondary} strokeWidth={3} lineDashPattern={[6, 6]} />
        )}
        {route && route.length > 1 && <Polyline coordinates={route} strokeColor={theme.accent} strokeWidth={5} />}
        {soloRoute && soloRoute.length > 1 && (
          <Polyline coordinates={soloRoute} strokeColor={theme.accent} strokeWidth={4} lineDashPattern={[8, 8]} />
        )}
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={pin}
            title={pin.title}
            description={pin.description}
            anchor={pin.kind === 'destination' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
            onPress={() => onPinPress?.(pin.id)}>
            <PinView pin={pin} />
          </Marker>
        ))}
      </MapView>

      {children}

      <View style={[styles.controls, { top: Spacing.three + topInset }]}>
        <MapButton icon="locate" label="Centre on me" onPress={centerOnMe} />
        <MapButton icon="scan-outline" label="Fit everything" onPress={fitAll} />
        <MapButton
          icon={showZones ? 'warning' : 'warning-outline'}
          label={showZones ? 'Hide reports' : 'Show reports'}
          active={showZones}
          onPress={() => {
            setShowZones((v) => !v);
            setSelectedId(null);
          }}
        />
      </View>

      {selected ? (
        <View style={[styles.detail, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.detailIcon, { backgroundColor: `${severityColor(selected.severity)}22` }]}>
            <Ionicons
              name={CATEGORY_ICON[selected.category ?? 'other'] ?? 'alert-circle-outline'}
              size={20}
              color={severityColor(selected.severity)}
            />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold">{selected.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {[selected.description, selected.reports ? `${selected.reports} report${selected.reports === 1 ? '' : 's'}` : null, timeAgo(selected.updatedAt)]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
            <SeverityPill severity={selected.severity} />
          </View>
          <Pressable onPress={() => setSelectedId(null)} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.legend, { backgroundColor: theme.card }]}>
          <Dot color={theme.gold} />
          <ThemedText style={styles.legendText}>Meetup</ThemedText>
          <Dot color={SeverityColor.low} />
          <Dot color={SeverityColor.medium} />
          <Dot color={SeverityColor.high} />
          <ThemedText style={styles.legendText}>Reports</ThemedText>
          {onMapPress && <ThemedText style={[styles.legendText, { color: theme.textSecondary }]}>· hold to set destination</ThemedText>}
        </View>
      )}
    </View>
  );
}

function PinView({ pin }: { pin: MapPin }) {
  const theme = useTheme();
  switch (pin.kind) {
    case 'meetup-selected':
      return (
        <View style={[styles.meetupOn, { backgroundColor: theme.gold }]}>
          <Ionicons name="people" size={16} color={theme.navy} />
        </View>
      );
    case 'meetup':
      return (
        <View style={[styles.meetup, { backgroundColor: theme.card, borderColor: theme.gold }]}>
          <Ionicons name="people-outline" size={13} color={theme.navy} />
        </View>
      );
    case 'destination':
      return <Ionicons name="location" size={36} color={theme.accent} />;
    case 'walker':
      return (
        <View style={[styles.walker, { backgroundColor: theme.accent }]}>
          <ThemedText style={styles.walkerText}>{pin.title.slice(0, 1).toUpperCase()}</ThemedText>
        </View>
      );
    case 'my-split':
      return <View style={[styles.split, { backgroundColor: theme.success }]} />;
    case 'split':
    default:
      return <View style={[styles.split, { backgroundColor: theme.gold }]} />;
  }
}

function MapButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.mapButton,
        { backgroundColor: theme.card, borderColor: theme.border, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}>
      <Ionicons name={icon} size={18} color={active === false ? theme.textSecondary : theme.accent} />
    </Pressable>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden' },
  flex: { flex: 1, gap: 2 },
  controls: { position: 'absolute', right: Spacing.three, gap: Spacing.two },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  legend: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    ...shadow,
  },
  legendText: { fontSize: 11, lineHeight: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  detail: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    ...shadow,
  },
  detailIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  zonePin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetupOn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  meetup: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  walker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  walkerText: { color: '#fff', fontSize: 13, lineHeight: 16, fontWeight: '700' },
  split: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
});
