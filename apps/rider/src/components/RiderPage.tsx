import { type ReactNode, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SessionUnavailable } from '../pages/SessionUnavailable';
import { RiderBar } from './RiderBar';

/** A logged-in page: `skeleton` while the account is being checked, and never shown to a visitor who is not logged in. */
export function RiderPage({ title, skeleton, children }: { title: string; skeleton: ReactNode; children: ReactNode }) {
  const { email, loading, unreachable, expired, retry, logout } = useAuth();
  const navigate = useNavigate();
  const loggingOut = useRef(false);

  useEffect(() => {
    const before = document.title;
    document.title = `${title} | Thirrem`;
    return () => {
      document.title = before;
    };
  }, [title]);

  if (loading) return skeleton;
  if (unreachable) return <SessionUnavailable onRetry={retry} />;
  if (!email) return loggingOut.current ? null : <Navigate to={expired ? '/login' : '/'} replace />;

  return (
    <div className="ride-page">
      <RiderBar
        onLogOut={() => {
          loggingOut.current = true;
          logout();
          navigate('/');
        }}
      />
      {children}
    </div>
  );
}
