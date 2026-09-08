import { beforeEach, describe, expect, it } from 'vitest';

import {
  consumeReviewedOfficerReportIds,
  recordReviewedOfficerReportId,
  subscribeToReviewedOfficerReportIds
} from './pendingReportsState';

beforeEach(() => {
  consumeReviewedOfficerReportIds();
});

describe('Officer pending report invalidation state', () => {
  it('queues backend-confirmed reviewed report ids once', () => {
    recordReviewedOfficerReportId('report-1');
    recordReviewedOfficerReportId('report-1');
    recordReviewedOfficerReportId('report-2');

    expect(consumeReviewedOfficerReportIds()).toEqual(['report-1', 'report-2']);
  });

  it('clears reviewed ids after they are consumed', () => {
    recordReviewedOfficerReportId('report-1');

    consumeReviewedOfficerReportIds();

    expect(consumeReviewedOfficerReportIds()).toEqual([]);
  });

  it('notifies mounted pending lists until they unsubscribe', () => {
    const receivedReportIds: string[] = [];
    const unsubscribe = subscribeToReviewedOfficerReportIds((reportId) => {
      receivedReportIds.push(reportId);
    });

    recordReviewedOfficerReportId('report-1');
    unsubscribe();
    recordReviewedOfficerReportId('report-2');

    expect(receivedReportIds).toEqual(['report-1']);
  });
});
