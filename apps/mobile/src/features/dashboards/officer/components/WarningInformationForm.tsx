import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { WARNING_FIELD_LIMITS, type WarningRiskLevel } from '@safealert/contracts';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { warningFields, type WarningForm, type WarningFormErrors } from '../warningForm';

type EditableField = Exclude<keyof WarningForm, 'affectedArea' | 'attachments'>;

export function WarningInformationForm({ form, affectedArea, riskLevel, errors, onChange }: {
  form: WarningForm;
  affectedArea: string | null;
  riskLevel: WarningRiskLevel;
  errors: WarningFormErrors;
  onChange: (field: EditableField, value: string) => void;
}) {
  const [focused, setFocused] = useState<EditableField | null>(null);
  return <View style={styles.card}>
    <View style={styles.headingRow}>
      <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>01</Text></View>
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={styles.heading}>Warning information</Text>
        <Text style={styles.helper}>Review the location and add clear safety instructions.</Text>
      </View>
    </View>

    <View style={styles.contextRow}>
      <View style={styles.riskCard}>
        <Text style={styles.contextLabel}>Risk Level</Text>
        <PriorityBadge priority={riskLevel} />
        <Text style={styles.helper}>Confirmed in the saved assessment.</Text>
      </View>
      <View style={[styles.areaCard, !affectedArea && styles.invalidArea]}>
        <View style={styles.areaHeading}>
          <Text style={styles.contextLabel}>Affected Area</Text>
          <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>FROM REPORT</Text></View>
        </View>
        {affectedArea ? <>
          <Text accessibilityLabel={`Affected Area: ${affectedArea}`} selectable style={styles.areaValue}>{affectedArea}</Text>
          <Text style={styles.coordinateHint}>Latitude, longitude</Text>
          <Text style={styles.areaHelper}>Saved report location. Included automatically in this warning.</Text>
        </> : <Text accessibilityRole="alert" style={styles.error}>
          The source report location is unavailable. Reload the assessment before creating a warning.
        </Text>}
      </View>
    </View>

    <View style={styles.divider} />
    <View style={styles.instructionsHeading}>
      <Text style={styles.subheading}>Safety instructions</Text>
      <Text style={styles.helper}>* Required fields</Text>
    </View>
    <View style={styles.fields}>
      {warningFields.map((field) => {
        if (field.key === 'affectedArea') return null;
        const isRoadField = field.key === 'unsafeRoads' || field.key === 'safeRoutes';
        return <View key={field.key} style={[styles.field, isRoadField && styles.roadField]}>
          <Text style={styles.label}>{field.label}{field.required ? <Text style={styles.required}> *</Text> : <Text style={styles.optional}> (optional)</Text>}</Text>
          <TextInput accessibilityLabel={`${field.label}${field.required ? ' (required)' : ''}`}
            value={form[field.key]} multiline maxLength={WARNING_FIELD_LIMITS[field.key]}
            placeholder={field.placeholder} placeholderTextColor={dashboardTheme.colors.muted}
            onChangeText={(value) => onChange(field.key, value)}
            onFocus={() => setFocused(field.key)} onBlur={() => setFocused(null)}
            style={[styles.input, field.key === 'message' && styles.message,
              focused === field.key && styles.focusedInput, !!errors[field.key] && styles.invalidInput]} />
          {errors[field.key] ? <Text accessibilityRole="alert" style={styles.error}>{errors[field.key]}</Text> : null}
        </View>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 22, padding: 20, borderRadius: dashboardTheme.radius.md, borderWidth: 1,
    borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surface, ...cardShadow },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionNumber: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: dashboardTheme.colors.primarySoft },
  sectionNumberText: { color: dashboardTheme.colors.primaryStrong, fontSize: 15, fontWeight: '800' },
  headingCopy: { flex: 1, gap: 4 },
  heading: { color: dashboardTheme.colors.text, fontSize: 20, fontWeight: '800' },
  helper: { color: dashboardTheme.colors.muted, fontSize: 13, lineHeight: 20 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  riskCard: { flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: 12, padding: 18, borderRadius: 16,
    borderWidth: 1, borderColor: dashboardTheme.colors.border, backgroundColor: dashboardTheme.colors.surfaceMuted },
  contextLabel: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '700' },
  areaCard: { flexGrow: 2, flexShrink: 1, flexBasis: 280, gap: 8, padding: 18, borderRadius: 16, borderWidth: 1,
    borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  areaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  sourceBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: dashboardTheme.colors.primarySoft },
  sourceBadgeText: { fontSize: 10, letterSpacing: 0.7, fontWeight: '800', color: dashboardTheme.colors.primaryStrong },
  areaValue: { color: dashboardTheme.colors.primaryStrong, fontSize: 20, fontWeight: '800', lineHeight: 29, marginTop: 5 },
  coordinateHint: { color: dashboardTheme.colors.muted, fontSize: 12 },
  areaHelper: { color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 4 },
  invalidArea: { backgroundColor: dashboardTheme.colors.criticalSoft, borderColor: '#fecaca' },
  divider: { height: 1, backgroundColor: dashboardTheme.colors.border },
  instructionsHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  subheading: { fontSize: 15, fontWeight: '700', color: dashboardTheme.colors.text },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  field: { width: '100%', gap: 8 },
  roadField: { width: 'auto', flexGrow: 1, flexShrink: 1, flexBasis: 260 },
  label: { color: dashboardTheme.colors.text, fontSize: 14, fontWeight: '600' },
  required: { color: dashboardTheme.colors.primary },
  optional: { color: dashboardTheme.colors.muted, fontWeight: '400' },
  input: { minHeight: 94, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', outlineWidth: 0,
    backgroundColor: dashboardTheme.colors.surfaceMuted, fontSize: 15, lineHeight: 23, color: dashboardTheme.colors.text, textAlignVertical: 'top' },
  message: { minHeight: 132 },
  focusedInput: { borderColor: dashboardTheme.colors.primary, backgroundColor: dashboardTheme.colors.surface },
  invalidInput: { borderColor: dashboardTheme.colors.critical },
  error: { fontSize: 13, lineHeight: 20, color: dashboardTheme.colors.critical }
});
