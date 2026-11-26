import { HomeBar } from '../components/HomeBar';

export function SessionUnavailable({ onRetry }: { onRetry(): void }) {
  return (
    <div className="home-page">
      <HomeBar />
      <main className="auth-card home-card">
        <h1>Thirrem is not reachable</h1>
        <div className="form-error" role="alert">
          <span>Could not reach Thirrem. You are still logged in; check your connection and try again.</span>
        </div>
        <button type="button" className="btn primary home-retry" onClick={onRetry}>
          Try again
        </button>
      </main>
    </div>
  );
}
