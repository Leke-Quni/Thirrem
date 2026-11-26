import { useAuth } from '../auth/AuthProvider';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

/** The bar of every logged-in page. While the account is still being checked there is no email or log out yet. */
export function RiderBar({ onLogOut }: { onLogOut?(): void }) {
  const { email } = useAuth();
  return (
    <header className="ride-bar">
      <Logo to="/home" />
      <div className="links">
        {onLogOut && email ? <AccountMenu email={email} /> : <span className="account-skeleton" aria-hidden="true" />}
        <ThemeToggle />
        {onLogOut ? (
          <button type="button" className="btn ghost" onClick={onLogOut}>
            Log out
          </button>
        ) : (
          <span className="logout-skeleton" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}
