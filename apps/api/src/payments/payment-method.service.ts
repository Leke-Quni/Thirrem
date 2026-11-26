import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { PaymentMethodsResponse } from '@thirrem/types';
import { type PaymentMethodRecord, PaymentMethodRepository } from './payment-method.repository.js';
import { type Card, PaymentService, PaymentServiceError, PaymentsNotSetUpError } from './payment.service.js';

const unavailable = (error: unknown): never => {
  if (error instanceof PaymentsNotSetUpError) throw new ServiceUnavailableException('Card payments are not set up on this server.');
  if (error instanceof PaymentServiceError) throw new ServiceUnavailableException('Cards are unavailable right now. Try again in a moment.');
  throw error;
};

@Injectable()
export class PaymentMethodService {
  /** The last card being kept for each account, so that two copies of one card are not checked at once. */
  private readonly keeping = new Map<string, Promise<void>>();

  constructor(
    private readonly payments: PaymentService,
    private readonly methods: PaymentMethodRepository,
  ) {}

  async list(accountId: string): Promise<PaymentMethodsResponse> {
    const records = await this.methods.findByAccount(accountId);
    return {
      publishableKey: this.payments.publishableKey,
      // Stripe's references stay on the server.
      methods: records.map(({ id, brand, last4, wallet, isDefault }) => ({ id, brand, last4, wallet, isDefault })),
    };
  }

  async startAdding(accountId: string): Promise<{ clientSecret: string }> {
    return this.payments.startSetup(await this.customerRef(accountId)).catch(unavailable);
  }

  async finishAdding(accountId: string, setupId: unknown): Promise<PaymentMethodsResponse> {
    const notSaved = new BadRequestException('That card was not saved. Try adding it again.');
    if (typeof setupId !== 'string' || !setupId) throw notSaved;
    const customerRef = await this.methods.findCustomerRef(accountId);
    if (!customerRef) throw notSaved;
    const card = await this.payments.findSetupCard(customerRef, setupId).catch(unavailable);
    if (!card) throw notSaved;
    await this.keep(accountId, customerRef, card);
    return this.list(accountId);
  }

  async addTestCard(accountId: string): Promise<PaymentMethodsResponse> {
    const customerRef = await this.customerRef(accountId);
    const card = await this.payments.saveTestCard(customerRef).catch(unavailable);
    await this.keep(accountId, customerRef, card);
    return this.list(accountId);
  }

  async makeDefault(accountId: string, id: string): Promise<PaymentMethodsResponse> {
    await this.owned(accountId, id);
    await this.methods.setDefault(accountId, id);
    return this.list(accountId);
  }

  async remove(accountId: string, id: string): Promise<PaymentMethodsResponse> {
    const method = await this.owned(accountId, id);
    // Stripe first, so a method is never left saved there with nothing here to remove it by.
    await this.payments.forgetCard(method.ref).catch(unavailable);
    await this.methods.remove(accountId, id);
    return this.list(accountId);
  }

  /** Saves the card, unless another copy of it is saved already. */
  private keep(accountId: string, customerRef: string, card: Card): Promise<void> {
    const kept = (this.keeping.get(accountId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        if (await this.isSecondCopy(accountId, customerRef, card)) {
          await this.payments.forgetCard(card.ref).catch(unavailable);
          throw new ConflictException('That card is already saved. To replace it, remove it first.');
        }
        await this.methods.add(accountId, card);
      });
    this.keeping.set(accountId, kept);
    return kept.finally(() => {
      if (this.keeping.get(accountId) === kept) this.keeping.delete(accountId);
    });
  }

  /** A card saved through a wallet is a method of its own, apart from the same card typed in. */
  private async isSecondCopy(accountId: string, customerRef: string, card: Card): Promise<boolean> {
    const saved = new Set((await this.methods.findByAccount(accountId)).map((method) => method.ref));
    // The same setup reported again is not a second copy.
    if (saved.size === 0 || saved.has(card.ref)) return false;
    const cards = await this.payments.listCards(customerRef).catch(unavailable);
    return cards.some((other) => saved.has(other.ref) && other.fingerprint === card.fingerprint && other.wallet === card.wallet);
  }

  private async owned(accountId: string, id: string): Promise<PaymentMethodRecord> {
    const method = (await this.methods.findByAccount(accountId)).find((candidate) => candidate.id === id);
    if (!method) throw new NotFoundException('That payment method is no longer saved.');
    return method;
  }

  private async customerRef(accountId: string): Promise<string> {
    const saved = await this.methods.findCustomerRef(accountId);
    if (saved) return saved;
    return this.methods.saveCustomerRef(accountId, await this.payments.createCustomer(accountId).catch(unavailable));
  }
}
