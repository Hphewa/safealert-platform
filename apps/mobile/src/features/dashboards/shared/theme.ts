export const dashboardTheme = {
  colors: {
    background: '#f4f7fa',
    surface: '#ffffff',
    surfaceMuted: '#eef3f7',
    border: '#d9e2ec',
    text: '#172b4d',
    muted: '#60758a',
    primary: '#1473e6',
    primarySoft: '#e2efff',
    primaryStrong: '#0b5fc1',
    info: '#1473e6',
    infoSoft: '#e2efff',
    critical: '#d92d20',
    criticalSoft: '#fee4e2',
    high: '#f79009',
    highSoft: '#fff0d6',
    moderate: '#d9a514',
    moderateSoft: '#fff7cc',
    low: '#16a34a',
    lowSoft: '#dcfce7',
    success: '#16a34a',
    successSoft: '#dcfce7',
    navy: '#102a43',
    navySoft: '#dfeaf5',
    teal: '#0f766e',
    tealSoft: '#d9f4ef'
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24
  }
} as const;

import { Platform } from 'react-native';

export const cardShadow = Platform.select({
  web: {
    boxShadow: '0px 6px 12px rgba(17, 24, 39, 0.06)'
  },
  default: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  }
}) ?? {};
