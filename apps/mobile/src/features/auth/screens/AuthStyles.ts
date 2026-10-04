import { StyleSheet } from 'react-native';

export const authStyles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    padding: 22,
    backgroundColor: '#f4f7fa'
  },
  brandPanel: {
    gap: 8,
    padding: 22,
    borderRadius: 24,
    backgroundColor: '#102a43'
  },
  brandName: { fontSize: 25, fontWeight: '900', color: '#ffffff' },
  brandTagline: { fontSize: 14, lineHeight: 20, color: '#d9e2ec' },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: '#0b5fc1' },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#172b4d'
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#60758a'
  },
  form: {
    gap: 12
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#d9e2ec',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#172b4d'
  },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#1473e6',
    paddingHorizontal: 16
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1473e6',
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
    color: '#0b5fc1'
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: '#dc2626'
  },
  helper: {
    fontSize: 13,
    lineHeight: 18,
    color: '#60758a'
  }
});
