import { useLocation } from 'react-router';
import { Card, Icon, Panel, PanelHeader, Text } from '@jasperlepardo/sikat-design-system';
import { leafForPath } from '../app/nav';

/** Stand-in for nav entries that don't have a screen yet. */
export function Placeholder() {
  const { pathname } = useLocation();
  const title = leafForPath(pathname)?.label ?? 'Not found';
  return (
    <Panel className="flex-1">
      <PanelHeader icon="construction" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title={title} />
      <Panel.Body>
        <Card>
          <Card.Header icon={<Icon size={24}>info</Icon>}>Coming soon</Card.Header>
          <Card.Content>
            <Text>
              Add a page under <code>src/pages</code> and register it in <code>src/app/router.tsx</code>.
            </Text>
          </Card.Content>
        </Card>
      </Panel.Body>
    </Panel>
  );
}
