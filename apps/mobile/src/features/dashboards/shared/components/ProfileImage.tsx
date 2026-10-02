import { Image, StyleSheet, View } from 'react-native';

import profilePlaceholder from '../../../../../assets/profile-placeholder.png';

export function ProfileImage({ size = 40 }: { size?: number }) {
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}><Image accessibilityLabel="Profile" source={profilePlaceholder} style={[styles.image, { width: size * 0.82, height: size * 0.82 }]} /></View>;
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef3f7', overflow: 'hidden' },
  image: { resizeMode: 'contain' }
});
