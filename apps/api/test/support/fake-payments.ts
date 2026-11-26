import { randomUUID } from 'node:crypto';
import { type Card, HoldLostError, type HoldRequest, type HoldStatus, PaymentService, PaymentServiceError, type PlacedHold } from '../../src/payments/payment.service.js';

/** A card as a test describes it. Unless told otherwise, the same brand and digits are the same card. */
export type NewCard = Omit<Card, 'ref' | 'fingerprint'> & { fingerprint?: string };

/** Stands in for Stripe: customers, card setups and test cards live in memory. */
export class FakePaymentService extends PaymentService {
  readonly publishableKey = 'pk_test_fake';
  /** The customer each call was made for, in order. */
  readonly customers: string[] = [];
  readonly forgotten: string[] = [];
  failing = false;
  /** What the next holds come to, as a bank would decide. */
  holdOutcome: PlacedHold['status'] = 'held';
  /** Every hold asked for, in order, as it stands now. A declined one is among them. */
  readonly holds: Array<HoldRequest & { ref: string; status: HoldStatus; chargedCents: number | null }> = [];
  private readonly customerByAccount = new Map<string, string>();
  private readonly setups = new Map<string, { customerRef: string; card: Card | null }>();
  private readonly cards: Array<Card & { customerRef: string }> = [];

  async createCustomer(accountId: string): Promise<string> {
    this.check();
    const ref = this.customerByAccount.get(accountId) ?? `cus_${randomUUID()}`;
    this.customerByAccount.set(accountId, ref);
    return ref;
  }

  async startSetup(customerRef: string): Promise<{ clientSecret: string }> {
    this.check();
    this.customers.push(customerRef);
    const id = `seti_${randomUUID()}`;
    this.setups.set(id, { customerRef, card: null });
    return { clientSecret: `${id}_secret_fake` };
  }

  async findSetupCard(customerRef: string, setupId: string): Promise<Card | null> {
    this.check();
    const setup = this.setups.get(setupId);
    if (setup?.customerRef !== customerRef || !setup.card) return null;
    return this.forgotten.includes(setup.card.ref) ? null : setup.card;
  }

  async saveTestCard(customerRef: string): Promise<Card> {
    this.check();
    this.customers.push(customerRef);
    return this.newCard(customerRef, { brand: 'visa', last4: '4242', wallet: null });
  }

  async listCards(customerRef: string): Promise<Card[]> {
    this.check();
    return this.cards.filter((card) => card.customerRef === customerRef && !this.forgotten.includes(card.ref)).map(({ customerRef: _, ...card }) => card);
  }

  async forgetCard(ref: string): Promise<void> {
    this.check();
    this.forgotten.push(ref);
  }

  async placeHold(request: HoldRequest): Promise<PlacedHold> {
    this.check();
    const ref = `pi_${randomUUID()}`;
    const status = this.holdOutcome;
    this.holds.push({ ...request, ref, status, chargedCents: null });
    if (status === 'declined') return { status, message: 'Your card was declined.' };
    return status === 'held' ? { status, ref } : { status, ref, clientSecret: `${ref}_secret_fake` };
  }

  async findHold(ref: string): Promise<HoldStatus> {
    this.check();
    return this.hold(ref).status;
  }

  async captureHold(ref: string, amountCents: number): Promise<void> {
    this.check();
    const hold = this.hold(ref);
    if (hold.status === 'charged') return;
    if (hold.status !== 'held') throw new HoldLostError(`Cannot charge a hold that is ${hold.status}`);
    if (amountCents > hold.amountCents) throw new PaymentServiceError('More than was held');
    Object.assign(hold, { status: 'charged', chargedCents: amountCents });
  }

  async releaseHold(ref: string): Promise<void> {
    this.check();
    const hold = this.hold(ref);
    if (hold.status === 'charged') throw new PaymentServiceError('A charged hold cannot be released');
    hold.status = 'released';
  }

  /** What the bank's check ends in, once the Rider has been through it. */
  finishVerification(clientSecret: string, passed: boolean): void {
    this.hold(this.setupId(clientSecret)).status = passed ? 'held' : 'declined';
  }

  private hold(ref: string) {
    const hold = this.holds.find((each) => each.ref === ref);
    if (!hold) throw new PaymentServiceError(`No hold ${ref}`);
    return hold;
  }

  setupId(clientSecret: string): string {
    return clientSecret.split('_secret_')[0]!;
  }

  /** What Stripe's form does when the Rider submits a card that is accepted. */
  completeSetup(clientSecret: string, card: NewCard): string {
    const id = this.setupId(clientSecret);
    const setup = this.setups.get(id)!;
    setup.card = this.newCard(setup.customerRef, card);
    return id;
  }

  cardRef(last4: string): string | undefined {
    return this.cards.findLast((card) => card.last4 === last4)?.ref;
  }

  private newCard(customerRef: string, card: NewCard): Card {
    const saved = { ref: `pm_${randomUUID()}`, fingerprint: `${card.brand}-${card.last4}`, ...card };
    this.cards.push({ ...saved, customerRef });
    return saved;
  }

  private check(): void {
    if (this.failing) throw new PaymentServiceError('Stripe is down');
  }
}
