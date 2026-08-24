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
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel={decrementAccessibilityLabel ?? `Decrease ${label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDecrement }}
          disabled={!canDecrement}
          onPress={() => onChange(Math.max(min, value - 1))}
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
          onPress={() => onChange(typeof max === 'number' ? Math.min(max, value + 1) : value + 1)}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  button: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.primary,
    borderRadius: 21,
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
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
