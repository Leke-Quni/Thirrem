import { AuthForm } from '@thirrem/ui';
import { useAuth } from '../auth/AuthProvider';
import { DriverAuthLayout } from '../components/DriverAuthLayout';

export function Signup() {
  const { signup } = useAuth();
  return (
    <DriverAuthLayout mode="signup" title="Create your Driver account" intro="Sign up to drive in a simulation. There is nothing to verify.">
      <AuthForm mode="signup" onSubmit={signup} />
    </DriverAuthLayout>
  );
}
