import { useAuth } from '../auth/AuthProvider';
import { AuthForm } from '../components/AuthForm';
import { AuthLayout } from '../components/auth/AuthLayout';

export function Login() {
  const { login } = useAuth();
  return (
    <AuthLayout mode="login" title="Log in to your Rider account" intro="Welcome back. Pick up where you left off.">
      <AuthForm mode="login" onSubmit={login} />
    </AuthLayout>
  );
}
