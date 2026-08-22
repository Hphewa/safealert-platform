import type { RiskLevel, ReportStatus } from '@safealert/contracts';

import type { BadgeTone } from './types';

export function getFirstName(name: string) {
  const [firstName] = name.trim().split(/\s+/);

  return firstName || name;
}

export function badgeToneForRiskLevel(level: RiskLevel): BadgeTone {
  switch (level) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MODERATE':
      return 'moderate';
    case 'LOW':
      return 'low';
  }
}

export function badgeToneForReportStatus(status: ReportStatus): BadgeTone {
  switch (status) {
    case 'PENDING':
      return 'info';
    case 'VERIFIED':
      return 'success';
    case 'REJECTED':
      return 'critical';
    case 'RESOLVED':
      return 'low';
  }
}
