import type { PaymentMethod, Wallet } from '@thirrem/types';

const BRANDS: Record<string, string> = {
  amex: 'American Express',
  cartes_bancaires: 'Cartes Bancaires',
  diners: 'Diners Club',
  discover: 'Discover',
  eftpos_au: 'eftpos',
  jcb: 'JCB',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  visa: 'Visa',
};

export const cardName = (brand: string): string => BRANDS[brand] ?? 'Card';

export const WALLET_NAMES: Record<Wallet, string> = { apple_pay: 'Apple Pay', google_pay: 'Google Pay' };

export const cardEnding = ({ brand, last4, wallet }: Pick<PaymentMethod, 'brand' | 'last4' | 'wallet'>): string =>
  `${cardName(brand)} ending ${last4}${wallet ? ` in ${WALLET_NAMES[wallet]}` : ''}`;
