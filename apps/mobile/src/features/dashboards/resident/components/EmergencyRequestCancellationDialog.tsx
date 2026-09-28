import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dashboardTheme } from '../../shared/theme';

type Props = {
  isSubmitting: boolean;
  onKeepRequest: () => void;
  onConfirm: () => void;
};

export function EmergencyRequestCancellationDialog({ isSubmitting, onKeepRequest, onConfirm }: Props) {
  // Native Alert is a no-op in the installed web renderer. Modal preserves the
  // same explicit, labelled safe/destructive choices on mobile and web.
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onKeepRequest}>
      <View style={styles.overlay}>
        <ScrollView style={styles.dialog} contentContainerStyle={styles.content}>
          <View accessibilityViewIsModal style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>Cancel emergency request?</Text>
            <Text style={styles.message}>
              Are you sure you want to cancel this emergency assistance request? This action cannot be undone.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep Request"
              accessibilityState={{ disabled: isSubmitting }}
              disabled={isSubmitting}
              onPress={onKeepRequest}
              style={({ pressed }) => [styles.button, styles.keep, (pressed || isSubmitting) && styles.dimmed]}
            >
              <Text style={styles.keepText}>Keep Request</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel Request"
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
              disabled={isSubmitting}
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, styles.cancel, (pressed || isSubmitting) && styles.dimmed]}
            >
              <Text style={styles.cancelText}>{isSubmitting ? 'Cancelling...' : 'Cancel Request'}</Text>
            </Pressable>
            {isSubmitting ? <Text accessibilityLiveRegion="polite" style={styles.message}>Cancelling your request...</Text> : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  dialog: { flexGrow: 0, maxHeight: '90%', width: '100%', maxWidth: 420, borderRadius: dashboardTheme.radius.md, backgroundColor: dashboardTheme.colors.surface },
  content: { padding: 12, gap: 16 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: '800', color: dashboardTheme.colors.text },
  message: { fontSize: 16, lineHeight: 24, color: dashboardTheme.colors.text },
  button: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: dashboardTheme.radius.sm },
  keep: { backgroundColor: dashboardTheme.colors.primaryStrong },
  keepText: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.surface },
  cancel: { borderWidth: 1, borderColor: dashboardTheme.colors.critical },
  cancelText: { fontSize: 16, fontWeight: '800', color: dashboardTheme.colors.critical },
  dimmed: { opacity: 0.65 }
});
