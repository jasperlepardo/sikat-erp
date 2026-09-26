import { useEffect, useState } from 'react';

/** Run an async loader on mount / when deps change; returns `undefined` while loading. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let cancelled = false;
    setValue(undefined);
    load().then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
