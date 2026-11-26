import { AuthStreets } from '@thirrem/ui';

/** A faint street map with a route that draws itself once, behind the form. */
export function AuthBackdrop() {
  return (
    <svg className="auth-backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <AuthStreets />
      <path
        className="auth-route"
        pathLength={1}
        d="M240 700 L270 480 L590 470 L742 462 A58 58 0 0 1 858 462 L1040 470 L1180 330 L1190 190 L1360 175"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g className="auth-pin auth-pin-start">
        <circle className="auth-pin-ring" cx="240" cy="700" r="26" fill="none" strokeWidth="2" />
        <circle cx="240" cy="700" r="11" />
      </g>
      <g className="auth-pin auth-pin-end">
        <circle className="auth-pin-ring" cx="1360" cy="175" r="26" fill="none" strokeWidth="2" />
        <rect x="1348" y="163" width="24" height="24" rx="4" />
      </g>
    </svg>
  );
}
