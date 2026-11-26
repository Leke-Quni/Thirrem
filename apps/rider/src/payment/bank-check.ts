import { loadStripe } from '@stripe/stripe-js/pure';

/** Opens the bank's own check over the page, and resolves once the Rider has finished or closed it. */
export async function bankCheck(publishableKey: string, clientSecret: string): Promise<void> {
  const stripe = await loadStripe(publishableKey);
  await stripe?.handleNextAction({ clientSecret });
}
