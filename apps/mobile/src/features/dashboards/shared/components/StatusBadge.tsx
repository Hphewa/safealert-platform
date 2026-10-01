import { StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../theme';
import type { BadgeTone } from '../types';

type StatusBadgeProps = {
  label: string;
  tone: BadgeTone;
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const toneStyle = toneMap[tone];

  return (
    <View accessibilityRole="text" accessibilityLabel={label} accessible style={[styles.badge, toneStyle.container]}>
      <Text style={[styles.label, toneStyle.label]}>{label}</Text>
    </View>
  );
}

const toneMap = {
  critical: {
    container: {
      backgroundColor: dashboardTheme.colors.criticalSoft
    },
    label: {
      color: dashboardTheme.colors.critical
    }
  },
  high: {
    container: {
      backgroundColor: dashboardTheme.colors.highSoft
    },
    label: {
      color: dashboardTheme.colors.high
    }
  },
  moderate: {
    container: {
      backgroundColor: dashboardTheme.colors.moderateSoft
    },
    label: {
      color: dashboardTheme.colors.moderate
    }
  },
  low: {
    container: {
      backgroundColor: dashboardTheme.colors.lowSoft
    },
    label: {
      color: dashboardTheme.colors.low
    }
  },
  info: {
    container: {
      backgroundColor: dashboardTheme.colors.infoSoft
    },
    label: {
      color: dashboardTheme.colors.info
    }
  },
  success: {
    container: {
      backgroundColor: dashboardTheme.colors.successSoft
    },
    label: {
      color: dashboardTheme.colors.success
    }
  },
  neutral: {
    container: {
      backgroundColor: dashboardTheme.colors.surfaceMuted
    },
    label: {
      color: dashboardTheme.colors.text
    }
  }
} as const;

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  }
});
