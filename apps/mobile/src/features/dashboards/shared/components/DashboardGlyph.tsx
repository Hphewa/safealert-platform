import { Image, StyleSheet, Text, View } from 'react-native';

import locationPinImage from '../../../../../assets/hazards/location-pin.png';
import photoEvidenceIcon from '../../../../../assets/evidence/photo-evidence.png';
import voiceEvidenceIcon from '../../../../../assets/evidence/voice-evidence.png';

type DashboardGlyphProps = { name: string; color: string; size?: number };

const glyphMap: Record<string, string> = {
  'home-outline': '⌂', 'notifications-outline': '●', 'document-text-outline': '▤',
  'person-outline': '●', 'person-circle-outline': '●', 'warning-outline': '!',
  'checkmark-done-outline': '✓', 'help-buoy-outline': '◉', 'cloudy-rainy-outline': '☁',
  'water-outline': '≈', 'create-outline': '✎', 'shield-checkmark-outline': '⬟',
  'alert-circle-outline': '!', 'trail-sign-outline': '⚑', 'flame-outline': '♨',
  'reader-outline': '▤', 'speedometer-outline': '◔', 'eye-outline': '◉',
  'locate-outline': 'NB', 'location-outline': 'NB', 'help-circle-outline': '?',
  'leaf-outline': '♧', 'rainy-outline': '☂', 'book-outline': '▥', 'list-outline': '☷',
  'flash-outline': 'ϟ', 'time-outline': '◷', 'search-outline': '⌕', 'bus-outline': '▣',
  'medical-outline': '+', 'map-outline': '⌖', 'camera-outline': 'PH', 'mic-outline': 'VO',
  'refresh-outline': '↻', 'people-outline': '♟', 'play-outline': '▶', 'pause-outline': '⏸',
  'log-out-outline': 'LG', 'construct-outline': 'UI', 'chevron-forward': '>', 'arrow-back': '<'
};

export function DashboardGlyph({ name, color, size = 18 }: DashboardGlyphProps) {
  if (name === 'person-circle-outline') {
    return <View style={[styles.personIcon, { width: size, height: size }]}>
      <View style={[styles.personHead, { width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, backgroundColor: color }]} />
      <View style={[styles.personBody, { width: size * 0.7, height: size * 0.36, borderRadius: size * 0.22, backgroundColor: color }]} />
    </View>;
  }

  if (name === 'notifications-outline') {
    return <View style={[styles.bellIcon, { width: size, height: size * 1.1 }]}>
      <View style={[styles.bellBody, { top: size * 0.1, left: size * 0.2, width: size * 0.6, height: size * 0.62, borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3, borderBottomLeftRadius: size * 0.08, borderBottomRightRadius: size * 0.08, backgroundColor: color }]} />
      <View style={[styles.bellRim, { bottom: size * 0.16, left: size * 0.08, width: size * 0.84, height: size * 0.14, borderRadius: size * 0.07, backgroundColor: color }]} />
      <View style={[styles.bellClapper, { bottom: 0, left: size * 0.41, width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: color }]} />
    </View>;
  }

  if (name === 'locate-outline' || name === 'location-outline' || name === 'map-outline') {
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
  return <Text style={[styles.glyph, { color, fontSize: isSymbol ? size : size * 0.58, lineHeight: isSymbol ? size * 1.05 : size * 0.9 }]}>{glyph}</Text>;
}

const styles = StyleSheet.create({
  personIcon: { alignItems: 'center', justifyContent: 'flex-end', gap: 2 }, personHead: {}, personBody: {},
  bellIcon: { position: 'relative', alignItems: 'center' }, bellBody: { position: 'absolute' },
  bellRim: { position: 'absolute' }, bellClapper: { position: 'absolute' },
  glyph: { fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 }
});
