import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';

import { useTheme } from '@/hooks/use-theme';
import type { LatLng } from '@/lib/directions';

export type MapPin = LatLng & {
  id: string;
  title: string;
  description?: string;
  kind: 'meetup' | 'meetup-selected' | 'destination' | 'split' | 'my-split' | 'walker';
};

export type WalkMapProps = {
  pins: MapPin[];
  route?: LatLng[];
  /** Leg walked alone after leaving the group; drawn dashed. */
  soloRoute?: LatLng[];
  onPinPress?: (id: string) => void;
  onMapPress?: (coordinate: LatLng) => void;
  height?: number;
};

// Default view: SJSU main campus.
const CAMPUS = { latitude: 37.3352, longitude: -121.8811, latitudeDelta: 0.015, longitudeDelta: 0.015 };

export function WalkMap({ pins, route, soloRoute, onPinPress, onMapPress, height = 320 }: WalkMapProps) {
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

  // Keep the route and pins in view when they change.
  const fitKey = [...(route ?? []), ...(soloRoute ?? []), ...pins].map((p) => `${p.latitude},${p.longitude}`).join('|');
  useEffect(() => {
    const coords = [...(route ?? []), ...(soloRoute ?? []), ...pins];
    if (coords.length > 1) {
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
      {route && route.length > 1 && (
        <Polyline coordinates={route} strokeColor={theme.accent} strokeWidth={5} />
      )}
      {soloRoute && soloRoute.length > 1 && (
        <Polyline coordinates={soloRoute} strokeColor={theme.accent} strokeWidth={4} lineDashPattern={[8, 8]} />
      )}
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          coordinate={pin}
          title={pin.title}
          description={pin.description}
          pinColor={colors[pin.kind]}
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
