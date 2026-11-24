export function MapIllustration() {
  return (
    <div className="mapcard" role="img" aria-label="Illustration of a map with a route between a pickup and a drop-off point">
      <svg viewBox="0 0 500 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="water" d="M-10 330 C 90 300, 150 360, 240 340 S 400 300, 520 350 L520 450 L-10 450Z" />
        <g className="street" fill="none" strokeWidth="9" strokeLinecap="round">
          <path d="M-10 90 L520 70" />
          <path d="M-10 190 L520 215" />
          <path d="M-10 285 L520 262" />
          <path d="M80 -10 L100 450" />
          <path d="M200 -10 L180 450" />
          <path d="M330 -10 L350 450" />
          <path d="M440 -10 L425 450" />
          <circle cx="262" cy="200" r="30" strokeWidth="8" />
        </g>
        <g className="street" fill="none" strokeWidth="4" strokeLinecap="round" opacity=".8">
          <path d="M-10 140 L520 150" />
          <path d="M-10 240 L520 240" />
          <path d="M140 -10 L145 450" />
          <path d="M265 -10 L270 450" />
          <path d="M385 -10 L390 450" />
        </g>
        <path className="route" pathLength="1" d="M100 275 L100 190 L200 195 L232 200 A30 30 0 0 1 292 200 L342 205 L346 90" fill="none" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="pinring" cx="100" cy="275" r="20" strokeWidth="2" />
        <circle className="pin" cx="100" cy="275" r="9" />
        <circle className="pinring" cx="346" cy="90" r="20" strokeWidth="2" />
        <rect className="pin" x="337" y="81" width="18" height="18" rx="3" />
      </svg>
      <div className="ride">
        <strong>Example ride</strong>
        <ol className="ride-progress" aria-label="Example ride progress">
          <li className="done">Request sent</li>
          <li className="done">Driver matched</li>
          <li className="now" aria-current="step">
            On the way
          </li>
        </ol>
        <span>A simulated driver, on a simulated trip.</span>
      </div>
    </div>
  );
}
