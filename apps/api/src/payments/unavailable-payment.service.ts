import { PaymentService, PaymentsNotSetUpError } from './payment.service.js';

/** Used when no Stripe keys are configured. */
export class UnavailablePaymentService extends PaymentService {
  readonly publishableKey = null;

  async createCustomer(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async startSetup(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async findSetupCard(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async saveTestCard(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async listCards(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async forgetCard(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async placeHold(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async findHold(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async captureHold(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }

  async releaseHold(): Promise<never> {
    throw new PaymentsNotSetUpError();
  }
}
