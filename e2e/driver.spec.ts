import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const password = 'Correct-horse-battery';
const newEmail = () => `driver-${randomUUID()}@example.com`;

async function submit(page: Page, button: 'Sign up' | 'Log in', email: string, secret = password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: button }).click();
}

test.describe('Driver landing page', () => {
  test('explains that this is a simulated demo and links to signup and login', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/simulated demo/i).first()).toBeVisible();
    await expect(page.getByText(/no real (rides|riders|drivers|money)/i).first()).toBeVisible();

    await page.getByRole('link', { name: 'Sign up', exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('shows the live demo as online when the API health check passes', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('status').filter({ hasText: /live demo is online/i })).toBeVisible();
  });

  test('shows the live demo as offline but keeps the page working when the API is unreachable', async ({ page }) => {
    await page.route('**/health', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByRole('status').filter({ hasText: /live demo is offline/i })).toBeVisible();
    await page.getByRole('link', { name: 'Sign up', exact: true }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('shows the example Ride Request as a picture, with nothing to press', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('img', { name: /example ride request/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /accept|decline/i })).toHaveCount(0);
  });

  test('is teal, to tell it apart from the Rider app', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  });

  test('is dark by default and can switch to light mode, remembering the choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test('keeps the example Fare clear of the choices on a 320 px wide window', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  // The words can spill out of their box, so the text itself is measured.
  const edges = (text: string) =>
    page.getByText(text, { exact: true }).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const { left, right, top, bottom } = range.getBoundingClientRect();
      return { left, right, top, bottom };
    });
  const fare = await edges('Estimated Fare');
  const decline = await edges('Decline');

  expect(fare.right <= decline.left || fare.bottom <= decline.top).toBe(true);
});

