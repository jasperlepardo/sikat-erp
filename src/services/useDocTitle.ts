import { useEffect } from 'react';

const BASE = 'Sikat ERP';

/** Sets the browser tab title; resets to the app name on unmount. */
export function useDocTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · ${BASE}`;
    return () => { document.title = BASE; };
  }, [title]);
}
