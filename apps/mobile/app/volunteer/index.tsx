import { RoleHomeScreen } from '../../src/features/auth/screens/RoleHomeScreen';

export default function VolunteerHome() {
  return (
    <RoleHomeScreen
      allowedRole="COMMUNITY_VOLUNTEER"
      title="Community Volunteer Home"
      description="Logged in as Community Volunteer"
    />
  );
}
