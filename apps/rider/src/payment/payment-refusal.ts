import type { PaymentRefusedResponse } from '@thirrem/types';
import { ApiError } from '../auth/auth-api';

/** The API would not go ahead, as the Fare could not be held. */
export class PaymentRefusedError extends ApiError {
  constructor(readonly refusal: PaymentRefusedResponse) {
    super(refusal.message, 402);
  }
}

/**
 * Sends what needs the Fare held. If the Rider's bank wants to check it is them, `verify` takes them through that,
 * and it is sent again with the hold. The API is asked either way, as it is the one that knows whether the check passed.
 */
export async function withBankVerification<T>(
  send: (holdId?: string) => Promise<T>,
  verify: (publishableKey: string, clientSecret: string) => Promise<void>,
): Promise<T> {
  try {
    return await send(undefined);
  } catch (failure) {
    if (!(failure instanceof PaymentRefusedError) || failure.refusal.code !== 'PAYMENT_VERIFICATION') throw failure;
    const { holdId, publishableKey, clientSecret } = failure.refusal;
    await verify(publishableKey, clientSecret).catch(() => undefined);
    return send(holdId);
  }
}

export interface RequestFailure {
  message: string;
  /** Set when the Rider's payment method is what has to change. */
  payment?: Exclude<PaymentRefusedResponse['code'], 'PAYMENT_VERIFICATION'>;
}

/** What to tell the Rider about a request that failed, and `fallback` if the failure says nothing. */
export function requestFailure(failure: unknown, fallback: string): RequestFailure {
  const message = failure instanceof Error ? failure.message : fallback;
  const code = failure instanceof PaymentRefusedError ? failure.refusal.code : undefined;
  return { message, payment: code === 'PAYMENT_VERIFICATION' ? undefined : code };
}
