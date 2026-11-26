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
      // Only once, or every later page load would log a logged out Rider back in.
      await page.addInitScript((value) => {
        if (sessionStorage.getItem('rider-session-seeded')) return;
        sessionStorage.setItem('rider-session-seeded', 'yes');
        localStorage.setItem('thirrem-rider-token', value);
      }, token);
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
      await expect(page.getByRole('heading', { name: /create your rider account/i })).toBeVisible();
      // A session left behind would be checked by now, and would send the Rider to the home page.
      await page.waitForLoadState('networkidle');
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

    test.describe('when every Sandbox is busy', () => {
      const refusal = { status: 503, json: { code: 'SANDBOX_LIMIT', message: 'All Sandboxes are busy right now. Please try again in a few minutes.' } };
      const card = (page: Page) => page.getByRole('alert').filter({ hasText: 'All Sandboxes are busy' });

      test('says so, and shows the Drivers once trying again finds a place', async ({ page }) => {
        let attempts = 0;
        await page.route('**/rider/sandbox', (r) => (++attempts === 1 ? r.fulfill(refusal) : r.fulfill({ json: { drivers: driversAround(gjakova) } })));
        await openHome(page);

        await expect(card(page)).toContainText('Try again in a few minutes.');
        await expect(drivers(page)).toHaveCount(0);
        await card(page).getByRole('button', { name: 'Try again' }).click();

        await expect(drivers(page)).toHaveCount(40);
        await expect(card(page)).toHaveCount(0);
      });

      test('stays in place while trying again, without losing focus or asking twice', async ({ page }) => {
        let attempts = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        await page.route('**/rider/sandbox', async (r) => {
          if (++attempts > 1) await gate;
          return r.fulfill(refusal);
        });
        await openHome(page);
        const button = card(page).getByRole('button');

        await button.focus();
        await page.keyboard.press('Enter');

        await expect(button).toHaveText('Trying…');
        await expect(button).toHaveAttribute('aria-disabled', 'true');
        await expect(button).toBeFocused();
        await page.keyboard.press('Enter');
        release();
        await expect(button).toHaveText('Try again');
        await expect(button).toBeFocused();
        expect(attempts).toBe(2);
      });

      test('keeps the stopped cars when a Sandbox cannot be continued yet, and continues it later', async ({ page }) => {
        await page.clock.install();
        const connections = await liveFeed(page);
        const opened: Array<{ fresh?: boolean }> = [];
        await page.route('**/rider/sandbox', (r) => {
          opened.push(r.request().postDataJSON());
          return opened.length === 2 ? r.fulfill(refusal) : r.fulfill({ json: { drivers: [car] } });
        });
        await openHome(page);
        await expect.poll(() => connections[0]?.told.length).toBe(1);
        await connections[0]!.socket.close({ code: 4410 });

        await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();

        await expect(card(page)).toBeVisible();
        await expect(drivers(page)).toHaveCount(1);
        await card(page).getByRole('button', { name: 'Try again' }).click();
        await expect(page.getByRole('status').filter({ hasText: '1 simulated Driver nearby' })).toBeVisible();
        expect(opened.at(-1)?.fresh).toBeUndefined();
      });

      for (const width of [320, 1280]) {
        test(`keeps the busy message inside the map and clear of the zoom buttons at ${width} px wide`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await page.route('**/rider/sandbox', (r) => r.fulfill(refusal));
          await openHome(page);

          const message = (await card(page).boundingBox())!;
          const map = (await page.locator('.map-card').boundingBox())!;
          const zoom = (await page.getByRole('button', { name: 'Zoom in' }).boundingBox())!;

          expect(message.x).toBeGreaterThanOrEqual(map.x);
          expect(message.x + message.width).toBeLessThanOrEqual(zoom.x);
          expect(message.y + message.height).toBeLessThanOrEqual(map.y + map.height);
        });
      }
    });

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

