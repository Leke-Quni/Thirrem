import { RouteLoader } from '@thirrem/ui';
import type { DriverVehicle } from '@thirrem/types';
import { lazy, Suspense } from 'react';
import { paintOf } from '../vehicle/vehicle-names';
import { VehicleStatus } from '../vehicle/VehicleStatus';
import { SandboxStatus } from './SandboxStatus';
import { useDriverSandbox } from './useDriverSandbox';

// The map is large, so a Driver who is still applying does not download it.
const DriverMap = lazy(() => import('./DriverMap').then((module) => ({ default: module.DriverMap })));

/** An approved Driver's home: their vehicle beside the map of their Sandbox. */
export function DriverSandbox({ vehicle, takeFocus }: { vehicle: DriverVehicle; takeFocus: boolean }) {
  const { state, retry } = useDriverSandbox();
  const car = state.status === 'ready' || state.status === 'busy' ? state.car : null;

  return (
    <main className="sandbox">
      <div className="auth-card home-card sandbox-panel">
        <VehicleStatus vehicle={vehicle} takeFocus={takeFocus} />
      </div>
      <div className="map-card">
        <Suspense fallback={<div className="map-loading"><RouteLoader label="Loading the map…" /></div>}>
          <DriverMap car={car} paint={paintOf(vehicle.colour)} />
        </Suspense>
        <SandboxStatus sandbox={state} onRetry={retry} />
      </div>
    </main>
  );
}
