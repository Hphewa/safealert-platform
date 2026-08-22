import type { RiskLevel } from '@safealert/contracts';

import { StatusBadge } from './StatusBadge';
import { badgeToneForRiskLevel } from '../utils';

type PriorityBadgeProps = {
  priority: RiskLevel;
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return <StatusBadge label={priority} tone={badgeToneForRiskLevel(priority)} />;
}
