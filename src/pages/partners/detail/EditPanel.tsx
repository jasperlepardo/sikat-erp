import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Button, Icon, IconButton, Panel, SidePanel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';

/**
 * Side panel for adding or editing one contact or address. It edits a copy: the primary hands it
 * back to the partner form (still saved with the page's Save), Cancel/Escape/backdrop drop it.
 * With a `noun`, the primary reads Create {noun} for a new row and Save changes for an existing
 * one; without, it reads Done (a tool panel such as Copy from).
 */
export function EditPanel({
  icon,
  title,
  noun,
  isNew = false,
  onCancel,
  onDone,
  doneLabel,
  doneDisabled = false,
  children,
}: {
  icon: string;
  title: string;
  /** The row's name ("contact person"), for the primary's label. */
  noun?: string;
  isNew?: boolean;
  onCancel: () => void;
  onDone: () => void;
  /** The primary button's label, for a panel that acts rather than edits (e.g. "Send 3 RFQs"). */
  doneLabel?: string;
  doneDisabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <SidePanel overlay onOverlayClick={onCancel} style={{ '--sikat-side-panel-width': '720px' } as CSSProperties}>
      <PageHeader
        variant="plain"
        icon={icon}
        title={title}
        actions={
          <>
            <IconButton intent="default" variant="link" label="Close" onClick={onCancel}>
              <Icon size={20}>close</Icon>
            </IconButton>
            <Button type="button" intent="white" variant="solid" shape="pill" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" intent="primary" variant="solid" shape="pill" disabled={doneDisabled} onClick={onDone}>
              {doneLabel ?? (!noun ? 'Done' : isNew ? `Create ${noun}` : 'Save changes')}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">{children}</Panel.Body>
    </SidePanel>
  );
}
