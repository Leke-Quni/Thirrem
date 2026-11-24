import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const password = 'Correct-horse-battery';
const newEmail = () => `rider-${randomUUID()}@example.com`;

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

  test('has no guest mode: the home page sends a visitor without an account to login', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login$/);
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
        await expect(page.getByRole('heading', { name: /you are logged in/i })).toBeVisible();
      });
    }

    test('stays on the home page when they click the logo', async ({ page }) => {
      await page.goto('/home');
      await page.getByRole('link', { name: 'Thirrem home' }).click();
      await expect(page).toHaveURL(/\/home$/);
      await expect(page.getByRole('heading', { name: /you are logged in/i })).toBeVisible();
    });

    test('can still reach the landing page', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
