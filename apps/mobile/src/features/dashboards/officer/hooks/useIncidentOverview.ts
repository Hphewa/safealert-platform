import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useRiskAssessmentDraft } from '../assessment-flow/riskAssessmentDraft';
import { loadIncidentOverview } from '../api/incidentOverview';
import { useAssessmentResource } from './useAssessmentResource';

export function useIncidentOverview(incidentId: string | undefined) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const { draft, initializeInitialAssessment } = useRiskAssessmentDraft();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [starting, setStarting] = useState(false);
  const load = useCallback(async () => {
    if (!accessToken) throw new Error('Your Officer session is unavailable. Please log in again.');
    if (!incidentId) throw new Error('An incident reference is required.');
    return loadIncidentOverview(incidentId, accessToken);
  }, [incidentId, accessToken]);
  const resource = useAssessmentResource(load);
  useFocusEffect(useCallback(() => {
    inFlight.current = false;
    setStarting(false);
    return () => { generation.current += 1; };
  }, [incidentId, accessToken]));

  const startAssessment = async () => {
    if (!incidentId || inFlight.current || resource.loading || resource.error ||
      resource.data?.incident.id !== incidentId || !resource.data.canStartInitialAssessment) return;
    const current = generation.current;
    inFlight.current = true;
    setStarting(true);
    let navigated = false;
    try {
      // Reuse the generation-guarded loader so late or failed requests cannot trigger navigation.
      const latest = await resource.reload({ preserveData: true });
      if (generation.current !== current || !latest?.canStartInitialAssessment || latest.incident.id !== incidentId) return;
      const currentDraft = draftRef.current;
      if (currentDraft?.mode !== 'INITIAL' || currentDraft.incidentId !== incidentId) initializeInitialAssessment(incidentId);
      router.push({ pathname: '/officer/assessments/wizard/[step]', params: { step: 'situation', incidentId } });
      navigated = true;
    } finally {
      if (generation.current === current) {
        inFlight.current = navigated;
        setStarting(false);
      }
    }
  };
  return { ...resource, starting, startAssessment };
}
