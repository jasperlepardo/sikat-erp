import { Outlet, useLocation, useNavigate } from 'react-router';
import { Navbar, Page, SideNav, Text, useHoverIntent, useTheme, type NavbarMenuItem } from '@jasperlepardo/sikat-design-system';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { APPS, appNav, firstChildOf, firstPageOf, leafForPath, moduleOf, openGroupFor, pathOf } from './nav';
import { SETTINGS_NAV, settingsLeafForPath, settingsModuleOf } from './settingsNav';
import { useCollection } from '../components/form/MasterLookup';
import { companies, setCurrentCompanyId, useCurrentCompany } from '../services/companies';
import { DateSettings } from './DateSettings';
import { CreateMenu } from '../components/search/CreateMenu';

/** Results under the navbar search field, loaded on first open so its index code stays out of the shell. */
const GlobalSearch = lazy(() => import('../components/search/GlobalSearch'));

/** True while typing in a field, where `/` is a character, not a shortcut. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Settings is an app peer to CRM / Sales / Purchasing: it shows in the app selector and as the header name. */
const SETTINGS_APP: NavbarMenuItem = { id: 'settings', label: 'Settings' };
const ALL_APPS: NavbarMenuItem[] = [...APPS, SETTINGS_APP];

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

  // Global search lives in the navbar field; results drop down under it.
  // ⌘K / Ctrl+K focuses the field (or leaves it); `/` focuses it when not typing in a field.
  const [searchInput, setSearchInput] = useState<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('.sikat-navbar__search input');
    if (!input) return;
    setSearchInput(input);
    const onFocus = () => setSearchOpen(true);
    input.addEventListener('focus', onFocus);
    return () => input.removeEventListener('focus', onFocus);
  }, []);
  useEffect(() => {
    if (!searchInput) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (document.activeElement === searchInput) {
          searchInput.blur();
          setSearchOpen(false);
        } else {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchInput]);

  // The navbar + button opens a menu of "New …" commands under it.
  const [createButton, setCreateButton] = useState<HTMLElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  useEffect(() => setCreateButton(document.querySelector<HTMLElement>('.sikat-navbar__create')), []);

  // Navbar toggle slides the side nav out; hovering the toggle (or the bar) peeks it back as an overlay.
  const [navExpanded, setNavExpanded] = useState(true);
  const peek = useHoverIntent();

  // Main nav state
  const activeId = leafForPath(location.pathname)?.id;
  const activeModule = moduleOf(activeId); // the app, for the app selector
  const openGroup = openGroupFor(activeId); // the expandable parent, for the sidebar
  const [mainOpenId, setMainOpenId] = useState<string | null>(() => openGroup);
  useEffect(() => {
    setMainOpenId(openGroup);
  }, [openGroup]);

  // Current app: follows the route; Settings keeps the last one.
  const routeApp = APPS.some((a) => a.id === activeModule) ? activeModule : null;
  const [appId, setAppId] = useState(() => routeApp ?? APPS[0].id);
  useEffect(() => {
    if (routeApp) setAppId(routeApp);
  }, [routeApp]);
  // While on a settings route the app selector + header read "Settings"; otherwise the current module.
  const currentAppId = isSettings ? SETTINGS_APP.id : appId;

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
    { id: 'preferences', label: 'Preferences', onSelect: () => navigate('/settings/preferences') },
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
      height: 'calc(100vh - 64px)',
      flex: 'none',
      overflowY: 'auto',
    } as React.CSSProperties,
  };

  return (
    <Page>
      <Navbar
        theme="dark"
        onSideNavToggle={() => {
          setNavExpanded((v) => !v);
          peek.reset();
        }}
        onSideNavToggleHover={peek.onHover}
        sideNavExpanded={navExpanded}
        sideNavId="app-sidenav"
        appName={ALL_APPS.find((a) => a.id === currentAppId)?.label}
        apps={ALL_APPS}
        appId={currentAppId}
        onAppChange={(id) => {
          if (id === SETTINGS_APP.id) {
            navigate('/settings');
            return;
          }
          setAppId(id);
          navigate(firstPageOf(id));
        }}
        organizations={orgs}
        organizationId={company?.id}
        onOrganizationChange={setCurrentCompanyId}
        avatar={<span className="grid size-full place-items-center bg-primary text-sm font-semibold text-heading_on-primary">JL</span>}
        accountItems={accountItems}
        onSettingsClick={() => navigate('/settings')}
        onCreateClick={() => setCreateOpen((open) => !open)}
        searchPlaceholder="Search documents, partners, items…"
        onSearchChange={(value) => {
          setSearchQuery(value);
          if (document.activeElement === searchInput) setSearchOpen(true);
        }}
      />
      {searchOpen && searchInput ? (
        <Suspense fallback={null}>
          <GlobalSearch input={searchInput} query={searchQuery} onClose={closeSearch} />
        </Suspense>
      ) : null}
      {createOpen && createButton ? <CreateMenu button={createButton} appId={currentAppId} onClose={closeCreate} /> : null}
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
            onOpenChange={(id) => {
              setMainOpenId(id);
              const first = id && firstChildOf(id);
              if (first) navigate(pathOf(first));
            }}
            // A grouped parent has no page of its own; land on its first child (All) — reached only
            // in the compact rail, since the expanded parent just toggles its submenu.
            onNavigate={(id, item) => navigate(pathOf(item.items?.length ? item.items[0].id : id))}
            {...sideNavProps}
          />
        )}
        {/* Bounded to the viewport so a Panel fills it and scrolls its own body; list tables then scroll their rows. */}
        <main className="flex h-[calc(100dvh-64px)] min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2 *:min-h-0">
          {/* Pages load on first visit (see router.tsx). */}
          <Suspense fallback={<Text tone="muted" className="p-4">Loading…</Text>}>
            <DateSettings company={company}>
              <Outlet />
            </DateSettings>
          </Suspense>
        </main>
      </div>
    </Page>
  );
}
