import { RiderBar } from '../components/RiderBar';
import { RouteLoader } from '../components/RouteLoader';

export function HomeSkeleton() {
  return (
    <div className="ride-page" aria-busy="true">
      <RiderBar />
      <span className="sr-only" role="status">
        Loading your ride planner…
      </span>
      <main className="ride-layout">
        <div className="planner planner-skeleton" aria-hidden="true">
          <span className="skeleton-line wide" />
          <span className="skeleton-line" />
          <span className="skeleton-block" />
          <span className="skeleton-field" />
          <span className="skeleton-block" />
          <span className="skeleton-field" />
        </div>
        <div className="map-card">
          <div className="map-loading">
            <RouteLoader label="Loading the map…" />
          </div>
        </div>
      </main>
    </div>
  );
}
