import type { CSSProperties } from 'react';
import { Car } from '../components/Car';
import { paintOf } from './vehicle-names';

/** The vehicle in its colour, with its number plate once it has one. */
export function VehiclePicture({ colour, plate }: { colour: string; plate?: string }) {
  return (
    <div className="vehicle-picture" style={{ '--paint': paintOf(colour) } as CSSProperties}>
      <svg viewBox="-40 -20 80 40" aria-hidden="true">
        <Car x={0} y={0} heading={90} />
      </svg>
      {plate && (
        <span className="plate" translate="no">
          {plate}
        </span>
      )}
    </div>
  );
}
