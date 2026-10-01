import type { ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Panel, PanelHeader, Tabs } from '@jasperlepardo/sikat-design-system';
import type { ListRoute } from './MasterList';

export interface PageTab {
  value: string;
  label: string;
  /** List tabs get their route; other tabs (profiles, testers) can ignore it. */
  Component: ComponentType<ListRoute>;
}

/**
 * A settings page whose tabs live in the URL (`${base}/${tab}`), so a record
 * opened from a tab (`${base}/${tab}/${id}`) gets its own page and Back returns
 * to the right tab. Expects route params `tab` and `recordId`.
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
  const navigate = useNavigate();
  const params = useParams();
  const active = tabs.find((t) => t.value === params.tab) ?? tabs[0];
  const route: ListRoute = { basePath: `${base}/${active.value}`, recordId: params.recordId };

  // A record page replaces the whole panel.
  if (params.recordId) return <active.Component {...route} />;

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon={icon}
        title={title}
        subcopy={subcopy}
        tabs={
          <Tabs
            variant="outline"
            value={active.value}
            onValueChange={(v) => navigate(`${base}/${v}`)}
            items={tabs.map((t) => ({ value: t.value, label: t.label }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <active.Component {...route} />
      </Panel.Body>
    </Panel>
  );
}
