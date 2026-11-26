import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

const password = 'Correct-horse-battery';

const method = (id: string, brand: string, last4: string, isDefault = false, wallet: string | null = null) => ({ id, brand, last4, wallet, isDefault });
const visa = method('m-visa', 'visa', '4242', true);
const mastercard = method('m-mastercard', 'mastercard', '4444');

async function signedIn(page: Page) {
  const response = await page.request.post('/rider/auth/signup', { data: { email: `rider-${randomUUID()}@example.com`, password } });
  const { token } = await response.json();
  await page.addInitScript((value) => {
    // Only on the first load, so that logging out stays logged out.
    if (sessionStorage.getItem('signed-in')) return;
    sessionStorage.setItem('signed-in', 'yes');
    localStorage.setItem('thirrem-rider-token', value);
  }, token);
}

interface Answer {
  status?: number;
  methods?: unknown[];
  message?: string;
}

/** Answers for the API's payment methods, and records what the app asked for. */
async function paymentMethods(page: Page, start: unknown[], answers: Record<string, Answer> = {}, publishableKey: string | null = 'pk_test_browser') {
  const asked: string[] = [];
  let methods = start;
  await page.route(/\/rider\/payment-methods(\/.*)?$/, async (route) => {
    const request = route.request();
    const call = `${request.method()} ${new URL(request.url()).pathname.replace('/rider/payment-methods', '') || '/'}`;
    asked.push(call);
    const answer = answers[call];
    if (answer?.status) return route.fulfill({ status: answer.status, json: { message: answer.message } });
    methods = answer?.methods ?? methods;
    return route.fulfill({ json: { publishableKey, methods } });
  });
  return asked;
}

const row = (page: Page, name: string) => page.getByRole('region', { name: 'Saved methods' }).getByRole('listitem').filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: [] } }));
  await page.routeWebSocket('**/rider/live', () => undefined);
});

