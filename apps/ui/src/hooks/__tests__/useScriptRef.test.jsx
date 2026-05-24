import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import useScriptRef from '../useScriptRef';

describe('useScriptRef', () => {
  it('returns a ref with current=true while mounted', () => {
    const { result } = renderHook(() => useScriptRef());
    expect(result.current.current).toBe(true);
  });

  it('flips current to false on unmount (used to short-circuit async state updates)', () => {
    const { result, unmount } = renderHook(() => useScriptRef());
    expect(result.current.current).toBe(true);
    unmount();
    expect(result.current.current).toBe(false);
  });
});
