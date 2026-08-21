import { StyleSheet } from 'react-native';

export const authStyles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#f8fafc'
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a'
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#475569'
  },
  form: {
    gap: 12
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#0f172a'
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0369a1',
    paddingHorizontal: 16
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0369a1',
    paddingHorizontal: 16
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff'
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0369a1'
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: '#b91c1c'
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b'
  }
});
