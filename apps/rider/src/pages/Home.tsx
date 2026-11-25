import type { Coordinate, PlaceResult, SimulatedDriver, VehicleType } from '@thirrem/types';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { RouteLoader } from '../components/RouteLoader';
import { ThemeToggle } from '../components/ThemeToggle';
import { PlannerPanel } from '../map/PlannerPanel';
import { RideMap } from '../map/RideMap';
import { locate } from '../map/locate';
import { initialPlan, planReducer } from '../map/planner';
import { useFareQuote } from '../map/useFareQuote';
import { useRoute } from '../map/useRoute';
import { sandboxCentre } from '../sandbox/sandbox-centre';
import { SandboxStatus } from '../sandbox/SandboxStatus';
import { useDeviceLocation } from '../sandbox/useDeviceLocation';
import { useSandbox } from '../sandbox/useSandbox';
import { HomeSkeleton } from './HomeSkeleton';
import { SessionUnavailable } from './SessionUnavailable';

const NO_DRIVERS: SimulatedDriver[] = [];

export function Home() {
  const { email, loading, unreachable, expired, retry: retrySession, logout } = useAuth();
  const navigate = useNavigate();
  const loggingOut = useRef(false);
  const [plan, dispatch] = useReducer(planReducer, initialPlan);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [locating, setLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ point: Coordinate; nonce: number } | null>(null);
  const { state: route, retry } = useRoute(plan.pickup, plan.dropoff);
  const { state: fare, retry: retryFare } = useFareQuote(plan.pickup, plan.dropoff);
  const [vehicleType, setVehicleType] = useState<VehicleType>('economy');
  const device = useDeviceLocation(mapState === 'ready');
  const { state: sandbox, retry: retrySandbox } = useSandbox(sandboxCentre(device.location, plan.pickup));

  const planRef = useRef(plan);
  planRef.current = plan;

  const findMe = async (auto = false) => {
    setLocating(true);
    setLocateMessage(null);
    try {
      const point = await locate();
      device.found(point);
      if (auto && planRef.current.pickup) return;
      dispatch({ type: 'choose', slot: 'pickup', point: { ...point, origin: 'device' } });
      setFocus((current) => ({ point, nonce: (current?.nonce ?? 0) + 1 }));
    } catch (error) {
      device.failed();
      setLocateMessage(error instanceof Error ? error.message : 'Your location could not be found. Click the map to place a pin instead.');
    } finally {
      setLocating(false);
    }
  };

  const choosePlace = (slot: 'pickup' | 'dropoff', place: PlaceResult) => {
    const point = { lat: place.lat, lon: place.lon };
    dispatch({ type: 'choose', slot, point: { ...point, label: place.detail ? `${place.name}, ${place.detail}` : place.name } });
    setFocus((current) => ({ point, nonce: (current?.nonce ?? 0) + 1 }));
  };

  const askedForLocation = useRef(false);
  useEffect(() => {
    if (mapState !== 'ready' || askedForLocation.current) return;
    askedForLocation.current = true;
    void findMe(true);
  }, [mapState]);

  if (loading) return <HomeSkeleton />;
  if (unreachable) return <SessionUnavailable onRetry={retrySession} />;
  if (!email) return loggingOut.current ? null : <Navigate to={expired ? '/login' : '/'} replace />;

  return (
    <div className="ride-page">
      <header className="ride-bar">
        <Logo to="/home" />
        <div className="links">
          <span className="who">{email}</span>
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
      </header>
      <main className="ride-layout">
        <PlannerPanel
          plan={plan}
          route={route}
          fare={fare}
          vehicleType={vehicleType}
          onChooseVehicleType={setVehicleType}
          onRetryFare={retryFare}
          mapReady={mapState === 'ready'}
          locating={locating}
          locateMessage={locateMessage}
          onLocate={() => findMe()}
          onChoosePlace={choosePlace}
          onSelect={(slot) => dispatch({ type: 'select', slot })}
          onRemove={(slot) => dispatch({ type: 'remove', slot })}
          onRetry={() => {
            retry();
            retryFare();
          }}
        />
        <div className="map-card">
          <RideMap
            pickup={plan.pickup}
            dropoff={plan.dropoff}
            geometry={route.status === 'ready' ? route.route.geometry : null}
            focus={focus}
            drivers={sandbox.status === 'ready' ? sandbox.drivers : NO_DRIVERS}
            onPlace={(point) => dispatch({ type: 'place', point })}
            onMove={(slot, point) => dispatch({ type: 'move', slot, point })}
            onReady={() => setMapState('ready')}
            onFailure={() => setMapState('failed')}
          />
          <div className="map-crosshair" aria-hidden="true" />
          {mapState === 'ready' && <SandboxStatus sandbox={sandbox} onRetry={retrySandbox} />}
          {mapState === 'loading' && (
            <div className="map-loading" role="status">
              <RouteLoader label="Loading the map…" />
            </div>
          )}
          {mapState === 'failed' && (
            <div className="map-loading is-error" role="alert">
              The map could not be loaded. Check your connection and reload the page.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
