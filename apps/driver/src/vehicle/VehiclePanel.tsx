import { RouteLoader } from '@thirrem/ui';
import { useRef } from 'react';
import { DriverSandbox } from '../sandbox/DriverSandbox';
import { useVehicle } from './useVehicle';
import { VehicleForm } from './VehicleForm';
import { VehicleStatus } from './VehicleStatus';

export function VehiclePanel() {
  const { state, register, reload } = useVehicle();
  // Whether the page has shown an earlier stage of the application, which the status then replaces.
  const sawEarlier = useRef(false);
  if (state.status === 'unregistered') sawEarlier.current = true;

  if (state.status === 'loading') {
    return (
      <main className="auth-card home-card is-loading" aria-busy="true">
        <RouteLoader label="Loading your vehicle…" />
      </main>
    );
  }

  if (state.status === 'registered' && state.vehicle.status === 'approved') {
    return <DriverSandbox vehicle={state.vehicle} takeFocus={sawEarlier.current} />;
  }
  if (state.status === 'registered') sawEarlier.current = true;

  return (
    <main className={`auth-card home-card${state.status === 'unregistered' ? '' : ' is-compact'}`}>
      {state.status === 'failed' && (
        <>
          <h1>Vehicle unavailable</h1>
          <div className="form-error" role="alert">
            <span>Could not load your vehicle. Check your connection and try again.</span>
          </div>
          <button type="button" className="btn primary home-retry" onClick={reload}>
            Try again
          </button>
        </>
      )}
      {state.status === 'unregistered' && <VehicleForm options={state.options} onRegister={register} />}
      {state.status === 'registered' && <VehicleStatus vehicle={state.vehicle} takeFocus={sawEarlier.current} />}
    </main>
  );
}
