import { Outlet, useLocation, useNavigate } from 'react-router';
import { Navbar, Page, SideNav, useTheme, type NavbarMenuItem } from '@jasperlepardo/sikat-design-system';
import { useEffect, useState } from 'react';
import { NAV, leafForPath, moduleOf, pathOf } from './nav';
import { SETTINGS_NAV, settingsLeafForPath, settingsModuleOf } from './settingsNav';
import { useCollection } from '../components/form/MasterLookup';
import { companies, setCurrentCompanyId, useCurrentCompany } from '../services/companies';


/** Navbar on top, SideNav on the left, the routed screen on the right. */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setTheme, resolved] = useTheme();
  const company = useCurrentCompany();
  const orgs: NavbarMenuItem[] = (useCollection(companies) ?? [])
    .filter((c) => c.active || c.id === company?.id)
    .map((c) => ({ id: c.id, label: c.name }));

  const isSettings = location.pathname.startsWith('/settings');

  // Main nav state
  const activeId = leafForPath(location.pathname)?.id;
  const [mainOpenId, setMainOpenId] = useState<string | null>(() => moduleOf(activeId));
  const activeModule = moduleOf(activeId);
  useEffect(() => {
    if (activeModule) setMainOpenId(activeModule);
  }, [activeModule]);

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
    { id: 'sign-out', label: 'Sign out', onSelect: () => navigate('/') },
  ];

  const sideNavStyle: React.CSSProperties = {
    position: 'sticky',
    top: 64,
    height: 'calc(100vh - 64px)',
    flex: 'none',
    width: 280,
    overflowY: 'auto',
  };

  return (
    <Page>
      <Navbar
        appName="Sikat ERP"
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
            style={sideNavStyle}
          />
        ) : (
          <SideNav
            sections={NAV}
            activeId={activeId}
            openId={mainOpenId}
            onOpenChange={setMainOpenId}
            onNavigate={(id) => navigate(pathOf(id))}
            style={sideNavStyle}
          />
        )}
        {/* Bounded to the viewport so a Panel fills it and scrolls its own body; list tables then scroll their rows. */}
        <main className="flex h-[calc(100dvh-64px)] min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2 *:min-h-0">
          <Outlet />
        </main>
      </div>
    </Page>
  );
}
