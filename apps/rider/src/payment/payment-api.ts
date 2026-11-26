import type { CardSetupResponse, PaymentMethodsResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';

async function request<T>(path: string, method: string, failure: string, body?: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/rider/payment-methods${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: body && JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(failure, 0);
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(answer.message ?? failure, response.status);
  return answer as T;
}

export const paymentApi = {
  list: () => request<PaymentMethodsResponse>('', 'GET', 'Your payment methods could not be loaded. Check your connection and try again.'),
  startAdding: () => request<CardSetupResponse>('/setup', 'POST', 'The card form could not be opened. Try again.'),
  finishAdding: (setupId: string) => request<PaymentMethodsResponse>('', 'POST', 'Your card could not be saved. Try again.', { setupId }),
  addTestCard: () => request<PaymentMethodsResponse>('/test-card', 'POST', 'The test card could not be added. Try again.'),
  makeDefault: (id: string) => request<PaymentMethodsResponse>(`/${id}/default`, 'PUT', 'The default method could not be changed. Try again.'),
  remove: (id: string) => request<PaymentMethodsResponse>(`/${id}`, 'DELETE', 'The card could not be removed. Try again.'),
};
