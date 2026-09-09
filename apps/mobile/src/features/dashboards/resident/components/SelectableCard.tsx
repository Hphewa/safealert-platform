import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { dashboardTheme } from '../../shared/theme';
import type { DashboardIconName } from '../../shared/types';

type SelectableCardProps<TValue extends string> = {
  label: string;
  value: TValue;
  selected: boolean;
  icon?: DashboardIconName;
  accessibilityLabel?: string;
  onSelect: (value: TValue) => void;
};

export function SelectableCard<TValue extends string>({
  label,
  value,
  selected,
  icon,
  accessibilityLabel,
  onSelect
}: SelectableCardProps<TValue>) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.cardPressed
      ]}
    >
      {icon ? (
        <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
          <DashboardGlyph
            color={selected ? dashboardTheme.colors.primaryStrong : dashboardTheme.colors.info}
            name={icon}
            size={20}
          />
        </View>
      ) : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      <View style={[styles.selectionDot, selected && styles.selectionDotSelected]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 104,
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  cardSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  cardPressed: {
    opacity: 0.82
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: dashboardTheme.colors.infoSoft
  },
  iconWrapSelected: {
    backgroundColor: dashboardTheme.colors.primarySoft
  },
  label: {
    paddingRight: 24,
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  labelSelected: {
    color: dashboardTheme.colors.primaryStrong
  },
  selectionDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: dashboardTheme.colors.border,
    borderRadius: 8,
    backgroundColor: dashboardTheme.colors.surface
  },
  selectionDotSelected: {
    borderColor: dashboardTheme.colors.primary,
    backgroundColor: dashboardTheme.colors.primary
  }
});
