import { describe, expect, it } from 'vitest';
import { cardEnding, cardName } from './payment-text';

describe('payment method wording', () => {
  it('names card brands as people know them', () => {
    expect(cardName('visa')).toBe('Visa');
    expect(cardName('mastercard')).toBe('Mastercard');
    expect(cardName('amex')).toBe('American Express');
    expect(cardName('jcb')).toBe('JCB');
    expect(cardName('cartes_bancaires')).toBe('Cartes Bancaires');
  });

  it('calls a brand it does not know a card', () => {
    expect(cardName('unknown')).toBe('Card');
    expect(cardName('something_new')).toBe('Card');
  });

  it('tells methods apart by their last four digits', () => {
    expect(cardEnding({ brand: 'visa', last4: '4242', wallet: null })).toBe('Visa ending 4242');
  });

  it('says which wallet a card was saved through', () => {
    expect(cardEnding({ brand: 'visa', last4: '4242', wallet: 'apple_pay' })).toBe('Visa ending 4242 in Apple Pay');
    expect(cardEnding({ brand: 'mastercard', last4: '4444', wallet: 'google_pay' })).toBe('Mastercard ending 4444 in Google Pay');
  });
});
