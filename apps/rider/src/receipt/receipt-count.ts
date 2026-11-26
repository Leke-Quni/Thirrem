/** How many receipts the Rider had when last asked, kept so the loader can match them. `index.html` reads it too. */
const KEY = 'thirrem-rider-receipt-count';

export const PAGE_SIZE = 6;

/** As many shells as the first page is expected to fill: a full one when it is not known. */
export function expectedReceipts(): number {
  const kept = localStorage.getItem(KEY);
  return kept === null ? PAGE_SIZE : Math.min(Number(kept), PAGE_SIZE);
}

export const rememberReceiptCount = (total: number) => localStorage.setItem(KEY, String(total));

export const forgetReceiptCount = () => localStorage.removeItem(KEY);
