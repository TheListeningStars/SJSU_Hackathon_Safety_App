import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmergencyPhone, SafeWalkPhone, Spacing } from '@/constants/theme';

export function SafetyBar() {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button compact variant="secondary" icon="call-outline" title="SafeWalk" onPress={() => Linking.openURL(`tel:${SafeWalkPhone}`)} />
      </View>
      <View style={styles.cell}>
        <Button compact variant="secondary" icon="chatbubble-outline" title="Text" onPress={() => Linking.openURL(`sms:${SafeWalkPhone}`)} />
      </View>
      <View style={styles.cell}>
        <Button compact variant="danger" icon="call" title="911" onPress={() => Linking.openURL(`tel:${EmergencyPhone}`)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
