export const dashboardTheme = {
  colors: {
    background: '#eef4f8',
    surface: '#ffffff',
    surfaceMuted: '#f7fafc',
    border: '#d7e3ec',
    text: '#102033',
    muted: '#5f7185',
    primary: '#0f766e',
    primarySoft: '#dff7f3',
    primaryStrong: '#115e59',
    info: '#0f4c81',
    infoSoft: '#dcecff',
    critical: '#b42318',
    criticalSoft: '#fde7e5',
    high: '#c2410c',
    highSoft: '#ffedd5',
    moderate: '#b45309',
    moderateSoft: '#fef3c7',
    low: '#166534',
    lowSoft: '#dcfce7',
    success: '#166534',
    successSoft: '#dcfce7'
  },
  radius: {
    sm: 14,
    md: 20,
    lg: 26
  }
} as const;

export const cardShadow = {
  shadowColor: '#102033',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: {
    width: 0,
    height: 6
  },
  elevation: 2
} as const;
