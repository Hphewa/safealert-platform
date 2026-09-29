import { StyleSheet, View } from 'react-native';

export function SearchIcon({ color, size = 20 }: { color: string; size?: number }) {
  const handleLength = Math.max(6, Math.round(size * 0.4));

  return (
    <View accessibilityLabel="Search" style={[styles.icon, { height: size, width: size }]}>
      <View
        style={[
          styles.circle,
          {
            borderColor: color,
            borderRadius: size * 0.3,
            height: size * 0.6,
            width: size * 0.6
          }
        ]}
      />
      <View
        style={[
          styles.handle,
          {
            backgroundColor: color,
            height: 2,
            right: 0,
            top: size - handleLength,
            transform: [{ rotate: '45deg' }],
            width: handleLength
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'relative',
    justifyContent: 'flex-start'
  },
  circle: {
    borderWidth: 2
  },
  handle: {
    position: 'absolute',
    borderRadius: 1
  }
});
