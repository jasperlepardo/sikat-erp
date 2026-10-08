import { Outlet, useLocation, useNavigate } from 'react-router';
import { Navbar, Page, SideNav, useHoverIntent, useTheme, type NavbarMenuItem } from '@jasperlepardo/sikat-design-system';
import { useEffect, useState } from 'react';
import { APPS, appNav, firstPageOf, leafForPath, moduleOf, pathOf } from './nav';
import { SETTINGS_NAV, settingsLeafForPath, settingsModuleOf } from './settingsNav';
import { useCollection } from '../components/form/MasterLookup';
import { companies, setCurrentCompanyId, useCurrentCompany } from '../services/companies';
import { useInstallApp } from '../services/installApp';
import { InstallHelpPanel } from './InstallHelpPanel';


/** Navbar on top, SideNav on the left, the routed screen on the right. */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setTheme, resolved] = useTheme();
  const company = useCurrentCompany();
  const installApp = useInstallApp();
  const [installHelp, setInstallHelp] = useState(false);
  const orgs: NavbarMenuItem[] = (useCollection(companies) ?? [])
    .filter((c) => c.active || c.id === company?.id)
    .map((c) => ({ id: c.id, label: c.name }));

  const isSettings = location.pathname.startsWith('/settings');

  // Navbar toggle slides the side nav out; hovering the toggle (or the bar) peeks it back as an overlay.
  const [navExpanded, setNavExpanded] = useState(true);
  const peek = useHoverIntent();

  // Main nav state
  const activeId = leafForPath(location.pathname)?.id;
  const [mainOpenId, setMainOpenId] = useState<string | null>(() => moduleOf(activeId));
  const activeModule = moduleOf(activeId);
  useEffect(() => {
    if (activeModule) setMainOpenId(activeModule);
  }, [activeModule]);

  // Current app: follows the route; Settings keeps the last one.
  const routeApp = APPS.some((a) => a.id === activeModule) ? activeModule : null;
  const [appId, setAppId] = useState(() => routeApp ?? APPS[0].id);
  useEffect(() => {
    if (routeApp) setAppId(routeApp);
  }, [routeApp]);

  // Settings nav state
  const settingsActiveId = settingsLeafForPath(location.pathname)?.id;
  const [settingsOpenId, setSettingsOpenId] = useState<string | null>(() => settingsModuleOf(settingsActiveId));
  const settingsModule = settingsModuleOf(settingsActiveId);
  useEffect(() => {
    if (settingsModule) setSettingsOpenId(settingsModule);
  }, [settingsModule]);

  const accountItems: NavbarMenuItem[] = [
    {
      id: 'theme',
      label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      onSelect: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    },
    { id: 'system', label: 'Use system theme', onSelect: () => setTheme('system') },
    ...(installApp.installed
      ? []
      : [{ id: 'install', label: 'Install app', onSelect: () => (installApp.prompt ? installApp.prompt() : setInstallHelp(true)) }]),
    { id: 'sign-out', label: 'Sign out', onSelect: () => navigate('/') },
  ];

  const sideNavProps = {
    id: 'app-sidenav',
    collapsed: !navExpanded,
    peek: peek.hovering,
    onMouseEnter: () => peek.onHover(true),
    onMouseLeave: () => peek.onHover(false),
    style: {
      '--sidenav-width': '280px',
      position: 'sticky',
      top: 64,
      height: 'calc(100vh - 64px - var(--titlebar-height, 0px))',
      flex: 'none',
      overflowY: 'auto',
    } as React.CSSProperties,
  };

  return (
    <Page>
      <Navbar
        onSideNavToggle={() => {
          setNavExpanded((v) => !v);
          peek.reset();
        }}
        onSideNavToggleHover={peek.onHover}
        sideNavExpanded={navExpanded}
        sideNavId="app-sidenav"
        appName={APPS.find((a) => a.id === appId)?.label}
        apps={APPS}
        appId={appId}
        onAppChange={(id) => {
          setAppId(id);
          navigate(firstPageOf(id));
        }}
        organizations={orgs}
        organizationId={company?.id}
        onOrganizationChange={setCurrentCompanyId}
        avatar={<span className="grid size-full place-items-center bg-primary text-sm font-semibold text-heading_on-primary">JL</span>}
        accountItems={accountItems}
        onSettingsClick={() => navigate('/settings')}
      />
      <div className="flex flex-1">
        {isSettings ? (
          <SideNav
            sections={SETTINGS_NAV}
            activeId={settingsActiveId}
            openId={settingsOpenId}
            onOpenChange={setSettingsOpenId}
            onNavigate={(id) => navigate(pathOf(id))}
            {...sideNavProps}
          />
        ) : (
          <SideNav
            sections={appNav(appId)}
            activeId={activeId}
            openId={mainOpenId}
            onOpenChange={setMainOpenId}
            onNavigate={(id) => navigate(pathOf(id))}
            {...sideNavProps}
          />
        )}
        {/* Bounded to the viewport so a Panel fills it and scrolls its own body; list tables then scroll their rows. */}
        <main className="flex h-[calc(100dvh-64px-var(--titlebar-height,0px))] min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2 *:min-h-0">
          <Outlet />
        </main>
      </div>
      {installHelp && <InstallHelpPanel onClose={() => setInstallHelp(false)} />}
    </Page>
  );
}
