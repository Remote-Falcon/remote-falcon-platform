import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

// MultiAPILink picks the endpoint from each operation's @api(name: ...)
// directive. An operation without one is never sent to control-panel, and the
// caller just sees it fail. Unit tests mock Apollo (MockedProvider), so they
// can't catch a missing directive (#211: the "Exclude this network" query
// shipped without one and the button did nothing in prod). This checks every
// operation in this folder.

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const operations = ['queries.jsx', 'mutations.jsx'].flatMap((file) => {
  const source = readFileSync(join(docsDir, file), 'utf8');
  return [...source.matchAll(/export const (\w+) = gql`([^`]+)`/g)].map(([, name, body]) => ({ file, name, body }));
});

const routesToControlPanel = (body) =>
  parse(body).definitions.every(
    (definition) =>
      definition.kind !== 'OperationDefinition' ||
      (definition.directives ?? []).some(
        (directive) =>
          directive.name.value === 'api' &&
          directive.arguments.some((arg) => arg.name.value === 'name' && arg.value.value === 'controlPanel')
      )
  );

describe('control-panel GraphQL operations', () => {
  it('finds the operations', () => {
    expect(operations.length).toBeGreaterThan(50);
  });

  it.each(operations.map((op) => [`${op.file} ${op.name}`, op]))('%s routes to controlPanel via @api', (_label, op) => {
    expect(routesToControlPanel(op.body)).toBe(true);
  });
});
