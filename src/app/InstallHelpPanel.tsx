import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, IconButton, Panel, PanelHeader, SidePanel, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../components/form/fields';
import { installBrowser, type InstallBrowser } from '../services/installApp';

const STEPS: Record<InstallBrowser, { title: string; steps: string[] }> = {
  ios: {
    title: 'Safari on iPhone or iPad',
    steps: ['Tap the Share button in the toolbar.', 'Choose Add to Home Screen.', 'Tap Add.'],
  },
  safari: {
    title: 'Safari on Mac',
    steps: ['Open the File menu (or the Share button).', 'Choose Add to Dock.', 'Click Add.'],
  },
  firefox: {
    title: 'Firefox',
    steps: [
      'Firefox on desktop can’t install web apps — open Sikat ERP in Chrome, Edge or Safari instead.',
      'On Android, open the ⋮ menu and choose Install or Add to Home screen.',
    ],
  },
  chromium: {
    title: 'Chrome or Edge',
    steps: [
      'Click the install icon at the right end of the address bar — or open the ⋮ menu and choose Cast, save, and share › Install page as app.',
      'Click Install.',
      'Not offered? The page must be served from the production build over HTTPS (or localhost) — the dev server doesn’t support installing.',
    ],
  },
};

/** Manual install steps, for browsers that don't let the page open the install dialog itself. */
export function InstallHelpPanel({ onClose }: { onClose: () => void }) {
  const { title, steps } = STEPS[installBrowser()];
  return createPortal(
    <SidePanel overlay onOverlayClick={onClose} style={{ '--sikat-side-panel-width': '480px' } as CSSProperties}>
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          type="forms"
          icon="install_desktop"
          title="Install Sikat ERP"
          subcopy="Runs in its own window and works offline."
          actions={
            <>
              <IconButton intent="default" variant="link" label="Close" onClick={onClose}>
                <Icon size={20}>close</Icon>
              </IconButton>
              <Button type="button" intent="primary" variant="solid" size="extra-large" onClick={onClose}>
                Done
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <Section icon="checklist" title={title}>
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              {steps.map((step) => (
                <li key={step}>
                  <Text variant="small">{step}</Text>
                </li>
              ))}
            </ol>
          </Section>
        </Panel.Body>
      </div>
    </SidePanel>,
    document.body,
  );
}
