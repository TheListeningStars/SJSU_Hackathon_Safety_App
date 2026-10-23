import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { WalkMapProps } from '@/components/walk-map';

export type { MapPin, WalkMapProps } from '@/components/walk-map';

// react-native-maps has no web support; show the pins as a list so the flow is still usable.
export function WalkMap({ pins, onPinPress }: WalkMapProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="small" themeColor="textSecondary">
        The live map is available in the mobile app (Expo Go). Destinations can only be picked on mobile.
      </ThemedText>
      <View style={styles.list}>
        {pins.map((pin) => (
          <Pressable key={pin.id} onPress={() => onPinPress?.(pin.id)}>
            <ThemedText type="small">
              {pin.kind === 'meetup-selected' ? '● ' : '○ '}
              {pin.title}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
});
