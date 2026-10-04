import { useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Badge, Checkbox, FormField, Panel, PanelHeader, TableStatus, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../components/form/fields';
import { MasterList } from '../../components/form/MasterList';
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  DIMENSIONS,
  DRAWERS,
  STATEMENT_LINES,
  defaultAccountType,
  normalBalance,
  statementOf,
  type Account,
  type Drawer,
} from '../../mocks/chartOfAccounts';
import { describeUsage, loadAccountUsage, usageCount } from '../../services/accountUsage';
import { accounts, taxCodes } from '../../services/masterData';
import { useAsync } from '../../services/useAsync';
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
  accountType: 'Expenditure',
  classification: '',
  cashFlow: 'Operating',
  statementLine: STATEMENT_LINES['Operating expenses'][0],
  blockManualPosting: false,
  validFrom: '',
  validTo: '',
  requiredDimensions: ['Branch'],
  confidential: false,
  revalue: false,
  reconcile: false,
  defaultTaxCode: '',
});

const balanceSheet = (d: Drawer) => d === 'Assets' || d === 'Liabilities';

/** Accounting › Chart of Accounts: drawers, title accounts and the active accounts documents post to. */
export function ChartOfAccountsPage() {
  const { recordId } = useParams();
  const { rows, save, setActive } = useCollectionRows(accounts);
  const [drawer, setDrawer] = useState<'all' | Drawer>('all');
  const [notice, setNotice] = useState<string>();
  // Which records use each account; reloads whenever the chart changes.
  const usage = useAsync(loadAccountUsage, [rows]);
  const codes = useAsync(taxCodes.list, []);
  const usedBy = (code: string) => usage?.get(code);

  // Accounts in use can't be deactivated: move the records to another account first.
  const setActiveChecked = async (picked: Account[], active: boolean) => {
    const blocked = active ? [] : picked.filter((a) => usageCount(usedBy(a.code)) > 0);
    await setActive(picked.filter((a) => !blocked.includes(a)), active);
    setNotice(
      blocked.length
        ? `Not deactivated — still in use: ${blocked.map((a) => `${a.code} (${describeUsage(usedBy(a.code))})`).join('; ')}. Move those records to another account first.`
        : undefined,
    );
  };
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
      onSetActive={setActiveChecked}
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
          key: 'statementLine',
          header: 'Statement line',
          cell: (a) =>
            a.title ? '—' : (
              <span>
                {a.statementLine || <span className="text-warning">Not mapped</span>}
                {a.classification ? <span className="text-muted"> · {a.classification}</span> : null}
              </span>
            ),
        },
        {
          key: 'flags',
          header: 'Flags',
          cell: (a) => (
            <div className="flex gap-1">
              {a.control ? <Badge variant="outline">Control</Badge> : null}
              {a.cash ? <Badge variant="outline">Cash</Badge> : null}
              {a.contra ? <Badge variant="outline">Contra</Badge> : null}
              {a.blockManualPosting ? <Badge variant="outline">No manual JE</Badge> : null}
              {a.confidential ? <Badge variant="outline">Confidential</Badge> : null}
            </div>
          ),
        },
        { key: 'currency', header: 'Currency', cell: (a) => a.currency },
        {
          key: 'usage',
          header: 'Used in',
          cell: (a) => {
            const n = usageCount(usedBy(a.code));
            return n ? `${n} record${n === 1 ? '' : 's'}` : <span className="text-muted">—</span>;
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (a) => <TableStatus intent={a.active ? 'success' : 'default'}>{a.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(a, key) =>
        key === 'drawer'
          ? `${DRAWERS.indexOf(a.drawer)}-${a.code}`
          : key === 'usage'
            ? usageCount(usedBy(a.code))
            : key === 'balance' ? normalBalance(a) : String(a[key as keyof Account] ?? '').toLowerCase()
      }
      searchText={(a) =>
        [
          a.code, a.name, a.drawer, a.accountType, a.classification, a.cashFlow, a.statementLine, a.defaultTaxCode, ...a.requiredDimensions,
          a.control && 'control', a.cash && 'cash', a.contra && 'contra', a.confidential && 'confidential',
          a.blockManualPosting && 'no manual', a.revalue && 'revalue', a.reconcile && 'reconcile',
        ]
          .filter(Boolean)
          .join(' ')
      }
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
        if (!a.title) {
          if (!a.statementLine) e.statementLine = 'Pick the statement line it rolls up to.';
          if (balanceSheet(a.drawer) && !a.classification) e.classification = 'Balance sheet accounts are current or non-current.';
        }
        if (a.validFrom && a.validTo && a.validTo < a.validFrom) e.validTo = 'Ends before it starts.';
        if (a.revalue && (a.currency === 'PHP' || a.currency === 'All currencies'))
          e.revalue = 'Only single foreign-currency accounts (e.g. USD) are revalued.';
        if (a.reconcile && !a.cash) e.reconcile = 'Only cash accounts are reconciled against bank statements.';
        const used = usedBy(a.code);
        if (usageCount(used) && !a.active) e.active = `Still used by ${describeUsage(used)} — move them to another account before deactivating.`;
        if (usageCount(used) && a.title) e.title = `Used by ${describeUsage(used)} — a title account can't take postings.`;
        return e;
      }}
      onSave={(a) => save({ ...a, code: a.code.trim(), name: a.name.trim() })}
      editor={(a, update, errors, isNew) => {
        // A new drawer resets what depends on it: parent, account type, classification, statement line.
        const f = bind(a, (p) =>
          update(
            p.drawer
              ? {
                  ...p,
                  parentCode: all.find((x) => x.drawer === p.drawer && !x.parentCode)?.code ?? '',
                  accountType: defaultAccountType(p.drawer),
                  classification: balanceSheet(p.drawer) ? 'Current' : '',
                  statementLine: STATEMENT_LINES[p.drawer][0],
                  requiredDimensions: ['Revenue', 'Cost of sales', 'Operating expenses'].includes(p.drawer) ? ['Branch'] : [],
                }
              : p.parentCode
                ? { ...p, ...siblingDefaults(p.parentCode) }
                : p,
          ),
        );
        // A new account under a title takes its reporting settings from the accounts already there.
        function siblingDefaults(parentCode: string): Partial<Account> {
          const sibling = isNew ? all.find((x) => x.parentCode === parentCode && !x.title) : undefined;
          return sibling
            ? { classification: sibling.classification, statementLine: sibling.statementLine, cashFlow: sibling.cashFlow, accountType: sibling.accountType }
            : {};
        }
        const taxOptions = [
          { value: '', label: '— None (not VAT-relevant) —' },
          ...(codes ?? [])
            .filter((c) => (c.active || c.code === a.defaultTaxCode) && (a.accountType === 'Sales' ? c.direction === 'Sales' : c.direction === 'Purchase'))
            .map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` })),
        ];
        const toggleDimension = (d: (typeof DIMENSIONS)[number], on: boolean) =>
          update({ requiredDimensions: on ? [...a.requiredDimensions, d] : a.requiredDimensions.filter((x) => x !== d) });
        const drawerTop = all.find((x) => x.drawer === a.drawer && !x.parentCode);
        const titles = all.filter((x) => x.title && x.drawer === a.drawer && x.id !== a.id);
        const isDrawerTop = !isNew && !a.parentCode;
        return (
          <>
            <Fields cols={3}>
              {f.text(‘code', ‘Code', {
                required: true,
                error: errors.code,
                disabled: !isNew,
                hint: isNew ? ‘Number it inside its title\'s range, e.g. 6330 under 6195.' : "Can't change once saved — documents refer to it.",
              })}
              {f.text('name', 'Name', { required: true, error: errors.name, className: 'md:col-span-2' })}
              {isDrawerTop ? (
                <ReadOnly label="Drawer" value={a.drawer} hint="Top of the drawer." />
              ) : (
                f.pick('drawer', 'Drawer', DRAWERS, {
                  disabled: !isNew,
                  hint: !isNew ? "Can't change once saved — affects financial statement mapping." : `${statementOf(a.drawer)}.`,
                })
              )}
              {isDrawerTop
                ? null
                : f.lookup(
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
            {errors.title || errors.control || errors.active ? (
              <Text variant="small" tone="danger">{errors.title ?? errors.control ?? errors.active}</Text>
            ) : null}
            <Fields cols={1}>
              <ReadOnly
                label="Used in"
                value={isNew ? '—' : describeUsage(usedBy(a.code)) || 'Not used yet.'}
                hint="Item groups, items, business partners and tax codes that post to this account. Names shown here update everywhere when the account is renamed."
              />
            </Fields>
            <Fields cols={1}>{f.area('remarks', 'Remarks', { rows: 2 })}</Fields>

            {a.title ? null : (
              <>
                <Section icon="summarize" title="Reporting">
                  <Fields cols={3}>
                    {f.pick('accountType', 'Account type', ACCOUNT_TYPES, { hint: 'Sales, Expenditure or Other — used by sales and expense reports.' })}
                    {balanceSheet(a.drawer)
                      ? f.choose(
                          'classification',
                          'Classification',
                          [
                            { value: 'Current', label: 'Current' },
                            { value: 'Non-current', label: 'Non-current' },
                          ],
                          { required: true, error: errors.classification, hint: 'Splits the balance sheet into current and non-current.' },
                        )
                      : <ReadOnly label="Classification" value="—" hint="Only assets and liabilities are current or non-current." />}
                    {f.choose(
                      'cashFlow',
                      'Cash flow category',
                      CASH_FLOW_CATEGORIES.map((c) => ({ value: c, label: c || '— None —' })),
                      { hint: a.cash ? 'Cash accounts are the cash itself — no category.' : 'Indirect method: income statement accounts are operating.' },
                    )}
                    {f.pick('statementLine', 'Statement line', [...new Set([...STATEMENT_LINES[a.drawer], a.statementLine].filter(Boolean))], {
                      required: true,
                      error: errors.statementLine,
                      className: 'md:col-span-2',
                      hint: `${statementOf(a.drawer)} line it rolls up to.`,
                    })}
                  </Fields>
                </Section>

                <Section icon="rule" title="Posting controls">
                  <Fields cols={3}>
                    {f.date('validFrom', 'Valid from', { hint: 'Postings dated earlier are refused.' })}
                    {f.date('validTo', 'Valid to', { error: errors.validTo, hint: 'Freeze the account after this date.' })}
                    <FormField label="Required dimensions" tooltip="Postings must fill these in, e.g. the store for revenue and expenses.">
                      {() => (
                        <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
                          {DIMENSIONS.map((d) => (
                            <Checkbox key={d} checked={a.requiredDimensions.includes(d)} onChange={(e) => toggleDimension(d, e.currentTarget.checked)}>
                              {d}
                            </Checkbox>
                          ))}
                        </div>
                      )}
                    </FormField>
                  </Fields>
                  <Flags>
                    {f.check('blockManualPosting', 'Block manual journal entries (documents post here only)')}
                    {f.check('confidential', 'Confidential')}
                  </Flags>
                </Section>

                <Section icon="event_repeat" title="Period-end and tax">
                  <Fields cols={3}>
                    {f.lookup('defaultTaxCode', 'Default tax code', taxOptions, {
                      hint: 'Proposed on manual postings to this account. None = not VAT-relevant.',
                    })}
                  </Fields>
                  <Flags>
                    {f.check('revalue', 'Revalue at period-end (foreign currency)', { disabled: a.currency === 'PHP' || a.currency === 'All currencies' })}
                    {f.check('reconcile', 'Reconcile against bank statements', { disabled: !a.cash })}
                  </Flags>
                  {errors.revalue || errors.reconcile ? <Text variant="small" tone="danger">{errors.revalue ?? errors.reconcile}</Text> : null}
                </Section>
              </>
            )}
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
            variant="outline"
            value={drawer}
            onValueChange={(v) => setDrawer(v as 'all' | Drawer)}
            items={[
              { value: 'all', label: 'All', badge: rows ? String(rows.length) : undefined },
              ...DRAWERS.map((d) => ({ value: d, label: d, badge: rows ? String(rows.filter((a) => a.drawer === d).length) : undefined })),
            ]}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="warning" variant="outline" title="Some accounts are in use">
            {notice}
          </Alert>
        ) : null}
        {list}
      </Panel.Body>
    </Panel>
  );
}
