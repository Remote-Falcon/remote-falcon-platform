import { describe, expect, it } from 'vitest';
import { print } from 'graphql';

import { SIGN_IN, VERIFY_MFA } from '../queries';

/**
 * `completeSignIn` seeds redux straight from the SIGN_IN payload, and the
 * control-panel mutations (updatePreferences, updateCategories) are full-object
 * / full-array replaces. So any field VERIFY_MFA selects but SIGN_IN does not is
 * a field a non-MFA operator can silently erase by signing in, opening a
 * settings tab and saving without reloading.
 *
 * 2FA accounts never hit it, which is exactly why it stayed invisible: the
 * fields were added to VERIFY_MFA and not to SIGN_IN, and nothing failed.
 *
 * This asserts the two stay in lockstep. If you add a field to one, add it to
 * the other. (Fragments would express this better but MultiAPILink hangs
 * forever on any document containing a FragmentDefinition, so the selection
 * sets are duplicated on purpose.)
 */
const selectionPaths = (document) => {
  const paths = new Set();
  const walk = (node, trail) => {
    (node.selections ?? []).forEach((selection) => {
      if (selection.kind !== 'Field') return;
      const next = [...trail, selection.name.value];
      paths.add(next.join('.'));
      if (selection.selectionSet) walk(selection.selectionSet, next);
    });
  };
  // Skip the operation root (signIn vs verifyMfa) so only the payload compares.
  const root = document.definitions[0].selectionSet.selections[0];
  walk(root.selectionSet, []);
  return paths;
};

describe('SIGN_IN / VERIFY_MFA selection parity', () => {
  it('selects exactly the same payload fields', () => {
    const signIn = selectionPaths(SIGN_IN);
    const verifyMfa = selectionPaths(VERIFY_MFA);

    const missingFromSignIn = [...verifyMfa].filter((p) => !signIn.has(p)).sort();
    const missingFromVerifyMfa = [...signIn].filter((p) => !verifyMfa.has(p)).sort();

    expect({ missingFromSignIn, missingFromVerifyMfa }).toEqual({
      missingFromSignIn: [],
      missingFromVerifyMfa: []
    });
  });

  it('selects the fields a settings-tab save would otherwise erase', () => {
    const signIn = selectionPaths(SIGN_IN);
    [
      'preferences.nightlyPlayLimit',
      'preferences.dailyVoteLimit',
      'preferences.votingExemptIps',
      'preferences.statsExcludedIps',
      'preferences.blockedViewerIps',
      'preferences.additionalGpsLocations',
      'categories.name',
      'categories.nightlyPlayLimit',
      'categories.displayOrder'
    ].forEach((path) => expect(signIn).toContain(path));
  });

  it('keeps both documents fragment-free (MultiAPILink hangs on fragments)', () => {
    [SIGN_IN, VERIFY_MFA].forEach((document) => {
      expect(document.definitions.every((d) => d.kind !== 'FragmentDefinition')).toBe(true);
      expect(print(document)).not.toContain('...');
    });
  });
});
