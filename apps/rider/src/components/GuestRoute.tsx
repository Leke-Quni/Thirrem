import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function GuestRoute({ children }: { children: ReactNode }) {
  const { email } = useAuth();
  return email ? <Navigate to="/home" replace /> : children;
}
