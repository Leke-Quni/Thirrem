import type { DriverVehicle } from '@thirrem/types';
import { useEffect, useRef } from 'react';
import { VEHICLE_TYPE_NAMES } from './vehicle-names';
import { VehiclePicture } from './VehiclePicture';

const TEXT = {
  pending: { title: 'Waiting for approval', text: 'A simulated Admin is checking your application. This takes about 10\u00a0seconds.' },
  approved: { title: 'You are approved', text: 'Your Sandbox is still being built, so there are no Ride Requests yet.' },
};

export function VehicleStatus({ vehicle, justRegistered }: { vehicle: DriverVehicle; justRegistered: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const approved = vehicle.status === 'approved';

  // The button that was pressed is gone, so focus moves to what replaced the form.
  useEffect(() => {
    if (justRegistered) heading.current?.focus();
  }, [justRegistered]);

  const steps = [
    { label: 'Vehicle added', state: 'done' },
    { label: approved ? 'Approved' : 'Approval', state: approved ? 'done' : 'now' },
    { label: 'Sandbox', state: 'next' },
  ];

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
      <ol className="ride-progress vehicle-progress" aria-label="Application progress">
        {steps.map((step) => (
          <li key={step.label} className={step.state} aria-current={step.state === 'now' ? 'step' : undefined}>
            {step.label}
          </li>
        ))}
      </ol>
    </>
  );
}
