import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert, Badge, Checkbox, FormField, Icon, Panel, Select, TableStatus, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../components/form/PageHeader';
import { FieldStack, Flags, ReadOnly, Section, bind } from '../../components/form/fields';
import { MasterList } from '../../components/form/MasterList';
import { MasterLookup } from '../../components/form/MasterLookup';
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  DRAWERS,
  PLANNING_LEVELS,
  STATEMENT_LINES,
  defaultAccountType,
  normalBalance,
  statementOf,
  type Account,
  type Drawer,
} from '../../mocks/chartOfAccounts';
import { DIMENSION_NAMES, DIMENSION_NOS, accountDimension, withAccountDimension, type AccountDimension, type DimensionNo } from '../../mocks/costAccounting';
import { describeUsage, loadAccountUsage, usageCount } from '../../services/accountUsage';
import { loadAccountBalances } from '../../services/journalEntries';
import { accounts, taxCodes, withholdingGroups } from '../../services/masterData';
import { activeOptions } from '../../services/inventoryMasters';
import { currencyDef, distributionRuleDef, projectDef } from '../settings/masterDefs';
import { AccountBalancePanel, signedBalance } from './AccountBalancePanel';
import { useAsync } from '../../services/useAsync';
import { useCollectionRows } from '../../services/useCollectionRows';
import { useHeaderSearchHost } from '../../components/form/HeaderSearch';
import { GL_ACCOUNT_NOUN } from './paths';

const BASE = '/accounting/chart-of-accounts';
/** The tree's depth picker goes this deep at most. */
const MAX_LEVEL = 10;

/** Dimension defaults a new account in the drawer starts with (what the seeded accounts there use). */
const drawerDimensions = (d: Drawer, all: readonly Account[]): AccountDimension[] =>
  all.find((x) => x.drawer === d && !x.title)?.dimensions.map((x) => ({ ...x })) ?? [];

const blank = (drawer: Drawer, all: readonly Account[]): Account => ({
  // The id is set from the account number on save: the number is the key.
  id: '',
  code: '',
  name: '',
  drawer,
  parentCode: all.find((x) => x.drawer === drawer && !x.parentCode)?.code ?? '',
  title: false,
  contra: false,
  control: false,
  cash: false,
  currency: 'PHP',
  active: true,
  remarks: '',
  externalCode: '',
  foreignName: '',
  exportCode: '',
  accountType: defaultAccountType(drawer),
  classification: balanceSheet(drawer) ? 'Current' : '',
  cashFlow: 'Operating',
  statementLine: STATEMENT_LINES[drawer][0],
  cashFlowRelevant: false,
  planningLevel: '',
  blockManualPosting: false,
  validFrom: '',
  validTo: '',
  dimensions: drawerDimensions(drawer, all),
  projectRequired: false,
  defaultProjectId: '',
  balanceRange: false,
  minBalance: 0,
  maxBalance: 0,
  costAccountingOnly: false,
  confidential: false,
  revalue: false,
  indexed: false,
  reconcile: false,
  defaultTaxCode: '',
  defaultWithholdingGroup: '',
});

function balanceSheet(d: Drawer) {
  return d === 'Assets' || d === 'Liabilities';
}

/** 1 for a drawer's top title, 2 for the accounts under it, and so on. */
function levelOf(a: Account, all: readonly Account[]) {
  let level = 1;
  for (let p = a.parentCode; p && level <= MAX_LEVEL; level++) p = all.find((x) => x.code === p)?.parentCode ?? '';
  return level;
}