test.describe('Driver accounts', () => {
  test('signs up, stays logged in on reload, logs out and logs back in', async ({ page }) => {
    const email = newEmail();

    await page.goto('/signup');
    await submit(page, 'Sign up', email);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText(email)).toBeVisible();

    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/login');
    await submit(page, 'Log in', email);
    await expect(page.getByText(email)).toBeVisible();
  });

  test('sends a logged-in Driver away from the signup and login pages', async ({ page }) => {
    await page.goto('/signup');
    await submit(page, 'Sign up', newEmail());
    await expect(page).toHaveURL(/\/home$/);

    await page.goto('/signup');
    await expect(page).toHaveURL(/\/home$/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/home$/);
  });

  test('keeps the logo on the home page', async ({ page }) => {
    await page.goto('/signup');
    await submit(page, 'Sign up', newEmail());

    await expect(page.getByRole('link', { name: 'Thirrem Driver home' })).toHaveAttribute('href', '/home');
  });

  test('refuses the password of a Rider account that has no Driver account', async ({ page }) => {
    const email = newEmail();
    await page.request.post('/rider/auth/signup', { data: { email, password } });

    await page.goto('/login');
    await submit(page, 'Log in', email);

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);
  });

  test('has no guest mode: the home page sends a visitor without an account to the landing page', async ({ page }) => {
    await page.goto('/home');

    await expect(page).toHaveURL(/\/$/);
  });

  test('asks a Driver whose session has ended to log in again', async ({ page }) => {
    await page.goto('/signup');
    await submit(page, 'Sign up', newEmail());
    await expect(page).toHaveURL(/\/home$/);

    await page.route('**/driver/me', (route) => route.fulfill({ status: 401, json: { message: 'Log in to continue' } }));
    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
  });

  test('keeps the Driver logged in and offers a retry when the API cannot be reached', async ({ page }) => {
    const email = newEmail();
    await page.goto('/signup');
    await submit(page, 'Sign up', email);
    await expect(page).toHaveURL(/\/home$/);

    await page.route('**/driver/me', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(/still logged in/i);

    await page.unroute('**/driver/me');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(email)).toBeVisible();
  });

  for (const width of [320, 1280]) {
    test(`fits a ${width} px wide window on every public page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/', '/signup', '/login']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
      }
    });
  }
});

test.describe('Driver vehicle registration', () => {
  async function newDriver(page: Page) {
    await page.goto('/signup');
    await submit(page, 'Sign up', newEmail());
    await expect(page.getByRole('heading', { name: 'Register your vehicle' })).toBeVisible();
  }

  async function register(page: Page) {
    await page.getByRole('radio', { name: 'Comfort' }).check();
    await page.getByLabel('Model').selectOption('Škoda Superb');
    await page.getByRole('radio', { name: 'Blue' }).check();
    await page.getByRole('button', { name: 'Register vehicle' }).click();
  }

  test('registers a vehicle, shows it as pending and then approved', async ({ page }) => {
    await newDriver(page);
    await register(page);

    await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
    await expect(page.getByText('Blue Škoda Superb')).toBeVisible();
    await expect(page.getByText(/^TH-\d{3}-[A-Z]{2}$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register vehicle' })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'You are approved' })).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'You are approved' })).toBeVisible();
    await expect(page.getByText('Blue Škoda Superb')).toBeVisible();
  });

  test('offers only the models of the chosen Vehicle Type', async ({ page }) => {
    await newDriver(page);

    await page.getByRole('radio', { name: 'XL' }).check();

    await expect(page.getByLabel('Model').getByRole('option')).toHaveText(['Volkswagen Touran', 'Ford Galaxy', 'Dacia Jogger']);
    await expect(page.getByLabel('Model')).toHaveValue('Volkswagen Touran');
  });

  test('keeps the choices and says what went wrong when registration fails', async ({ page }) => {
    await newDriver(page);
    await page.route('**/driver/vehicle', (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    );

    await register(page);

    await expect(page.getByRole('alert')).toContainText(/could not reach thirrem/i);
    await expect(page.getByRole('radio', { name: 'Comfort' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Register vehicle' })).toBeEnabled();
  });

  test('shows the vehicle already registered, for example in another tab', async ({ page, context }) => {
    await newDriver(page);
    const other = await context.newPage();
    await other.goto('/home');
    await register(other);
    await expect(other.getByText('Blue Škoda Superb')).toBeVisible();

    await page.getByRole('button', { name: 'Register vehicle' }).click();

    await expect(page.getByText('Blue Škoda Superb')).toBeVisible();
  });

  test('offers a retry when the vehicle cannot be loaded', async ({ page }) => {
    await newDriver(page);
    await page.route('**/driver/vehicle', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(/could not load your vehicle/i);

    await page.unroute('**/driver/vehicle');
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('button', { name: 'Register vehicle' })).toBeVisible();
  });

  for (const width of [320, 1280]) {
    test(`fits a ${width} px wide window through registration`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth);
      await newDriver(page);
      expect(await overflow()).toBeLessThanOrEqual(width);

      await register(page);
      await expect(page.getByText('Blue Škoda Superb')).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(width);
    });
  }
});

test.describe('Driver loading shell has the same layout as the loaded page', () => {
  const sizes = [
    ['desktop', { width: 1280, height: 800 }],
    ['phone', { width: 390, height: 844 }],
  ] as const;

  async function signedIn(page: Page) {
    const response = await page.request.post('/driver/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await response.json();
    await page.addInitScript((value) => localStorage.setItem('thirrem-driver-token', value), token);
  }

  /** Holds back the requests for `url` until the returned function is called. */
  async function hold(page: Page, url: string) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(url, async (route) => {
      await gate;
      await route.continue();
    });
    return release;
  }

  const box = async (page: Page, selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) return null;
    return { x: Math.round(found.x), y: Math.round(found.y), width: Math.round(found.width), height: Math.round(found.height) };
  };

  const layout = async (page: Page, selectors: Record<'header' | 'toggle' | 'logout' | 'card' | 'email', string>) => ({
    header: await box(page, selectors.header),
    toggle: await box(page, selectors.toggle),
    logout: await box(page, selectors.logout),
    card: await box(page, selectors.card),
    // The address is of any length, so only the end and height of its slot are known beforehand.
    email: await box(page, selectors.email).then((slot) => slot && { end: slot.x + slot.width, y: slot.y, height: slot.height }),
  });

  const loadedPage = async (page: Page) => {
    await expect(page.getByRole('button', { name: 'Register vehicle' })).toBeVisible();
    return layout(page, { header: '.home-bar', toggle: '.home-bar .icon-btn', logout: '.home-bar .btn', card: '.home-card', email: '.home-bar .who' });
  };

  for (const [name, viewport] of sizes) {
    test(`the static shell shown before the app code arrives matches the loaded page on a ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signedIn(page);
      const release = await hold(page, '**/src/main.tsx*');

      await page.goto('/home', { waitUntil: 'commit' });
      await expect(page.locator('.boot-card')).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Loading your home page…');
      const shell = await layout(page, { header: '.boot-bar', toggle: '.boot-toggle', logout: '.boot-logout', card: '.boot-card', email: '.boot-who' });
      release();

      expect(shell).toEqual(await loadedPage(page));
    });

    test(`the skeleton shown while the login is checked matches the loaded page on a ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signedIn(page);
      const release = await hold(page, '**/driver/me');

      await page.goto('/home');
      await expect(page.getByText('Loading your account…')).toBeVisible();
      const shell = await layout(page, { header: '.home-bar', toggle: '.home-bar .icon-btn', logout: '.logout-skeleton', card: '.home-card', email: '.who-skeleton' });
      release();

      expect(shell).toEqual(await loadedPage(page));
    });
  }
});
