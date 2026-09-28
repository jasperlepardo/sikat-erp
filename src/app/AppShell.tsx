import { Outlet, useLocation, useNavigate } from 'react-router';
import { Navbar, Page, SideNav, useTheme, type NavbarMenuItem } from '@jasperlepardo/sikat-design-system';
import { useEffect, useState } from 'react';
import { NAV, leafForPath, moduleOf, pathOf } from './nav';

const ORGS: NavbarMenuItem[] = [
  { id: 'sikat', label: 'Sikat Tech Inc.' },
  { id: 'acme', label: 'Acme Corp' },
];

/** Navbar on top, SideNav on the left, the routed screen on the right. */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setTheme, resolved] = useTheme();
  const activeId = leafForPath(location.pathname)?.id;
  // Open the current page's hub whenever the route moves to another hub (links,
  // Back, deep links) — not only when the user clicks the sidebar.
  const [openId, setOpenId] = useState<string | null>(moduleOf(activeId));
  const activeModule = moduleOf(activeId);
  useEffect(() => {
    if (activeModule) setOpenId(activeModule);
  }, [activeModule]);

  const accountItems: NavbarMenuItem[] = [
    {
      id: 'theme',
      label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      onSelect: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    },
    { id: 'system', label: 'Use system theme', onSelect: () => setTheme('system') },
    { id: 'sign-out', label: 'Sign out', onSelect: () => navigate('/') },
  ];

  return (
    <Page>
      <Navbar
        appName="Sikat ERP"
        organizations={ORGS}
        organizationId="sikat"
        avatar={<span className="grid size-full place-items-center bg-primary text-sm font-semibold text-heading_on-primary">JL</span>}
        accountItems={accountItems}
      />
      <div className="flex flex-1">
        <SideNav
          sections={NAV}
          activeId={activeId}
          openId={openId}
          onOpenChange={setOpenId}
          onNavigate={(id) => navigate(pathOf(id))}
          style={{ position: 'sticky', top: 64, height: 'calc(100vh - 64px)', flex: 'none', width: 280, overflowY: 'auto' }}
        />
        {/* Bounded to the viewport so a Panel fills it and scrolls its own body; list tables then scroll their rows. */}
        <main className="flex h-[calc(100dvh-64px)] min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2 *:min-h-0">
          <Outlet />
        </main>
      </div>
    </Page>
  );
}
