export const dashboardTheme = {
  colors: {
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceMuted: '#f7fafc',
    border: '#e2e8f0',
    text: '#111827',
    muted: '#64748b',
    primary: '#2563eb',
    primarySoft: '#dbeafe',
    primaryStrong: '#1d4ed8',
    info: '#2563eb',
    infoSoft: '#dbeafe',
    critical: '#dc2626',
    criticalSoft: '#fee2e2',
    high: '#f97316',
    highSoft: '#ffedd5',
    moderate: '#f97316',
    moderateSoft: '#ffedd5',
    low: '#16a34a',
    lowSoft: '#dcfce7',
    success: '#16a34a',
    successSoft: '#dcfce7'
  },
  radius: {
    sm: 14,
    md: 20,
    lg: 26
  }
} as const;

export const cardShadow = {
  shadowColor: '#111827',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: {
    width: 0,
    height: 6
  },
  elevation: 2
} as const;
