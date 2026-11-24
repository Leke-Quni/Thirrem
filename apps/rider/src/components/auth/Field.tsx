import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

interface FieldProps {
  label: string;
  icon: IconName;
  name: string;
  type: 'email' | 'password';
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  onValueChange?(value: string): void;
  hint?: ReactNode;
  describedBy?: string;
}

export function Field({ label, icon, name, type, autoComplete, placeholder, minLength, onValueChange, hint, describedBy }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        <span className="field-icon">
          <Icon name={icon} />
        </span>
        <input
          id={id}
          name={name}
          type={isPassword && revealed ? 'text' : type}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-describedby={describedBy}
          onChange={(event) => onValueChange?.(event.target.value)}
        />
        {isPassword && (
          <button type="button" className="field-toggle" onClick={() => setRevealed((value) => !value)} aria-label={revealed ? 'Hide password' : 'Show password'}>
            <Icon name={revealed ? 'eye-off' : 'eye'} />
          </button>
        )}
      </div>
      {hint}
    </div>
  );
}
