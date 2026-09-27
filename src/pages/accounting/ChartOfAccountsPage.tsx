import { useState } from 'react';
import { useParams } from 'react-router';
import { Badge, Panel, PanelHeader, TableStatus, Tabs } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, bind } from '../../components/form/fields';
import { MasterList } from '../../components/form/MasterList';
import { DRAWERS, normalBalance, statementOf, type Account, type Drawer } from '../../mocks/chartOfAccounts';
import { accounts } from '../../services/masterData';
import { newId, useCollectionRows } from '../../services/useCollectionRows';

const BASE = '/accounting/chart-of-accounts';
const CURRENCIES = ['PHP', 'USD', 'All currencies'];

/** Levels below the drawer's top title (0 = drawer). */
const depthOf = (a: Account, all: Account[]) => {
  let depth = 0;
  let parent = all.find((x) => x.code === a.parentCode);
  while (parent && depth < 10) {
    depth++;
    parent = all.find((x) => x.code === parent!.parentCode);
  }
  return depth;
};

const blank = (): Account => ({
  id: newId('acct'),
  code: '',
  name: '',
  drawer: 'Operating expenses',
  parentCode: '6195',
  title: false,
  contra: false,
  control: false,
  cash: false,
  currency: 'PHP',
  active: true,
  remarks: '',
});

