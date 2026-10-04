import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  HAZARD_ASSESSMENT_SEVERITIES, INFRASTRUCTURE_IMPACT_LEVELS, ROAD_ACCESSIBILITY_OPTIONS,
  WATER_LEVEL_TRENDS, WEATHER_CONDITIONS, type AssessmentRoadAccessibility,
  type HazardAssessmentSeverity, type InfrastructureImpact, type WaterLevelTrend, type WeatherCondition
} from '@safealert/contracts';
import { AssessmentButton, AssessmentOptions, assessmentStyles } from './RiskAssessmentComponents';
import type { RiskAssessmentForm } from '../riskAssessmentForm';

export type AssessmentFactorSection = 'situation' | 'impact' | 'environment';
type Props = {
  section: AssessmentFactorSection;
  factors: RiskAssessmentForm;
  hazardType: string;
  errors?: Partial<Record<'peopleAffected' | 'vulnerablePeople', string>>;
  showErrors?: boolean;
  onChange: <K extends keyof RiskAssessmentForm>(key: K, value: RiskAssessmentForm[K]) => void;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
};

export const roadLabels: Record<AssessmentRoadAccessibility, string> = {
  ACCESSIBLE: 'Accessible', PARTIALLY_BLOCKED: 'Partially blocked', FULLY_BLOCKED: 'Fully blocked', UNKNOWN: 'Unknown'
};
const roadDescriptions: Record<AssessmentRoadAccessibility, string> = {
  ACCESSIBLE: 'Normal road access available', PARTIALLY_BLOCKED: 'Access remains possible with difficulty',
  FULLY_BLOCKED: 'Normal vehicle access unavailable', UNKNOWN: 'Road access has not been confirmed'
};
export const infrastructureLabels: Record<InfrastructureImpact, string> = {
  NONE: 'None', LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High', SEVERE: 'Severe'
};
export const waterLabels: Record<WaterLevelTrend, string> = {
  FALLING: 'Falling', STABLE: 'Stable', RISING: 'Rising', RISING_RAPIDLY: 'Rising rapidly',
  NOT_APPLICABLE: 'Not applicable', UNKNOWN: 'Unknown'
};
export const weatherLabels: Record<WeatherCondition, string> = {
  CLEAR: 'Clear', LIGHT_RAIN: 'Light rain', MODERATE_RAIN: 'Moderate rain', HEAVY_RAIN: 'Heavy rain',
  STORM: 'Storm', UNKNOWN: 'Unknown'
};

export function AssessmentFactorFields({ section, factors, hazardType, errors = {}, showErrors = false,
  onChange, onBack, onContinue, continueLabel = 'CONTINUE' }: Props) {
  const countField = (key: 'peopleAffected' | 'vulnerablePeople', label: string, hint?: string) => <View style={styles.field} key={key}>
    <Text style={assessmentStyles.label}>{label}</Text>
    {hint ? <Text style={assessmentStyles.helper}>{hint}</Text> : null}
    <TextInput accessibilityLabel={label} accessibilityHint={showErrors ? errors[key] : undefined}
      keyboardType="number-pad" value={factors[key]} onChangeText={(value) => onChange(key, value)}
      placeholder={`Enter ${label.toLowerCase()}`} style={[assessmentStyles.input, showErrors && errors[key] ? assessmentStyles.inputError : null]} />
    {showErrors && errors[key] ? <Text accessibilityRole="alert" style={assessmentStyles.error}>{errors[key]}</Text> : null}
  </View>;

  return <View style={assessmentStyles.card}>
    {section === 'situation' ? <>
      <AssessmentOptions label="Hazard Severity" options={HAZARD_ASSESSMENT_SEVERITIES}
        value={factors.hazardSeverity} onChange={(value: HazardAssessmentSeverity) => onChange('hazardSeverity', value)} />
      {countField('peopleAffected', 'People Affected')}
      {countField('vulnerablePeople', 'Vulnerable People', 'May include children, older adults, people with disabilities, or people requiring medical assistance.')}
    </> : null}
    {section === 'impact' ? <>
      <AssessmentOptions label="Road Accessibility" options={ROAD_ACCESSIBILITY_OPTIONS} value={factors.roadAccessibility}
        optionLabels={roadLabels} onChange={(value: AssessmentRoadAccessibility) => onChange('roadAccessibility', value)} />
      <View style={styles.optionHelp}>{ROAD_ACCESSIBILITY_OPTIONS.map((value) => <Text key={value} style={assessmentStyles.helper}>{roadLabels[value]} — {roadDescriptions[value]}</Text>)}</View>
      <AssessmentOptions label="Infrastructure Impact" options={INFRASTRUCTURE_IMPACT_LEVELS} value={factors.infrastructureImpact}
        optionLabels={infrastructureLabels} onChange={(value: InfrastructureImpact) => onChange('infrastructureImpact', value)} />
    </> : null}
    {section === 'environment' ? <>
      <AssessmentOptions label="Water Level Trend" options={WATER_LEVEL_TRENDS} value={factors.waterLevelTrend}
        optionLabels={waterLabels} onChange={(value: WaterLevelTrend) => onChange('waterLevelTrend', value)} />
      <AssessmentOptions label="Weather Condition" options={WEATHER_CONDITIONS} value={factors.weatherCondition}
        optionLabels={weatherLabels} onChange={(value: WeatherCondition) => onChange('weatherCondition', value)} />
      {hazardType !== 'FLOOD' ? <Text style={assessmentStyles.helper}>Water trend is recorded for context; it contributes to scoring only for flood incidents.</Text> : null}
    </> : null}
    {(onBack || onContinue) ? <View style={styles.actions}>
      {onBack ? <AssessmentButton label="BACK" secondary onPress={onBack} /> : null}
      {onContinue ? <AssessmentButton label={continueLabel} onPress={onContinue} /> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  optionHelp: { gap: 5, marginTop: -7, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }
});
