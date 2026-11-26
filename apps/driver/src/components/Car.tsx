/** A car seen from above, facing up before it is turned. */
export function Car({ x, y, heading = 0 }: { x: number; y: number; heading?: number }) {
  return (
    <g className="car" transform={`translate(${x} ${y}) rotate(${heading})`}>
      <path className="car-body" d="M-17 -9h5v5h-5zM12 -9h5v5h-5z" />
      <rect className="car-body" x="-13" y="-23" width="26" height="46" rx="10" />
      <path className="car-glass" d="M-9 -8 Q0 -14 9 -8 L7 0 L-7 0 Z" />
      <rect className="car-glass" x="-7" y="11" width="14" height="5" rx="2" />
    </g>
  );
}
