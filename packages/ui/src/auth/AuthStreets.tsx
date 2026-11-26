/** The water and streets every app's login and signup backdrop is drawn over. */
export function AuthStreets() {
  return (
    <>
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
    </>
  );
}
