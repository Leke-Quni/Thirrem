import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const password = 'Correct-horse-battery';
const newEmail = () => `rider-${randomUUID()}@example.com`;

const driversAround = ({ lat, lon }: { lat: number; lon: number }) =>
  Array.from({ length: 40 }, (_, index) => ({ id: `driver-${index}`, heading: (index * 47) % 360, vehicleType: ['economy', 'comfort', 'xl', 'electric'][index % 4], lat: lat + index * 0.0002, lon: lon + index * 0.0002 }));

// Most browser tests answer for the Sandbox themselves, so they choose exactly where the Drivers are.
test.beforeEach(async ({ page }) => {
  await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: driversAround(r.request().postDataJSON().centre) } }));
  // A live feed that connects and says nothing.
  await page.routeWebSocket('**/rider/live', () => undefined);
});

test.describe('Rider landing page', () => {
  test('explains that this is a simulated demo and links to signup and login', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/simulated demo/i).first()).toBeVisible();
    await expect(page.getByText(/no real (rides|drivers|money)/i).first()).toBeVisible();

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
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toBeVisible();
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

test.describe('Rider accounts', () => {
  test('signs up, stays logged in on reload, logs out and logs back in', async ({ page }) => {
    const email = newEmail();

    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByText(email)).toBeVisible();

    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText(email)).toBeVisible();
  });

  test('goes back to the landing page in one step after signing up', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign up', exact: true }).click();
    await page.getByLabel('Email').fill(newEmail());
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('goes back to the landing page in one step after logging in', async ({ page }) => {
    const email = newEmail();
    await page.request.post('/rider/auth/signup', { data: { email, password } });

    await page.goto('/');
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('shows a clear error for a wrong password', async ({ page }) => {
    const email = newEmail();
    await page.request.post('/rider/auth/signup', { data: { email, password } });

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);
  });

  test('shows a clear error when the email is already registered', async ({ page }) => {
    const email = newEmail();
    await page.request.post('/rider/auth/signup', { data: { email, password } });

    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByRole('alert')).toContainText(/already exists/i);
  });

  test('has no guest mode: the home page sends a visitor without an account to the landing page', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  });

  test('sends a logged-out visitor from /home to the landing page before any app code, never showing the planner loader', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/src/main.tsx*', async (r) => {
      await gate;
      await r.continue();
    });

    await page.goto('/home', { waitUntil: 'commit' });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#boot-home')).toBeAttached();
    await expect(page.getByText('Loading your ride planner…')).toHaveCount(0);
    release();
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  });

  test.describe('a logged-in rider', () => {
    test.beforeEach(async ({ page }) => {
      const response = await page.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
      const { token } = await response.json();
      await page.addInitScript((value) => localStorage.setItem('thirrem-rider-token', value), token);
    });

    for (const path of ['/signup', '/login']) {
      test(`is sent to the home page when they go to ${path} by hand`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/home$/);
        await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
      });
    }

    test('stays on the home page when they click the logo', async ({ page }) => {
      await page.goto('/home');
      await page.getByRole('link', { name: 'Thirrem home' }).click();
      await expect(page).toHaveURL(/\/home$/);
      await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
    });

    test('can still reach the landing page', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('lands on the landing page when going back to /home after logging out', async ({ page }) => {
      await page.goto('/home');
      await page.getByRole('button', { name: 'Log out' }).click();
      await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();

      await page.goBack();

      await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });

    test('is not bounced back to the home page after logging out', async ({ page }) => {
      await page.goto('/home');
      await page.getByRole('button', { name: 'Log out' }).click();
      await page.goto('/signup');
      await expect(page).toHaveURL(/\/signup$/);
    });
  });

  test('a visitor with an expired or invalid session still sees the signup page', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('thirrem-rider-token', 'not-a-real-token'));
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: /create your rider account/i })).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });
});

test.describe('Rider login and signup pages', () => {
  const pages = [
    { path: '/login', heading: /log in to your rider account/i },
    { path: '/signup', heading: /create your rider account/i },
  ];

  for (const { path, heading } of pages) {
    test(`${path} puts the form in a card in the horizontal centre of the page`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);

      const box = await page.getByRole('region', { name: heading }).boundingBox();

      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(480);
      expect(Math.abs(box!.x + box!.width / 2 - 640)).toBeLessThan(2);
    });

    test(`${path} fits a phone screen without sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(path);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const box = await page.getByRole('region', { name: heading }).boundingBox();

      expect(overflow).toBeLessThanOrEqual(0);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    });

    test(`${path} says the demo is simulated and keeps accounts`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByText(/no real drivers, rides or money/i)).toBeVisible();
      await expect(page.getByText(/account is kept/i)).toBeVisible();
    });

    test(`${path} links back to the landing page`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('link', { name: 'Back to home' }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test('switches between login and signup with the tabs at the top of the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('shows and hides the password on request', async ({ page }) => {
    await page.goto('/login');
    const field = page.getByLabel('Password', { exact: true });
    await field.fill(password);
    await expect(field).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  test('shows which password requirements are met as a new rider types', async ({ page }) => {
    await page.goto('/signup');
    const rules = page.getByRole('list').filter({ hasText: 'Uppercase letter' });
    const summary = page.getByRole('status');
    const field = page.getByLabel('Password', { exact: true });
    await expect(field).toHaveAccessibleDescription(/8\+ characters/i);
    const met = (name: string) => rules.locator('li.is-met', { hasText: name });

    await expect(rules).toContainText(/8\+ characters/i);
    await expect(rules).toContainText(/uppercase letter/i);
    await expect(rules).toContainText(/special character/i);
    await expect(rules.locator('li.is-met')).toHaveCount(0);

    await expect(summary).toHaveText('0 of 3 password requirements met');
    await field.fill('correcthorse');
    await expect(summary).toHaveText('1 of 3 password requirements met');
    await expect(met('8+ characters')).toHaveCount(1);
    await expect(met('Uppercase letter')).toHaveCount(0);
    await expect(met('Special character')).toHaveCount(0);

    await field.fill('Correcthorse');
    await expect(met('Uppercase letter')).toHaveCount(1);
    await expect(met('Special character')).toHaveCount(0);

    await field.fill(password);
    await expect(rules.locator('li.is-met')).toHaveCount(3);
    await expect(summary).toHaveText('3 of 3 password requirements met');
  });

  test('tells a rider which requirement is missing when the server rejects a password', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill(`rider-${Date.now()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('alert')).toContainText(/uppercase letter/i);
  });

  test('keeps the login page free of signup-only password hints', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});

