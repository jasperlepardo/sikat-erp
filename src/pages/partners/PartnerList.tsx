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
  TableLink,
  TableStatus,
  TableSubcontent,
  TableUser,
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
import { paymentTermName } from '../../services/purchaseOrders';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../components/form/DataTable';
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const presets = useListPresets({
    list: scope,
    fields: partnerFilterFields(scope),
    builtIns: partnerViews(scope),
    defaultSort: { key: 'name', direction: 'asc' },
    rows: partners,
    onChange: () => setPage(1),
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

  const open = (p: Partner) => navigate(`${config.basePath}/${p.id}`);

  const roleColumn: TableColumn<Partner> =
    scope === 'all'
      ? { key: 'group', header: 'Group', sortable: true, cell: (p) => p.group }
      : scope === 'lead'
      ? { key: 'leadSource', header: 'Source', sortable: true, cell: (p) => p.leadSource ?? '—' }
      : scope === 'customer'
        ? {
            key: 'creditLimit',
            header: 'Credit limit',
            cell: (p) => (
              <TableSubcontent subcopy={paymentTermName(p.customerPaymentTermId)}>
                <TableAmount currency="PHP">{formatAmount(p.creditLimit ?? 0)}</TableAmount>
              </TableSubcontent>
            ),
          }
        : { key: 'vendorPaymentTermId', header: 'Payment terms', sortable: true, cell: (p) => (p.vendorPaymentTermId ? paymentTermName(p.vendorPaymentTermId) : '—') };

  const columns: TableColumn<Partner>[] = [
    {
      key: 'name',
      header: config.singular,
      sortable: true,
      cell: (p) => (
        <TableSubcontent subcopy={p.code}>
          <TableLink onClick={() => open(p)}>{p.name}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      cell: (p) => {
        const name = defaultContactName(p);
        return name ? <TableUser name={name} subcopy={defaultContact(p)?.email || p.contactChannels.find((c) => c.type === 'Email')?.value} initials={initials(name)} /> : '—';
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

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon={config.icon}
        title={presets.menu}
        showSearch
        searchLabel={`Search ${config.title.toLowerCase()}`}
        searchPlaceholder="Search by name, code, contact, or city"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="extra-large"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${config.basePath}/new`)}
          >
            New {config.singular.toLowerCase()}
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(null)}
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {partners ? (
            <Table
              caption={config.title}
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(p) => p.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
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
