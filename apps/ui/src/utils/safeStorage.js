// Guarded localStorage access. Browsers with site data blocked (strict
// privacy settings, sandboxed iframes) throw a SecurityError on ANY access
// to window.localStorage — including the property read itself — so every
// call is wrapped. Callers get null/false/no-op instead of a throw and the
// app degrades to in-memory behavior (no persisted session, defaults).
//
// Use this for all direct localStorage access. Stateful React persistence
// should keep using the useLocalStorage hook (guarded the same way).
const safeStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage blocked — nothing to remove that could have been written */
    }
  }
};

export default safeStorage;
