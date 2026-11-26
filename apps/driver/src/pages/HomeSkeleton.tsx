import { RouteLoader } from '@thirrem/ui';
import { HomeBar } from '../components/HomeBar';

export function HomeSkeleton() {
  return (
    <div className="home-page" aria-busy="true">
      <HomeBar who={<span className="who-skeleton" aria-hidden="true" />} action={<span className="logout-skeleton" aria-hidden="true" />} />
      <span className="sr-only" role="status">
        Loading your home page…
      </span>
      <main className="auth-card home-card is-loading">
        <RouteLoader label="Loading your account…" />
      </main>
    </div>
  );
}
