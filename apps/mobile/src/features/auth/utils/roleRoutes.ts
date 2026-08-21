import type { UserRole } from '@safealert/contracts';

export function routeForRole(role: UserRole) {
  switch (role) {
    case 'RESIDENT':
      return '/resident';
    case 'COMMUNITY_VOLUNTEER':
      return '/volunteer';
    case 'DISASTER_OFFICER':
      return '/officer';
    case 'EMERGENCY_RESPONDER':
      return '/responder';
  }
}
