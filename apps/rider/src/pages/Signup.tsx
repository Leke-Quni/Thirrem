import { useAuth } from '../auth/AuthProvider';
import { AuthForm } from '@thirrem/ui';
import { AuthLayout } from '../components/auth/AuthLayout';

export function Signup() {
  const { signup } = useAuth();
  return (
    <AuthLayout mode="signup" title="Create your Rider account" intro="Sign up, then request your first simulated ride. There is nothing to verify.">
      <AuthForm mode="signup" onSubmit={signup} />
    </AuthLayout>
  );
}
