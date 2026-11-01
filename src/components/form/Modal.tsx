import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, IconButton, Panel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from './PageHeader';

/**
 * A centered modal dialog — the design system ships only `SidePanel`, so this is the one
 * centered overlay in the app. Mirrors `EditPanel`'s header/footer (Close · Cancel · primary)
 * but floats a constrained box over a backdrop instead of sliding a sheet in from the right.
 * Cancel, Escape and a backdrop click all dismiss it. The body scrolls when the content
 * outgrows the viewport, so a tall table stays inside the box.
 */
export function Modal({
  icon,
  title,
  onCancel,
  onDone,
  doneLabel,
  doneDisabled = false,
  children,
}: {
  icon: string;
  title: string;
  onCancel: () => void;
  onDone: () => void;
  /** The primary button's label (e.g. "Add 3 items"). */
  doneLabel: string;
  doneDisabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: '#0006' }}
      // Close only on a direct click of the backdrop itself. Filter/Select dropdowns
      // portal their menus to the body (outside the Panel), so their clicks bubble up
      // here with a target that isn't the backdrop — guarding on the target keeps a
      // value pick from dismissing the whole modal.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <Panel className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden">
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
                {doneLabel}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">{children}</Panel.Body>
      </Panel>
    </div>,
    document.body,
  );
}
