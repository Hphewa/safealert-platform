import { StyleSheet, Text, View } from 'react-native';

type DashboardGlyphProps = {
  name: string;
  color: string;
  size?: number;
};

const glyphMap: Record<string, string> = {
  'home-outline': 'HM',
  'notifications-outline': 'AL',
  'document-text-outline': 'RP',
  'person-outline': 'PR',
  'person-circle-outline': 'PF',
  'warning-outline': 'HZ',
  'checkmark-done-outline': 'OK',
  'help-buoy-outline': 'HP',
  'cloudy-rainy-outline': 'WX',
  'water-outline': 'FL',
  'create-outline': 'UP',
  'shield-checkmark-outline': 'VF',
  'alert-circle-outline': 'AI',
  'trail-sign-outline': 'RD',
  'flame-outline': 'FR',
  'reader-outline': 'RV',
  'speedometer-outline': 'RK',
  'eye-outline': 'MN',
  'locate-outline': 'NB',
  'help-circle-outline': 'CN',
  'leaf-outline': 'TR',
  'rainy-outline': 'RN',
  'book-outline': 'FG',
  'list-outline': 'RQ',
  'flash-outline': 'AC',
  'time-outline': 'HS',
  'search-outline': 'SR',
  'bus-outline': 'EV',
  'medical-outline': 'MD',
  'map-outline': 'MP',
  'camera-outline': 'PH',
  'refresh-outline': 'RF',
  'play-outline': 'PL',
  'pause-outline': 'PA',
  'log-out-outline': 'LG',
  'construct-outline': 'UI',
  'chevron-forward': '>',
  'arrow-back': '<'
};

export function DashboardGlyph({ name, color, size = 18 }: DashboardGlyphProps) {
  if (name === 'person-circle-outline') {
    return (
      <View style={[styles.personIcon, { width: size, height: size }]}>
        <View style={[styles.personHead, { width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, backgroundColor: color }]} />
        <View style={[styles.personBody, { width: size * 0.7, height: size * 0.36, borderRadius: size * 0.22, backgroundColor: color }]} />
      </View>
    );
  }

  const glyph = glyphMap[name] ?? '*';
  const isSymbol = glyph.length === 1;

  return (
    <Text
      style={[
        styles.glyph,
        {
          color,
          fontSize: isSymbol ? size : size * 0.58,
          lineHeight: isSymbol ? size * 1.05 : size * 0.9
        }
      ]}
    >
      {glyph}
    </Text>
  );
}

const styles = StyleSheet.create({
  personIcon: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2
  },
  personHead: {},
  personBody: {},
  glyph: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5
  }
});
