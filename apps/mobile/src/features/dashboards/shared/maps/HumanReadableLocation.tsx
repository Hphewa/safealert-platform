import type { GeoJsonPoint } from '@safealert/contracts';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useLocationLabel } from './useLocationLabel';

export function HumanReadableLocation({ location, style, numberOfLines }: {
  location: GeoJsonPoint; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const label = useLocationLabel(location);
  return <Text style={style} numberOfLines={numberOfLines}>{label}</Text>;
}
