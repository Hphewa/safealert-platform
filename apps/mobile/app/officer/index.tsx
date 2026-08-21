import { RoleHomeScreen } from '../../src/features/auth/screens/RoleHomeScreen';

export default function OfficerHome() {
  return (
    <RoleHomeScreen
      allowedRole="DISASTER_OFFICER"
      title="Disaster Officer Home"
      description="Logged in as Disaster Officer"
    />
  );
}
