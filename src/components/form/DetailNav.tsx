import { Alert, Button, ButtonGroup, IconButton, Panel, PanelHeader, TextField, panelHeaderIcons } from '@jasperlepardo/sikat-design-system';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * A document page's tabs in the URL (`<path>/<tab>`): returns the setter that switches tab in place.
 * A link without a tab opens on Details, once, keeping the state it was opened with (a notice)
 * unless `keepState` is false.
 */
export function useDocTab<P extends string>(path: string, tabParam: string | undefined, { keepState = true } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const redirected = useRef(false);
  useEffect(() => {
    if (tabParam || redirected.current) return;
    redirected.current = true;
    navigate(`${path}/details`, { replace: true, state: keepState ? location.state : undefined });
  }, [tabParam, path, keepState, navigate, location.state]);
  return (tab: P) => navigate(`${path}/${tab}`, { replace: true });
}

/**
 * Rejecting a document awaiting approval: `start()` (the Reject menu action) opens a reason box,
 * `alert(title, confirm)` renders it above the document while open; Confirm passes the reason on.
 */
export function useReject() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = () => {
    setOpen(false);
    setReason('');
  };
  return {
    start: () => setOpen(true),
    alert: (title: string, confirm: (reason: string) => unknown) =>
      open ? (
        <Alert intent="danger" variant="outline" title={title}>
          <div className="flex flex-col gap-2">
            <TextField aria-label="Rejection reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="Explain why this is being rejected…" />
            <div className="flex gap-2">
              <Button type="button" intent="danger" variant="solid" size="small" onClick={() => confirm(reason)}>Confirm reject</Button>
              <Button type="button" intent="white" variant="solid" size="small" onClick={cancel}>Cancel</Button>
            </div>
          </div>
        </Alert>
      ) : null,
  };
}

/** A document list in Previous/Next order: newest posting date first, by number once posted (as its URL reads). */
export const siblingKeys = <D extends { id: string; docNum: number; postingDate: string }>(all: readonly D[], numberOf: (d: D) => string) =>
  [...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((d) => (d.docNum ? numberOf(d) : d.id));

/** The records either side of `key` in a list's order (ids, or document numbers once posted). */
export function neighbours(siblings: readonly string[], key: string | undefined) {
  const at = key ? siblings.indexOf(key) : -1;
  return {
    prevId: at > 0 ? siblings[at - 1] : undefined,
    nextId: at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined,
  };
}

/** Previous / Next in a detail page's header: open the record before or after this one, under `path`. */
export function PrevNext({ path, prevId, nextId }: { path: string; prevId?: string; nextId?: string }) {
  const navigate = useNavigate();
  return (
    <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
      <IconButton type="button" label="Previous" size="small" shape="pill" disabled={!prevId} onClick={() => navigate(`${path}/${prevId}`)}>
        {panelHeaderIcons.arrowUpward}
      </IconButton>
      <IconButton type="button" label="Next" size="small" shape="pill" disabled={!nextId} onClick={() => navigate(`${path}/${nextId}`)}>
        {panelHeaderIcons.arrowDownward}
      </IconButton>
    </ButtonGroup>
  );
}

/** A detail page whose record doesn't exist: say so, with a way back to the list. */
export function NotFound({ icon, title, backTo, backLabel }: { icon: string; title: string; backTo: string; backLabel: string }) {
  const navigate = useNavigate();
  return (
    <Panel className="flex-1">
      <PanelHeader icon={icon} iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title={title} />
      <Panel.Body>
        <Button onClick={() => navigate(backTo)}>{backLabel}</Button>
      </Panel.Body>
    </Panel>
  );
}
