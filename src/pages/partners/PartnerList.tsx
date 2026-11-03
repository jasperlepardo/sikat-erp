import {
  Badge,
  TableContent,
  TableStatus,
} from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../components/form/listColumns';
import type { Partner } from '../../mocks/partners';
import {
  defaultBillTo,
  defaultContact,
  defaultContactName,
  isActive,
  listPartners,
  listPartnersByRole,
} from '../../services/partners';
import { useAsync } from '../../services/useAsync';
import { loadPartnerBalances } from '../../services/journalEntries';
import { formatMoney } from '../../services/format';
import { bpGroupName, leadSources, nameIn } from '../../services/partnerMasters';
import { paymentTermName } from '../../services/purchaseOrders';
import { ROLE_CONFIG, ROLE_ORDER, STAGE_INTENT, scopeConfig, scopeNoun, type PartnerScope } from './roles';
import { partnerFilterFields, partnerViews } from './filterFields';

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function sortValue(p: Partner, key: string): string {
  if (key === 'contact') return defaultContactName(p);
  if (key === 'city') return defaultBillTo(p)?.city ?? '';
  const value = p[key as keyof Partner];
  return typeof value === 'string' ? value : '';
}

export function PartnerList({ scope, compact, selectedId }: {
  scope: PartnerScope;
  compact?: boolean;
  selectedId?: string;
}) {
  const config = scopeConfig(scope);
  const noun = scopeNoun(scope);
  const partners = useAsync(() => (scope === 'all' ? listPartners() : listPartnersByRole(scope)), [scope]);
  const balances = useAsync(loadPartnerBalances, []);
  // A customer's balance is what they owe us (debit); a vendor's is what we owe them (credit).
  const balanceOf = (p: Partner) => (balances?.get(p.id) ?? 0) * (scope === 'vendor' ? -1 : 1);
  const balanceColumns: ListColumn<Partner>[] = scope === 'customer' || scope === 'vendor'
    ? [{ key: 'balance', header: 'Balance', align: 'end', cell: (p) => (balances ? formatMoney(balanceOf(p)) : '—') }]
    : [];

  const roleColumn: ListColumn<Partner> =
    scope === 'all'
      ? { key: 'bpGroupId', header: 'Group', cell: (p) => bpGroupName(p.bpGroupId) }
      : scope === 'lead'
      ? { key: 'leadSource', header: 'Source', cell: (p) => (p.leadSourceId ? nameIn(leadSources, p.leadSourceId) : '—') }
      : scope === 'customer'
        ? { key: 'creditLimit', header: 'Credit limit', align: 'end', cell: (p) => <TableContent subcopy={paymentTermName(p.customerPaymentTermId)}>{formatMoney(p.creditLimit ?? 0)}</TableContent> }
        : { key: 'vendorPaymentTermId', header: 'Payment terms', cell: (p) => (p.vendorPaymentTermId ? paymentTermName(p.vendorPaymentTermId) : '—') };

  const allColumns: ListColumn<Partner>[] = [
    { key: 'name', header: config.singular, locked: true, cell: (p) => <TableContent href={`#${config.basePath}/${p.id}`}>{p.name}</TableContent> },
    { key: 'code', header: `${config.singular} code`, cell: (p) => p.code || '—' },
    {
      key: 'contact',
      header: 'Contact',
      cell: (p) => {
        const name = defaultContactName(p);
        return name ? <TableContent initials={initials(name)} subcopy={defaultContact(p)?.email || p.contactChannels.find((c) => c.type === 'Email')?.value}>{name}</TableContent> : '—';
      },
    },
    { key: 'city', header: 'City', cell: (p) => defaultBillTo(p)?.city || '—' },
    roleColumn,
    ...balanceColumns,
    {
      key: 'roles',
      header: scope === 'all' ? 'Roles' : 'Also a',
      cell: (p) => {
        const others = ROLE_ORDER.filter((r) => r !== scope && p.roles.includes(r));
        return others.length ? (
          <div className="flex gap-1">
            {others.map((r) => <Badge key={r} intent="primary" variant="outline">{ROLE_CONFIG[r].singular}</Badge>)}
          </div>
        ) : '—';
      },
    },
    {
      key: 'status',
      header: scope === 'lead' ? 'Stage' : 'Status',
      cell: (p) =>
        scope === 'lead'
          ? <TableStatus intent={STAGE_INTENT[p.leadStage ?? 'New']}>{p.leadStage ?? 'New'}</TableStatus>
          : <TableStatus intent={isActive(p) ? 'success' : 'default'}>{isActive(p) ? 'Active' : 'Inactive'}</TableStatus>,
    },
  ];

  const { columns, manager } = useListColumns(scope, allColumns);

  return (
    <ListPage
      rows={partners}
      columns={columns}
      fields={partnerFilterFields(scope)}
      noun={noun}
      icon={config.icon}
      basePath={config.basePath}
      listKey={scope}
      builtIns={partnerViews(scope)}
      defaultSort={{ key: 'name', direction: 'asc' }}
      search={{ placeholder: 'Search by name, code, contact, or city', label: `Search ${config.title.toLowerCase()}` }}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      filterFn={(p, q) => !q || `${p.code} ${p.name} ${p.aliasName} ${defaultContactName(p)} ${defaultBillTo(p)?.city ?? ''}`.toLowerCase().includes(q)}
      sortFn={(a, b, sort) =>
        sort.key === 'balance' ? balanceOf(a) - balanceOf(b)
        : sort.key === 'creditLimit' ? (a.creditLimit ?? 0) - (b.creditLimit ?? 0)
        : sortValue(a, sort.key).localeCompare(sortValue(b, sort.key))}
    />
  );
}
