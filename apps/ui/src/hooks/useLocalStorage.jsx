import { useState, useEffect } from 'react';

// Any access to window.localStorage — including the property read itself —
// throws a SecurityError when the browser blocks site data (strict privacy
// settings, sandboxed iframes). Degrade to plain in-memory state so the
// page still renders with defaults.
export default function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue === null ? defaultValue : JSON.parse(storedValue);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    const listener = (e) => {
      try {
        if (e.storageArea === localStorage && e.key === key) {
          setValue(e.newValue ? JSON.parse(e.newValue) : e.newValue);
        }
      } catch {
        // blocked storage or corrupt payload — keep the current value
      }
    };
    window.addEventListener('storage', listener);

    return () => {
      window.removeEventListener('storage', listener);
    };
  }, [key, defaultValue]);

  const setValueInLocalStorage = (newValue) => {
    setValue((currentValue) => {
      const result = typeof newValue === 'function' ? newValue(currentValue) : newValue;
      try {
        localStorage.setItem(key, JSON.stringify(result));
      } catch {
        // blocked or full storage — the in-memory state still updates
      }
      return result;
    });
  };

  return [value, setValueInLocalStorage];
}
