import { Car } from './Car';

/** A picture of a Ride Request reaching a Driver. Nothing in it can be pressed. */
export function RequestIllustration() {
  return (
    <div
      className="mapcard"
      role="img"
      aria-label="Example Ride Request: an Economy ride with an estimated Fare of €4.20, shown over a map with a car and its route to the Pickup Point"
    >
      <svg viewBox="0 0 500 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="water" d="M-10 330 C 90 300, 150 360, 240 340 S 400 300, 520 350 L520 450 L-10 450Z" />
        <g className="street" fill="none" strokeWidth="9" strokeLinecap="round">
          <path d="M-10 90 L520 70" />
          <path d="M-10 150 L520 152" />
          <path d="M-10 285 L520 262" />
          <path d="M80 -10 L100 450" />
          <path d="M200 -10 L180 450" />
          <path d="M345 -10 L347 450" />
          <path d="M440 -10 L425 450" />
          <circle cx="262" cy="215" r="30" strokeWidth="8" />
        </g>
        <g className="street" fill="none" strokeWidth="4" strokeLinecap="round" opacity=".8">
          <path d="M-10 215 L520 215" />
          <path d="M-10 345 L520 330" />
          <path d="M140 -10 L145 450" />
          <path d="M262 -10 L262 450" />
          <path d="M395 -10 L390 450" />
        </g>
        <path className="route" pathLength="1" d="M142 150 L346 152 L346 76" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="pinring" cx="128" cy="150" r="36" strokeWidth="2" />
        <circle className="pinring faint" cx="128" cy="150" r="54" strokeWidth="1.5" />
        <Car x={128} y={150} heading={90} />
        <circle className="pinring" cx="346" cy="76" r="20" strokeWidth="2" />
        <circle className="pin" cx="346" cy="76" r="9" />
      </svg>
      <div className="ride request" aria-hidden="true">
        <div className="request-head">
          <strong>Example request</strong>
          <em>Economy</em>
        </div>
        <ul className="request-stops">
          <li>
            <i />
            Pickup Point<span>2 min away</span>
          </li>
          <li>
            <i className="square" />
            Drop-off Point<span>3.4 km ride</span>
          </li>
        </ul>
        <div className="request-actions">
          <p>
            <b>€4.20</b>
            <span>Estimated Fare</span>
          </p>
          <span className="request-choice">Decline</span>
          <span className="request-choice accept">Accept</span>
        </div>
      </div>
    </div>
  );
}
