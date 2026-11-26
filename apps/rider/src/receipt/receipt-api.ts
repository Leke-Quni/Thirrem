import type { Receipt, ReceiptsResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { rememberReceiptCount } from './receipt-count';

async function request<T>(path: string, failure: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/rider/receipts${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` } }).catch(() => {
    throw new ApiError(failure, 0);
  });
  const answer = await response.json().catch(() => null);
  if (!response.ok || !answer) throw new ApiError(answer?.message ?? failure, response.status);
  return answer as T;
}

export const receiptApi = {
  /** A page of them, after the one that gave `after` as its `next`. */
  list: async (after?: string) => {
    const page = await request<ReceiptsResponse>(after ? `?after=${encodeURIComponent(after)}` : '', 'Your receipts could not be loaded. Check your connection and try again.');
    rememberReceiptCount(page.total);
    return page;
  },
  find: (id: string) => request<Receipt>(`/${encodeURIComponent(id)}`, 'Your receipt could not be loaded. Check your connection and try again.'),
};
