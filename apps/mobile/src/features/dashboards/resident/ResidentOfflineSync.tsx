import { useCallback, useEffect, useRef } from 'react';

import { useAuth } from '../../auth/hooks/useAuth';
import { uploadReportEvidence } from './api/mediaApi';
import { createResidentReport } from './api/reportApi';
import { listQueuedReports, removeQueuedReport, updateQueuedReport } from './offlineReportQueue';
import { subscribeToConnectivity } from './offlineConnectivity';
import { submitResidentReportDraft } from './reportSubmission';

export function ResidentOfflineSync() {
  const { accessToken, user } = useAuth();
  const processingRef = useRef(false);

  const syncQueuedReports = useCallback(async () => {
    if (!user?.id || !accessToken || processingRef.current) return;

    processingRef.current = true;
    try {
      const queuedReports = await listQueuedReports(user.id);
      for (const queuedReport of queuedReports) {
        if (queuedReport.status === 'SYNCING') {
          await updateQueuedReport(user.id, queuedReport.id, { status: 'PENDING' });
        }

        const attempts = queuedReport.attempts + 1;
        await updateQueuedReport(user.id, queuedReport.id, {
          status: 'SYNCING',
          attempts,
          lastError: null
        });

        try {
          await submitResidentReportDraft({
            draft: queuedReport.draft,
            accessToken,
            uploadReportEvidence,
            createResidentReport,
            clientOperationId: queuedReport.operationId
          });
          await removeQueuedReport(user.id, queuedReport.id);
        } catch (error) {
          await updateQueuedReport(user.id, queuedReport.id, {
            status: 'FAILED',
            lastError: error instanceof Error ? error.message : 'Could not sync this report.'
          });
          break;
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [accessToken, user?.id]);

  useEffect(() => {
    void syncQueuedReports();
    const unsubscribe = subscribeToConnectivity((connected) => {
      if (connected) void syncQueuedReports();
    });
    return unsubscribe;
  }, [syncQueuedReports]);

  return null;
}
