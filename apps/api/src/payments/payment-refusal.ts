import { HttpException, HttpStatus } from '@nestjs/common';
import type { PaymentRefusedResponse } from '@thirrem/types';

/** Why money that was needed could not be had. */
export const refused = (body: PaymentRefusedResponse) => new HttpException(body, HttpStatus.PAYMENT_REQUIRED);

export const isPaymentId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
