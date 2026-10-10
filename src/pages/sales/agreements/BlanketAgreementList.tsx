import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { BA_STATUSES, type BlanketAgreement, type BaStatus } from '../../../mocks/blanketAgreements';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listBlanketAgreements, baNumber, baTotals } from '../../../services/blanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { useDocTitle } from '../../../services/useDocTitle';

export const BA_LIST_PATH = '/sales/agreements';

export const BA_STATUS_INTENT: Record<BaStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  Approved: 'primary',
  'On Hold': 'warning',
  Terminated: 'danger',
  Closed: 'success',
};

export function BlanketAgreementList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const agreements = useAsync(listBlanketAgreements, []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useDocTitle('Blanket Agreements');

  const totalOf = (ba: BlanketAgreement) => baTotals(ba).plannedTotal;

  const fields = [
    textField<BlanketAgreement>('no', 'No.', baNumber),
    textField<BlanketAgreement>('customer', 'Customer', (d) => d.customerName),
    textField<BlanketAgreement>('customerRef', 'Customer ref.', (d) => d.customerRef),
    dateField<BlanketAgreement>('startDate', 'Start date', (d) => d.startDate),
    dateField<BlanketAgreement>('endDate', 'End date', (d) => d.endDate),
    statusField<BlanketAgreement>(BA_STATUSES),
  ];

  const presets = useListPresets({
    list: 'blanket-agreements',
    fields,
    builtIns: statusViews('agreements', BA_STATUSES),
    defaultSort: { key: 'startDate', direction: 'desc' },
    rows: agreements,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(agreements ?? []).filter(
      (ba) =>
        !q ||
        [baNumber(ba), ba.customerCode, ba.customerName, ba.customerRef, ba.description].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (ba: BlanketAgreement): string | number =>
      sort.key === 'total' ? totalOf(ba) : String(ba[sort.key as keyof BlanketAgreement] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreements, presets.filter, query, sort]);

  const open = (ba: BlanketAgreement) => navigate(`${BA_LIST_PATH}/${ba.docNum ? baNumber(ba) : ba.id}`);

  const paginated = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<BlanketAgreement>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: true,
      cell: (ba) => (
        <TableLink onClick={() => open(ba)}>
          {ba.docNum ? baNumber(ba) : <Text tone="muted">Draft</Text>}
        </TableLink>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (ba) => (
        <TableStatus intent={BA_STATUS_INTENT[ba.status]}>{ba.status}</TableStatus>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      cell: (ba) => <TableSubcontent subcopy={ba.customerCode}>{ba.customerName || '—'}</TableSubcontent>,
    },
    {
      key: 'description',
      header: 'Description',
      cell: (ba) => ba.description || <Text tone="muted">—</Text>,
    },
    {
      key: 'startDate',
      header: 'Start date',
      sortable: true,
      cell: (ba) => formatDate(ba.startDate),
    },
    {
      key: 'endDate',
      header: 'End date',
      sortable: true,
      cell: (ba) => ba.endDate ? formatDate(ba.endDate) : <Text tone="muted">—</Text>,
    },
    {
      key: 'total',
      header: 'Planned total',
      sortable: true,
      cell: (ba) => {
        const totals = baTotals(ba);
        return <span className="tabular-nums">{ba.currency} {formatAmount(totals.plannedTotal)}</span>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search agreements"
        searchPlaceholder="Search by no., customer, or description"
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); setPage(1); }}
        icon="description"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${BA_LIST_PATH}/new`)}>
            New agreement
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        <Card className={fillCardClass(paginated.length)}>
          {agreements ? (
            <Table
              caption="Blanket agreements"
              columns={columns}
              rows={paginated}
              getRowId={(ba) => ba.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{ page, pageSize, total: rows.length, pageSizes: PAGE_SIZES, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading agreements…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
