import { useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

export function Home() {
  const { email, loading, logout } = useAuth();
  const navigate = useNavigate();
  const loggingOut = useRef(false);

  if (loading) return null;
  if (!email) return loggingOut.current ? null : <Navigate to="/login" replace />;

  return (
    <div className="page">
      <div className="wrap">
        <nav>
          <Logo to="/home" />
          <div className="links">
            <ThemeToggle />
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                loggingOut.current = true;
                logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </div>
        </nav>
        <main className="auth-card">
          <h1>You are logged in</h1>
          <p>
            Signed in as <strong>{email}</strong>. The map and ride requests arrive in the next tickets.
          </p>
        </main>
      </div>
    </div>
  );
}
