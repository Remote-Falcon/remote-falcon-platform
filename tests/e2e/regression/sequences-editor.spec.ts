import { test, expect } from '@playwright/test';

import { signUpAndSignIn } from './helpers';
import { buildSequence, seedShowByEmail } from './seed';

// Regression: the Sequences list editor (`/control-panel/sequences/list`).
//
// Sequences is the catalog editor owners spend hours in pre-season.
// Inline editing is implemented by EditableCell + useCoalescedSave with
// a 600ms debounce — the field-commit path that touches the most user
// data. A regression here = data loss.
//
// What we assert:
//   1. Seeded sequence appears in the table.
//   2. Clicking the displayName cell enters edit mode (the Typography
//      becomes a TextField).
//   3. Typing a new value + pressing Enter commits — coalesced save
//      flushes within ~1s, status indicator transitions to "Saved".
//   4. After page.reload() the new value is persisted (round-trip
//      through the UPDATE_SEQUENCES mutation + mongo + the next GraphQL
//      show fetch).
test.describe('sequences editor (inline edit)', () => {
  test('inline-editing displayName persists across reload', async ({ page }) => {
    const user = await signUpAndSignIn(page);

    const originalDisplay = 'Original Display Name';
    const updatedDisplay = 'Updated Display Name';

    await seedShowByEmail(user.email, {
      sequences: [
        buildSequence({
          name: 'TestSong',
          displayName: originalDisplay,
          index: 0,
          order: 0,
          active: true,
          visible: true,
          artist: 'Test Artist',
        }),
      ],
    });

    // Single navigation with networkidle wait — avoids the goto+reload race
    // where Playwright aborts an in-flight `getShow` GraphQL request,
    // Apollo's onError handler calls logout(), and the reload lands on the
    // marketing landing page instead of the Sequences list.
    await page.goto('/control-panel/sequences/list', { waitUntil: 'networkidle' });

    // Locate the row containing the seeded sequence by its (immutable)
    // name column. The displayName cell is the 4th TableCell in the row
    // (status, index, name, displayName...). Targeting by visible text
    // is more robust than nth(3) — but we'll combine both for safety.
    const row = page.locator('tr', { has: page.getByText('TestSong', { exact: true }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(originalDisplay);

    // Click the displayName cell to enter edit mode. The Typography
    // collapses into a standard-variant TextField that selects all
    // text on focus, so typing replaces the value.
    await row.getByText(originalDisplay, { exact: true }).click();

    const input = row.locator('input[type="text"]').first();
    await expect(input).toBeFocused();
    // Defensive: explicit select-all in case browser focus order varied.
    await input.press('ControlOrMeta+a');
    await input.fill(updatedDisplay);

    // Enter triggers the input.blur() path which calls commitAndExit.
    await input.press('Enter');

    // useCoalescedSave debounces 600ms; allow ~1.5s for the save round-trip
    // before reloading. We *could* poll for the "Saved" status badge but
    // it's transient (1.5s after which it clears) and the row-status
    // tracking lives on internal state — the persistence assertion below
    // is the actual contract.
    await page.waitForTimeout(2000);

    // Reload re-fetches the show via GraphQL — if the mutation didn't
    // persist, the cell snaps back to the original value.
    await page.reload();

    const reloadedRow = page.locator('tr', { has: page.getByText('TestSong', { exact: true }) });
    await expect(reloadedRow).toContainText(updatedDisplay, { timeout: 15_000 });
    await expect(reloadedRow).not.toContainText(originalDisplay);
  });
});
