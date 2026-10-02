import type { ImageSourcePropType } from 'react-native';

import floodImage from '../../../../assets/hazards/flood.png';
import landslideImage from '../../../../assets/hazards/landslide.png';
import blockedRoadImage from '../../../../assets/hazards/blocked-road.png';
import otherImage from '../../../../assets/hazards/other.png';

export function hazardImageForType(hazardType?: string): ImageSourcePropType {
  switch (hazardType?.toUpperCase()) {
    case 'FLOOD': return floodImage;
    case 'LANDSLIDE': return landslideImage;
    case 'BLOCKED_ROAD': return blockedRoadImage;
    default: return otherImage;
  }
}