/** Accounting › Chart of Accounts: drawers, title accounts and the active accounts documents post to. */
export function ChartOfAccountsPage() {
  const { recordId } = useParams();
  const { rows, save, setActive } = useCollectionRows(accounts);
  const [drawer, setDrawer] = useState<'all' | Drawer>('all');
  const all = rows ?? [];
  const shown = rows && (drawer === 'all' ? rows : rows.filter((a) => a.drawer === drawer));

  const list = (
    <MasterList<Account>
      basePath={BASE}
      recordId={recordId}
      icon="account_tree"
      title="Accounts"
      noun="account"
      description="Title accounts group the accounts below them; documents post only to active accounts. Control accounts take postings through business partners only."
      rows={shown}
      onSetActive={setActive}
      columns={[
        {
          key: 'code',
          header: 'Account',
          cell: (a) => (
            <span style={{ paddingLeft: `${depthOf(a, all) * 20}px` }} className={a.title ? 'font-semibold' : undefined}>
              {a.code} {a.name}
            </span>
          ),
        },
        { key: 'drawer', header: 'Drawer', cell: (a) => a.drawer },
        { key: 'title', header: 'Level', cell: (a) => (a.title ? 'Title' : 'Active account') },
        { key: 'balance', header: 'Normal balance', cell: (a) => (a.title ? '—' : normalBalance(a)) },
        {
          key: 'flags',
          header: 'Flags',
          cell: (a) => (
            <div className="flex gap-1">
              {a.control ? <Badge variant="outline">Control</Badge> : null}
              {a.cash ? <Badge variant="outline">Cash</Badge> : null}
              {a.contra ? <Badge variant="outline">Contra</Badge> : null}
            </div>
          ),
        },
        { key: 'currency', header: 'Currency', cell: (a) => a.currency },
        {
          key: 'active',
          header: 'Status',
          cell: (a) => <TableStatus intent={a.active ? 'success' : 'default'}>{a.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(a, key) =>
        key === 'drawer' ? `${DRAWERS.indexOf(a.drawer)}-${a.code}` : key === 'balance' ? normalBalance(a) : String(a[key as keyof Account] ?? '').toLowerCase()
      }
      searchText={(a) => `${a.code} ${a.name} ${a.drawer} ${a.control ? 'control' : ''} ${a.cash ? 'cash' : ''} ${a.contra ? 'contra' : ''}`}
      blank={blank}
      label={(a) => `${a.code} ${a.name}`}
      validate={(a, others) => {
        const e: Record<string, string> = {};
        if (!/^\d{4}$/.test(a.code.trim())) e.code = 'Use a 4-digit account code.';
        else if (others.some((o) => o.id !== a.id && o.code === a.code.trim())) e.code = `${a.code} already exists.`;
        if (!a.name.trim()) e.name = 'Name is required.';
        const parent = others.find((o) => o.code === a.parentCode);
        const isDrawerTop = !a.parentCode && others.some((o) => o.id === a.id && !o.parentCode);
        if (isDrawerTop) return e;
        if (!parent) e.parentCode = 'Pick the title account this belongs under.';
        else if (!parent.title) e.parentCode = `${parent.code} is an active account — pick a title account.`;
        else if (parent.drawer !== a.drawer) e.parentCode = `${parent.code} is in ${parent.drawer}, not ${a.drawer}.`;
        const children = others.filter((o) => o.parentCode === a.code && o.id !== a.id);
        if (!a.title && children.length) e.title = `${children.length} account(s) sit under it, so it must stay a title account.`;
        if (a.control && a.cash) e.control = 'An account is either a control account or a cash account, not both.';
        return e;
      }}
      onSave={(a) => save({ ...a, code: a.code.trim(), name: a.name.trim() })}
      editor={(a, update, errors, isNew) => {
        // A new drawer starts the account under that drawer's top title.
        const f = bind(a, (p) =>
          update(p.drawer ? { ...p, parentCode: all.find((x) => x.drawer === p.drawer && !x.parentCode)?.code ?? '' } : p),
        );
        const drawerTop = all.find((x) => x.drawer === a.drawer && !x.parentCode);
        const titles = all.filter((x) => x.title && x.drawer === a.drawer && x.id !== a.id);
        const isDrawerTop = !isNew && !a.parentCode;
        return (
          <>
            <Fields cols={3}>
              {f.text('code', 'Code', {
                required: true,
                error: errors.code,
                readOnly: !isNew,
                hint: isNew ? 'Number it inside its title’s range, e.g. 6330 under 6195.' : 'Can’t change once saved — documents refer to it.',
              })}
              {f.text('name', 'Name', { required: true, error: errors.name, className: 'md:col-span-2' })}
              {isDrawerTop ? (
                <ReadOnly label="Drawer" value={a.drawer} hint="Top of the drawer." />
              ) : (
                f.pick('drawer', 'Drawer', DRAWERS, {
                  disabled: !isNew,
                  hint: `${statementOf(a.drawer)}.`,
                })
              )}
              {isDrawerTop
                ? null
                : f.choose(
                    'parentCode',
                    'Under title account',
                    titles.map((t) => ({ value: t.code, label: `${t.code} ${t.name}` })),
                    { error: errors.parentCode, hint: drawerTop ? `Within ${drawerTop.code} ${drawerTop.name}.` : undefined },
                  )}
              {f.pick('currency', 'Currency', CURRENCIES, { hint: 'All currencies lets documents in any currency post here.' })}
              <ReadOnly label="Normal balance" value={a.title ? '—' : normalBalance(a)} hint={a.contra ? 'Contra account: opposite of its drawer.' : undefined} />
            </Fields>
            <Flags>
              {f.check('title', 'Title account (groups others; no postings)', { disabled: isDrawerTop })}
              {f.check('contra', 'Contra account')}
              {f.check('control', 'Control account (AR/AP)')}
              {f.check('cash', 'Cash account')}
              {f.check('active', 'Active')}
            </Flags>
            {errors.title || errors.control ? <p className="text-sm text-danger">{errors.title ?? errors.control}</p> : null}
            <Fields cols={1}>{f.area('remarks', 'Remarks', { rows: 2 })}</Fields>
          </>
        );
      }}
    />
  );

  if (recordId) return list;
  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="account_tree"
        title="Chart of Accounts"
        subcopy="Balance sheet and income statement accounts for a VAT-registered Philippine retailer."
        tabs={
          <Tabs
            value={drawer}
            onValueChange={(v) => setDrawer(v as 'all' | Drawer)}
            items={[
              { value: 'all', label: 'All', badge: rows ? String(rows.length) : undefined },
              ...DRAWERS.map((d) => ({ value: d, label: d, badge: rows ? String(rows.filter((a) => a.drawer === d).length) : undefined })),
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">{list}</Panel.Body>
    </Panel>
  );
}
