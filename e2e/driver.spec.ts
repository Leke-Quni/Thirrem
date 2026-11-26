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

test.describe('Driver Sandbox', () => {
  const choice = { vehicleType: 'comfort', model: 'Škoda Superb', colour: 'Blue' };
  const gjakova = { lat: 42.3803, lon: 20.4308 };
  const london = { latitude: 51.5072, longitude: -0.1276 };
  const car = (page: Page) => page.getByRole('img', { name: 'Your car' });

  /** A new Driver with a registered vehicle, logged in on `page` but not yet on any page. */
  async function registeredDriver(page: Page, { approved = true } = {}) {
    const signup = await page.request.post('/driver/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await signup.json();
    const headers = { Authorization: `Bearer ${token}` };
    await page.request.post('/driver/vehicle', { headers, data: choice });
    if (approved) {
      await expect
        .poll(async () => (await (await page.request.get('/driver/vehicle', { headers })).json()).vehicle.status, { timeout: 20_000 })
        .toBe('approved');
    }
    await page.addInitScript((value) => localStorage.setItem('thirrem-driver-token', value), token);
  }

  const openedAt = (page: Page) => page.waitForRequest((r) => r.url().endsWith('/driver/sandbox') && r.method() === 'PUT').then((r) => r.postDataJSON().centre);

  test.describe('with the device location shared', () => {
    test.use({ geolocation: london, permissions: ['geolocation'] });

    test('shows an approved Driver their car on a map around the device location', async ({ page }) => {
      await registeredDriver(page);
      const centre = openedAt(page);

      await page.goto('/home');

      expect(await centre).toEqual({ lat: london.latitude, lon: london.longitude });
      await expect(page.getByRole('application', { name: /map/i })).toBeVisible();
      await expect(car(page)).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Your car is on the map' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'You are approved' })).toBeVisible();
      await expect(page.getByText('Blue Škoda Superb')).toBeVisible();
    });
  });

  test('starts in Gjakova when the device location is refused', async ({ page }) => {
    await registeredDriver(page);
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    const centre = openedAt(page);

    await page.goto('/home');

    expect(await centre).toEqual(gjakova);
    await expect(car(page)).toBeVisible();
  });

  test('gives a Driver waiting for approval no Sandbox, and opens it once they are approved', async ({ page }) => {
    let opened = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/driver/sandbox')) opened += 1;
    });
    await registeredDriver(page, { approved: false });

    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Waiting for approval' })).toBeVisible();
    await expect(page.getByRole('application')).toHaveCount(0);
    expect(opened).toBe(0);

    await expect(car(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'You are approved' })).toBeFocused();
  });

  test('has its own loader while the car is being placed', async ({ page }) => {
    await registeredDriver(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/driver/sandbox', async (route) => {
      await gate;
      await route.continue();
    });

    await page.goto('/home');
    await expect(page.getByRole('status').filter({ hasText: 'Placing your car…' })).toBeVisible();
    release();

    await expect(car(page)).toBeVisible();
  });

  test('says all Sandboxes are busy, and opens one on trying again', async ({ page }) => {
    await registeredDriver(page);
    await page.route('**/driver/sandbox', (route) =>
      route.fulfill({ status: 503, json: { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' } }),
    );

    await page.goto('/home');
    await expect(page.getByRole('alert')).toContainText('All Sandboxes are busy');
    await expect(car(page)).toHaveCount(0);

    await page.unroute('**/driver/sandbox');
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(car(page)).toBeVisible();
  });

  test('offers a retry when the Sandbox cannot be opened', async ({ page }) => {
    await registeredDriver(page);
    await page.route('**/driver/sandbox', (route) => route.abort());

    await page.goto('/home');
    await expect(page.getByRole('alert')).toContainText(/could not reach thirrem/i);

    await page.unroute('**/driver/sandbox');
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(car(page)).toBeVisible();
  });

  test('says when the Sandbox has stopped, keeping the car, and resumes it when asked', async ({ page }) => {
    await registeredDriver(page);
    await page.route('**/driver/sandbox', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: { status: 'stopped', car: { ...gjakova, heading: 0, vehicleType: 'comfort' } } });
    });

    await page.goto('/home');
    await expect(page.getByText('Your Sandbox stopped after 15 minutes without activity.')).toBeVisible({ timeout: 15_000 });
    await expect(car(page)).toBeVisible();
    await page.unroute('**/driver/sandbox');
    const reopened = openedAt(page);
    await page.getByRole('button', { name: 'Resume Sandbox' }).click();

    await reopened;
    await expect(page.getByRole('status').filter({ hasText: 'Your car is on the map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume Sandbox' })).toHaveCount(0);
  });

  test('opens a new Sandbox by itself when the running one is gone', async ({ page }) => {
    await registeredDriver(page);
    await page.goto('/home');
    await expect(car(page)).toBeVisible();
    const reopened = openedAt(page);
    await page.route('**/driver/sandbox', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 404, json: { message: 'You have no Sandbox.' } });
    });

    await reopened;
    await expect(car(page)).toBeVisible();
  });

  test('asks the Driver to log in again when the session has ended by the time the Sandbox is opened', async ({ page }) => {
    await registeredDriver(page);
    let ended = false;
    const unauthorised = { status: 401, json: { message: 'Log in to continue' } };
    await page.route('**/driver/sandbox', (route) => {
      ended = true;
      return route.fulfill(unauthorised);
    });
    await page.route('**/driver/me', (route) => (ended ? route.fulfill(unauthorised) : route.continue()));

    await page.goto('/home');

    await expect(page).toHaveURL(/\/login$/);
  });

  for (const width of [320, 1280]) {
    test(`fits a ${width} px wide window with the map`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await registeredDriver(page);

      await page.goto('/home');
      await expect(car(page)).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
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
