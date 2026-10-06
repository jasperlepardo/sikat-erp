import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button, Icon, Panel, PanelHeader, Tabs } from '@jasperlepardo/sikat-design-system';
import type { ListRoute } from './MasterList';

export interface PageTab {
  value: string;
  label: string;
  description?: string;
  /** List tabs get their route; other tabs (profiles, testers) can ignore it. */
  Component: ComponentType<ListRoute>;
}

/**
 * A tabbed page whose tabs live in the URL (`${base}/${tab}`), so a record
 * opened from a tab (`${base}/${tab}/${id}`) gets its own page and Back returns
 * to the right tab. Expects route params `tab` and `recordId`.
 *
 * On `/settings/…` routes the tabs are shown in the sidebar nav instead, so the
 * horizontal tab bar is hidden and the panel header shows the current tab label.
 */
export function TabbedPage({
  base,
  icon,
  title,
  subcopy,
  tabs,
}: {
  base: string;
  icon: string;
  title: string;
  subcopy: string;
  tabs: PageTab[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const active = tabs.find((t) => t.value === params.tab) ?? tabs[0];
  const route: ListRoute = { basePath: `${base}/${active.value}`, recordId: params.recordId };

  // Keep the URL canonical so the sidebar nav item stays highlighted.
  useEffect(() => {
    if (!params.tab) navigate(`${base}/${tabs[0].value}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A record page replaces the whole panel.
  if (params.recordId) return <active.Component {...route} />;

  const isSettings = location.pathname.startsWith('/settings');

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon={icon}
        title={isSettings ? active.label : title}
        subcopy={isSettings ? active.description : subcopy}
        actions={
          isSettings ? (
            <Button
              type="button"
              intent="primary"
              variant="solid"
              size="extra-large"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={() => navigate(`${base}/${active.value}/new`)}
            >
              New
            </Button>
          ) : undefined
        }
        tabs={
          isSettings ? undefined : (
            <Tabs
              variant="outline"
              value={active.value}
              onValueChange={(v) => navigate(`${base}/${v}`)}
              items={tabs.map((t) => ({ value: t.value, label: t.label }))}
            />
          )
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <active.Component {...route} />
      </Panel.Body>
    </Panel>
  );
}
