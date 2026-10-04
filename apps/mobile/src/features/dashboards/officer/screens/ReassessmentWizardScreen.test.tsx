import type { ReactNode } from 'react';
import { createRequire } from 'node:module';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IncidentMonitoringDetailResponse, RiskAssessmentResponse, SafeRiskAssessment } from '@safealert/contracts';
import type { RiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraftState';
import type { RiskAssessmentForm } from '../riskAssessmentForm';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: ReactNode) => string };
const state = vi.hoisted(() => ({
  step: 'reason',
  draft: null as RiskAssessmentDraft | null,
  data: null as { assessment: SafeRiskAssessment; detail: IncidentMonitoringDetailResponse } | null,
  actions: new Map<string, () => void>(),
  route: vi.fn(),
  params: vi.fn(),
  resource: vi.fn(),
  initialize: vi.fn(),
  update: vi.fn(),
  reason: vi.fn(),
  preview: vi.fn(),
  finalRisk: vi.fn(),
  decisionReason: vi.fn(),
  reset: vi.fn(),
  getAssessment: vi.fn(),
  calculate: vi.fn(),
  reassess: vi.fn()
}));

vi.mock('react-native', () => ({
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: 'web' },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({ accessibilityLabel, value }: { accessibilityLabel: string; value: string }) => <input aria-label={accessibilityLabel} value={value} readOnly />,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}));
vi.mock('expo-router', () => ({
  useFocusEffect: vi.fn(),
  useLocalSearchParams: () => ({ assessmentId: 'assessment-1', step: state.step }),
  useRouter: () => ({ setParams: state.route, replace: state.route })
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'officer-token' }) }));
vi.mock('../hooks/useAssessmentResource', () => ({ useAssessmentResource: () => state.resource() }));
vi.mock('../assessment-flow/riskAssessmentDraft', () => ({ useRiskAssessmentDraft: () => ({
  draft: state.draft, initializeReassessment: state.initialize, updateSingleFactor: state.update,
  setReassessmentReason: state.reason, setCalculationPreview: state.preview, setFinalRisk: state.finalRisk,
  setDecisionReason: state.decisionReason, resetAssessmentDraft: state.reset
}) }));
vi.mock('../hooks/useAssessmentDraftExitGuard', () => ({ useAssessmentDraftExitGuard: () => vi.fn() }));
vi.mock('../api/riskAssessmentApi', () => ({ getRiskAssessment: state.getAssessment, calculateRiskAssessment: state.calculate, reassessRiskAssessment: state.reassess }));
vi.mock('../api/incidentApi', () => ({ getIncidentMonitoringDetail: vi.fn() }));
vi.mock('../components/RiskAssessmentComponents', () => ({
  AssessmentButton: ({ label, onPress }: { label: string; onPress: () => void }) => { state.actions.set(label, onPress); return <button>{label}</button>; },
  AssessmentDetail: ({ label, value }: { label: string; value: string | number }) => <div>{label}: {value}</div>,
  AssessmentLoadState: () => <span>Loading</span>, AssessmentPage: ({ title, children }: { title: string; children?: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  AssessmentOptions: ({ label, value }: { label: string; value: string }) => <div>{label}: {value}</div>,
  assessmentStyles: new Proxy({}, { get: () => undefined })
}));
vi.mock('../components/AssessmentFactorFields', () => ({ AssessmentFactorFields: ({ section, factors }: { section: string; factors: Record<string, string> }) => <div>{section}: {factors.peopleAffected}</div> }));
vi.mock('./RiskDecisionScreen', () => ({ RiskDecisionScreen: () => <div>Final officer decision</div> }));
vi.mock('../../shared/components/PriorityBadge', () => ({ PriorityBadge: ({ priority }: { priority: string }) => <span>{priority}</span> }));

import { ReassessmentWizardScreen } from './ReassessmentWizardScreen';

const response = {
  assessment: {
    id: 'assessment-1', incidentId: 'incident-1', hazardSeverity: 'HIGH', peopleAffected: 18,
    vulnerablePeople: 6, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
    waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN', calculatedScore: 18,
    systemSuggestedRisk: 'HIGH', finalRiskLevel: 'HIGH', assessedById: 'officer-1', status: 'ACTIVE', isDeleted: false,
    assessedAt: '2026-09-26T12:00:00.000Z', createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z'
  },
  incident: { id: 'incident-1', hazardType: 'FLOOD', location: { type: 'Point', coordinates: [79.86, 6.92] }, reportIds: ['report-1'], status: 'ACTIVE', createdById: 'officer-1', createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T11:00:00.000Z' },
  reports: []
} as unknown as RiskAssessmentResponse;
const detail = { monitoring: {
  incident: response.incident, currentAssessment: response.assessment, latestAssessment: response.assessment,
  totalVerifiedReports: 1, newVerifiedReportsSinceAssessment: 0, latestVerifiedReportAt: null,
  hasNewVerifiedEvidence: false, warnings: []
}, recentVerifiedReports: [] } as unknown as IncidentMonitoringDetailResponse;
const factors = { hazardSeverity: 'HIGH', peopleAffected: '18', vulnerablePeople: '6', roadAccessibility: 'PARTIALLY_BLOCKED',
  infrastructureImpact: 'MODERATE', waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' } as RiskAssessmentForm;
const preview = { factors: { ...response.assessment }, result: { calculatedScore: 18, systemSuggestedRisk: 'HIGH', factorContributions: [], calculationVersion: 'risk-v1' } } as unknown as NonNullable<RiskAssessmentDraft['calculationPreview']>;

beforeEach(() => {
  state.step = 'reason'; state.actions.clear(); state.route.mockReset(); state.initialize.mockReset(); state.update.mockReset();
  state.reason.mockReset(); state.preview.mockReset(); state.finalRisk.mockReset(); state.decisionReason.mockReset(); state.reset.mockReset();
  state.getAssessment.mockReset(); state.calculate.mockReset(); state.reassess.mockReset();
  state.data = { assessment: response.assessment, detail };
  state.draft = { mode: 'REASSESSMENT', assessmentId: 'assessment-1', incidentId: 'incident-1', previousAssessment: response.assessment,
    factors, calculationPreview: null, finalRiskLevel: 'HIGH', decisionReason: '', reassessmentReason: 'Rising water and new road closure.' } as unknown as RiskAssessmentDraft;
  state.resource.mockReturnValue({ data: state.data, loading: false, error: null, reload: vi.fn() });
});

function renderWizard() { return renderToStaticMarkup(<ReassessmentWizardScreen />); }

it('shows the prior decision and permits review when no new evidence is available', () => {
  const markup = renderWizard();
  expect(markup).toContain('Reason &amp; Evidence');
  expect(markup).toContain('Current score: 18');
  expect(markup).toContain('New verified reports: 0');
  expect(markup).toContain('You can still reassess using current information');
  expect(markup).toContain('Rising water and new road closure.');
});

it('reviews changed factors with numeric deltas and keeps unchanged factors out', () => {
  state.step = 'review';
  state.draft = { ...(state.draft as RiskAssessmentDraft), factors: { ...factors, peopleAffected: '24', roadAccessibility: 'FULLY_BLOCKED' } };
  const markup = renderWizard();
  expect(markup).toContain('People affected: 18 → 24 (+6)');
  expect(markup).toContain('Road accessibility: PARTIALLY_BLOCKED → FULLY_BLOCKED');
  expect(markup).not.toContain('Weather condition');
});

it('compares old and new recommendations without assigning causes to factor changes', () => {
  state.step = 'comparison';
  state.draft = { ...(state.draft as RiskAssessmentDraft), calculationPreview: preview };
  const markup = renderWizard();
  expect(markup).toContain('Previous officer decision: HIGH');
  expect(markup).toContain('New system recommendation: HIGH');
  expect(markup).toContain('does not attribute the change to individual factors');
});

it('revalidates the active assessment and calculates through the existing server API', async () => {
  state.step = 'review';
  state.draft = { ...(state.draft as RiskAssessmentDraft), calculationPreview: null };
  state.getAssessment.mockResolvedValue({ assessment: response.assessment });
  state.calculate.mockResolvedValue({ calculatedScore: 21, systemSuggestedRisk: 'HIGH', factorContributions: [], calculationVersion: 'risk-v1' });
  renderWizard();
  await state.actions.get('CALCULATE NEW RISK')!();
  expect(state.getAssessment).toHaveBeenCalledWith('assessment-1', 'officer-token');
  expect(state.calculate).toHaveBeenCalledWith({ incidentId: 'incident-1', hazardSeverity: 'HIGH', peopleAffected: 18,
    vulnerablePeople: 6, roadAccessibility: 'PARTIALLY_BLOCKED', infrastructureImpact: 'MODERATE',
    waterLevelTrend: 'RISING', weatherCondition: 'HEAVY_RAIN' }, 'officer-token');
});
