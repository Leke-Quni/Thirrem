import { useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { HomeBar } from '../components/HomeBar';
import { HomeSkeleton } from './HomeSkeleton';
import { SessionUnavailable } from './SessionUnavailable';

export function Home() {
  const { email, loading, unreachable, expired, retry, logout } = useAuth();
  const navigate = useNavigate();
  const loggingOut = useRef(false);

  if (loading) return <HomeSkeleton />;
  if (unreachable) return <SessionUnavailable onRetry={retry} />;
  if (!email) return loggingOut.current ? null : <Navigate to={expired ? '/login' : '/'} replace />;

  const logOut = () => {
    loggingOut.current = true;
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="home-page">
      <HomeBar
        who={<span className="who">{email}</span>}
        action={
          <button type="button" className="btn ghost" onClick={logOut}>
            Log out
          </button>
        }
      />
      <main className="auth-card home-card">
        <h1>Your Driver account is ready</h1>
        <p>Adding a vehicle and getting approved are still being built. There is nothing else to do here yet.</p>
      </main>
    </div>
  );
}
