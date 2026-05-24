import { describe, it, expect } from 'vitest';

import * as cpMutations from '../controlPanel/mutations';
import * as cpQueries from '../controlPanel/queries';
import * as viewerMutations from '../viewer/mutations';
import * as viewerQueries from '../viewer/queries';

// These modules are nothing but `gql` tagged-template exports. The
// "test" is two-fold:
//   1) The files parse — a stray bad gql causes Apollo to throw at
//      *import* time, which would crash every page that touches them.
//   2) Every named export is a DocumentNode (Apollo's parsed AST). If
//      `gql` ever silently downgrades or someone exports a plain string,
//      mutation/query hooks will throw at runtime.

const expectAllDocumentNodes = (mod) => {
  const names = Object.keys(mod).filter((k) => k !== 'default');
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    const node = mod[name];
    expect(node, name).toBeTypeOf('object');
    expect(node, name).toHaveProperty('kind', 'Document');
    expect(node, name).toHaveProperty('definitions');
    expect(Array.isArray(node.definitions), name).toBe(true);
  }
};

describe('graphql modules — parse and export shape', () => {
  it('control-panel mutations import cleanly and every export is a DocumentNode', () => {
    expectAllDocumentNodes(cpMutations);
  });

  it('control-panel queries import cleanly and every export is a DocumentNode', () => {
    expectAllDocumentNodes(cpQueries);
  });

  it('viewer mutations import cleanly and every export is a DocumentNode', () => {
    expectAllDocumentNodes(viewerMutations);
  });

  it('viewer queries import cleanly and every export is a DocumentNode', () => {
    expectAllDocumentNodes(viewerQueries);
  });
});
