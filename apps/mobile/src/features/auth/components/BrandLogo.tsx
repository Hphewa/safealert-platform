import { Image, type ImageStyle, StyleSheet } from 'react-native';

import safeAlertLogo from '../../../../assets/safealert-logo.png';

type BrandLogoProps = {
  size?: number;
  style?: ImageStyle;
};

export function BrandLogo({ size = 48, style }: BrandLogoProps) {
  return <Image accessibilityLabel="SafeAlert logo" source={safeAlertLogo} style={[styles.logo, { width: size, height: size }, style]} />;
}

const styles = StyleSheet.create({
  logo: { resizeMode: 'contain' }
});
