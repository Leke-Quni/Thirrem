import { Icon } from '@thirrem/ui';
import type { VehicleOptionsResponse, VehicleType } from '@thirrem/types';
import { type CSSProperties, type FormEvent, useState } from 'react';
import type { VehicleChoice } from './vehicle-api';
import { paintOf, VEHICLE_TYPE_NAMES } from './vehicle-names';
import { VehiclePicture } from './VehiclePicture';

export function VehicleForm({ options, onRegister }: { options: VehicleOptionsResponse; onRegister(choice: VehicleChoice): Promise<void> }) {
  const types = Object.keys(options.models) as VehicleType[];
  const [choice, setChoice] = useState<VehicleChoice>(() => ({
    vehicleType: types[0]!,
    model: options.models[types[0]!][0]!,
    colour: options.colours[0]!,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRegister(choice);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Register your vehicle</h1>
      <p>One vehicle for each Driver account, and it cannot be changed later.</p>
      <form className="vehicle-form" onSubmit={submit}>
        <VehiclePicture colour={choice.colour} />
        <fieldset>
          <legend>Vehicle Type</legend>
          <div className="type-choices">
            {types.map((type) => (
              <label key={type} className="type-choice">
                <input
                  type="radio"
                  name="vehicleType"
                  value={type}
                  checked={choice.vehicleType === type}
                  onChange={() => setChoice({ ...choice, vehicleType: type, model: options.models[type][0]! })}
                />
                {VEHICLE_TYPE_NAMES[type]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="vehicle-model">Model</label>
          <div className="field-control">
            <select id="vehicle-model" name="model" autoComplete="off" value={choice.model} onChange={(event) => setChoice({ ...choice, model: event.target.value })}>
              {options.models[choice.vehicleType].map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
          </div>
        </div>
        <fieldset>
          <legend>
            Colour: <span>{choice.colour}</span>
          </legend>
          <div className="swatches">
            {options.colours.map((colour) => (
              <label key={colour} className="swatch" style={{ '--paint': paintOf(colour) } as CSSProperties} title={colour}>
                <input type="radio" name="colour" value={colour} aria-label={colour} checked={choice.colour === colour} onChange={() => setChoice({ ...choice, colour })} />
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </p>
        )}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy ? 'Registering…' : 'Register vehicle'}
        </button>
        <p className="auth-note">Your number plate is made up for you.</p>
      </form>
    </>
  );
}
