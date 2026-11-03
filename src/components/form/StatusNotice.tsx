import { useState, type ReactNode } from 'react';
import { Alert } from '@jasperlepardo/sikat-design-system';

/**
 * The outline notice above a saved document's body that explains an
 * exceptional state (expired, awaiting approval, closed, cancelled,
 * terminated). Not shown for the normal live state: the status field and the
 * locked form already say that. The user can dismiss it; it comes back when
 * `resetKey` changes (another record, or a new status).
 */
export function StatusNotice({ title, resetKey, children }: { title: ReactNode; resetKey: string; children?: ReactNode }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (dismissed === resetKey) return null;
  return (
    <Alert intent="default" variant="outline" title={title} onClose={() => setDismissed(resetKey)} closeLabel="Dismiss">
      {children}
    </Alert>
  );
}
