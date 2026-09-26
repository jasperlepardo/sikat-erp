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
  Tabs,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { LEAD_STAGES, type Partner, type PartnerRole } from '../../mocks/partners';
import { defaultBillTo, defaultContact, defaultContactName, isActive, listPartnersByRole } from '../../services/partners';
import { useAsync } from '../../services/useAsync';
import { formatAmount } from '../../services/format';
import { ROLE_CONFIG, ROLE_ORDER, STAGE_INTENT } from './roles';

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

/** Leads, Customers and Vendors: the same business partner records, filtered by role. */
export function PartnerList({ role }: { role: PartnerRole }) {
  const config = ROLE_CONFIG[role];
  const navigate = useNavigate();
  const partners = useAsync(() => listPartnersByRole(role), [role]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Leads filter by pipeline stage; customers and vendors by active status.
  const filters: Record<string, (p: Partner) => boolean> =
    role === 'lead'
      ? Object.fromEntries([
          ['all', () => true],
          ...LEAD_STAGES.map((s) => [s, (p: Partner) => p.leadStage === s]),
        ])
      : {
          all: () => true,
          active: (p) => isActive(p),
          inactive: (p) => !isActive(p),
        };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (filters[filter] ?? filters.all) as (p: Partner) => boolean;
    const filtered = (partners ?? []).filter(
      (p) => matches(p) && (!q || `${p.code} ${p.name} ${p.aliasName} ${defaultContactName(p)} ${defaultBillTo(p)?.city ?? ''}`.toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners, filter, query, sort]);

  const count = (key: string) => String(partners?.filter(filters[key]).length ?? '');
  const open = (p: Partner) => navigate(`${config.basePath}/${p.id}`);

  const roleColumn: TableColumn<Partner> =
    role === 'lead'
      ? { key: 'leadSource', header: 'Source', sortable: true, cell: (p) => p.leadSource ?? '—' }
      : role === 'customer'
        ? {
            key: 'creditLimit',
            header: 'Credit limit',
            cell: (p) => (
              <TableSubcontent subcopy={p.customerPaymentTerms}>
                <TableAmount currency="PHP">{formatAmount(p.creditLimit ?? 0)}</TableAmount>
              </TableSubcontent>
            ),
          }
        : { key: 'vendorPaymentTerms', header: 'Payment terms', sortable: true, cell: (p) => p.vendorPaymentTerms || '—' };

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
        return name ? <TableUser name={name} subcopy={defaultContact(p)?.email || p.email} initials={initials(name)} /> : '—';
      },
    },
    { key: 'city', header: 'City', sortable: true, cell: (p) => defaultBillTo(p)?.city || '—' },
    roleColumn,
    {
      key: 'roles',
      header: 'Also a',
      cell: (p) => {
        const others = ROLE_ORDER.filter((r) => r !== role && p.roles.includes(r));
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
      header: role === 'lead' ? 'Stage' : 'Status',
      cell: (p) =>
        role === 'lead' ? (
          <TableStatus intent={STAGE_INTENT[p.leadStage ?? 'New']}>{p.leadStage ?? 'New'}</TableStatus>
        ) : (
          <TableStatus intent={isActive(p) ? 'success' : 'default'}>{isActive(p) ? 'Active' : 'Inactive'}</TableStatus>
        ),
    },
  ];

  const tabLabels: Record<string, string> =
    role === 'lead' ? { all: 'All', ...Object.fromEntries(LEAD_STAGES.map((s) => [s, s])) } : { all: 'All', active: 'Active', inactive: 'Inactive' };

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon={config.icon}
        title={config.title}
        subcopy={config.subcopy}
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
        tabs={
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
            items={Object.entries(tabLabels).map(([value, label]) => ({ value, label, badge: count(value) }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <TextField
          aria-label={`Search ${config.title.toLowerCase()}`}
          placeholder="Search by name, code, contact, or city"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card>
          {partners ? (
            <Table
              caption={config.title}
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(p) => p.id}
              sort={sort}
              onSortChange={setSort}
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: [10, 25, 50],
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          ) : (
            <p className="p-4 text-muted">Loading {config.title.toLowerCase()}…</p>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}
