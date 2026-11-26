import { RouteLoader } from '@thirrem/ui';
import { useRef } from 'react';
import { useVehicle } from './useVehicle';
import { VehicleForm } from './VehicleForm';
import { VehicleStatus } from './VehicleStatus';

export function VehiclePanel() {
  const { state, register, reload } = useVehicle();
  const sawForm = useRef(false);
  if (state.status === 'unregistered') sawForm.current = true;

  if (state.status === 'loading') {
    return (
      <main className="auth-card home-card is-loading" aria-busy="true">
        <RouteLoader label="Loading your vehicle…" />
      </main>
    );
  }

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
      {state.status === 'registered' && <VehicleStatus vehicle={state.vehicle} justRegistered={sawForm.current} />}
    </main>
  );
}