/** Accounting › Chart of Accounts: drawers, title accounts and the active accounts documents post to. */
export function ChartOfAccountsPage() {
  const { recordId, view } = useParams();
  const navigate = useNavigate();
  const { rows, save, setActive } = useCollectionRows(accounts);
  const [notice, setNotice] = useState<string>();
  // Which records use each account; reloads whenever the chart changes.
  const usage = useAsync(loadAccountUsage, [rows]);
  const codes = useAsync(taxCodes.list, []);
  const whGroups = useAsync(withholdingGroups.list, []);
  const ledger = useAsync(loadAccountBalances, []);
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

  // A title's balance is the sum of everything under it.
  const balanceOf = (a: Account): number =>
    a.title ? all.filter((x) => x.parentCode === a.code).reduce((n, x) => n + balanceOf(x), 0) : (ledger?.get(a.code) ?? 0);

  const search = useHeaderSearchHost();
  const searching = Boolean(search.headerProps.searchValue?.trim());

  // Drawer tabs: the tree shows one drawer; an account opened by link brings its drawer forward.
  const [tab, setTab] = useState<Drawer>('Assets');
  const opened = recordId && recordId !== 'new' ? all.find((a) => a.id === recordId) : undefined;
  const drawer = opened?.drawer ?? tab;
  if (opened && opened.drawer !== tab) setTab(opened.drawer);
  const inDrawer = all.filter((a) => a.drawer === drawer);

  // Level: expand the tree down to this depth; expanding or collapsing a row by hand overrides it.
  const [level, setLevel] = useState(2);
  const [expanded, setExpanded] = useState<string[] | null>(null);
  const deepest = Math.min(MAX_LEVEL, Math.max(1, ...inDrawer.map((a) => levelOf(a, all))));
  const expandedIds = expanded ?? inDrawer.filter((a) => a.title && levelOf(a, all) < level).map((a) => a.id);
  const pickDrawer = (d: Drawer) => {
    setTab(d);
    setExpanded(null);
  };

  const list = (
    <MasterList<Account>
      basePath={BASE}
      recordId={view ? undefined : recordId}
      icon="account_tree"
      title="Accounts"
      noun={GL_ACCOUNT_NOUN.one}
      description="Title accounts group the accounts below them; documents post only to active accounts. Control accounts take postings through business partners only."
      rows={rows && (searching ? rows : inDrawer)}
      hideHeader
      sidePanelEdit
      getSubRows={(a) => {
        const children = all.filter((x) => x.parentCode === a.code);
        return children.length ? children : undefined;
      }}
      expandedIds={expandedIds}
      onExpandedChange={setExpanded}
      onSetActive={setActiveChecked}
      columns={[
        {
          key: 'code',
          header: 'Account',
          // Title accounts in blue, active accounts in black, as in SAP's tree.
          cell: (a) => (
            <span className={a.title ? 'font-semibold text-primary' : undefined}>
              {a.code} {a.name}
            </span>
          ),
        },
        ...(searching ? [{ key: 'drawer', header: 'Drawer', cell: (a: Account) => a.drawer }] : []),
        { key: 'title', header: 'Level', cell: (a) => `${levelOf(a, all)} · ${a.title ? 'Title' : 'Active account'}` },
        {
          key: 'ledger',
          header: 'Balance',
          cell: (a) =>
            !ledger ? '…' : (
              <a className="tabular-nums whitespace-nowrap" href={`#${BASE}/${encodeURIComponent(a.id)}/balance`} title="Account balance">
                {signedBalance(balanceOf(a))} <Icon size={14}>arrow_forward</Icon>
              </a>
            ),
        },
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
            : key === 'ledger'
              ? balanceOf(a)
              : key === 'balance' ? normalBalance(a) : String(a[key as keyof Account] ?? '').toLowerCase()
      }
      searchText={(a) =>
        [
          a.code, a.name, a.externalCode, a.foreignName, a.exportCode, a.drawer, a.accountType, a.classification, a.cashFlow, a.statementLine,
          a.planningLevel, a.defaultTaxCode, ...a.dimensions.map((d) => DIMENSION_NAMES[d.dimension]),
          a.control && 'control', a.cash && 'cash', a.contra && 'contra', a.confidential && 'confidential',
          a.blockManualPosting && 'no manual', a.revalue && 'revalue', a.reconcile && 'reconcile', a.indexed && 'indexed',
        ]
          .filter(Boolean)
          .join(' ')
      }
      blank={() => blank(drawer, all)}
      label={(a) => `${a.code} ${a.name}`}
      validate={(a) => {
        // Check against the whole chart, not just the drawer on show.
        const others = all;
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
        if (a.balanceRange && a.maxBalance < a.minBalance) e.maxBalance = 'Below the minimum.';
        const used = usedBy(a.code);
        if (usageCount(used) && !a.active) e.active = `Still used by ${describeUsage(used)} — move them to another account before deactivating.`;
        if (usageCount(used) && a.title) e.title = `Used by ${describeUsage(used)} — a title account can't take postings.`;
        return e;
      }}
      onSave={async (a) => {
        await save({ ...a, id: a.id || a.code.trim(), code: a.code.trim(), name: a.name.trim(), externalCode: a.externalCode.trim(), foreignName: a.foreignName.trim(), exportCode: a.exportCode.trim() });
        pickDrawer(a.drawer);
      }}
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
                  dimensions: drawerDimensions(p.drawer, all),
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
        const setDimension = (n: DimensionNo, patch: Partial<AccountDimension>) => update({ dimensions: withAccountDimension(a.dimensions, n, patch) });
        const drawerTop = all.find((x) => x.drawer === a.drawer && !x.parentCode);
        const titles = all.filter((x) => x.title && x.drawer === a.drawer && x.id !== a.id);
        const isDrawerTop = !isNew && !a.parentCode;
        return (
          <>
            <Section icon="account_tree" title="Account">
              <FieldStack>
                {f.text('code', 'Code', {
                  required: true,
                  error: errors.code,
                  disabled: !isNew,
                  hint: isNew ? "Number it inside its title's range, e.g. 6330 under 6195." : "Can't change once saved — documents refer to it.",
                })}
                {f.text('name', 'Name', { required: true, error: errors.name })}
                {f.text('externalCode', 'External code', { hint: 'Alternate code for external reporting and consolidation.' })}
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
                {f.master('currency', 'Currency', currencyDef, {
                  extra: ['All currencies'],
                  where: (c) => c.active || c.code === a.currency,
                  hint: 'All currencies lets documents in any currency post here.',
                })}
                <ReadOnly label="Level" value={levelOf(a, all)} hint="Depth in the drawer: 1 is the drawer itself." />
                <ReadOnly label="Normal balance" value={a.title ? '—' : normalBalance(a)} hint={a.contra ? 'Contra account: opposite of its drawer.' : undefined} />
                {isNew ? null : (
                  <ReadOnly
                    label="Balance"
                    value={
                      ledger ? (
                        <a href={`#${BASE}/${encodeURIComponent(a.id)}/balance`} title="Account balance">
                          PHP {signedBalance(balanceOf(a))} <Icon size={14}>arrow_forward</Icon>
                        </a>
                      ) : '…'
                    }
                    hint="Posted to date. Opens the account's postings."
                  />
                )}
                <ReadOnly
                  label="Used in"
                  value={isNew ? '—' : describeUsage(usedBy(a.code)) || 'Not used yet.'}
                  hint="Item groups, items, business partners and tax codes that post to this account."
                />
                {f.status('active', 'Status')}
              </FieldStack>
              <Flags>
                {f.check('title', 'Title account (groups others; no postings)', { disabled: isDrawerTop })}
                {f.check('contra', 'Contra account')}
                {f.check('control', 'Control account (AR/AP)')}
                {f.check('cash', 'Cash account')}
              </Flags>
              {errors.title || errors.control || errors.active ? (
                <Text variant="small" tone="danger">{errors.title ?? errors.control ?? errors.active}</Text>
              ) : null}
              {f.area('remarks', 'Remarks', { rows: 2 })}
            </Section>

            {a.title ? null : (
              <>
                <Section icon="summarize" title="Reporting">
                  <FieldStack>
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
                      CASH_FLOW_CATEGORIES.filter(Boolean).map((c) => ({ value: c, label: c })),
                      { clearable: true, hint: a.cash ? 'Cash accounts are the cash itself — no category.' : 'Indirect method: income statement accounts are operating.' },
                    )}
                    {f.pick('statementLine', 'Statement line', [...new Set([...STATEMENT_LINES[a.drawer], a.statementLine].filter(Boolean))], {
                      required: true,
                      error: errors.statementLine,
                      hint: `${statementOf(a.drawer)} line it rolls up to.`,
                    })}
                    {f.check('cashFlowRelevant', 'Cash flow relevant (postings name a cash flow line item)')}
                    {f.pick('planningLevel', 'Planning level', PLANNING_LEVELS, { hint: 'Groups the account for cash flow forecasting.' })}
                    {f.text('foreignName', 'Foreign name', { hint: 'Name on reports printed in a second language.' })}
                    {f.text('exportCode', 'Code for exporting', { hint: 'Used in official electronic files, e.g. BIR alphalists.' })}
                  </FieldStack>
                </Section>

                <Section icon="rule" title="Posting controls">
                  <FieldStack>
                    {f.date('validFrom', 'Valid from', { hint: 'Postings dated earlier are refused.' })}
                    {f.date('validTo', 'Valid to', { error: errors.validTo, hint: 'Freeze the account after this date.' })}
                  </FieldStack>
                  <Flags>
                    {f.check('blockManualPosting', 'Block manual journal entries (documents post here only)')}
                    {f.check('costAccountingOnly', 'Cost accounting adjustment only')}
                    {f.check('confidential', 'Confidential')}
                    {f.check('balanceRange', 'Limit the account balance')}
                  </Flags>
                  {a.balanceRange ? (
                    <FieldStack>
                      {f.num('minBalance', 'Balance from', { hint: 'Debit positive, credit negative.' })}
                      {f.num('maxBalance', 'Balance to', { error: errors.maxBalance, hint: 'Journal entries that take the balance outside the range are refused.' })}
                    </FieldStack>
                  ) : null}
                </Section>

                <Section icon="call_split" title="Cost accounting">
                  <FieldStack>
                    {DIMENSION_NOS.map((n) => {
                      const d = accountDimension(a.dimensions, n);
                      return (
                        <FormField key={n} label={DIMENSION_NAMES[n]} tooltip={`Dimension ${n}. Required: every manual posting must name a ${DIMENSION_NAMES[n]}. The default is proposed on each row.`}>
                          {(p) => (
                            <div className="flex items-center gap-3">
                              <Checkbox checked={d.required} onChange={(e) => setDimension(n, { required: e.currentTarget.checked })}>
                                Required
                              </Checkbox>
                              <div className="min-w-0 flex-1">
                                <MasterLookup
                                  def={distributionRuleDef}
                                  fieldProps={p}
                                  value={d.defaultRuleId}
                                  onChange={(id) => setDimension(n, { defaultRuleId: id })}
                                  where={(r) => r.dimension === n && (r.active || r.id === d.defaultRuleId)}
                                  seed={{ dimension: n }}
                                  placeholder="No default"
                                  clearable
                                />
                              </div>
                            </div>
                          )}
                        </FormField>
                      );
                    })}
                    {f.master('defaultProjectId', 'Default project', projectDef, { clearable: true, hint: 'Proposed on rows that post here.' })}
                  </FieldStack>
                  <Flags>{f.check('projectRequired', 'Project required on every posting')}</Flags>
                </Section>

                <Section icon="event_repeat" title="Period-end and tax">
                  <FieldStack>
                    {f.lookup('defaultTaxCode', 'Default tax code', taxOptions, {
                      hint: 'Proposed on manual postings to this account. None = not VAT-relevant.',
                    })}
                    {a.accountType === 'Expenditure'
                      ? f.lookup('defaultWithholdingGroup', 'Default withholding group', activeOptions(whGroups ?? [], (g) => g.code, (g) => `${g.code} · ${g.name}`, a.defaultWithholdingGroup), {
                          clearable: true,
                          placeholder: 'None',
                          hint: "Withholding on purchases costed here when the item has no withholding group of its own.",
                        })
                      : null}
                  </FieldStack>
                  <Flags>
                    {f.check('revalue', 'Revalue at period-end (foreign currency)', { disabled: a.currency === 'PHP' || a.currency === 'All currencies' })}
                    {f.check('indexed', 'Indexed (inflation adjustment)')}
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

  return (
    <Panel className="flex-1">
      <PageHeader
        {...search.headerProps}
        icon="account_tree"
        title="Chart of Accounts"
        create={{ noun: GL_ACCOUNT_NOUN, to: BASE }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="warning" variant="outline" title="Some accounts are in use">
            {notice}
          </Alert>
        ) : null}
        {searching ? null : (
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Tabs
              variant="outline"
              aria-label="Drawer"
              value={drawer}
              onValueChange={(v) => pickDrawer(v as Drawer)}
              items={DRAWERS.map((d) => ({ value: d, label: d }))}
            />
            <Select
              aria-label="Level"
              className="w-36"
              options={Array.from({ length: deepest }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` }))}
              value={String(Math.min(level, deepest))}
              onValueChange={(v) => {
                setLevel(Number(v));
                setExpanded(null);
              }}
            />
          </div>
        )}
        {search.provide(list)}
      </Panel.Body>
      {view === 'balance' && opened ? <AccountBalancePanel account={opened} all={all} onClose={() => navigate(BASE)} /> : null}
    </Panel>
  );
}
