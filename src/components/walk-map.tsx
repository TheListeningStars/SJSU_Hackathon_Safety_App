import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Circle, Marker, Polyline, type MapPressEvent } from 'react-native-maps';

import { useTheme } from '@/hooks/use-theme';
import type { LatLng } from '@/lib/directions';

export type MapPin = LatLng & {
  id: string;
  title: string;
  description?: string;
  kind: 'meetup' | 'meetup-selected' | 'destination' | 'split' | 'my-split' | 'walker';
  /** Let the user drag this pin; the new spot is reported through onPinDragEnd. */
  draggable?: boolean;
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
};

export type WalkMapProps = {
  pins: MapPin[];
  route?: LatLng[];
  /** Leg walked alone after leaving the group; drawn dashed. */
  soloRoute?: LatLng[];
  /** The route before a reroute, drawn faded so people can see what changed. */
  previousRoute?: LatLng[];
  zones?: MapZone[];
  onPinPress?: (id: string) => void;
  onPinDragEnd?: (id: string, coordinate: LatLng) => void;
  onMapPress?: (coordinate: LatLng) => void;
  height?: number;
};

// Default view: SJSU main campus.
const CAMPUS = { latitude: 37.3352, longitude: -121.8811, latitudeDelta: 0.015, longitudeDelta: 0.015 };

export function WalkMap({
  pins,
  route,
  soloRoute,
  previousRoute,
  zones = [],
  onPinPress,
  onPinDragEnd,
  onMapPress,
  height = 320,
}: WalkMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const colors: Record<MapPin['kind'], string> = {
    meetup: theme.textSecondary,
    'meetup-selected': theme.accent,
    destination: theme.danger,
    split: theme.warning,
    'my-split': theme.success,
    walker: theme.accent,
  };

  // Re-frame the map only when a route appears or changes (and once when pins first load).
  // Re-zooming on every tap or live-location update made the map jump around under your finger.
  const routeKey = [...(route ?? []), ...(soloRoute ?? [])].map((p) => `${p.latitude},${p.longitude}`).join('|');
  const fitKey = routeKey || (pins.length > 1 ? 'pins-loaded' : '');
  useEffect(() => {
    const coords = [...(route ?? []), ...(soloRoute ?? []), ...pins];
    if (fitKey && coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const handlePress = (e: MapPressEvent) => {
    // On Android a marker tap also fires a map press; ignore it.
    if (e.nativeEvent.action === 'marker-press') return;
    onMapPress?.(e.nativeEvent.coordinate);
  };

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, { height }]}
      initialRegion={CAMPUS}
      showsUserLocation
      onPress={onMapPress ? handlePress : undefined}>
      {zones.map((z) => {
        const color = z.severity === 'high' ? theme.danger : theme.warning;
        return (
          <Circle
            key={`zone-${z.id}`}
            center={{ latitude: z.latitude, longitude: z.longitude }}
            radius={z.radius}
            strokeColor={color}
            strokeWidth={2}
            fillColor={`${color}33`}
          />
        );
      })}
      {zones.map((z) => (
        <Marker
          key={`zone-pin-${z.id}`}
          coordinate={{ latitude: z.latitude, longitude: z.longitude }}
          title={z.title}
          description={z.description}
          pinColor={z.severity === 'high' ? theme.danger : theme.warning}
        />
      ))}
      {previousRoute && previousRoute.length > 1 && (
        <Polyline coordinates={previousRoute} strokeColor={theme.textSecondary} strokeWidth={3} lineDashPattern={[6, 6]} />
      )}
      {route && route.length > 1 && (
        <Polyline coordinates={route} strokeColor={theme.accent} strokeWidth={5} />
      )}
      {soloRoute && soloRoute.length > 1 && (
        <Polyline coordinates={soloRoute} strokeColor={theme.accent} strokeWidth={4} lineDashPattern={[8, 8]} />
      )}
      {pins.map((pin) => (
        <Marker
          // Position is part of the key: on iOS a Marker sometimes ignores coordinate updates and
          // stays on the first spot, so a moved pin is remounted instead.
          key={`${pin.id}@${pin.latitude.toFixed(6)},${pin.longitude.toFixed(6)}`}
          coordinate={pin}
          title={pin.title}
          description={pin.description}
          pinColor={colors[pin.kind]}
          draggable={pin.draggable}
          onDragEnd={(e) => onPinDragEnd?.(pin.id, e.nativeEvent.coordinate)}
          onPress={() => onPinPress?.(pin.id)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    borderRadius: 16,
  },
});
