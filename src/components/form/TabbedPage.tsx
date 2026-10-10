import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button, Icon, Panel, PanelHeader, Tabs } from '@jasperlepardo/sikat-design-system';
import type { ListRoute } from './MasterList';
import { useHeaderSearchHost } from './HeaderSearch';

export interface PageTab {
  value: string;
  label: string;
  description?: string;
  /**
   * Set on a tab that only hosts record pages for a list on another tab: it
   * stays out of the tab bar, and its records return to the parent tab.
   */
  parent?: string;
  /**
   * Open records in a SidePanel overlay instead of replacing the whole panel.
   * The list stays visible behind the panel.
   */
  sidePanelEdit?: boolean;
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
  tabs,
}: {
  base: string;
  icon: string;
  title: string;
  tabs: PageTab[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const active = tabs.find((t) => t.value === params.tab) ?? tabs[0];
  const route: ListRoute = {
    basePath: `${base}/${active.value}`,
    recordId: params.recordId,
    listPath: active.parent ? `${base}/${active.parent}` : undefined,
  };
  const shown = active.parent ? (tabs.find((t) => t.value === active.parent) ?? active) : active;
  const search = useHeaderSearchHost();
  const { reset: resetSearch } = search;

  // Each tab starts with an empty search.
  useEffect(() => resetSearch(), [active.value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL canonical so the sidebar nav item stays highlighted.
  useEffect(() => {
    if (!params.tab) navigate(`${base}/${tabs[0].value}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A records-only tab has no list of its own.
  useEffect(() => {
    if (active.parent && !params.recordId) navigate(`${base}/${active.parent}`, { replace: true });
  }, [active.parent, params.recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A record page replaces the whole panel (unless the tab uses side-panel editing).
  if (params.recordId && !active.sidePanelEdit) return <active.Component {...route} />;
  if (active.parent) return null;

  const isSettings = location.pathname.startsWith('/settings');

  return (
    <Panel className="flex-1">
      <PanelHeader
        {...search.headerProps}
        icon={icon}
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={isSettings ? shown.label : title}
        actions={
          isSettings ? (
            <Button
              type="button"
              intent="primary"
              variant="solid"
              size="medium"
              shape="pill"
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
              value={shown.value}
              onValueChange={(v) => navigate(`${base}/${v}`)}
              items={tabs.filter((t) => !t.parent).map((t) => ({ value: t.value, label: t.label }))}
            />
          )
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {search.provide(<active.Component {...route} />)}
      </Panel.Body>
    </Panel>
  );
}
