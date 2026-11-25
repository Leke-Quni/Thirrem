export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

export const formatFare = (cents: number): string => euros.format(cents / 100);

/** Minutes and seconds left, as a clock counts them down. */
export const formatCountdown = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
