import type { Coordinate, PlaceResult, SimulatedDriver, VehicleType } from '@thirrem/types';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Logo';
import { RouteLoader } from '../components/RouteLoader';
import { ThemeToggle } from '../components/ThemeToggle';
import { PlannerPanel } from '../map/PlannerPanel';
import { RideMap } from '../map/RideMap';
import { drivingRoute } from '../map/approach-route';
import { carMarks } from '../map/car-marks';
import { locate } from '../map/locate';
import { initialPlan, planReducer } from '../map/planner';
import { useFareQuote } from '../map/useFareQuote';
import { useRoute } from '../map/useRoute';
import { RidePanel } from '../ride-request/RidePanel';
import { RideRequestPanel } from '../ride-request/RideRequestPanel';
import { useRequestRide } from '../ride-request/useRequestRide';
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
  const { state: sandbox, retry: retrySandbox, startNew: startNewSandbox, requested, routing } = useSandbox(sandboxCentre(device.location, plan.pickup), plan.pickup, plan.dropoff);
  // A failed Ride Request the Rider has moved on from is not shown again.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const rideRequest = sandbox.status === 'ready' && sandbox.rideRequest?.id !== dismissed ? sandbox.rideRequest : null;
  const ride = sandbox.status === 'ready' ? sandbox.ride : null;
  /** What the Rider is doing, if anything: asking for a Ride, or on one. */
  const journey = ride ?? rideRequest;
  const sandboxLive = sandbox.status === 'ready' && sandbox.connection === 'live';
  const askedHere = useRef(false);
  const { pending, error: requestError, request } = useRequestRide(plan.pickup, plan.dropoff, vehicleType, (made) => {
    askedHere.current = true;
    requested(made);
  });
  const marks = useMemo(() => carMarks(rideRequest, ride), [rideRequest, ride]);
  const driving = useMemo(() => drivingRoute(rideRequest, ride), [rideRequest, ride]);
  const droppedRequest = useRef(false);

  // After a reload the pins and Vehicle Type are put back as the shown Ride Request or Ride has them, whatever else moved them.
  useEffect(() => {
    if (!journey) return;
    dispatch({ type: 'restore', pickup: journey.pickup, dropoff: journey.dropoff });
    setVehicleType(journey.vehicleType);
  }, [journey, plan.pickup, plan.dropoff]);

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

  const startNewRide = () => {
    askedHere.current = false;
    droppedRequest.current = true;
    startNewSandbox();
  };

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
        {ride ? (
          <RidePanel key={ride.id} ride={ride} pickup={plan.pickup} dropoff={plan.dropoff} fare={fare} focusTitle={askedHere.current} onRouting={routing} onStartNew={startNewRide} />
        ) : rideRequest ? (
          <RideRequestPanel
            key={rideRequest.id}
            rideRequest={rideRequest}
            pickup={plan.pickup}
            dropoff={plan.dropoff}
            fare={fare}
            focusTitle={askedHere.current}
            onRouting={routing}
            onStartNew={startNewRide}
            retry={{ ready: sandboxLive, pending, error: requestError, onRetry: request }}
            onChange={() => {
              askedHere.current = false;
              droppedRequest.current = true;
              setDismissed(rideRequest.id);
            }}
          />
        ) : (
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
            focusTitle={droppedRequest.current}
            request={{ ready: sandboxLive, pending, error: requestError, onRequest: request }}
          />
        )}
        <div className="map-card">
          <RideMap
            pickup={plan.pickup}
            dropoff={plan.dropoff}
            geometry={route.status === 'ready' ? route.route.geometry : null}
            driving={driving}
            focus={focus}
            drivers={'drivers' in sandbox ? sandbox.drivers : NO_DRIVERS}
            marks={marks}
            locked={journey !== null}
            onPlace={(point) => {
              if (!journey) dispatch({ type: 'place', point });
            }}
            onMove={(slot, point) => {
              if (!journey) dispatch({ type: 'move', slot, point });
            }}
            onReady={() => setMapState('ready')}
            onFailure={() => setMapState('failed')}
          />
          <div className="map-crosshair" aria-hidden="true" />
          {mapState === 'ready' && <SandboxStatus sandbox={sandbox} onRetry={retrySandbox} onStartNew={startNewSandbox} />}
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
