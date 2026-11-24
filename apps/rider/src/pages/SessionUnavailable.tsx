import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

export function SessionUnavailable({ onRetry }: { onRetry(): void }) {
  return (
    <div className="ride-page">
      <header className="ride-bar">
        <Logo to="/home" />
        <div className="links">
          <ThemeToggle />
        </div>
      </header>
      <main className="auth-card">
        <h1>Thirrem is not reachable</h1>
        <div className="form-error" role="alert">
          <span>Could not reach Thirrem. You are still logged in; check your connection and try again.</span>
        </div>
        <button type="button" className="btn primary retry-session" onClick={onRetry}>
          Try again
        </button>
      </main>
    </div>
  );
}
