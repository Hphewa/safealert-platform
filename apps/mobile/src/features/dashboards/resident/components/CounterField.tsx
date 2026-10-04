import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../../shared/theme';

type CounterFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helperText?: string;
  min?: number;
  max?: number;
  containerStyle?: StyleProp<ViewStyle>;
  decrementAccessibilityLabel?: string;
  incrementAccessibilityLabel?: string;
};

export function CounterField({
  label,
  value,
  onChange,
  helperText,
  min = 0,
  max,
  containerStyle,
  decrementAccessibilityLabel,
  incrementAccessibilityLabel
}: CounterFieldProps) {
  const canDecrement = value > min;
  const canIncrement = typeof max === 'number' ? value < max : true;

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
        {typeof max === 'number' ? (
          <Text style={styles.helperText}>Maximum is {max} because {max} people are reported as needing assistance.</Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel={decrementAccessibilityLabel ?? `Decrease ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDecrement }}
          disabled={!canDecrement}
          onPress={() => { if (canDecrement) onChange(Math.max(min, value - 1)); }}
          style={({ pressed }) => [
            styles.button,
            !canDecrement && styles.buttonDisabled,
            pressed && canDecrement && styles.pressed
          ]}
        >
          <Text style={[styles.buttonText, !canDecrement && styles.buttonTextDisabled]}>-</Text>
        </Pressable>

        <View accessibilityRole="adjustable" accessibilityValue={{ min, now: value, max }} style={styles.valueWrap}>
          <Text style={styles.value}>{value}</Text>
        </View>

        <Pressable
          accessibilityLabel={incrementAccessibilityLabel ?? `Increase ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canIncrement }}
          disabled={!canIncrement}
          onPress={() => { if (canIncrement) onChange(value + 1); }}
          style={({ pressed }) => [
            styles.button,
            !canIncrement && styles.buttonDisabled,
            pressed && canIncrement && styles.pressed
          ]}
        >
          <Text style={[styles.buttonText, !canIncrement && styles.buttonTextDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  header: {
    gap: 4
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    color: dashboardTheme.colors.muted
  },
  controls: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  button: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: 19,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  buttonDisabled: {
    borderColor: dashboardTheme.colors.border,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  buttonText: {
    fontSize: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.primaryStrong
  },
  buttonTextDisabled: {
    color: dashboardTheme.colors.muted
  },
  valueWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  pressed: {
    opacity: 0.82
  }
});
