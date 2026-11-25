// A car seen from above, so Drivers read as vehicles and not as the Rider's pins.
const CAR = '<svg viewBox="0 0 16 26" width="16" height="26"><rect class="driver-body" x="1" y="1" width="14" height="24" rx="5.5"/><path class="driver-glass" d="M3.5 8.5Q8 6 12.5 8.5L11.5 12h-7zM4.5 18h7l1 2.5q-4.5 1.5-9 0z"/></svg>';

export function driverElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'driver';
  el.innerHTML = CAR;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
