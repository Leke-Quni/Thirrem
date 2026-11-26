import { AuthForm } from '@thirrem/ui';
import { useAuth } from '../auth/AuthProvider';
import { DriverAuthLayout } from '../components/DriverAuthLayout';

export function Login() {
  const { login } = useAuth();
  return (
    <DriverAuthLayout mode="login" title="Log in to your Driver account" intro="Welcome back. Pick up where you left off.">
      <AuthForm mode="login" onSubmit={login} />
    </DriverAuthLayout>
  );
}