test.describe('Rider ride planner', () => {
  const route = {
    distanceM: 1850,
    durationS: 241,
    geometry: [
      [20.4308, 42.3803],
      [20.4219, 42.3712],
    ],
  };

  const quote = {
    distanceM: 1850,
    durationS: 241,
    fares: [
      { vehicleType: 'economy', amountCents: 202, currency: 'EUR' },
      { vehicleType: 'comfort', amountCents: 279, currency: 'EUR' },
      { vehicleType: 'xl', amountCents: 364, currency: 'EUR' },
      { vehicleType: 'electric', amountCents: 279, currency: 'EUR' },
    ],
  };

  async function signUpAndOpenPlanner(page: import('@playwright/test').Page, street: string | null = null) {
    await page.route('**/rider/places/reverse**', (r) => r.fulfill({ json: { street } }));
    await page.route('**/rider/fare', (r) => r.fulfill({ json: quote }));
    await page.goto('/signup');
    await page.getByLabel('Email').fill(newEmail());
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /use my location/i })).toBeEnabled({ timeout: 30_000 });
  }

  const placeBothPins = async (page: import('@playwright/test').Page) => {
    const box = (await page.getByRole('application', { name: /map/i }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
  };

  test('shows a Fare for Economy, Comfort, XL and Electric, with Economy chosen to start', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    await placeBothPins(page);

    const types = page.getByRole('group', { name: 'Choose a Vehicle Type' });
    await expect(types.getByRole('radio', { name: 'Economy €2.02' })).toBeChecked();
    await expect(types.getByRole('radio', { name: 'Comfort €2.79' })).not.toBeChecked();
    await expect(types.getByRole('radio', { name: 'XL €3.64' })).not.toBeChecked();
    await expect(types.getByRole('radio', { name: 'Electric €2.79' })).not.toBeChecked();
  });

  test('keeps the chosen Vehicle Type when a pin moves', async ({ page }) => {
    let quotes = 0;
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    await page.route('**/rider/fare', (r) => {
      quotes += 1;
      return r.fulfill({ json: quote });
    });
    await placeBothPins(page);

    await page.getByText('Comfort', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /comfort/i })).toBeChecked();

    await page.getByRole('button', { name: /pickup point pin/i }).focus();
    await page.keyboard.press('ArrowRight');

    await expect.poll(() => quotes).toBe(2);
    await expect(page.getByRole('radio', { name: /comfort/i })).toBeChecked();
  });

  test('changes the Vehicle Type with the arrow keys', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    await placeBothPins(page);

    await page.getByRole('radio', { name: /economy/i }).focus();
    await page.keyboard.press('ArrowDown');

    await expect(page.getByRole('radio', { name: /comfort/i })).toBeChecked();
  });

  test('says plainly when the Fares cannot be loaded and lets the Rider try again', async ({ page }) => {
    let attempts = 0;
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    await page.route('**/rider/fare', (r) => {
      attempts += 1;
      return attempts === 1 ? r.fulfill({ status: 503, json: { message: 'Routing is unavailable right now. Try again in a moment.' } }) : r.fulfill({ json: quote });
    });
    await placeBothPins(page);

    await expect(page.getByRole('alert')).toContainText(/routing is unavailable/i);
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('radio', { name: /economy/i })).toBeVisible();
  });

  const trips = [
    { name: 'a short trip', distanceM: 1850, durationS: 241, shown: '1.9 km' },
    { name: 'a long trip', distanceM: 86_000, durationS: 5250, shown: '1 h 28 min' },
    { name: 'a trip across a continent', distanceM: 5_432_100, durationS: 215_940, shown: '59 h 59 min' },
  ];
  for (const { viewport, trip } of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 700 }].flatMap((viewport) => trips.map((trip) => ({ viewport, trip })))) {
    test(`does not resize the planner as the route and Fares arrive for ${trip.name}, at ${viewport.width} px wide`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.route('**/rider/route', (r) => r.fulfill({ json: { ...route, distanceM: trip.distanceM, durationS: trip.durationS } }));
      await signUpAndOpenPlanner(page);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/rider/fare', async (r) => {
        await gate;
        await r.fulfill({ json: quote });
      });
      const height = async () => (await page.locator('.planner').boundingBox())!.height;
      const empty = await height();
      await placeBothPins(page);

      await expect(page.getByRole('status').filter({ hasText: 'Loading the Fares…' })).toBeAttached();
      const loading = await height();
      release();
      await expect(page.getByRole('radio', { name: /xl/i })).toBeVisible();
      await expect(page.getByText(trip.shown)).toBeVisible();

      expect(loading).toBe(empty);
      expect(await height()).toBe(empty);
    });
  }

  test('leaves room to spare for the pin labels on a narrow phone, so wider fonts do not wrap them', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    await placeBothPins(page);
    await expect(page.getByRole('button', { name: 'Remove the Pickup Point' })).toBeVisible();

    const spare = await page.locator('.pin-row-main').evaluateAll((rows) =>
      Math.min(
        ...rows.map((row) => {
          const style = getComputedStyle(row);
          const glyph = row.firstElementChild!.getBoundingClientRect().width;
          const room = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.columnGap) - glyph;
          const label = document.createRange();
          label.selectNodeContents(row.querySelector('strong')!);
          return room - label.getBoundingClientRect().width;
        }),
      ),
    );

    expect(spare).toBeGreaterThanOrEqual(8);
  });

  for (const width of [320, 360, 390, 1280]) {
    test(`keeps every Vehicle Type name and a long Fare inside its option at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
      await signUpAndOpenPlanner(page);
      await page.route('**/rider/fare', (r) => r.fulfill({ json: { ...quote, fares: quote.fares.map((fare) => ({ ...fare, amountCents: 1_234_567 })) } }));
      await placeBothPins(page);
      await expect(page.getByText('€12,345.67')).toHaveCount(4);

      const spill = await page.locator('.vehicle-type span').evaluateAll((parts) => Math.max(...parts.map((el) => el.getBoundingClientRect().width - el.parentElement!.clientWidth)));

      expect(spill).toBeLessThanOrEqual(0);
    });
  }

  test('shows the page shell and its own loader straight away on a slow connection, instead of a blank page', async ({ page }) => {
    await signUpAndOpenPlanner(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/rider/me', async (r) => {
      await gate;
      await r.continue();
    });

    await page.reload();

    await expect(page.getByRole('link', { name: /thirrem/i }).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /loading your ride planner/i })).toBeAttached();
    await expect(page.locator('.route-loader')).toBeVisible();
    await expect(page.getByRole('heading', { name: /plan your ride/i })).toHaveCount(0);

    release();
    await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
  });

  test('shows the route loader over the map until the map has loaded', async ({ page }) => {
    await page.route('**tiles.openfreemap.org/**', (r) => new Promise((resolve) => setTimeout(resolve, 1500)).then(() => r.continue()));
    await page.goto('/signup');
    await page.getByLabel('Email').fill(newEmail());
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.locator('.map-card .route-loader')).toBeVisible();
    await expect(page.getByText('Loading the map…')).toBeVisible();
    await expect(page.locator('.map-card .route-loader')).toBeHidden({ timeout: 30_000 });
  });

  test('shows the planner with both pins asked for, before any pin is placed', async ({ page }) => {
    await signUpAndOpenPlanner(page);

    await expect(page.getByText('Pickup Point', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /search for the pickup point/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /search for the drop-off point/i })).toBeVisible();
    await expect(page.getByText('Drop-off Point', { exact: true })).toBeVisible();
    await expect(page.getByText(/appear once both pins are placed/i)).toBeVisible();
  });

  test('drops a Pickup Point and a Drop-off Point by clicking the map, then shows the route distance and time', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    const map = page.getByRole('application', { name: /map/i });
    const box = (await map.boundingBox())!;

    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);

    await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /drop-off point pin/i })).toBeVisible();
    await expect(page.getByText('1.9 km')).toBeVisible();
    await expect(page.getByText('4 min')).toBeVisible();
  });

  test('keeps the map to a card beside the planner, not the whole screen', async ({ page }) => {
    await signUpAndOpenPlanner(page);

    const map = (await page.locator('.map-card').boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(map.width).toBeLessThan(viewport.width - 380);
    expect(map.height).toBeLessThan(viewport.height);
  });

  test('keeps the planner card and the map card the same size side by side', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);

    const sizes = async () => {
      const planner = (await page.locator('.planner').boundingBox())!;
      const map = (await page.locator('.map-card').boundingBox())!;
      return { planner, map };
    };
    const before = await sizes();
    expect(Math.abs(before.planner.height - before.map.height)).toBeLessThan(1);
    expect(Math.abs(before.planner.y - before.map.y)).toBeLessThan(1);

    const box = before.map;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await expect(page.getByText('1.9 km')).toBeVisible();

    const after = await sizes();
    expect(Math.abs(after.planner.height - after.map.height)).toBeLessThan(1);
  });

  test('searches for a street name and sets the Pickup Point from the chosen result', async ({ page }) => {
    await page.route('**/rider/places**', (r) =>
      r.fulfill({ json: [{ name: 'Rruga Bajram Curri', detail: 'Gjakovë, Kosovo', lat: 42.3803, lon: 20.4308 }] }),
    );
    await signUpAndOpenPlanner(page);

    await page.getByRole('combobox', { name: /search for the pickup point/i }).fill('Bajram Curri');
    await page.getByRole('option', { name: /rruga bajram curri/i }).click();

    await expect(page.getByText('Rruga Bajram Curri, Gjakovë, Kosovo')).toBeVisible();
    await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible();
  });

  test('chooses a search result with the keyboard for the Drop-off Point', async ({ page }) => {
    await page.route('**/rider/places**', (r) =>
      r.fulfill({ json: [{ name: 'Hospital', detail: 'Gjakovë, Kosovo', lat: 42.37, lon: 20.42 }] }),
    );
    await signUpAndOpenPlanner(page);

    const search = page.getByRole('combobox', { name: /search for the drop-off point/i });
    await search.fill('Hospital');
    await expect(page.getByRole('option', { name: /hospital/i })).toBeVisible();
    await search.press('Enter');

    await expect(page.getByText('Hospital, Gjakovë, Kosovo')).toBeVisible();
    await expect(page.getByRole('button', { name: /drop-off point pin/i })).toBeVisible();
  });

  test('tells the Rider to click the map when a search finds no street name', async ({ page }) => {
    await page.route('**/rider/places**', (r) => r.fulfill({ json: [] }));
    await signUpAndOpenPlanner(page);

    await page.getByRole('combobox', { name: /search for the drop-off point/i }).fill('Nowhere road');

    await expect(page.getByText(/no streets or places match.*click the map to drop a pin/i)).toBeVisible();
  });

  test('says plainly when search is unavailable and still lets the Rider click the map', async ({ page }) => {
    await page.route('**/rider/places**', (r) => r.fulfill({ status: 503, json: { message: 'Search is unavailable right now. Click the map to place a pin instead.' } }));
    await signUpAndOpenPlanner(page);

    await page.getByRole('combobox', { name: /search for the pickup point/i }).fill('Bajram');

    await expect(page.getByText(/search is unavailable right now/i)).toBeVisible();
  });

  test('shows the Drop-off Point as a pointed location pin', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    const box = (await page.locator('.map-card').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);

    await expect(page.locator('.pin-dropoff svg path')).toBeVisible();
  });

  test('lets a keyboard user place both pins by moving the map and pressing Enter at the centre mark', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);

    await page.locator('canvas.maplibregl-canvas').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.map-crosshair')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: /drop-off point pin/i })).toBeVisible();
    await expect(page.getByText('1.9 km')).toBeVisible();
  });

  test('moves a pin with the arrow keys and asks for a new route', async ({ page }) => {
    let requests = 0;
    await page.route('**/rider/route', (r) => {
      requests += 1;
      return r.fulfill({ json: route });
    });
    await signUpAndOpenPlanner(page);
    const box = (await page.getByRole('application', { name: /map/i }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await expect(page.getByText('1.9 km')).toBeVisible();

    await page.getByRole('button', { name: /pickup point pin/i }).focus();
    await page.keyboard.press('ArrowRight');

    await expect.poll(() => requests).toBe(2);
  });

  test('says plainly when no route exists between the pins and lets the Rider try again', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ status: 422, json: { message: 'There is no road route between these two points. Try moving a pin closer to a street.' } }));
    await signUpAndOpenPlanner(page);
    const box = (await page.getByRole('application', { name: /map/i }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);

    await expect(page.getByRole('alert')).toContainText(/no road route/i);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('fills the search box of a pin dropped on the map with its street name', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page, 'Skënderbeu, Gjakova');
    const box = (await page.locator('.map-card').boundingBox())!;

    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);

    await expect(page.getByRole('combobox', { name: /search for the pickup point/i })).toHaveValue('Skënderbeu, Gjakova');
  });

  test('shows a finding message, never the coordinates, while the street name is still loading', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/rider/places/reverse**', async (r) => {
      await gate;
      await r.fulfill({ json: { street: 'Skënderbeu, Gjakova' } });
    });
    const box = (await page.locator('.map-card').boundingBox())!;

    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);

    const search = page.getByRole('combobox', { name: /search for the pickup point/i });
    await expect(search).toHaveValue('Finding the street name…');
    await expect(search).not.toHaveValue(/\d+\.\d{5}/);
    release();
    await expect(search).toHaveValue('Skënderbeu, Gjakova');
  });

  test('fills the search box with the point when the map has no street name there', async ({ page }) => {
    await page.route('**/rider/route', (r) => r.fulfill({ json: route }));
    await signUpAndOpenPlanner(page, null);
    const box = (await page.locator('.map-card').boundingBox())!;

    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);

    await expect(page.getByRole('combobox', { name: /search for the pickup point/i })).toHaveValue(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
  });

  test('puts the street name of the pin in the box again when the Rider leaves it half typed', async ({ page }) => {
    await page.route('**/rider/places?**', (r) => r.fulfill({ json: [] }));
    await signUpAndOpenPlanner(page, 'Skënderbeu, Gjakova');
    const box = (await page.locator('.map-card').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
    const search = page.getByRole('combobox', { name: /search for the pickup point/i });
    await expect(search).toHaveValue('Skënderbeu, Gjakova');

    await search.fill('Bajr');
    await page.getByRole('heading', { name: /plan your ride/i }).click();

    await expect(search).toHaveValue('Skënderbeu, Gjakova');
  });

  test.describe('with location allowed', () => {
    test.use({ geolocation: { latitude: 51.5072, longitude: -0.1276 }, permissions: ['geolocation'] });

    test('puts the Pickup Point at the device location by itself, anywhere in the world', async ({ page }) => {
      await signUpAndOpenPlanner(page, 'Nëna Terezë, London');

      await expect(page.getByText('Your location', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible();
      await expect(page.getByRole('combobox', { name: /search for the pickup point/i })).toHaveValue('Nëna Terezë, London');
    });

    test('fills the Pickup Point search with the device point when the map has no street name there', async ({ page }) => {
      await signUpAndOpenPlanner(page, null);

      await expect(page.getByRole('combobox', { name: /search for the pickup point/i })).toHaveValue('51.50720, -0.12760');
    });
  });

  test.describe('with location blocked', () => {
    test.use({ permissions: [] });

    test('explains how to carry on when the Rider blocks location access', async ({ page, context }) => {
      await context.clearPermissions();
      await page.addInitScript(() => {
        navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      });
      await signUpAndOpenPlanner(page);

      await expect(page.getByText(/location access is blocked.*click the map/i)).toBeVisible();
      await expect(page.getByText('Not set').first()).toBeVisible();
    });
  });
});

test.describe('Rider Sandbox with simulated Drivers', () => {
  type Page = import('@playwright/test').Page;
  const gjakova = { lat: 42.3803, lon: 20.4308 };
  const london = { lat: 51.5072, lon: -0.1276 };

  const recordCentres = async (page: Page) => {
    const centres: Array<{ lat: number; lon: number }> = [];
    await page.route('**/rider/sandbox', (r) => {
      const { centre } = r.request().postDataJSON();
      centres.push(centre);
      return r.fulfill({ json: { drivers: driversAround(centre) } });
    });
    return centres;
  };

  const openHome = async (page: Page) => {
    await page.route('**/rider/places/reverse**', (r) => r.fulfill({ json: { street: null } }));
    const signup = await page.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem('thirrem-rider-token', value), token);
    await page.goto('/home');
    await expect(page.getByRole('button', { name: /use my location/i })).toBeEnabled({ timeout: 30_000 });
  };

  const choosePickup = async (page: Page, place: { name: string; lat: number; lon: number }) => {
    await page.route('**/rider/places?**', (r) => r.fulfill({ json: [{ detail: '', ...place }] }));
    await page.getByRole('combobox', { name: /search for the pickup point/i }).fill(place.name);
    await page.getByRole('option', { name: place.name }).click();
  };

  const drivers = (page: Page) => page.locator('.ride-map .driver');

  test.describe('with location allowed', () => {
    test.use({ geolocation: { latitude: london.lat, longitude: london.lon }, permissions: ['geolocation'] });

    test('shows the simulated Drivers around the device location after logging in', async ({ page }) => {
      const centres = await recordCentres(page);
      await openHome(page);

      await expect(drivers(page)).toHaveCount(40);
      await expect(page.getByRole('status').filter({ hasText: '40 simulated Drivers nearby' })).toBeVisible();
      expect(centres).toEqual([london]);
    });

    test('keeps the Drivers for a nearby Pickup Point and moves them to a far one', async ({ page }) => {
      const centres = await recordCentres(page);
      await openHome(page);
      await expect(drivers(page)).toHaveCount(40);

      await choosePickup(page, { name: 'Nearby Road', lat: london.lat + 0.03, lon: london.lon });
      await expect(page.getByText('Nearby Road', { exact: true }).first()).toBeVisible();
      expect(centres).toHaveLength(1);

      await choosePickup(page, { name: 'Rue de Paris', lat: 48.8566, lon: 2.3522 });
      await expect.poll(() => centres.at(-1)).toEqual({ lat: 48.8566, lon: 2.3522 });
      expect(centres).toHaveLength(2);
    });
  });

  test.describe('with location blocked', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      });
    });

    test('puts the Drivers around Gjakova, then around the Pickup Point once one is set', async ({ page }) => {
      const centres = await recordCentres(page);
      await openHome(page);
      await expect.poll(() => centres).toEqual([gjakova]);

      await choosePickup(page, { name: 'Rue de Paris', lat: 48.8566, lon: 2.3522 });

      await expect.poll(() => centres.at(-1)).toEqual({ lat: 48.8566, lon: 2.3522 });
    });

    test('lets the Rider place a pin on top of a Driver', async ({ page }) => {
      await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: [{ id: 'only', vehicleType: 'economy', heading: 90, ...gjakova }] } }));
      await openHome(page);
      const box = (await drivers(page).boundingBox())!;

      await expect(drivers(page)).toHaveAttribute('style', /rotateZ\(90deg\)/);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible();
    });

    test('says it is placing Drivers, then says what went wrong and lets the Rider try again', async ({ page }) => {
      let attempts = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/rider/sandbox', async (r) => {
        attempts += 1;
        if (attempts > 1) return r.fulfill({ json: { drivers: driversAround(gjakova) } });
        await gate;
        return r.fulfill({ status: 429, json: { message: 'Too many Sandbox requests. Please wait a minute and try again.' } });
      });
      await openHome(page);
      await expect(page.getByRole('status').filter({ hasText: 'Placing Drivers…' })).toBeVisible();

      release();
      await expect(page.getByRole('alert')).toContainText(/too many sandbox requests/i);
      await page.getByRole('button', { name: 'Try again' }).click();

      await expect(drivers(page)).toHaveCount(40);
    });

    for (const width of [320, 1280]) {
      test(`keeps the Driver message inside the map and clear of the zoom buttons at ${width} px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.route('**/rider/sandbox', (r) => r.fulfill({ status: 503, json: { message: 'Too many Sandbox requests. Please wait a minute and try again.' } }));
        await openHome(page);

        const message = (await page.getByRole('alert').boundingBox())!;
        const map = (await page.locator('.map-card').boundingBox())!;
        const zoom = (await page.getByRole('button', { name: 'Zoom in' }).boundingBox())!;

        expect(message.x).toBeGreaterThanOrEqual(map.x);
        expect(message.x + message.width).toBeLessThanOrEqual(zoom.x);
        expect(message.y + message.height).toBeLessThanOrEqual(map.y + map.height);
      });
    }
  });

  test.describe('live positions', () => {
    const car = { id: 'only', vehicleType: 'economy', heading: 90, ...gjakova };
    const frame = (changes: Partial<typeof car>) => JSON.stringify({ event: 'drivers', data: { drivers: [{ ...car, ...changes }] } });

    /** Answers for the live feed, keeping each connection and what it was told. */
    const liveFeed = async (page: Page) => {
      const connections: Array<{ socket: import('@playwright/test').WebSocketRoute; told: unknown[] }> = [];
      await page.routeWebSocket('**/rider/live', (socket) => {
        const connection = { socket, told: [] as unknown[] };
        connections.push(connection);
        socket.onMessage((message) => connection.told.push(JSON.parse(String(message))));
      });
      return connections;
    };

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      });
      await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: [car] } }));
    });

    test('moves and turns a car as new positions arrive, without reloading', async ({ page }) => {
      const connections = await liveFeed(page);
      await openHome(page);
      await expect(drivers(page)).toHaveCount(1);
      await expect.poll(() => connections[0]?.told).toEqual([{ event: 'watch', data: { token: expect.any(String) } }]);
      const marker = (await drivers(page).elementHandle())!;
      const before = (await drivers(page).boundingBox())!;

      connections[0]!.socket.send(frame({ lon: gjakova.lon + 0.001, heading: 180 }));

      await expect(drivers(page)).toHaveAttribute('style', /rotateZ\(180deg\)/);
      await expect.poll(async () => (await drivers(page).boundingBox())!.x).toBeGreaterThan(before.x + 10);
      expect(await marker.evaluate((element) => element.isConnected)).toBe(true);
    });

    test('says it is reconnecting when the feed drops, and carries on when it is back', async ({ page }) => {
      const connections = await liveFeed(page);
      await openHome(page);
      await expect.poll(() => connections[0]?.told.length).toBe(1);

      await connections[0]!.socket.close({ code: 1011 });
      await expect(page.getByRole('status').filter({ hasText: 'Reconnecting to the Drivers…' })).toBeVisible();
      await expect(drivers(page)).toHaveCount(1);

      await expect.poll(() => connections[1]?.told.length).toBe(1);
      connections[1]!.socket.send(frame({ heading: 200 }));

      await expect(page.getByRole('status').filter({ hasText: '1 simulated Driver nearby' })).toBeVisible();
      await expect(drivers(page)).toHaveAttribute('style', /rotateZ\(200deg\)/);
    });

    /** A page whose Sandbox has just stopped, keeping what each request to open it asked for. */
    const stoppedSandbox = async (page: Page) => {
      await page.clock.install();
      const connections = await liveFeed(page);
      const opened: Array<{ fresh?: boolean }> = [];
      await page.route('**/rider/sandbox', (r) => {
        const body = r.request().postDataJSON();
        opened.push(body);
        return r.fulfill({ json: { drivers: [body.fresh ? { ...car, id: 'new', heading: 200 } : car] } });
      });
      await openHome(page);
      await expect.poll(() => connections[0]?.told.length).toBe(1);
      await connections[0]!.socket.close({ code: 4410 });
      const dialog = page.getByRole('dialog', { name: 'Your Sandbox timed out' });
      await expect(dialog).toBeVisible();
      return { connections, opened, dialog };
    };
    const nearby = (page: Page) => page.getByRole('status').filter({ hasText: '1 simulated Driver nearby' });
    const stoppedNote = (page: Page) => page.getByRole('status').filter({ hasText: 'Sandbox stopped after 15 minutes without activity.' });

    test('says the Sandbox timed out, keeps the cars, and offers to continue or start a new one', async ({ page }) => {
      const { dialog, opened, connections } = await stoppedSandbox(page);

      await expect(dialog).toContainText('It stopped after 15 minutes without activity.');
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeFocused();
      await expect(dialog.getByRole('button', { name: 'Start a new one' })).toBeVisible();
      await expect(drivers(page)).toHaveCount(1);
      // Long enough for any automatic reconnection to show itself.
      await page.waitForTimeout(2_500);
      expect([opened.length, connections.length]).toEqual([1, 1]);
    });

    test('continues the same Sandbox', async ({ page }) => {
      const { dialog, opened, connections } = await stoppedSandbox(page);

      await dialog.getByRole('button', { name: 'Continue' }).click();

      await expect(dialog).toBeHidden();
      await expect(nearby(page)).toBeVisible();
      await expect.poll(() => connections[1]?.told.length).toBe(1);
      expect(opened.map((body) => body.fresh ?? false)).toEqual([false, false]);
      await expect(drivers(page)).toHaveAttribute('style', /rotateZ\(90deg\)/);
    });

    test('starts a new Sandbox', async ({ page }) => {
      const { dialog, opened } = await stoppedSandbox(page);

      await dialog.getByRole('button', { name: 'Start a new one' }).click();

      await expect(dialog).toBeHidden();
      await expect(nearby(page)).toBeVisible();
      expect(opened.map((body) => body.fresh ?? false)).toEqual([false, true]);
      await expect(drivers(page)).toHaveAttribute('style', /rotateZ\(200deg\)/);
    });

    for (const [how, dismiss] of [
      ['Escape', (page: Page) => page.keyboard.press('Escape')],
      ['the close button', (page: Page) => page.getByRole('button', { name: 'Close' }).click()],
    ] as const) {
      test(`closes with ${how} without choosing, leaving a way to resume on the map`, async ({ page }) => {
        const { dialog, opened } = await stoppedSandbox(page);

        await dismiss(page);

        await expect(dialog).toBeHidden();
        await expect(stoppedNote(page)).toBeVisible();
        expect(opened).toHaveLength(1);
        await page.getByRole('button', { name: 'Resume Sandbox' }).click();
        await expect(nearby(page)).toBeVisible();
      });
    }

    test('resumes when a pin is moved after closing, and asks again at the next timeout', async ({ page }) => {
      const { dialog, opened, connections } = await stoppedSandbox(page);
      await page.keyboard.press('Escape');

      await choosePickup(page, { name: 'Nearby Road', lat: gjakova.lat + 0.002, lon: gjakova.lon });

      await expect(nearby(page)).toBeVisible();
      expect(opened).toHaveLength(2);
      await expect.poll(() => connections[1]?.told.length).toBe(1);
      await connections[1]!.socket.close({ code: 4410 });
      await expect(dialog).toBeVisible();
    });

    test('offers only a new Sandbox once the old one has been discarded', async ({ page }) => {
      const { dialog, opened, connections } = await stoppedSandbox(page);
      await page.clock.fastForward(60_000);
      await expect.poll(() => connections[1]?.told.length).toBe(1);

      await connections[1]!.socket.close({ code: 4404 });

      await expect(dialog).toContainText('It is no longer available.');
      await expect(dialog.getByRole('button', { name: 'Continue' })).toHaveCount(0);
      expect(opened).toHaveLength(1);
      await dialog.getByRole('button', { name: 'Start a new one' }).click();
      await expect(nearby(page)).toBeVisible();
      expect(opened.at(-1)?.fresh).toBe(true);
    });

    for (const width of [320, 1280]) {
      test(`keeps the timeout message and its buttons on screen at ${width} px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 640 });
        const { dialog } = await stoppedSandbox(page);

        const panel = (await dialog.boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(width);
        expect(panel.y + panel.height).toBeLessThanOrEqual(640);
        for (const name of ['Continue', 'Start a new one', 'Close']) {
          const button = (await dialog.getByRole('button', { name }).boundingBox())!;
          expect(button.x).toBeGreaterThanOrEqual(panel.x);
          expect(button.x + button.width).toBeLessThanOrEqual(panel.x + panel.width);
        }
        await page.keyboard.press('Escape');
        const note = (await page.locator('.map-status').boundingBox())!;
        const zoom = (await page.getByRole('button', { name: 'Zoom in' }).boundingBox())!;
        expect(note.x + note.width).toBeLessThanOrEqual(zoom.x);
      });
    }

    test('opens the Sandbox again when the server no longer has it', async ({ page }) => {
      const connections = await liveFeed(page);
      let opened = 0;
      await page.route('**/rider/sandbox', (r) => {
        opened += 1;
        return r.fulfill({ json: { drivers: [car] } });
      });
      await openHome(page);
      await expect.poll(() => connections[0]?.told.length).toBe(1);

      await connections[0]!.socket.close({ code: 4404 });

      await expect.poll(() => opened).toBe(2);
      await expect.poll(() => connections.length).toBe(2);
      await expect(drivers(page)).toHaveCount(1);
    });
  });

  test('receives live positions from the real API', async ({ page }) => {
    await page.unrouteAll();
    // A page keeps its socket routes, so a fresh one is needed to reach the real feed.
    const real = await page.context().newPage();
    await real.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    const received = new Promise<string>((resolve) => {
      real.on('websocket', (socket) => {
        if (socket.url().endsWith('/rider/live')) socket.on('framereceived', ({ payload }) => resolve(String(payload)));
      });
    });

    await openHome(real);

    expect(JSON.parse(await received).data.drivers).toHaveLength(40);
    await expect(drivers(real)).toHaveCount(40);
  });

  test('uses Gjakova when the location question is left unanswered', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = () => undefined;
    });
    const centres = await recordCentres(page);
    await page.route('**/rider/places/reverse**', (r) => r.fulfill({ json: { street: null } }));
    const signup = await page.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem('thirrem-rider-token', value), token);

    await page.goto('/home');

    await expect.poll(() => centres, { timeout: 25_000 }).toEqual([gjakova]);
  });
});

test.describe('Rider first paint on a slow connection', () => {
  const withSession = (page: import('@playwright/test').Page) => page.addInitScript(() => localStorage.setItem('thirrem-rider-token', 'a-stored-session'));

  const holdAppCode = async (page: import('@playwright/test').Page) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/src/main.tsx*', async (r) => {
      await gate;
      await r.continue();
    });
    return release;
  };

  test('shows the page shell on the dark background before any app code has arrived on /home, never a white screen', async ({ page }) => {
    await withSession(page);
    const release = await holdAppCode(page);

    await page.goto('/home', { waitUntil: 'commit' });

    await expect(page.locator('.boot-bar')).toBeVisible();
    await expect(page.locator('.boot-planner')).toBeVisible();
    await expect(page.locator('.boot-map')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /loading your ride planner/i })).toBeAttached();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(7, 9, 13)');

    release();
    await expect(page.locator('.boot-page')).toHaveCount(0);
  });

  test('keeps the early loader inside the map card instead of covering the whole page', async ({ page }) => {
    await withSession(page);
    await holdAppCode(page);

    await page.goto('/home', { waitUntil: 'commit' });

    const viewport = page.viewportSize()!;
    const map = (await page.locator('.boot-map').boundingBox())!;
    const loader = (await page.locator('.boot-map svg').first().boundingBox())!;
    expect(map.width).toBeLessThan(viewport.width - 380);
    expect(loader.x).toBeGreaterThanOrEqual(map.x);
    expect(loader.x + loader.width).toBeLessThanOrEqual(map.x + map.width);
    await expect(page.locator('.boot-loader')).toHaveCount(0);
  });

  test('uses the light background when the Rider chose light mode, with no loader on pages that are instant', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('thirrem-theme', 'light'));
    const release = await holdAppCode(page);

    await page.goto('/', { waitUntil: 'commit' });

    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(238, 240, 244)');
    await expect(page.locator('.boot-page')).toHaveCount(0);
    await expect(page.locator('.boot-loader')).toHaveCount(0);
    release();
  });

  test('uses the light page shell on /home when the Rider chose light mode', async ({ page }) => {
    await withSession(page);
    await page.addInitScript(() => localStorage.setItem('thirrem-theme', 'light'));
    await holdAppCode(page);

    await page.goto('/home', { waitUntil: 'commit' });

    await expect(page.locator('.boot-planner')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(238, 240, 244)');
  });

  test('sets the browser bar colour to match the page background', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#07090d');
  });

  test('does not download the map code on pages that have no map', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

    expect(requested.filter((url) => /maplibre/i.test(url))).toEqual([]);
  });
});

test.describe('Rider session check on the home page', () => {
  async function signedInPage(page: import('@playwright/test').Page) {
    const response = await page.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await response.json();
    await page.addInitScript((value) => {
      if (sessionStorage.getItem('rider-session-seeded')) return;
      sessionStorage.setItem('rider-session-seeded', 'yes');
      localStorage.setItem('thirrem-rider-token', value);
    }, token);
    return token as string;
  }
  const storedToken = (page: import('@playwright/test').Page) => page.evaluate(() => localStorage.getItem('thirrem-rider-token'));

  test('never logs the Rider out when the page is reloaded many times in quick succession', async ({ page }) => {
    await signedInPage(page);
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
    await page.route('**/rider/me', async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await r.continue().catch(() => undefined);
    });

    for (let i = 0; i < 25; i += 1) {
      await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
      await page.waitForTimeout(120);
    }

    await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible({ timeout: 30_000 });
    expect(await storedToken(page)).not.toBeNull();
  });

  test('keeps the Rider logged in and offers a retry when the session check fails without a 401', async ({ page }) => {
    await signedInPage(page);
    let failing = true;
    await page.route('**/rider/me', (r) => (failing ? r.abort() : r.continue()));

    await page.goto('/home');

    await expect(page.getByRole('alert')).toContainText(/could not reach thirrem/i);
    await expect(page).toHaveURL(/\/home$/);
    expect(await storedToken(page)).not.toBeNull();

    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: /plan your ride/i })).toBeVisible();
  });

  test('keeps the Rider logged in when the server answers 503 to the session check', async ({ page }) => {
    await signedInPage(page);
    await page.route('**/rider/me', (r) => r.fulfill({ status: 503, json: { message: 'Service Unavailable' } }));

    await page.goto('/home');

    await expect(page.getByRole('alert')).toContainText(/could not reach thirrem/i);
    expect(await storedToken(page)).not.toBeNull();
  });

  test('ends the session and sends the Rider to login when the server answers 401', async ({ page }) => {
    await signedInPage(page);
    await page.route('**/rider/me', (r) => r.fulfill({ status: 401, json: { message: 'Unauthorized' } }));

    await page.goto('/home');

    await expect(page).toHaveURL(/\/login$/);
    expect(await storedToken(page)).toBeNull();
  });
});

test.describe('Rider loading shell has the same layout as the loaded page', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const sizes = [
    ['desktop', { width: 1280, height: 800 }],
    ['phone', { width: 390, height: 844 }],
  ] as const;

  async function signedIn(page: import('@playwright/test').Page) {
    const response = await page.request.post('/rider/auth/signup', { data: { email: `shell-${randomUUID()}@example.com`, password } });
    const { token } = await response.json();
    await page.addInitScript((value) => {
      if (sessionStorage.getItem('rider-session-seeded')) return;
      sessionStorage.setItem('rider-session-seeded', 'yes');
      localStorage.setItem('thirrem-rider-token', value);
    }, token);
  }
  const box = async (page: import('@playwright/test').Page, selector: string): Promise<Box> => {
    const found = await page.locator(selector).first().boundingBox();
    if (!found) throw new Error(`${selector} is not on the page`);
    return found;
  };
  const sameBox = (shell: Box, loaded: Box, label: string) => {
    const round = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
    expect({ label, ...round(shell) }).toEqual({ label, ...round(loaded) });
  };
  const layout = async (page: import('@playwright/test').Page, selectors: Record<string, string>) => {
    const result: Record<string, Box> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      if (name === 'email' && !(await page.locator(selector).first().isVisible())) continue;
      result[name] = await box(page, selector);
    }
    return result;
  };
  const sameEmailSlot = (shell: Box | undefined, loaded: Box | undefined) => {
    expect(Boolean(shell)).toBe(Boolean(loaded));
    if (!shell || !loaded) return;
    expect(Math.round(shell.x + shell.width)).toBe(Math.round(loaded.x + loaded.width));
    expect(Math.round(shell.y)).toBe(Math.round(loaded.y));
    expect(Math.round(shell.height)).toBe(Math.round(loaded.height));
  };
  const loadedSelectors = { header: '.ride-bar', toggle: '.ride-bar .icon-btn', logout: '.ride-bar .btn', planner: '.planner', map: '.map-card', email: '.ride-bar .who' };
  const loadedPage = async (page: import('@playwright/test').Page) => {
    await expect(page.getByRole('button', { name: /use my location/i })).toBeEnabled({ timeout: 30_000 });
    return layout(page, loadedSelectors);
  };

  for (const [name, viewport] of sizes) {
    test(`the static shell shown before the app code arrives matches the loaded page on a ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signedIn(page);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/src/main.tsx*', async (r) => {
        await gate;
        await r.continue();
      });
      await page.goto('/home', { waitUntil: 'commit' });
      await expect(page.locator('.boot-planner')).toBeVisible();
      const shell = await layout(page, { header: '.boot-bar', toggle: '.boot-toggle', logout: '.boot-logout', planner: '.boot-planner', map: '.boot-map', email: '.boot-who' });

      release();
      const loaded = await loadedPage(page);

      for (const part of ['header', 'toggle', 'logout', 'planner', 'map'] as const) sameBox(shell[part], loaded[part], part);
      sameEmailSlot(shell.email, loaded.email);
    });

    test(`the skeleton shown while the login is checked matches the loaded page on a ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signedIn(page);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/rider/me', async (r) => {
        await gate;
        await r.continue();
      });
      await page.goto('/home');
      await expect(page.locator('.planner-skeleton')).toBeVisible();
      const shell = await layout(page, { header: '.ride-bar', toggle: '.ride-bar .icon-btn', logout: '.logout-skeleton', planner: '.planner-skeleton', map: '.map-card', email: '.who-skeleton' });

      release();
      const loaded = await loadedPage(page);

      for (const part of ['header', 'toggle', 'logout', 'planner', 'map'] as const) sameBox(shell[part], loaded[part], part);
      sameEmailSlot(shell.email, loaded.email);
    });
  }
});
