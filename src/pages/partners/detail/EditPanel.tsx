import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Button, Icon, IconButton, Panel, PanelHeader, SidePanel } from '@jasperlepardo/sikat-design-system';

/**
 * Side panel for adding or editing one contact or address. It edits a copy: Done hands it
 * back to the partner form (still saved with the page's Save), Cancel/Escape/backdrop drop it.
 */
export function EditPanel({
  icon,
  title,
  onCancel,
  onDone,
  children,
}: {
  icon: string;
  title: string;
  onCancel: () => void;
  onDone: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <SidePanel overlay onOverlayClick={onCancel} style={{ '--sikat-side-panel-width': '720px' } as CSSProperties}>
      <PanelHeader
        icon={icon}
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={title}
        actions={
          <>
            <IconButton intent="default" variant="link" label="Close" onClick={onCancel}>
              <Icon size={20}>close</Icon>
            </IconButton>
            <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" intent="primary" variant="solid" size="medium" shape="pill" onClick={onDone}>
              Done
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">{children}</Panel.Body>
    </SidePanel>
  );
}
