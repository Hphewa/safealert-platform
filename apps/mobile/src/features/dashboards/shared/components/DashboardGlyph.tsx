import { Image, StyleSheet, Text } from 'react-native';

import locationPinImage from '../../../../../assets/hazards/location-pin.png';
import photoEvidenceIcon from '../../../../../assets/evidence/photo-evidence.png';
import voiceEvidenceIcon from '../../../../../assets/evidence/voice-evidence.png';

type DashboardGlyphProps = {
  name: string;
  color: string;
  size?: number;
};

const glyphMap: Record<string, string> = {
  'home-outline': '⌂',
  'notifications-outline': '●',
  'document-text-outline': '▤',
  'person-outline': '●',
  'person-circle-outline': '●',
  'warning-outline': '!',
  'checkmark-done-outline': '✓',
  'help-buoy-outline': '◉',
  'cloudy-rainy-outline': '☁',
  'water-outline': '≈',
  'create-outline': '✎',
  'shield-checkmark-outline': '⬟',
  'alert-circle-outline': '!',
  'trail-sign-outline': '⚑',
  'flame-outline': '♨',
  'reader-outline': '▤',
  'speedometer-outline': '◔',
  'eye-outline': '◉',
  'locate-outline': 'NB',
  'help-circle-outline': '?',
  'leaf-outline': '♧',
  'rainy-outline': '☂',
  'book-outline': '▥',
  'list-outline': '☷',
  'flash-outline': 'ϟ',
  'time-outline': '◷',
  'search-outline': '⌕',
  'bus-outline': '▣',
  'medical-outline': '+',
  'map-outline': '⌖',
  'camera-outline': 'PH',
  'refresh-outline': '↻',
  'people-outline': '♟',
  'play-outline': '▶',
  'pause-outline': '⏸',
  'log-out-outline': 'LG',
  'construct-outline': 'UI',
  'chevron-forward': '>',
  'arrow-back': '<'
};

export function DashboardGlyph({ name, color, size = 18 }: DashboardGlyphProps) {
  if (name === 'locate-outline') {
    return (
      <Image
        accessibilityLabel="Location"
        source={locationPinImage}
        style={{ height: size + 8, width: size + 8 }}
      />
    );
  }

  if (name === 'location-outline' || name === 'map-outline') {
    return <Image accessibilityLabel="Location" source={locationPinImage} style={{ height: size + 8, width: size + 8 }} />;
  }

  if (name === 'camera-outline') {
    return <Image accessibilityLabel="Photo evidence" source={photoEvidenceIcon} style={{ height: size + 8, width: size + 8 }} />;
  }

  if (name === 'mic-outline') {
    return <Image accessibilityLabel="Voice evidence" source={voiceEvidenceIcon} style={{ height: size + 8, width: size + 8 }} />;
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
  glyph: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5
  }
});
