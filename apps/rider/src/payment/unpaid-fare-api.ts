import type { PaymentRefusedResponse, UnpaidFaresResponse } from '@thirrem/types';
import { API_BASE_URL } from '../api-base-url';
import { ApiError } from '../auth/auth-api';
import { TOKEN_KEY } from '../auth/AuthProvider';
import { PaymentRefusedError } from './payment-refusal';

async function request(path: string, method: string, failure: string, body?: object): Promise<UnpaidFaresResponse> {
  const response = await fetch(`${API_BASE_URL}/rider/unpaid-fares${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ''}` },
    body: body && JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(failure, 0);
  });
  const answer = await response.json().catch(() => ({}));
  if (response.status === 402 && answer.code) throw new PaymentRefusedError(answer as PaymentRefusedResponse);
  if (!response.ok || !Array.isArray(answer.fares)) throw new ApiError(answer.message ?? failure, response.status);
  return answer as UnpaidFaresResponse;
}

export const unpaidFareApi = {
  list: () => request('', 'GET', 'Your unpaid Fares could not be checked. Check your connection and try again.'),
  /** `holdId` is that of a hold the Rider's bank has been asked to verify. */
  pay: (id: string, methodId: string, holdId?: string) => request(`/${id}/payment`, 'POST', 'Your Fare could not be paid. Try again.', { methodId, holdId }),
};
