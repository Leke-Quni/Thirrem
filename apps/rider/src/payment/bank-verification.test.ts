import { describe, expect, it, vi } from 'vitest';
import { PaymentRefusedError, withBankVerification } from './payment-refusal';

const verification = new PaymentRefusedError({ code: 'PAYMENT_VERIFICATION', message: 'Your bank needs to verify this payment.', holdId: 'hold-1', clientSecret: 'pi_1_secret_a', publishableKey: 'pk_test_a' });
const declined = new PaymentRefusedError({ code: 'PAYMENT_DECLINED', message: 'Your card was declined.' });

describe('Sending what needs the Fare held', () => {
  it('sends it once when the bank asks for nothing', async () => {
    const send = vi.fn().mockResolvedValue('made');
    const verify = vi.fn();

    expect(await withBankVerification(send, verify)).toBe('made');
    expect(send.mock.calls).toEqual([[undefined]]);
    expect(verify).not.toHaveBeenCalled();
  });

  it('has the Rider verified, then sends it again with the hold', async () => {
    const send = vi.fn().mockRejectedValueOnce(verification).mockResolvedValue('made');
    const verify = vi.fn().mockResolvedValue(undefined);

    expect(await withBankVerification(send, verify)).toBe('made');
    expect(verify).toHaveBeenCalledWith('pk_test_a', 'pi_1_secret_a');
    expect(send.mock.calls).toEqual([[undefined], ['hold-1']]);
  });

  it('still sends the hold back when the check could not be done, so that the API releases it', async () => {
    const send = vi.fn().mockRejectedValueOnce(verification).mockRejectedValue(declined);

    await expect(withBankVerification(send, () => Promise.reject(new Error('Stripe did not load')))).rejects.toBe(declined);
    expect(send).toHaveBeenLastCalledWith('hold-1');
  });

  it('leaves any other refusal to the caller', async () => {
    const send = vi.fn().mockRejectedValue(declined);

    await expect(withBankVerification(send, vi.fn())).rejects.toBe(declined);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
