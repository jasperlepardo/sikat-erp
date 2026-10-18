import { useEffect, useRef } from 'react';

/** Calls saveFn whenever deps change while enabled, debounced at 800 ms. Skips the initial mount. */
export function useAutoSave(
  enabled: boolean,
  saveFn: () => Promise<unknown>,
  deps: readonly unknown[],
  debounceMs = 800,
) {
  const initialized = useRef(false);
  useEffect(() => {
    if (!enabled) { initialized.current = false; return; }
    if (!initialized.current) { initialized.current = true; return; }
    const t = setTimeout(() => { void saveFn(); }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}
