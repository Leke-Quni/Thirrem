import { AuthStreets } from '@thirrem/ui';
import { Car } from './Car';

const PICKUPS = [
  [430, 200],
  [1010, 160],
  [1180, 325],
  [280, 640],
  [1320, 610],
] as const;

/** A faint street map with a waiting car and the Pickup Points that appear around it, behind the form. */
export function AuthBackdrop() {
  return (
    <svg className="auth-backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <AuthStreets />
      {[70, 150, 250].map((radius) => (
        <circle key={radius} className="auth-reach" cx="270" cy="466" r={radius} fill="none" strokeWidth="1.5" />
      ))}
      {PICKUPS.map(([x, y], index) => (
        <g key={x} className="auth-pin" style={{ animationDelay: `${0.3 + index * 0.3}s` }}>
          <circle cx={x} cy={y} r="11" />
          <circle className="auth-pin-ring" cx={x} cy={y} r="26" fill="none" strokeWidth="2" />
        </g>
      ))}
      <Car x={270} y={466} />
    </svg>
  );
}
