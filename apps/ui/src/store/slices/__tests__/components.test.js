import { describe, it, expect } from 'vitest';

import reducer, { setActiveTab } from '../components';

describe('components slice reducer', () => {
  const initial = reducer(undefined, { type: '@@INIT' });

  it('starts with activeTab = 0', () => {
    expect(initial).toEqual({ activeTab: 0 });
  });

  it('setActiveTab replaces activeTab with payload', () => {
    expect(reducer(initial, setActiveTab(3)).activeTab).toBe(3);
    expect(reducer(initial, setActiveTab(0)).activeTab).toBe(0);
  });
});
