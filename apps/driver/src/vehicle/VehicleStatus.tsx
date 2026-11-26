import type { DriverVehicle } from '@thirrem/types';
import { useEffect, useRef } from 'react';
import { VEHICLE_TYPE_NAMES } from './vehicle-names';
import { VehiclePicture } from './VehiclePicture';

const TEXT = {
  pending: { title: 'Waiting for approval', text: 'A simulated Admin is checking your application. This takes about 10\u00a0seconds.' },
  approved: { title: 'You are approved', text: 'This is your private Sandbox. It has no Ride Requests yet.' },
};

const APPLICATION_STEPS = [
  { label: 'Vehicle added', state: 'done' },
  { label: 'Approval', state: 'now' },
  { label: 'Sandbox', state: 'next' },
];

/** `takeFocus` when this has replaced something the Driver was looking at, such as the form. */
export function VehicleStatus({ vehicle, takeFocus }: { vehicle: DriverVehicle; takeFocus: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);

  return (
    <>
      <div aria-live="polite">
        <h1 ref={heading} tabIndex={-1}>
          {TEXT[vehicle.status].title}
        </h1>
        <p>{TEXT[vehicle.status].text}</p>
      </div>
      <VehiclePicture colour={vehicle.colour} plate={vehicle.plate} />
      <p className="vehicle-name">
        <strong>
          {vehicle.colour} <span translate="no">{vehicle.model}</span>
        </strong>
        <span>{VEHICLE_TYPE_NAMES[vehicle.vehicleType]}</span>
      </p>
      {vehicle.status === 'pending' && (
        <ol className="ride-progress vehicle-progress" aria-label="Application progress">
          {APPLICATION_STEPS.map((step) => (
            <li key={step.label} className={step.state} aria-current={step.state === 'now' ? 'step' : undefined}>
              {step.label}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
