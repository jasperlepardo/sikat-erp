import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Badge,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
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
import { fillCardClass, useListPage } from '../../components/form/DataTable';
import { useListPresets } from '../../components/filter/useListPresets';
import { ROLE_CONFIG, ROLE_ORDER, STAGE_INTENT, scopeConfig, type PartnerScope } from './roles';
import { partnerFilterFields, partnerViews } from './filterFields';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Sort key → comparable text (contact and city come from the default contact / bill-to). */
function sortValue(p: Partner, key: string): string {
  if (key === 'contact') return defaultContactName(p);
  if (key === 'city') return defaultBillTo(p)?.city ?? '';
  const value = p[key as keyof Partner];
  return typeof value === 'string' ? value : '';
}

/**
 * Business Partners (the master: every partner) and Leads, Customers and Vendors
 * (the same records filtered by role).
 */
export function PartnerList({ scope }: { scope: PartnerScope }) {
  const config = scopeConfig(scope);
  const navigate = useNavigate();
  const partners = useAsync(() => (scope === 'all' ? listPartners() : listPartnersByRole(scope)), [scope]);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({
    list: scope,
    fields: partnerFilterFields(scope),
    builtIns: partnerViews(scope),
    defaultSort: { key: 'name', direction: 'asc' },
    rows: partners,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(partners ?? []).filter(
      (p) => !q || `${p.code} ${p.name} ${p.aliasName} ${defaultContactName(p)} ${defaultBillTo(p)?.city ?? ''}`.toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners, presets.filter, query, sort]);

  const roleColumn: TableColumn<Partner> =
    scope === 'all'
      ? { key: 'bpGroupId', header: 'Group', sortable: true, cell: (p) => bpGroupName(p.bpGroupId) }
      : scope === 'lead'
      ? { key: 'leadSource', header: 'Source', sortable: true, cell: (p) => (p.leadSourceId ? nameIn(leadSources, p.leadSourceId) : '—') }
      : scope === 'customer'
        ? {
            key: 'creditLimit',
            header: 'Credit limit',
            cell: (p) => (
              <TableContent subcopy={paymentTermName(p.customerPaymentTermId)}>
                <TableAmount currency="PHP">{formatAmount(p.creditLimit ?? 0)}</TableAmount>
              </TableContent>
            ),
          }
        : { key: 'vendorPaymentTermId', header: 'Payment terms', sortable: true, cell: (p) => (p.vendorPaymentTermId ? paymentTermName(p.vendorPaymentTermId) : '—') };

  const columns: TableColumn<Partner>[] = [
    {
      key: 'name',
      header: config.singular,
      sortable: true,
      cell: (p) => (
        <TableContent href={`#${config.basePath}/${p.id}`} subcopy={p.code}>{p.name}</TableContent>
      ),
    },
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
            {others.map((r) => (
              <Badge key={r} intent="primary" variant="outline">
                {ROLE_CONFIG[r].singular}
              </Badge>
            ))}
          </div>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'status',
      header: scope === 'lead' ? 'Stage' : 'Status',
      cell: (p) =>
        scope === 'lead' ? (
          <TableStatus intent={STAGE_INTENT[p.leadStage ?? 'New']}>{p.leadStage ?? 'New'}</TableStatus>
        ) : (
          <TableStatus intent={isActive(p) ? 'success' : 'default'}>{isActive(p) ? 'Active' : 'Inactive'}</TableStatus>
        ),
    },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon={config.icon}
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        showSearch
        searchLabel={`Search ${config.title.toLowerCase()}`}
        searchPlaceholder="Search by name, code, contact, or city"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${config.basePath}/new`)}
          >
            New {config.singular.toLowerCase()}
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(null)}
        <Card className={fillCardClass(visible.length)}>
          {partners ? (
            <Table
              caption={config.title}
              columns={columns}
              rows={visible}
              getRowId={(p) => p.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading {config.title.toLowerCase()}…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
