import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

const password = 'Correct-horse-battery';

const receipt = {
  id: 'receipt-1',
  rideId: 'ride-1',
  amountCents: 1670,
  currency: 'EUR',
  requestedAt: '2026-01-02T12:30:00.000Z',
  vehicleType: 'economy',
  pickupName: 'Sheshi Çarshia',
  dropoffName: 'Rruga Nëna Terezë',
  distanceM: 30_000,
  durationS: 2_400,
  breakdown: { baseCents: 150, distanceCents: 390, timeCents: 280, longDistanceCents: 850 },
  adjustmentCents: 0,
  paymentMethod: { brand: 'visa', last4: '4242', wallet: null },
};
const older = { ...receipt, id: 'receipt-0', rideId: 'ride-0', amountCents: 199, requestedAt: '2026-01-01T09:00:00.000Z', vehicleType: 'xl', pickupName: 'School Road', dropoffName: 'Pin on the map' };

test.use({ locale: 'en-GB', timezoneId: 'UTC' });

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

/** 6 of them at a time, as the API gives them. */
function pageOf(list: Array<typeof receipt>, after: string | null = null) {
  const from = after ? list.findIndex((each) => each.id === after) + 1 : 0;
  const shown = list.slice(from, from + 6);
  return { receipts: shown, total: list.length, next: from + 6 < list.length ? shown.at(-1)!.id : null };
}

const many = (count: number) => Array.from({ length: count }, (_, index) => ({ ...receipt, id: `receipt-${index + 1}`, amountCents: 100 + index }));

/** As though the last visit had found this many receipts. */
const remembered = (page: Page, count: number) => page.addInitScript((value) => localStorage.setItem('thirrem-rider-receipt-count', value), String(count));

/** Answers for the API's receipts. */
async function receipts(page: Page, list: Array<typeof receipt>) {
  await page.route(/\/rider\/receipts(\/.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    if (!id) return route.fulfill({ json: pageOf(list, new URL(route.request().url()).searchParams.get('after')) });
    const found = list.find((each) => each.id === id);
    return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { message: 'There is no such receipt.' } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: [] } }));
  await page.routeWebSocket('**/rider/live', () => undefined);
});

