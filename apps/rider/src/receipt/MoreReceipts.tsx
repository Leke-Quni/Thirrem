import { useEffect, useRef } from 'react';
import { LoadFailure } from './LoadFailure';
import { ReceiptShells } from './ReceiptShells';

interface MoreReceiptsProps {
  /** How many the next page is to bring. */
  count: number;
  error: string | null;
  onLoad(): void;
}

/** Shells for the receipts still to come, which are asked for as the Rider scrolls near them. */
export function MoreReceipts({ count, error, onLoad }: MoreReceiptsProps) {
  const shells = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error || !shells.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && onLoad(), { rootMargin: '100px' });
    observer.observe(shells.current);
    return () => observer.disconnect();
  }, [error, onLoad]);

  if (error) {
    return (
      <div className="payment-panel receipts-more">
        <LoadFailure message={error} onRetry={onLoad} />
      </div>
    );
  }
  return (
    <div className="receipts-more" ref={shells}>
      <span className="sr-only" role="status">
        Loading more receipts…
      </span>
      <ReceiptShells count={count} />
    </div>
  );
}
