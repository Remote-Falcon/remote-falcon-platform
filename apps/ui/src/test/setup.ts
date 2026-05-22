import '@testing-library/jest-dom/vitest';

// Vitest's jsdom environment running under Node 26 does not bind a
// localStorage instance onto the global window (jsdom 25 supplies one
// on a manually-constructed JSDOM, but the env-managed global has it
// undefined and the Node-native localStorage is gated behind
// --localstorage-file). Install a minimal in-memory shim so hooks that
// persist state (e.g. useDismissedNotifications) work in tests.
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; }
    }
  });
}
