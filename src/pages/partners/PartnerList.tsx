import {
  Badge,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../components/form/ListPage';
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
import { formatAmount } from '../../services/format';
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

  const roleColumn: TableColumn<Partner> =
    scope === 'all'
      ? { key: 'bpGroupId', header: 'Group', sortable: true, cell: (p) => bpGroupName(p.bpGroupId) }
      : scope === 'lead'
      ? { key: 'leadSource', header: 'Source', sortable: true, cell: (p) => (p.leadSourceId ? nameIn(leadSources, p.leadSourceId) : '—') }
      : scope === 'customer'
        ? { key: 'creditLimit', header: 'Credit limit', cell: (p) => <TableContent subcopy={paymentTermName(p.customerPaymentTermId)}><TableAmount currency="PHP">{formatAmount(p.creditLimit ?? 0)}</TableAmount></TableContent> }
        : { key: 'vendorPaymentTermId', header: 'Payment terms', sortable: true, cell: (p) => (p.vendorPaymentTermId ? paymentTermName(p.vendorPaymentTermId) : '—') };

  const columns: TableColumn<Partner>[] = [
    { key: 'name', header: config.singular, sortable: true, cell: (p) => <TableContent href={`#${config.basePath}/${p.id}`} subcopy={p.code}>{p.name}</TableContent> },
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      cell: (p) => {
        const name = defaultContactName(p);
        return name ? <TableContent initials={initials(name)} subcopy={defaultContact(p)?.email || p.contactChannels.find((c) => c.type === 'Email')?.value}>{name}</TableContent> : '—';
      },
    },
    { key: 'city', header: 'City', sortable: true, cell: (p) => defaultBillTo(p)?.city || '—' },
    roleColumn,
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
      compact={compact}
      selectedId={selectedId}
      filterFn={(p, q) => !q || `${p.code} ${p.name} ${p.aliasName} ${defaultContactName(p)} ${defaultBillTo(p)?.city ?? ''}`.toLowerCase().includes(q)}
      sortFn={(a, b, sort) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key))}
    />
  );
}
