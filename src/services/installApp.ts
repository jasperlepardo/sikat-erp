import { useSyncExternalStore } from 'react';

/** Chromium's install prompt event (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser fires this once, often before React mounts — so listen at module load and hold on to it.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Keep the browser's own mini-infobar out of the way; we offer it from the menu.
  deferred = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Already running as the installed app (Chromium/Edge, or iOS home-screen). */
function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Running inside the Electron desktop app, which is already "installed". */
export const isElectron = navigator.userAgent.includes('Electron/');

export interface InstallApp {
  installed: boolean;
  /** Opens the browser's install dialog; `undefined` when the browser hasn't offered one (Safari, Firefox, dev server). */
  prompt?: () => Promise<void>;
}

export function useInstallApp(): InstallApp {
  const available = useSyncExternalStore(subscribe, () => deferred !== null);
  if (isElectron || isStandalone()) return { installed: true };
  if (!available) return { installed: false };
  return {
    installed: false,
    prompt: async () => {
      const event = deferred;
      if (!event) return;
      deferred = null; // A prompt can only be shown once.
      notify();
      await event.prompt();
    },
  };
}

export type InstallBrowser = 'ios' | 'safari' | 'firefox' | 'chromium';

/** Which manual install steps to show when there's no prompt. */
export function installBrowser(): InstallBrowser {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'safari';
  return 'chromium';
}
