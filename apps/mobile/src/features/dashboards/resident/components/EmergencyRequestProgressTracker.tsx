import type { ResponseStatus } from '@safealert/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, dashboardTheme } from '../../shared/theme';
import {
  buildResidentEmergencyRequestProgress,
  type ResidentEmergencyRequestProgressStage
} from '../emergencyRequestPresentation';

const stageStateLabels: Record<ResidentEmergencyRequestProgressStage['state'], string> = {
  reached: 'Reached',
  current: 'Current stage',
  future: 'Not yet reached'
};

export function EmergencyRequestProgressTracker({ status }: { status: ResponseStatus }) {
  // Cancellation is a final outcome outside responder progress, not a missing
  // or pending stage. Preserve the record without implying an active response.
  if (status === 'CANCELLED') {
    return (
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.heading}>Request cancelled</Text>
        <Text style={styles.state}>This request is no longer active. Your request details remain available below.</Text>
      </View>
    );
  }
  const stages = buildResidentEmergencyRequestProgress(status);

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>Emergency Response Progress</Text>
      {stages ? (
        <View>
          {stages.map((stage, index) => (
            <View
              key={stage.status}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${stage.label}, ${stageStateLabels[stage.state]}`}
              style={styles.row}
            >
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rail}>
                <View style={[
                  styles.marker,
                  stage.state === 'reached' && styles.reachedMarker,
                  stage.state === 'current' && styles.currentMarker
                ]}>
                  {stage.state === 'reached' ? (
                    <Text allowFontScaling={false} style={styles.checkmark}>{'\u2713'}</Text>
                  ) : stage.state === 'current' ? <View style={styles.currentDot} /> : null}
                </View>
                {index < stages.length - 1 ? <View style={styles.connector} /> : null}
              </View>
              <View style={styles.stageText}>
                <Text style={[styles.label, stage.state === 'current' && styles.currentText]}>{stage.label}</Text>
                <Text style={[styles.state, stage.state === 'current' && styles.currentText]}>{stageStateLabels[stage.state]}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : <Text style={styles.state}>Progress unavailable.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  heading: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  rail: {
    width: 28,
    alignItems: 'center'
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: dashboardTheme.colors.muted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reachedMarker: {
    borderColor: dashboardTheme.colors.success,
    backgroundColor: dashboardTheme.colors.successSoft
  },
  currentMarker: {
    borderColor: dashboardTheme.colors.primaryStrong,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  currentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dashboardTheme.colors.primaryStrong
  },
  connector: {
    flex: 1,
    minHeight: 16,
    width: 2,
    backgroundColor: dashboardTheme.colors.border
  },
  stageText: {
    flex: 1,
    gap: 2,
    paddingBottom: 16
  },
  label: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: dashboardTheme.colors.text
  },
  state: {
    fontSize: 14,
    lineHeight: 20,
    color: dashboardTheme.colors.muted
  },
  currentText: {
    color: dashboardTheme.colors.primaryStrong,
    fontWeight: '800'
  }
});
