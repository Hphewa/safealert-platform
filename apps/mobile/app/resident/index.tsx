import { RoleHomeScreen } from '../../src/features/auth/screens/RoleHomeScreen';

export default function ResidentHome() {
  return (
    <RoleHomeScreen
      allowedRole="RESIDENT"
      title="Resident Home"
      description="Logged in as Resident"
    />
  );
}
