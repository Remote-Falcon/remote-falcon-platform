import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useTableSort from './useTableSort';

describe('useTableSort', () => {
  it('starts with the provided initial column and order', () => {
    const { result } = renderHook(() => useTableSort('order', 'asc'));
    expect(result.current.orderBy).toBe('order');
    expect(result.current.order).toBe('asc');
  });

  it('defaults to no sort column', () => {
    const { result } = renderHook(() => useTableSort());
    expect(result.current.orderBy).toBeNull();
    expect(result.current.order).toBe('asc');
  });

  it('sorts a new column ascending', () => {
    const { result } = renderHook(() => useTableSort());
    act(() => result.current.requestSort('name'));
    expect(result.current.orderBy).toBe('name');
    expect(result.current.order).toBe('asc');
  });

  it('flips direction when the active column is clicked again', () => {
    const { result } = renderHook(() => useTableSort());
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name'));
    expect(result.current.order).toBe('desc');
    act(() => result.current.requestSort('name'));
    expect(result.current.order).toBe('asc');
  });

  it('switching columns resets direction to ascending', () => {
    const { result } = renderHook(() => useTableSort());
    act(() => result.current.requestSort('name'));
    act(() => result.current.requestSort('name'));
    expect(result.current.order).toBe('desc');
    act(() => result.current.requestSort('artist'));
    expect(result.current.orderBy).toBe('artist');
    expect(result.current.order).toBe('asc');
  });

  it('resetSort returns to the initial column and order', () => {
    const { result } = renderHook(() => useTableSort('order', 'asc'));
    act(() => result.current.requestSort('artist'));
    act(() => result.current.requestSort('artist'));
    act(() => result.current.resetSort());
    expect(result.current.orderBy).toBe('order');
    expect(result.current.order).toBe('asc');
  });
});
