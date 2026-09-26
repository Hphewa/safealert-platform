import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { assessmentErrorMessage } from '../riskAssessmentForm';

// Each focused load has a generation; late results cannot overwrite a different route/session.
export function useAssessmentResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const requestId = ++generation.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await loader();
      if (requestId === generation.current) setData(result);
    } catch (failure) {
      if (requestId === generation.current) setError(assessmentErrorMessage(failure));
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(useCallback(() => {
    void reload();
    return () => { generation.current += 1; };
  }, [reload]));
  return { data, loading, error, reload };
}
