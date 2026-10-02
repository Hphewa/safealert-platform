import { Image, StyleSheet, View } from 'react-native';

import { hazardImageForType } from '../hazardAssets';

export function HazardImage({ hazardType, size = 44 }: { hazardType?: string; size?: number }) {
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.28 }]}><Image accessibilityLabel={`${hazardType ?? 'Other'} hazard icon`} source={hazardImageForType(hazardType)} style={[styles.image, { width: size * 0.76, height: size * 0.76 }]} /></View>;
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2efff', overflow: 'hidden' },
  image: { resizeMode: 'contain' }
});