test.describe('Rider payment page', () => {
  test('is reached from the account menu, and the logo goes back', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await page.goto('/home');
    await expect(page.getByRole('link', { name: 'Payment' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('link', { name: 'Payment' }).click();

    await expect(page).toHaveURL(/\/payment$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Payment' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveTitle('Payment | Thirrem');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('link', { name: 'Payment' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Thirrem home' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page).toHaveTitle('Thirrem: a simulated ride-hailing demo');
  });

  test('shows a loader at once while the saved methods are on their way', async ({ page }) => {
    await signedIn(page);
    let answer: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/rider/payment-methods', async (route) => {
      await answered;
      await route.fulfill({ json: { publishableKey: 'pk_test_browser', methods: [] } });
    });
    await page.goto('/payment');

    await expect(page.getByRole('status').filter({ hasText: 'Loading your payment methods…' })).toBeAttached();
    await expect(page.getByRole('heading', { level: 1, name: 'Payment' })).toBeVisible();
    answer!();
    await expect(page.getByText('No payment method saved yet.')).toBeVisible();
  });

  test('shows its shell before the app has loaded', async ({ page }) => {
    await signedIn(page);
    await page.route('**/src/main.tsx', () => undefined);
    await page.goto('/payment', { waitUntil: 'commit' });

    await expect(page.locator('.boot-page').getByRole('heading', { name: 'Payment' })).toBeVisible();
    await expect(page.locator('.boot-panel').first()).toBeVisible();
  });

  test('says it is test mode and invites a Rider with no saved method to add one', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, []);
    await page.goto('/payment');

    await expect(page.getByText(/test mode\. no real money/i)).toBeVisible();
    await expect(page.getByText('No payment method saved yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a card' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a test card' })).toBeVisible();
  });

  test('adds a Stripe test card in one click', async ({ page }) => {
    await signedIn(page);
    const asked = await paymentMethods(page, [], { 'POST /test-card': { methods: [visa] } });
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Use a test card' }).click();

    await expect(row(page, 'Visa •••• 4242')).toContainText('Default');
    await expect(page.getByRole('status').filter({ hasText: 'Visa ending 4242 saved.' })).toBeAttached();
    expect(asked).toContain('POST /test-card');
  });

  test('saves a card that had to leave the page to be checked, once it comes back', async ({ page }) => {
    await signedIn(page);
    const asked = await paymentMethods(page, [], { 'POST /': { methods: [visa] } });

    await page.goto('/payment?setup_intent=seti_returned&redirect_status=succeeded');

    await expect(row(page, 'Visa •••• 4242')).toBeVisible();
    await expect(page).toHaveURL(/\/payment$/);
    expect(asked.filter((call) => call === 'POST /')).toHaveLength(1);
  });

  test('says why a card could not be added and lets the Rider try again', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [], { 'POST /test-card': { status: 503, message: 'Cards are unavailable right now. Try again in a moment.' } });
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Use a test card' }).click();

    await expect(page.getByRole('alert')).toHaveText('Cards are unavailable right now. Try again in a moment.');
    await expect(page.getByRole('button', { name: 'Use a test card' })).toBeEnabled();
  });

  test('lists test cards to copy, and what each one does', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signedIn(page);
    await paymentMethods(page, []);
    await page.goto('/payment');
    const testCards = page.getByRole('complementary', { name: 'Test cards' });

    for (const [number, outcome] of [
      ['4242 4242 4242 4242', 'Saved straight away'],
      ['5555 5555 5555 4444', 'Saved straight away'],
      ['4000 0025 0000 3155', 'Asks for a bank check'],
      ['4000 0000 0000 0002', 'Declined'],
    ]) {
      await expect(testCards.getByRole('listitem').filter({ hasText: number })).toContainText(outcome!);
    }
    await expect(testCards).toContainText(/any future expiry date/i);

    await testCards.getByRole('button', { name: 'Copy 5555 5555 5555 4444' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Copied 5555 5555 5555 4444.' })).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('5555555555554444');
  });

  test('says how to copy a test card by hand when copying is blocked', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, []);
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } }));
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Copy 4242 4242 4242 4242' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Could not copy. Select the number and copy it.' })).toBeVisible();
  });

  test('says when the card is already saved', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa], { 'POST /test-card': { status: 409, message: 'That card is already saved. To replace it, remove it first.' } });
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Use a test card' }).click();

    await expect(page.getByRole('alert')).toHaveText('That card is already saved. To replace it, remove it first.');
    await expect(row(page, 'Visa')).toHaveCount(1);
  });

  test('changes the default method', async ({ page }) => {
    await signedIn(page);
    const asked = await paymentMethods(page, [visa, mastercard], {
      'PUT /m-mastercard/default': { methods: [{ ...visa, isDefault: false }, { ...mastercard, isDefault: true }] },
    });
    await page.goto('/payment');
    await expect(row(page, 'Visa').getByRole('button', { name: /make .* the default/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Make Mastercard ending 4444 the default' }).click();

    await expect(row(page, 'Mastercard')).toContainText('Default');
    await expect(row(page, 'Visa')).not.toContainText('Default');
    expect(asked).toContain('PUT /m-mastercard/default');
  });

  test('tells a card saved in a wallet apart from the same card typed in', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa, method('m-apple', 'visa', '4242', false, 'apple_pay'), method('m-google', 'mastercard', '4444', false, 'google_pay')]);
    await page.goto('/payment');

    await expect(row(page, 'Apple Pay')).toContainText('Visa');
    await expect(row(page, 'Google Pay')).toContainText('Mastercard');
    await expect(page.getByRole('button', { name: 'Remove Visa ending 4242 in Apple Pay' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Visa ending 4242', exact: true })).toBeVisible();
  });

  test('asks before removing a method', async ({ page }) => {
    await signedIn(page);
    const asked = await paymentMethods(page, [visa, mastercard], { 'DELETE /m-mastercard': { methods: [visa] } });
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Remove Mastercard ending 4444' }).click();
    await expect(page.getByText('Remove Mastercard ending 4444?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByRole('button', { name: 'Remove Mastercard ending 4444' })).toBeFocused();
    expect(asked.filter((call) => call.startsWith('DELETE'))).toEqual([]);

    await page.getByRole('button', { name: 'Remove Mastercard ending 4444' }).click();
    await page.getByRole('button', { name: 'Remove card' }).click();

    await expect(row(page, 'Mastercard')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Saved methods' })).toBeFocused();
  });

  test('says when card payments are not set up, and offers no way to add one', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [], {}, null);
    await page.goto('/payment');

    await expect(page.getByText('Card payments are not set up on this server.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a card' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Use a test card' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Test cards' })).toHaveCount(0);
  });

  test('offers to try again when the saved methods cannot be fetched', async ({ page }) => {
    await signedIn(page);
    let fail = true;
    await page.route('**/rider/payment-methods', (route) =>
      fail ? route.abort() : route.fulfill({ json: { publishableKey: 'pk_test_browser', methods: [visa] } }),
    );
    await page.goto('/payment');
    await expect(page.getByRole('alert')).toContainText('could not be loaded');

    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(row(page, 'Visa •••• 4242')).toBeVisible();
  });

  test('logs out to the landing page', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await page.goto('/payment');

    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('sends a visitor who is not logged in away', async ({ page }) => {
    await page.goto('/payment');

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Rider account menu', () => {
  const menu = (page: Page) => page.getByRole('button', { name: 'Account menu' });

  test('closes with Escape, giving focus back to its button', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await page.goto('/payment');

    await menu(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Payment' })).toBeFocused();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('link', { name: 'Payment' })).toHaveCount(0);
    await expect(menu(page)).toBeFocused();
  });

  test('closes on a click elsewhere, on tabbing away and on choosing the page already open', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await page.goto('/payment');
    const link = page.getByRole('link', { name: 'Payment' });

    await menu(page).click();
    await page.getByRole('heading', { level: 1 }).click();
    await expect(link).toHaveCount(0);

    await menu(page).click();
    await page.getByRole('link', { name: 'Receipts' }).focus();
    await page.keyboard.press('Tab');
    await expect(link).toHaveCount(0);

    await menu(page).click();
    await link.click();
    await expect(link).toHaveCount(0);
  });

  test('shows the whole email on a phone, where the button has no room for it', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await page.goto('/payment');

    await menu(page).click();

    await expect(page.getByText(/^rider-.*@example\.com$/).filter({ visible: true })).toBeVisible();
    const box = (await page.getByRole('link', { name: 'Payment' }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});

const unpaidFare = { id: 'fare-1', amountCents: 199, currency: 'EUR', vehicleType: 'economy', pickupName: 'School Road', dropoffName: 'Mother Teresa Street', requestedAt: '2026-01-01T12:00:00.000Z' };

interface PayAnswer {
  status: number;
  json: object;
}

/** Answers for the API's unpaid Fares. Each payment is answered in turn, and what was sent with it is recorded. */
async function unpaidFares(page: Page, answers: PayAnswer[] = []) {
  const paid: unknown[] = [];
  let fares = [unpaidFare];
  await page.route('**/rider/unpaid-fares', (r) => r.fulfill({ json: { fares } }));
  await page.route('**/rider/unpaid-fares/fare-1/payment', (r) => {
    paid.push(r.request().postDataJSON());
    const answer = answers.shift() ?? { status: 200, json: { fares: [] } };
    if (answer.status === 200) fares = [];
    return r.fulfill(answer);
  });
  return paid;
}

test.describe('An unpaid Fare on the Payment page', () => {
  const panel = (page: Page) => page.getByRole('region', { name: 'Unpaid Fare' });
  const pay = (page: Page) => panel(page).getByRole('button', { name: 'Pay €1.99' });

  test('says what could not be charged, with the default method chosen to pay it', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa, mastercard]);
    await unpaidFares(page);

    await page.goto('/payment');

    for (const text of ['€1.99', 'could not be charged', 'School Road', 'Mother Teresa Street', 'Economy']) await expect(panel(page)).toContainText(text);
    await expect(panel(page).getByRole('radio', { name: /Visa ending 4242/ })).toBeChecked();
    await expect(panel(page).getByRole('radio', { name: /Mastercard ending 4444/ })).not.toBeChecked();
  });

  test('pays it on the method chosen, and says so', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa, mastercard]);
    const paid = await unpaidFares(page);
    await page.goto('/payment');
    await panel(page).getByRole('radio', { name: /Mastercard/ }).check();

    await pay(page).click();

    await expect(page.getByRole('status').filter({ hasText: 'Fare of €1.99 paid. You can request Rides again.' })).toBeFocused();
    await expect(pay(page)).toHaveCount(0);
    expect(paid).toEqual([{ methodId: 'm-mastercard' }]);
  });

  test('says why the payment failed, and lets the Rider try again', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    const message = 'Your card was declined. Your Fare is still unpaid. Try again, or choose another method.';
    await unpaidFares(page, [{ status: 402, json: { code: 'PAYMENT_DECLINED', message } }]);
    await page.goto('/payment');

    await pay(page).click();

    await expect(panel(page).getByRole('alert')).toHaveText(message);
    await pay(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fare of €1.99 paid.' })).toBeVisible();
  });

  test('takes the Rider through their bank’s check, then pays on the same hold', async ({ page }) => {
    await page.route('https://js.stripe.com/**', (r) =>
      r.fulfill({
        contentType: 'text/javascript',
        body: `window.Stripe = () => ({ _registerWrapper() {}, registerAppInfo() {}, handleNextAction() { return Promise.resolve({}); } });`,
      }),
    );
    await signedIn(page);
    await paymentMethods(page, [visa]);
    const paid = await unpaidFares(page, [{ status: 402, json: { code: 'PAYMENT_VERIFICATION', message: 'Your bank needs to verify this payment.', holdId: 'fare-1', clientSecret: 'pi_1_secret_a', publishableKey: 'pk_test_browser' } }]);
    await page.goto('/payment');

    await pay(page).click();

    await expect(page.getByRole('status').filter({ hasText: 'Fare of €1.99 paid.' })).toBeVisible();
    expect(paid).toEqual([{ methodId: 'm-visa' }, { methodId: 'm-visa', holdId: 'fare-1' }]);
  });

  test('asks a Rider with no saved method to add one', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, []);
    await unpaidFares(page);

    await page.goto('/payment');

    await expect(panel(page)).toContainText('Add a payment method below to pay it.');
    await expect(pay(page)).toHaveCount(0);
  });

  test('says when unpaid Fares cannot be loaded, and lets the Rider try again', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    await unpaidFares(page);
    let down = true;
    await page.route('**/rider/unpaid-fares', (r) => (down ? r.fulfill({ status: 500, json: {} }) : r.fallback()));
    await page.goto('/payment');
    await expect(panel(page).getByRole('alert')).toContainText('could not be checked');
    down = false;

    await panel(page).getByRole('button', { name: 'Try again' }).click();

    await expect(pay(page)).toBeVisible();
  });

  test('is not shown to a Rider who owes nothing', async ({ page }) => {
    await signedIn(page);
    await paymentMethods(page, [visa]);
    const answered = page.waitForResponse('**/rider/unpaid-fares');
    await page.goto('/payment');
    await answered;

    await expect(page.getByRole('region', { name: /unpaid fare/i })).toHaveCount(0);
  });
});
