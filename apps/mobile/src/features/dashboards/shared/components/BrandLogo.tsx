import { Image, StyleSheet, View } from 'react-native';

import safeAlertLogo from '../../../../../assets/safealert-logo.png';

export function BrandLogo({ size = 34 }: { size?: number }) {
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.22 }]}><Image accessibilityLabel="SafeAlert logo" source={safeAlertLogo} style={[styles.image, { width: size, height: size }]} /></View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#ffffff' },
  image: { resizeMode: 'cover' }
});
