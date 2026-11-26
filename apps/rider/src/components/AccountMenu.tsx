import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/** The Rider's own settings, kept out of the bar. It is a list of links that opens under a button. */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Safari does not focus what is clicked, so a blur to nowhere is left to the click handler above.
  const onBlur = (event: FocusEvent) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div className="account" ref={container} onBlur={onBlur}>
      <button type="button" className="account-button" ref={button} aria-label="Account menu" aria-expanded={open} aria-controls="account-panel" onClick={() => setOpen((shown) => !shown)}>
        <span className="account-initial" aria-hidden="true">
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="who" translate="no">
          {email}
        </span>
        <svg className="account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="account-panel" id="account-panel">
          <p translate="no">{email}</p>
          <ul>
            <li>
              <NavLink to="/payment" onClick={() => setOpen(false)}>
                Payment
              </NavLink>
            </li>
            <li>
              <NavLink to="/receipts" onClick={() => setOpen(false)}>
                Receipts
              </NavLink>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
