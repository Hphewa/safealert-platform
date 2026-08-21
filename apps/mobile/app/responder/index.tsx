import { RoleHomeScreen } from '../../src/features/auth/screens/RoleHomeScreen';

export default function ResponderHome() {
  return (
    <RoleHomeScreen
      allowedRole="EMERGENCY_RESPONDER"
      title="Emergency Responder Home"
      description="Logged in as Emergency Responder"
    />
  );
}