test.describe('Rider receipts list', () => {
  const rows = (page: Page) => page.getByRole('main').getByRole('listitem');

  test('is reached from the account menu, and the logo goes back', async ({ page }) => {
    await signedIn(page);
    await receipts(page, [receipt]);
    await page.goto('/home');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('link', { name: 'Receipts' }).click();

    await expect(page).toHaveURL(/\/receipts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Receipts' })).toBeVisible();
    await expect(page).toHaveTitle('Receipts | Thirrem');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('link', { name: 'Receipts' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Thirrem home' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('lists each paid Ride with its date, amount and points, and opens its receipt', async ({ page }) => {
    await signedIn(page);
    await receipts(page, [receipt, older]);
    await page.goto('/receipts');

    await expect(rows(page)).toHaveCount(2);
    for (const text of ['2 Jan 2026, 12:30', '€16.70', 'Sheshi Çarshia', 'Rruga Nëna Terezë', 'Economy']) await expect(rows(page).first()).toContainText(text);
    await expect(rows(page).last()).toContainText('€1.99');

    await rows(page).last().getByRole('link').click();

    await expect(page).toHaveURL(/\/receipts\/receipt-0$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Receipt' })).toBeVisible();
  });

  test('says when there is no receipt yet, and leads to the planner', async ({ page }) => {
    await signedIn(page);
    await receipts(page, []);
    await page.goto('/receipts');

    await expect(page.getByText('No receipts yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a Ride' })).toHaveAttribute('href', '/home');
  });

  test('shows a loader at once while the receipts are on their way', async ({ page }) => {
    await signedIn(page);
    let answer: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/rider/receipts', async (route) => {
      await answered;
      await route.fulfill({ json: pageOf([]) });
    });
    await page.goto('/receipts');

    await expect(page.getByRole('status').filter({ hasText: 'Loading your receipts…' })).toBeAttached();
    await expect(page.getByRole('heading', { level: 1, name: 'Receipts' })).toBeVisible();
    await expect(page.locator('.receipts-skeleton > span')).toHaveCount(6);
    answer!();
    await expect(page.getByText('No receipts yet.')).toBeVisible();
  });

  test('shows its shell before the app has loaded', async ({ page }) => {
    await signedIn(page);
    await page.route('**/src/main.tsx', () => undefined);
    await page.goto('/receipts', { waitUntil: 'commit' });

    await expect(page.locator('.boot-page').getByRole('heading', { name: 'Receipts' })).toBeVisible();
    await expect(page.locator('.boot-rows > span')).toHaveCount(6);
  });

  for (const [count, shells] of [[3, 3], [25, 6], [0, 0]] as const) {
    test(`shows ${shells} shells before and while loading for a Rider last seen with ${count} receipts`, async ({ page }) => {
      await signedIn(page);
      await remembered(page, count);
      await page.route('**/rider/receipts', () => undefined);
      let start: () => void;
      const started = new Promise<void>((resolve) => (start = resolve));
      await page.route('**/src/main.tsx', async (route) => {
        await started;
        await route.continue();
      });
      await page.goto('/receipts', { waitUntil: 'commit' });
      await expect(page.locator('.boot-page').getByRole('heading', { name: 'Receipts' })).toBeVisible();
      await expect(page.locator('.boot-rows > span')).toHaveCount(shells);

      start!();

      await expect(page.locator('.boot-page')).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: 'Loading your receipts…' })).toBeAttached();
      await expect(page.locator('.receipts-skeleton > span')).toHaveCount(shells);
    });
  }

  test('renders 6 at a time as the Rider scrolls, with a shell for each one still to come', async ({ page }) => {
    await signedIn(page);
    const asked: Array<string | null> = [];
    const answers: Array<() => void> = [];
    await page.route(/\/rider\/receipts(\?.*)?$/, async (route) => {
      const after = new URL(route.request().url()).searchParams.get('after');
      asked.push(after);
      if (after) await new Promise<void>((resolve) => answers.push(resolve));
      await route.fulfill({ json: pageOf(many(14), after) });
    });
    await page.goto('/receipts');
    const shells = page.locator('.receipts-skeleton > span');

    await expect(rows(page)).toHaveCount(6);
    await expect(shells).toHaveCount(6);
    // The first page may be asked for twice in development, so only what carries on is counted.
    const carriedOn = () => asked.filter(Boolean);
    expect(carriedOn()).toEqual([]);

    await shells.first().scrollIntoViewIfNeeded();
    await expect.poll(() => answers.length).toBe(1);
    await expect(page.getByRole('status').filter({ hasText: 'Loading more receipts…' })).toBeAttached();
    answers[0]!();

    await expect(rows(page)).toHaveCount(12);
    await expect(shells).toHaveCount(2);
    expect(answers).toHaveLength(1);

    await shells.last().scrollIntoViewIfNeeded();
    await expect.poll(() => answers.length).toBe(2);
    answers[1]!();

    await expect(rows(page)).toHaveCount(14);
    await expect(shells).toHaveCount(0);
    expect(carriedOn()).toEqual(['receipt-6', 'receipt-12']);
  });

  test('keeps what is listed when more cannot be fetched, and offers to try again', async ({ page }) => {
    await signedIn(page);
    let down = true;
    await page.route(/\/rider\/receipts(\?.*)?$/, (route) => {
      const after = new URL(route.request().url()).searchParams.get('after');
      return after && down ? route.abort() : route.fulfill({ json: pageOf(many(8), after) });
    });
    await page.goto('/receipts');
    await expect(rows(page)).toHaveCount(6);

    await page.locator('.receipts-skeleton > span').first().scrollIntoViewIfNeeded();
    await expect(page.getByRole('alert')).toContainText('Your receipts could not be loaded.');
    await expect(rows(page)).toHaveCount(6);

    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(rows(page)).toHaveCount(8);
  });

  test('forgets how many receipts there were on logging out', async ({ page }) => {
    await signedIn(page);
    await receipts(page, many(3));
    await page.goto('/receipts');
    await expect(rows(page)).toHaveCount(3);
    const kept = () => page.evaluate(() => localStorage.getItem('thirrem-rider-receipt-count'));
    expect(await kept()).toBe('3');

    await page.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(await kept()).toBeNull();
  });

  test('offers to try again when the receipts cannot be fetched', async ({ page }) => {
    await signedIn(page);
    let down = true;
    await page.route('**/rider/receipts', (r) => (down ? r.abort() : r.fulfill({ json: pageOf([receipt]) })));
    await page.goto('/receipts');
    await expect(page.getByRole('alert')).toHaveText('Your receipts could not be loaded. Check your connection and try again.');

    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(rows(page)).toHaveCount(1);
  });

  test('sends a visitor who is not logged in away', async ({ page }) => {
    await page.goto('/receipts');

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('A Rider receipt', () => {
  const line = (page: Page, name: RegExp | string) => page.getByRole('table', { name: 'Fare breakdown' }).getByRole('row', { name });

  test('shows the Ride, each amount, the total and how it was paid', async ({ page }) => {
    await signedIn(page);
    await receipts(page, [receipt]);
    await page.goto('/receipts/receipt-1');

    const main = page.getByRole('main');
    for (const text of ['2 Jan 2026, 12:30', 'Sheshi Çarshia', 'Rruga Nëna Terezë', 'Economy', 'Paid with Visa ending 4242', 'No real money was taken.']) await expect(main).toContainText(text);
    await expect(line(page, /^Base/)).toContainText('€1.50');
    await expect(line(page, /^Distance 30\.0 km/)).toContainText('€3.90');
    await expect(line(page, /^Time 40 min/)).toContainText('€2.80');
    await expect(line(page, /^Long distance/)).toContainText('€8.50');
    await expect(line(page, /^Total charged/)).toContainText('€16.70');
    await expect(line(page, /quoted Fare/)).toHaveCount(0);
    await expect(page).toHaveTitle('Receipt | Thirrem');
  });

  test('says what was taken off to keep to the quoted Fare', async ({ page }) => {
    await signedIn(page);
    await receipts(page, [{ ...receipt, amountCents: 1600, adjustmentCents: -70, paymentMethod: { brand: 'mastercard', last4: '4444', wallet: 'google_pay' as never } }]);
    await page.goto('/receipts/receipt-1');

    await expect(line(page, /^Limited to your quoted Fare/)).toContainText('-€0.70');
    await expect(line(page, /^Total charged/)).toContainText('€16.00');
    await expect(page.getByRole('main')).toContainText('Paid with Mastercard ending 4444 in Google Pay');
  });

  test('goes back to the list', async ({ page }) => {
    await signedIn(page);
    await receipts(page, [receipt]);
    await page.goto('/receipts/receipt-1');

    await page.getByRole('link', { name: 'All receipts' }).click();

    await expect(page).toHaveURL(/\/receipts$/);
  });

  test('says when there is no such receipt', async ({ page }) => {
    await signedIn(page);
    await receipts(page, []);
    await page.goto('/receipts/someone-elses');

    await expect(page.getByRole('alert')).toHaveText('There is no such receipt.');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'All receipts' })).toBeVisible();
  });

  test('shows a loader, then offers to try again when it cannot be fetched', async ({ page }) => {
    await signedIn(page);
    let answer: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let down = true;
    await page.route('**/rider/receipts/receipt-1', async (route) => {
      await answered;
      await (down ? route.abort() : route.fulfill({ json: receipt }));
    });
    await page.goto('/receipts/receipt-1');
    await expect(page.getByRole('status').filter({ hasText: 'Loading your receipt…' })).toBeAttached();

    answer!();
    await expect(page.getByRole('alert')).toHaveText('Your receipt could not be loaded. Check your connection and try again.');
    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(line(page, /^Total charged/)).toContainText('€16.70');
  });

  test('shows its shell before the app has loaded', async ({ page }) => {
    await signedIn(page);
    await page.route('**/src/main.tsx', () => undefined);
    await page.goto('/receipts/receipt-1', { waitUntil: 'commit' });

    await expect(page.locator('.boot-page').getByRole('heading', { name: 'Receipt', exact: true })).toBeVisible();
  });

  for (const width of [320, 768]) {
    test(`fits a long name at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await signedIn(page);
      await receipts(page, [{ ...receipt, pickupName: 'Rruga'.repeat(30) }]);

      for (const path of ['/receipts', '/receipts/receipt-1']) {
        await page.goto(path);
        await expect(page.getByRole('main')).toContainText('€16.70');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
    });
  }
});
