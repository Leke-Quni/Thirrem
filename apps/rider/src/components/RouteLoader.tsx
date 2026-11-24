import { DROPOFF_PIN_PATH, DROPOFF_PIN_VIEWBOX } from '../map/pin-shape';

export function RouteLoader({ label }: { label: string }) {
  return (
    <div className="route-loader">
      <svg width="220" height="130" viewBox="0 0 220 130" aria-hidden="true">
        <path className="route-loader-track" d="M34 100 C 78 100, 70 42, 112 56 S 160 78, 182 50" pathLength="1" />
        <path className="route-loader-line" d="M34 100 C 78 100, 70 42, 112 56 S 160 78, 182 50" pathLength="1" />
        <circle className="route-loader-dot" cx="34" cy="100" r="9" />
        <g transform="translate(165 8)">
          <g className="route-loader-pin">
            <svg viewBox={DROPOFF_PIN_VIEWBOX} width="34" height="44" overflow="visible">
              <path d={DROPOFF_PIN_PATH} fill="var(--accent-solid)" stroke="var(--fg)" strokeWidth="2.5" />
              <circle cx="17" cy="16.5" r="5.5" fill="var(--fg)" />
            </svg>
          </g>
        </g>
      </svg>
      <p>{label}</p>
    </div>
  );
}
