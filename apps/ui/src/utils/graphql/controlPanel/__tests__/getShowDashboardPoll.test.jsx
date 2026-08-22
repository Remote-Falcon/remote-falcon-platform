import { GET_SHOW, GET_SHOW_DASHBOARD_POLL } from '../queries';

// GET_SHOW_DASHBOARD_POLL exists so the dashboard's 5s poll stops hauling
// pages[].html, apiAccess tokens, and activeViewers every tick. Its results
// are SHALLOW-merged into Redux ({ ...show, ...data.getShow }), which makes
// two things load-bearing:
//   1. Any top-level field the poll KEEPS must select the exact same
//      sub-fields as GET_SHOW, or the first poll tick nulls the missing
//      sub-fields for every widget reading Redux show.*.
//   2. The heavyweight fields must actually be OMITTED, or the diet is
//      silently undone by a future edit.
// These tests pin both sides mechanically from the query ASTs, so editing
// either query's selection set breaks the build instead of the dashboard.

const selections = (doc) => {
  const op = doc.definitions.find((d) => d.kind === 'OperationDefinition');
  return op.selectionSet.selections[0].selectionSet.selections;
};

const byName = (fields) => Object.fromEntries(fields.map((f) => [f.name.value, f]));

// Order-insensitive structural print of a field's sub-selection.
const shape = (field) => {
  if (!field.selectionSet) return null;
  return Object.fromEntries(
    field.selectionSet.selections.map((f) => [f.name.value, shape(f)]).sort(([a], [b]) => a.localeCompare(b))
  );
};

describe('GET_SHOW_DASHBOARD_POLL contract', () => {
  const full = byName(selections(GET_SHOW));
  const poll = byName(selections(GET_SHOW_DASHBOARD_POLL));

  it('omits the heavyweight and identity fields from the 5s poll', () => {
    ['pages', 'apiAccess', 'activeViewers', 'userProfile', 'showToken', 'serviceToken', 'email', 'lastLoginIp'].forEach(
      (name) => {
        expect(poll[name]).toBeUndefined();
      }
    );
  });

  it('every field it keeps also exists on GET_SHOW', () => {
    Object.keys(poll).forEach((name) => {
      expect(full[name], `poll selects '${name}' which GET_SHOW does not`).toBeDefined();
    });
  });

  it('kept fields select the identical sub-fields as GET_SHOW (shallow-merge safety)', () => {
    // A kept object field replaces the whole object in Redux, so a narrower
    // sub-selection here would null sub-fields platform code still reads.
    Object.keys(poll).forEach((name) => {
      expect(shape(poll[name]), `sub-selection drift on '${name}'`).toEqual(shape(full[name]));
    });
  });

  it('still refreshes what the live dashboard actually renders from', () => {
    ['playingNow', 'playingNext', 'requests', 'votes', 'psaSequences', 'preferences', 'sequences', 'nextPsaOverride'].forEach(
      (name) => {
        expect(poll[name], `poll must keep '${name}'`).toBeDefined();
      }
    );
  });
});
