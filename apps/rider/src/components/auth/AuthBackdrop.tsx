/** A faint street map with a route that draws itself once, behind the form. */
export function AuthBackdrop() {
  return (
    <svg className="auth-backdrop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path className="auth-water" d="M-20 760 C 220 700, 360 820, 640 790 S 1100 700, 1380 770 S 1560 760, 1640 800 L1640 920 L-20 920Z" />
      <g className="auth-street" fill="none" strokeLinecap="round">
        <g strokeWidth="14">
          <path d="M-20 200 L1640 150" />
          <path d="M-20 430 L1640 480" />
          <path d="M-20 640 L1640 600" />
          <path d="M240 -20 L290 920" />
          <path d="M620 -20 L590 920" />
          <path d="M1000 -20 L1040 920" />
          <path d="M1360 -20 L1330 920" />
          <circle cx="800" cy="455" r="58" strokeWidth="12" />
        </g>
        <g strokeWidth="5" opacity=".7">
          <path d="M-20 320 L1640 330" />
          <path d="M-20 540 L1640 545" />
          <path d="M430 -20 L440 920" />
          <path d="M820 -20 L815 920" />
          <path d="M1180 -20 L1190 920" />
          <path d="M1500 -20 L1480 920" />
        </g>
      </g>
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
