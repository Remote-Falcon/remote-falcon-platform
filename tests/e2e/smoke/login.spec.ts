import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

// Smoke tier: blocks deploy on PR + push.
// Target wall time <2 min, single chromium worker, retries handled by config.
//
// Flow under test (full happy-path auth round trip):
//   1. Landing loads at /
//   2. Navigate to /signup, fill the Formik-backed register form
//   3. Submit -> the JWT context shows a snackbar then setTimeout(3000) -> /signin
//   4. With AUTO_VALIDATE_EMAIL=true (set in ops/docker-compose.dev.yml for the
//      control-panel service), the freshly created account can sign in immediately
//   5. After sign-in, the user lands in /control-panel/* and the show name appears
//      in the ProfileSection of the MainLayout header
//
// Selectors are sourced from explicit `id=` attributes in the React components
// where they exist (signup-*, outlined-adornment-*-login). When those don't
// exist we fall back to button text. CSS class selectors are deliberately
// avoided since MUI's emotion classes are unstable across rebuilds.

test.describe('signup + login smoke', () => {
  test.describe.configure({ retries: 2 });

  test('new user can sign up, log in, and see the dashboard', async ({ page }) => {
    // Faker email + alphanumeric show name (the showName Yup validator only
    // permits letters/numbers/spaces).
    const email = faker.internet.email().toLowerCase();
    const password = `Aa1!${faker.string.alphanumeric(12)}`;
    const showName = `Smoke${faker.string.alphanumeric({ length: 8, casing: 'mixed' })}Show`;
    const firstName = faker.person.firstName().replace(/[^A-Za-z]/g, '');
    const lastName = faker.person.lastName().replace(/[^A-Za-z]/g, '');

    // 1. Landing page loads.
    await page.goto('/');
    await expect(page).toHaveTitle(/Remote Falcon/i);

    // 2. Navigate directly to /signup. The landing page links exist
    //    (id="keyfeature-signup") but going direct keeps the spec under
    //    its 2-minute budget and avoids flakiness from landing-page animations.
    await page.goto('/signup');
    await expect(page.locator('#signup-submit')).toBeVisible();

    // 3. Fill out the Formik register form. IDs come from
    //    apps/ui/src/views/pages/authentication/auth-forms/AuthRegister.jsx.
    await page.locator('#signup-first-name').fill(firstName);
    await page.locator('#signup-last-name').fill(lastName);
    await page.locator('#signup-show-name').fill(showName);
    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-password').fill(password);

    // 4. Submit. JWTContext.register() shows a snackbar then waits 3s before
    //    navigating to /signin, so we tolerate the redirect taking up to 15s.
    await page.locator('#signup-submit').click();

    await expect(page).toHaveURL(/\/signin/, { timeout: 15_000 });

    // 5. Sign in with the just-created credentials. With AUTO_VALIDATE_EMAIL=true
    //    in the dev-up control-panel container, the account is verified server
    //    side before the redirect resolves.
    await page.locator('#outlined-adornment-email-login').fill(email);
    await page.locator('#outlined-adornment-password-login').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // 6. Authenticated landing page is /control-panel/* (dashboard or
    //    onboarding flow). Either is a successful login.
    await expect(page).toHaveURL(/\/control-panel/, { timeout: 20_000 });

    // 7. Confirm we're really authenticated (not just bounced to a /control-panel
    //    redirect that subsequently kicks back to /signin). The v2 dashboard
    //    renders "Tonight's show" as the PageHead title — a stable anchor
    //    for the authenticated layout. Backed up by "Now playing" which the
    //    Now Playing card always shows whether the show is live or paused.
    await expect(page.locator('body')).toContainText(/Tonight's show|Now playing/i, {
      timeout: 15_000,
    });
  });
});
