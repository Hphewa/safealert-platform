import { StyleSheet, Text } from 'react-native';

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
  'play-outline': '▶',
  'pause-outline': 'Ⅱ',
  'log-out-outline': 'LG',
  'construct-outline': 'UI',
  'chevron-forward': '›',
  'arrow-back': '‹'
};

export function DashboardGlyph({ name, color, size = 18 }: DashboardGlyphProps) {
  const glyph = glyphMap[name] ?? '•';
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
  glyph: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5
  }
});