test.describe('Rider Ride Request', () => {
  type Page = import('@playwright/test').Page;
  const gjakova = { lat: 42.3803, lon: 20.4308 };
  const cars = driversAround(gjakova).slice(0, 8).map((car) => ({ ...car, available: true }));
  const economy = cars.filter((car) => car.vehicleType === 'economy');
  const driver = { id: economy[1]!.id, name: 'Arta K.', rating: 4.8, vehicle: { model: 'Škoda Fabia', colour: 'Silver', plate: 'TH-412-KD' } };

  const driving = (etaS: number) => ({ status: 'driving', geometry: [[economy[1]!.lon, economy[1]!.lat], [gjakova.lon, gjakova.lat]], etaS });

  const free = { counts: null as 'quick' | 'late' | null, quickForS: null as number | null, pausesRequests: false };
  const late = { ...free, counts: 'late' as const };
  const pausing = { ...late, pausesRequests: true };

  const requestFor = (status: 'searching' | 'matched' | 'failed', ends: { pickup: object; dropoff: object }, approach: object = driving(240), cancellation: typeof free = status === 'matched' ? late : free) => ({
    id: 'request',
    vehicleType: 'economy',
    ...ends,
    status,
    offers: economy.map((car) => ({ driverId: car.id, status: status === 'searching' ? 'offered' : status === 'matched' && car.id === driver.id ? 'accepted' : 'withdrawn' })),
    driver: status === 'matched' ? driver : null,
    approach: status === 'matched' ? approach : null,
    cancellation: status === 'failed' ? null : cancellation,
  });
  const defaultEnds = { pickup: { lat: 42.3803, lon: 20.4308 }, dropoff: { lat: 42.3712, lon: 20.4219 } };

  /** The planner of a signed in Rider whose Sandbox, routes, Fares and live feed the test answers for. */
  async function openPlanner(page: Page, { open = null as 'searching' | 'matched' | 'failed' | null, cancellation = undefined as typeof free | undefined, pausedForS = null as number | null, warningAtMs = null as number | null } = {}) {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    const sandbox = {
      asked: [] as Array<{ vehicleType: string; pickup: object; dropoff: object }>,
      fresh: 0,
      /** The query of each cancel sent. */
      cancels: [] as string[],
      pausedForS,
      warningAtMs,
      request: open ? requestFor(open, defaultEnds, undefined, cancellation) : (null as ReturnType<typeof requestFor> | null),
    };
    const connections: Array<import('@playwright/test').WebSocketRoute> = [];
    await page.routeWebSocket('**/rider/live', (socket) => void connections.push(socket));
    await page.route('**/rider/sandbox', (r) => {
      if (r.request().postDataJSON().fresh) {
        sandbox.fresh += 1;
        sandbox.request = null;
      }
      return r.fulfill({ json: { drivers: cars, rideRequest: sandbox.request, requestsPausedForS: sandbox.pausedForS, cancelWarningAtMs: sandbox.warningAtMs } });
    });
    await page.route(/\/rider\/ride-requests(\?.*)?$/, (r) => {
      if (r.request().method() === 'DELETE') {
        sandbox.cancels.push(new URL(r.request().url()).search);
        if (sandbox.request?.cancellation?.pausesRequests) sandbox.pausedForS = 900;
        sandbox.request = null;
        return r.fulfill({ status: 204, body: '' });
      }
      const body = r.request().postDataJSON();
      sandbox.asked.push(body);
      // As from the API, each Ride Request made has an id of its own.
      sandbox.request = { ...requestFor('searching', body), id: `request-${sandbox.asked.length}` };
      return r.fulfill({ status: 201, json: sandbox.request });
    });
    await page.route('**/rider/places/reverse**', (r) => r.fulfill({ json: { street: 'School Road' } }));
    await page.route('**/rider/route', (r) => r.fulfill({ json: { distanceM: 1850, durationS: 241, geometry: [[20.4308, 42.3803], [20.4219, 42.3712]] } }));
    await page.route('**/rider/fare', (r) => r.fulfill({ json: { distanceM: 1850, durationS: 241, fares: [{ vehicleType: 'economy', amountCents: 202, currency: 'EUR' }] } }));
    const signup = await page.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem('thirrem-rider-token', value), token);
    await page.goto('/home');
    const send = () => connections.at(-1)!.send(JSON.stringify({ event: 'drivers', data: { drivers: cars, rideRequest: sandbox.request, requestsPausedForS: sandbox.pausedForS, cancelWarningAtMs: sandbox.warningAtMs } }));
    const report = (status: 'searching' | 'matched' | 'failed', approach?: object, counting?: typeof free) => {
      sandbox.request = requestFor(status, sandbox.request!, approach, counting);
      send();
    };
    return { sandbox, connections, report, send };
  }

  const placeBothPins = async (page: Page) => {
    await expect(page.getByRole('button', { name: /use my location/i })).toBeEnabled({ timeout: 30_000 });
    const box = (await page.getByRole('application', { name: /map/i }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
  };
  const ask = (page: Page) => page.getByRole('button', { name: /^Request / });
  const marked = (page: Page, mark: string) => page.locator(`.ride-map .driver[data-mark='${mark}']`);

  test('requests the chosen Vehicle Type once both pins are placed, and shows the search on the map', async ({ page }) => {
    const { sandbox } = await openPlanner(page);
    await expect(ask(page)).toBeDisabled();
    await placeBothPins(page);

    await ask(page).click();

    await expect(page.getByRole('heading', { name: 'Finding your Driver' })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Asked 2 Economy Drivers nearby.' })).toBeVisible();
    await expect(marked(page, 'offered')).toHaveCount(2);
    expect(sandbox.asked).toEqual([expect.objectContaining({ vehicleType: 'economy' })]);
  });

  test("shows the matched Driver's name, vehicle and rating, and marks only their car", async ({ page }) => {
    const { report, connections } = await openPlanner(page);
    await placeBothPins(page);
    await ask(page).click();
    await expect(marked(page, 'offered')).toHaveCount(2);
    await expect.poll(() => connections.length).toBe(1);

    report('matched');

    const panel = page.getByRole('region', { name: 'Your Driver', exact: true });
    for (const text of ['Arta K.', 'Rated 4.8 out of 5', 'Silver Škoda Fabia', 'TH-412-KD', '€2.02', 'simulated Driver']) await expect(panel).toContainText(text);
    await expect(marked(page, 'matched')).toHaveCount(1);
    await expect(marked(page, 'offered')).toHaveCount(0);
  });

  test('counts down to the matched Driver arriving, then says they are waiting', async ({ page }) => {
    const { report, connections } = await openPlanner(page, { open: 'matched' });
    const arrival = page.locator('.arrival');
    await expect(arrival).toHaveText(/Arriving in\s*4 min/);
    await expect.poll(() => connections.length).toBe(1);

    report('matched', driving(70));
    await expect(arrival).toHaveText(/Arriving in\s*1 min/);

    report('matched', { status: 'arrived' });
    await expect(arrival).toHaveText('Your Driver is waiting at your Pickup Point.');
    // Drawn over the pin, which would otherwise hide a car waiting right on it.
    const layer = (selector: string) => page.locator(selector).evaluate((element) => Number(getComputedStyle(element).zIndex));
    await expect(marked(page, 'arrived')).toHaveCount(1);
    expect(await layer(".ride-map .driver[data-mark='arrived']")).toBeGreaterThan(await layer('.ride-map .pin-pickup'));
  });

  test("says while the Driver's route is still being looked for", async ({ page }) => {
    const { report, connections } = await openPlanner(page, { open: 'matched' });
    await expect.poll(() => connections.length).toBe(1);

    report('matched', { status: 'routing' });

    await expect(page.getByRole('status').filter({ hasText: 'Finding your Driver’s route…' })).toBeVisible();
  });

  test('lets the Rider ask again when no route to the Pickup Point can be found', async ({ page }) => {
    const { report, connections } = await openPlanner(page, { open: 'matched' });
    let asked = 0;
    await page.route('**/rider/ride-requests/approach', (r) => {
      asked += 1;
      return r.fulfill({ status: 204, body: '' });
    });
    await expect.poll(() => connections.length).toBe(1);
    report('matched', { status: 'unavailable' });
    await expect(page.getByRole('status').filter({ hasText: 'no route to your Pickup Point' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start a new Sandbox' })).toBeEnabled();

    await page.getByRole('button', { name: 'Find the route again' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Finding your Driver’s route…' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Driver', exact: true })).toBeFocused();
    expect(asked).toBe(1);
  });

  test('says why the route could not be asked for again', async ({ page }) => {
    await openPlanner(page, { open: 'matched' });
    await page.route('**/rider/ride-requests/approach', (r) => r.fulfill({ status: 429, json: { message: 'Too many Ride Requests. Please wait a minute and try again.' } }));
    // The first message of the Sandbox is the one that decides what the panel shows.
    await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: cars, rideRequest: requestFor('matched', defaultEnds, { status: 'unavailable' }) } }));
    await page.reload();
    const again = page.getByRole('button', { name: 'Find the route again' });

    await again.click();

    await expect(page.getByRole('alert')).toContainText(/too many ride requests/i);
    await expect(again).toBeEnabled();
  });

  const rideOf = (progress: object, finalFare: object | null = null) => ({ id: 'request-1', vehicleType: 'economy', ...defaultEnds, driver, progress, finalFare });

  test('follows the Ride from pickup to the Drop-off Point', async ({ page }) => {
    const { connections } = await openPlanner(page, { open: 'matched' });
    await expect.poll(() => connections.length).toBe(1);
    const ride = (progress: object) => connections.at(-1)!.send(JSON.stringify({ event: 'drivers', data: { drivers: cars, rideRequest: null, ride: rideOf(progress) } }));

    ride(driving(180));

    const panel = page.getByRole('region', { name: 'On your Ride' });
    await expect(page.locator('.arrival')).toHaveText(/Drop-off in\s*3 min/);
    for (const text of ['Arta K.', 'TH-412-KD', '€2.02']) await expect(panel).toContainText(text);
    await expect(marked(page, 'riding')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /pickup point pin/i })).toHaveAccessibleName(/stays put/);

    ride({ status: 'arrived' });

    await expect(page.locator('.arrival')).toHaveText('You have arrived at your Drop-off Point.');
    await expect(marked(page, 'arrived')).toHaveCount(1);
  });

  test("tags the Rider's own car from pickup until the Drop-off Point, and fades the Pickup Point left behind", async ({ page }) => {
    const { connections } = await openPlanner(page, { open: 'matched' });
    await expect.poll(() => connections.length).toBe(1);
    const tag = page.locator('.ride-map .rider-tag');
    const car = marked(page, 'riding');
    const pickupPin = page.getByRole('button', { name: /pickup point pin/i });
    const report = (progress: object, drivers = cars) =>
      connections.at(-1)!.send(JSON.stringify({ event: 'drivers', data: { drivers, rideRequest: null, ride: rideOf(progress) } }));
    // On its way to the Pickup Point, the car does not have the Rider in it yet.
    await expect(marked(page, 'matched')).toHaveCount(1);
    await expect(tag).toHaveCount(0);

    report(driving(180));

    await expect(tag).toHaveText('You');
    await expect(pickupPin).toHaveCSS('opacity', '0.45');
    /** How far the tag's middle is from the car's, across and up. */
    const offset = async () => {
      const [label, drawn] = [(await tag.boundingBox())!, (await car.boundingBox())!];
      return { across: Math.abs(label.x + label.width / 2 - (drawn.x + drawn.width / 2)), up: drawn.y + drawn.height / 2 - (label.y + label.height) };
    };
    // Polled, as the camera moves to the route between one measurement and the next.
    await expect.poll(async () => (await offset()).across).toBeLessThan(2);
    await expect.poll(async () => (await offset()).up).toBeGreaterThan(15);

    let before = (await tag.boundingBox())!;
    await expect.poll(async () => {
      const [last, now] = [before, (await tag.boundingBox())!];
      before = now;
      return Math.hypot(now.x - last.x, now.y - last.y);
    }, { intervals: [300] }).toBeLessThan(0.5);
    report(driving(120), cars.map((each) => (each.id === driver.id ? { ...each, lat: each.lat - 0.001, heading: 200 } : each)));

    await expect.poll(async () => (await tag.boundingBox())!.y - before.y).toBeGreaterThan(5);
    await expect.poll(async () => (await offset()).across).toBeLessThan(2);
    // It stays level however the car turns.
    expect((await tag.boundingBox())!.height).toBeCloseTo(before.height, 0);

    report({ status: 'arrived' });

    await expect(tag).toHaveCount(0);
    await expect(pickupPin).toHaveCSS('opacity', '1');
  });

  test('lets the Rider ask again when no route to the Drop-off Point can be found', async ({ page }) => {
    await openPlanner(page);
    let asked = 0;
    await page.route('**/rider/rides/route', (r) => {
      asked += 1;
      return r.fulfill({ status: 204, body: '' });
    });
    await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: cars, rideRequest: null, ride: rideOf({ status: 'unavailable' }) } }));
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: 'no route to your Drop-off Point' })).toBeVisible();

    await page.getByRole('button', { name: 'Find the route again' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Finding your route…' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'On your Ride' })).toBeFocused();
    expect(asked).toBe(1);
  });

  /** A Rider on a Ride, which `complete` has the live feed report complete. */
  async function onRide(page: Page) {
    const planner = await openPlanner(page, { open: 'matched' });
    await expect.poll(() => planner.connections.length).toBe(1);
    const report = (progress: object, finalFare: object | null = null) =>
      planner.connections.at(-1)!.send(JSON.stringify({ event: 'drivers', data: { drivers: cars, rideRequest: null, ride: { ...rideOf(progress, finalFare), id: 'request' } } }));
    report(driving(180));
    await expect(page.getByRole('heading', { name: 'On your Ride' })).toBeVisible();
    const complete = () => report({ status: 'arrived' }, { amountCents: 199, currency: 'EUR' });
    const panel = page.getByRole('region', { name: 'Ride complete' });
    return { ...planner, complete, panel };
  }

  test('shows the final Fare once the Ride has completed', async ({ page }) => {
    const { panel, complete } = await onRide(page);
    complete();

    await expect(panel.getByRole('status').filter({ hasText: 'Final Fare' })).toHaveText(/Final Fare\s*€1\.99/);
    // The Fare quoted beforehand is no longer shown beside it.
    await expect(panel).not.toContainText('€2.02');
    for (const text of ['You have arrived at your Drop-off Point.', 'Arta K.', 'TH-412-KD', 'No money was charged.']) await expect(panel).toContainText(text);
    await expect(panel.getByRole('button', { name: 'Start a new Sandbox' })).toHaveCount(0);
  });

  test('keeps focus in the panel when completing takes away the focused button', async ({ page }) => {
    const { complete } = await onRide(page);
    await page.getByRole('button', { name: 'Start a new Sandbox' }).focus();

    complete();

    await expect(page.getByRole('heading', { name: 'Ride complete' })).toBeFocused();
  });

  test('lets the Rider make another Ride Request after a completed Ride', async ({ page }) => {
    const { sandbox, panel, complete } = await onRide(page);
    complete();

    await panel.getByRole('button', { name: 'Request another Ride' }).click();
    // The API goes on sending the completed Ride until another Ride Request is made.
    complete();

    await expect(ask(page)).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'Ride complete' })).toHaveCount(0);
    await expect(page.locator('.planner h1')).toBeFocused();
    await expect(page.getByRole('button', { name: /pickup point pin/i })).not.toHaveAccessibleName(/stays put/);
    await expect(marked(page, 'arrived')).toHaveCount(0);
    expect(sandbox.fresh).toBe(0);

    await ask(page).click();

    await expect(page.getByRole('heading', { name: 'Finding your Driver' })).toBeVisible();
    expect(sandbox.asked).toHaveLength(1);
  });

  test('shows a completed Ride again after a reload', async ({ page }) => {
    await openPlanner(page);
    await page.route('**/rider/sandbox', (r) => r.fulfill({ json: { drivers: cars, rideRequest: null, ride: rideOf({ status: 'arrived' }, { amountCents: 199, currency: 'EUR' }) } }));

    await page.reload();

    await expect(page.getByRole('region', { name: 'Ride complete' })).toContainText('€1.99');
  });

  for (const width of [320, 768]) {
    test(`keeps the completed Ride inside the panel at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      const { panel, complete } = await onRide(page);
    complete();

      await expect(panel).toContainText('€1.99');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const outer = (await panel.boundingBox())!;
      for (const part of [panel.locator('.final-fare strong'), panel.getByRole('button', { name: 'Request another Ride' })]) {
        const box = (await part.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(outer.x);
        expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width);
      }
    });
  }

  test('keeps the pins where they are while the Ride Request is open', async ({ page }) => {
    await openPlanner(page);
    await placeBothPins(page);
    await ask(page).click();
    const pickup = page.getByRole('button', { name: /pickup point pin/i });
    const dropoff = page.getByRole('button', { name: /drop-off point pin/i });
    await expect(pickup).toHaveAccessibleName(/stays put/);
    /** How far apart the pins are on screen, which panning or scrolling leaves alone. */
    const apart = async () => {
      const [from, to] = [(await pickup.boundingBox())!, (await dropoff.boundingBox())!];
      return Math.hypot(to.x - from.x, to.y - from.y);
    };
    // The map moves to fit the route, so the pins are only measured once it has come to rest.
    await page.waitForTimeout(1_500);
    const before = await apart();

    await pickup.focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('application', { name: /map/i }).click({ position: { x: 60, y: 200 } });
    await page.waitForTimeout(1_500);

    expect(Math.abs((await apart()) - before)).toBeLessThan(2);
  });

  for (const status of ['searching', 'matched'] as const) {
    test(`shows the open Ride Request again after a reload while ${status}, with its pins`, async ({ page }) => {
      await openPlanner(page, { open: status });

      await expect(page.getByRole('heading', { name: status === 'matched' ? 'Your Driver' : 'Finding your Driver', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /pickup point pin/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /drop-off point pin/i })).toBeVisible();
      await expect(page.getByText('School Road')).toHaveCount(2);
      // Nothing was clicked, so focus is not moved.
      await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
    });

    test(`starts a new Sandbox while ${status}, after asking first`, async ({ page }) => {
      const { sandbox } = await openPlanner(page, { open: status });
      const start = page.getByRole('button', { name: 'Start a new Sandbox' });

      await start.click();
      await page.getByRole('button', { name: 'Keep this one' }).click();
      await expect(start).toBeFocused();
      expect(sandbox.fresh).toBe(0);
      await start.click();
      await page.getByRole('button', { name: 'Start new' }).click();

      await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
      await expect(ask(page)).toBeEnabled();
      await expect(marked(page, status === 'matched' ? 'matched' : 'offered')).toHaveCount(0);
      expect(sandbox.fresh).toBe(1);
    });
  }

  /** A page whose Ride Request has just failed, as told on the live feed. */
  async function openFailed(page: Page) {
    const planner = await openPlanner(page);
    await placeBothPins(page);
    await ask(page).click();
    await expect(marked(page, 'offered')).toHaveCount(2);
    await expect.poll(() => planner.connections.length).toBe(1);
    planner.report('failed');
    await expect(page.getByRole('heading', { name: 'Ride Request not accepted' })).toBeVisible();
    return planner;
  }

  test('says clearly that the Ride Request was not accepted, and marks no car', async ({ page }) => {
    await openFailed(page);

    await expect(page.getByRole('status').filter({ hasText: 'The Economy Drivers asked did not take your Ride.' })).toBeVisible();
    await expect(marked(page, 'offered')).toHaveCount(0);
    await expect(marked(page, 'matched')).toHaveCount(0);
  });

  test('says the search goes on while there is no Driver to ask', async ({ page }) => {
    const { sandbox, connections } = await openPlanner(page);
    await placeBothPins(page);
    await ask(page).click();
    await expect.poll(() => connections.length).toBe(1);

    connections.at(-1)!.send(JSON.stringify({ event: 'drivers', data: { drivers: cars, rideRequest: { ...sandbox.request!, offers: [] } } }));

    await expect(page.getByRole('status').filter({ hasText: 'No Economy Drivers are close by. Still searching…' })).toBeVisible();
  });

  test('tries the same Ride Request again after it failed', async ({ page }) => {
    const { sandbox } = await openFailed(page);

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('heading', { name: 'Finding your Driver' })).toBeFocused();
    await expect(marked(page, 'offered')).toHaveCount(2);
    expect(sandbox.asked).toHaveLength(2);
    expect(sandbox.asked[1]).toEqual(sandbox.asked[0]);
  });

  test('goes back to the planner after a failure, with the pins kept and free to move', async ({ page }) => {
    await openFailed(page);

    await page.getByRole('button', { name: 'Change your Ride' }).click();

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
    await expect(ask(page)).toBeEnabled();
    await expect(page.getByRole('button', { name: /pickup point pin/i })).not.toHaveAccessibleName(/stays put/);
  });

  test('says why trying again did not work, and keeps both ways forward', async ({ page }) => {
    await openFailed(page);
    await page.route('**/rider/ride-requests', (r) => r.fulfill({ status: 429, json: { message: 'Too many Ride Requests. Please wait a minute and try again.' } }));

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('alert')).toContainText(/too many ride requests/i);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Change your Ride' })).toBeEnabled();
  });

  test('shows a failed Ride Request again after a reload', async ({ page }) => {
    await openPlanner(page, { open: 'failed' });

    await expect(page.getByRole('heading', { name: 'Ride Request not accepted' })).toBeVisible();
    await expect(page.getByText('School Road')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  for (const width of [320, 1280]) {
    test(`keeps the failure actions inside the panel at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPlanner(page, { open: 'failed' });
      await expect(page.getByRole('heading', { name: 'Ride Request not accepted' })).toBeVisible();

      const panel = (await page.locator('.planner').boundingBox())!;
      for (const button of await page.locator('.request-reset .btn').all()) {
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(panel.x);
        expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
      }
    });
  }

  test('says why a Ride could not be requested and lets the Rider try again', async ({ page }) => {
    await openPlanner(page);
    await page.route('**/rider/ride-requests', (r) => r.fulfill({ status: 429, json: { message: 'Too many Ride Requests. Please wait a minute and try again.' } }));
    await placeBothPins(page);

    await ask(page).click();

    await expect(page.getByRole('alert')).toContainText(/too many ride requests/i);
    await expect(ask(page)).toBeEnabled();
  });

  for (const width of [320, 1280]) {
    test(`keeps the matched Driver inside the panel at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPlanner(page, { open: 'matched' });

      const panel = (await page.locator('.planner').boundingBox())!;
      for (const part of ['.arrival', '.driver-card', '.driver-plate', '.request-summary', '.request-reset .btn']) {
        for (const element of await page.locator(part).all()) {
          const box = (await element.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(panel.x);
          expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
        }
      }
    });
  }

  const cancelButton = (page: Page) => page.getByRole('button', { name: 'Cancel Ride Request' });
  const confirmation = (page: Page) => page.locator('.cancel-confirm');
  const keepDriver = (page: Page) => page.getByRole('button', { name: 'Keep my Driver' });
  const holdButton = (page: Page) => page.getByRole('button', { name: 'Hold to cancel' });
  /** Presses and holds long enough to cancel. */
  const hold = (page: Page) => holdButton(page).click({ delay: 1_700 });

  test('cancels at once while searching, back to the planner with the pins kept', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'searching' });

    await cancelButton(page).click();

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
    await expect(ask(page)).toBeEnabled();
    await expect(marked(page, 'offered')).toHaveCount(0);
    expect(sandbox.cancels).toEqual(['']);
  });

  test('asks in one line once a late cancel, with the choices side by side', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched' });
    await cancelButton(page).click();

    await expect(confirmation(page).locator('p')).toHaveText(['Arta K. is 4 min away. Cancel anyway?']);
    await expect(keepDriver(page)).toBeFocused();
    const [keep, cancel] = [(await keepDriver(page).boundingBox())!, (await holdButton(page).boundingBox())!];
    expect(cancel.y).toBe(keep.y);
    expect(cancel.x).toBeGreaterThan(keep.x + keep.width);
    await keepDriver(page).click();
    await expect(cancelButton(page)).toBeFocused();
    await cancelButton(page).click();
    await page.keyboard.press('Escape');
    await expect(cancelButton(page)).toBeFocused();
    expect(sandbox.cancels).toEqual([]);
  });

  test('cancels only once the button has been held down', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched' });
    await cancelButton(page).click();

    await holdButton(page).click({ delay: 300 });
    // Longer than a whole hold, in case letting go did not end it.
    await page.waitForTimeout(1_700);
    expect(sandbox.cancels).toEqual([]);
    await hold(page);

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
    await expect(marked(page, 'matched')).toHaveCount(0);
    expect(sandbox.cancels).toEqual(['']);
  });

  test('ends the hold when the pointer slides off the button', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched' });
    await cancelButton(page).click();
    const box = (await holdButton(page).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y - 40);
    await page.waitForTimeout(1_700);
    await page.mouse.up();

    expect(sandbox.cancels).toEqual([]);
  });

  for (const key of ['Enter', 'Space']) {
    test(`cancels by holding ${key}, and not by pressing it once`, async ({ page }) => {
      const { sandbox } = await openPlanner(page, { open: 'matched' });
      await cancelButton(page).click();
      await holdButton(page).focus();

      await page.keyboard.press(key);
      await page.waitForTimeout(1_700);
      expect(sandbox.cancels).toEqual([]);
      await page.keyboard.down(key);
      await page.waitForTimeout(1_700);
      await page.keyboard.up(key);

      await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeVisible();
      expect(sandbox.cancels).toEqual(['']);
    });
  }

  test('cancels on a single activation from assistive technology, which cannot hold', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched' });
    await cancelButton(page).click();

    await holdButton(page).dispatchEvent('click');

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeVisible();
    expect(sandbox.cancels).toEqual(['']);
  });

  test('says the Driver is waiting once they have arrived', async ({ page }) => {
    const { report, connections } = await openPlanner(page, { open: 'matched' });
    await cancelButton(page).click();
    await expect.poll(() => connections.length).toBe(1);

    report('matched', { status: 'arrived' });

    await expect(confirmation(page).locator('p')).toHaveText(['Arta K. is waiting for you. Cancel anyway?']);
  });

  const quick = (quickForS: number) => ({ ...free, counts: 'quick' as const, quickForS });
  const quickButton = (page: Page) => page.getByRole('button', { name: /^Quick cancel/ });

  test('counts down on the button while a cancel is quick, then offers an ordinary cancel', async ({ page }) => {
    const { report, connections } = await openPlanner(page, { open: 'matched', cancellation: quick(21) });
    await expect(quickButton(page)).toHaveText('Quick cancel 0:21');
    await expect(cancelButton(page)).toHaveCount(0);
    await expect(quickButton(page)).toHaveClass(/primary/);
    await expect.poll(() => connections.length).toBe(1);

    report('matched', undefined, quick(5));
    await expect(quickButton(page)).toHaveText('Quick cancel 0:05');

    report('matched', undefined, late);
    await expect(cancelButton(page)).toBeVisible();
    await expect(quickButton(page)).toHaveCount(0);
  });

  test('cancels quickly in one click', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched', cancellation: quick(21) });

    await quickButton(page).click();

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
    expect(sandbox.cancels).toEqual(['']);
  });

  test('still warns before a quick cancel that pauses Ride Requests', async ({ page }) => {
    const { sandbox } = await openPlanner(page, { open: 'matched', cancellation: { ...quick(21), pausesRequests: true } });

    await quickButton(page).click();

    await expect(confirmation(page).locator('.cancel-cost.is-pause')).toHaveText('Cancelling locks you for 15 minutes.');
    expect(sandbox.cancels).toEqual([]);
    await hold(page);
    await expect(page.locator('.pause-note')).toBeVisible();
    expect(sandbox.cancels).toEqual(['?pause=accepted']);
  });

  test('warns before a cancel that pauses Ride Requests, then shows how long is left', async ({ page }) => {
    const { sandbox, connections, send } = await openPlanner(page, { open: 'matched', cancellation: pausing });
    await cancelButton(page).click();
    await expect(confirmation(page).locator('.cancel-cost.is-pause')).toHaveText('Cancelling locks you for 15 minutes.');

    await hold(page);

    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeFocused();
    expect(sandbox.cancels).toEqual(['?pause=accepted']);
    await expect(page.locator('.pause-note')).toContainText('15:00');
    await expect(ask(page)).toBeDisabled();
    await expect.poll(() => connections.length).toBe(1);

    sandbox.pausedForS = 61;
    send();
    await expect(page.locator('.pause-note')).toContainText('1:01');

    sandbox.pausedForS = null;
    send();
    await expect(page.locator('.pause-note')).toHaveCount(0);
    await expect(ask(page)).toBeEnabled();
  });

  const toast = (page: Page) => page.locator('.toast');

  test('shows a message that can be closed once one more cancel would pause Ride Requests', async ({ page }) => {
    const { sandbox, connections, send } = await openPlanner(page);
    await placeBothPins(page);
    await expect.poll(() => connections.length).toBe(1);
    await expect(toast(page)).toHaveCount(0);

    sandbox.warningAtMs = 1_000;
    send();

    await expect(page.getByRole('status').filter({ hasText: 'If you keep cancelling your Ride Requests, you’ll be locked from requesting for a while.' })).toBeVisible();
    await expect(ask(page)).toBeEnabled();
    await toast(page).getByRole('button', { name: 'Close message' }).click();
    await expect(toast(page)).toHaveCount(0);
    // The same warning is reported every second, and stays closed.
    send();
    sandbox.warningAtMs = 2_000;
    send();
    await expect(toast(page)).toBeVisible();
    sandbox.pausedForS = 900;
    send();
    await expect(toast(page)).toHaveCount(0);
  });

  /** A planner showing the message. */
  async function openWarned(page: Page) {
    const planner = await openPlanner(page);
    await expect.poll(() => planner.connections.length).toBe(1);
    await expect(page.locator('.map-status')).toContainText('nearby');
    planner.sandbox.warningAtMs = 1_000;
    planner.send();
    await expect(toast(page)).toBeVisible();
    return planner;
  }

  test('takes the message away by itself after 8 seconds', async ({ page }) => {
    await openWarned(page);

    await page.waitForTimeout(6_000);
    await expect(toast(page)).toBeVisible();

    await expect(toast(page)).toHaveCount(0, { timeout: 4_000 });
  });

  for (const [how, attend, leave] of [
    ['the pointer is on it', (page: Page) => toast(page).hover(), (page: Page) => page.mouse.move(5, 5)],
    ['it has focus', (page: Page) => toast(page).getByRole('button').focus(), (page: Page) => toast(page).getByRole('button').blur()],
  ] as const) {
    test(`keeps the message while ${how}`, async ({ page }) => {
      await openWarned(page);

      await attend(page);
      await page.waitForTimeout(9_500);
      await expect(toast(page)).toBeVisible();
      await leave(page);

      await expect(toast(page)).toHaveCount(0, { timeout: 10_000 });
    });
  }

  test('does not show the message again after a reload', async ({ page }) => {
    const { connections } = await openPlanner(page, { warningAtMs: 1_000 });
    await expect.poll(() => connections.length).toBe(1);
    await placeBothPins(page);

    await expect(ask(page)).toBeEnabled();
    await expect(toast(page)).toHaveCount(0);
  });

  for (const width of [320, 1280]) {
    test(`keeps the message on screen at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const { sandbox, connections, send } = await openPlanner(page);
      await expect.poll(() => connections.length).toBe(1);
      await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeVisible();
      await expect(page.locator('.map-status')).toContainText('nearby');

      sandbox.warningAtMs = 1_000;
      send();

      await expect(toast(page)).toBeInViewport({ ratio: 1 });
    });
  }

  test('says Ride Requests are still paused after a reload', async ({ page }) => {
    await openPlanner(page, { pausedForS: 600 });
    await placeBothPins(page);

    await expect(page.getByText('Ride Requests are paused after too many cancellations.')).toBeVisible();
    await expect(page.locator('.pause-note')).toContainText('10:00');
    await expect(ask(page)).toBeDisabled();
  });

  test('shows the warning if the cancel turns out to pause Ride Requests, and only then accepts the pause', async ({ page }) => {
    await openPlanner(page, { open: 'searching' });
    const sent: string[] = [];
    await page.route(/\/rider\/ride-requests(\?.*)?$/, (r) => {
      sent.push(new URL(r.request().url()).search);
      if (sent.length === 1) return r.fulfill({ status: 409, json: { code: 'CANCEL_WOULD_PAUSE', message: 'Cancelling now would pause your Ride Requests for 15 minutes.' } });
      return r.fulfill({ status: 204, body: '' });
    });

    await cancelButton(page).click();

    await expect(confirmation(page).locator('.cancel-cost.is-pause')).toHaveText('Cancelling locks you for 15 minutes.');
    await hold(page);
    await expect(page.getByRole('heading', { name: 'Plan your ride' })).toBeVisible();
    expect(sent).toEqual(['', '?pause=accepted']);
  });

  test('says why the Ride Request could not be cancelled and keeps it', async ({ page }) => {
    await openPlanner(page, { open: 'searching' });
    await page.route(/\/rider\/ride-requests(\?.*)?$/, (r) => r.fulfill({ status: 429, json: { message: 'Too many Ride Requests. Please wait a minute and try again.' } }));

    await cancelButton(page).click();

    await expect(page.getByRole('alert')).toContainText(/too many ride requests/i);
    await expect(cancelButton(page)).toBeEnabled();
  });

  test('warns that starting a new Sandbox counts as a cancel', async ({ page }) => {
    await openPlanner(page, { open: 'matched', cancellation: pausing });

    await page.getByRole('button', { name: 'Start a new Sandbox' }).click();

    const group = page.getByRole('group', { name: /start a new sandbox/i });
    await expect(group.locator('.cancel-cost.is-pause')).toHaveText('Cancelling locks you for 15 minutes.');
    await expect(group.getByRole('button', { name: 'Start new and pause' })).toBeVisible();
  });

  test('warns in the timed out dialog that a new Sandbox counts as a cancel', async ({ page }) => {
    const { connections } = await openPlanner(page, { open: 'matched' });
    await expect.poll(() => connections.length).toBe(1);

    await connections.at(-1)!.close({ code: 4410 });

    await expect(page.getByRole('dialog')).toContainText('Starting a new one cancels your Ride Request.');
  });

  for (const width of [320, 1280]) {
    test(`keeps the cancel warning and the pause inside the panel at ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openPlanner(page, { open: 'matched', cancellation: pausing });
      const inside = async (parts: string[]) => {
        const panel = (await page.locator('.planner').boundingBox())!;
        for (const part of parts) {
          for (const element of await page.locator(part).all()) {
            const box = (await element.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(panel.x);
            expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
          }
        }
      };
      await expect(cancelButton(page)).toBeVisible();
      await inside(['.request-reset .btn']);
      await cancelButton(page).click();
      await inside(['.cancel-cost', '.request-reset .btn']);

      await hold(page);

      await expect(page.locator('.pause-note')).toBeVisible();
      await inside(['.pause-note']);
    });
  }

  test('requests a Ride from the real API and is matched to a simulated Driver', async ({ page }) => {
    // The search can take a minute to reach a Driver who is far off.
    test.setTimeout(120_000);
    await page.unrouteAll();
    const real = await page.context().newPage();
    await real.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied' } as GeolocationPositionError);
    });
    // Routing and street names come from public services, which tests do not call.
    await real.route('**/rider/places/reverse**', (r) => r.fulfill({ json: { street: null } }));
    await real.route('**/rider/route', (r) => r.fulfill({ json: { distanceM: 1850, durationS: 241, geometry: [[20.4308, 42.3803], [20.4219, 42.3712]] } }));
    await real.route('**/rider/fare', (r) => r.fulfill({ json: { distanceM: 1850, durationS: 241, fares: [] } }));
    const signup = await real.request.post('/rider/auth/signup', { data: { email: newEmail(), password } });
    const { token } = await signup.json();
    await real.addInitScript((value) => localStorage.setItem('thirrem-rider-token', value), token);
    await real.goto('/home');
    await placeBothPins(real);

    await ask(real).click();

    await expect(real.getByRole('heading', { name: 'Your Driver', exact: true })).toBeVisible({ timeout: 70_000 });
    await expect(marked(real, 'matched')).toHaveCount(1);
    // The tests' API has no routing server to reach, so the Rider is offered another try.
    // It is offered once the API's own retries have failed too.
    await real.getByRole('button', { name: 'Find the route again' }).click();
    await expect(real.getByRole('status').filter({ hasText: 'Finding your Driver’s route…' })).toBeVisible();
    await expect(real.getByRole('button', { name: 'Find the route again' })).toBeVisible({ timeout: 15_000 });

    // With no route to be had, cancelling is no fault of the Rider's, so it is done without asking.
    await cancelButton(real).click();

    await expect(real.getByRole('heading', { name: 'Plan your ride' })).toBeVisible();
    await expect(marked(real, 'matched')).toHaveCount(0);
    await expect(ask(real)).toBeEnabled();
  });
});
