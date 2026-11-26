import { Link } from 'react-router-dom';

export type AuthMode = 'login' | 'signup';

export function AuthTabs({ active }: { active: AuthMode }) {
  return (
    <div className="auth-tabs">
      <Link to="/login" aria-current={active === 'login' ? 'page' : undefined}>
        Log in
      </Link>
      <Link to="/signup" aria-current={active === 'signup' ? 'page' : undefined}>
        Sign up
      </Link>
    </div>
  );
}
