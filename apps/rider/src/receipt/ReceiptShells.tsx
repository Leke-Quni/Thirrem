/** One shell for each receipt on its way. */
export function ReceiptShells({ count }: { count: number }) {
  return (
    <div className="receipts-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="skeleton-field" />
      ))}
    </div>
  );
}
