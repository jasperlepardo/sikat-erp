import { Button, Panel, PanelHeader, Text } from '@jasperlepardo/sikat-design-system';
import { useRouteError } from 'react-router';

/**
 * A page that failed to load or render. Most often its chunk is gone because a newer build was
 * deployed while this tab was open, so reloading picks up the current one.
 */
export function PageError() {
  const error = useRouteError();
  return (
    <Panel className="flex-1">
      <PanelHeader icon="error" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="This page couldn't load" />
      <Panel.Body>
        <Text tone="muted">{error instanceof Error ? error.message : 'Something went wrong.'}</Text>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </Panel.Body>
    </Panel>
  );
}
