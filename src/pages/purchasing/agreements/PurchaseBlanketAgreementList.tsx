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
import { PBA_STATUSES, type PurchaseBlanketAgreement, type PbaStatus } from '../../../mocks/purchaseBlanketAgreements';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPurchaseBlanketAgreements, pbaNumber, pbaTotals } from '../../../services/purchaseBlanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { useDocTitle } from '../../../services/useDocTitle';

export const PBA_LIST_PATH = '/purchasing/agreements';

export const PBA_STATUS_INTENT: Record<PbaStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  Approved: 'primary',
  'On Hold': 'warning',
  Terminated: 'danger',
  Closed: 'success',
};

export function PurchaseBlanketAgreementList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const agreements = useAsync(listPurchaseBlanketAgreements, []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useDocTitle('Purchase Blanket Agreements');

  const totalOf = (pba: PurchaseBlanketAgreement) => pbaTotals(pba).plannedTotal;

  const fields = [
    textField<PurchaseBlanketAgreement>('no', 'No.', pbaNumber),
    textField<PurchaseBlanketAgreement>('vendor', 'Vendor', (d) => d.vendorName),
    textField<PurchaseBlanketAgreement>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<PurchaseBlanketAgreement>('startDate', 'Start date', (d) => d.startDate),
    dateField<PurchaseBlanketAgreement>('endDate', 'End date', (d) => d.endDate),
    statusField<PurchaseBlanketAgreement>(PBA_STATUSES),
  ];

  const presets = useListPresets({
    list: 'purchase-blanket-agreements',
    fields,
    builtIns: statusViews('agreements', PBA_STATUSES),
    defaultSort: { key: 'startDate', direction: 'desc' },
    rows: agreements,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(agreements ?? []).filter(
      (pba) =>
        !q ||
        [pbaNumber(pba), pba.vendorCode, pba.vendorName, pba.vendorRef, pba.description].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (pba: PurchaseBlanketAgreement): string | number =>
      sort.key === 'total' ? totalOf(pba) : String(pba[sort.key as keyof PurchaseBlanketAgreement] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreements, presets.filter, query, sort]);

  const open = (pba: PurchaseBlanketAgreement) => navigate(`${PBA_LIST_PATH}/${pba.docNum ? pbaNumber(pba) : pba.id}`);

  const paginated = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<PurchaseBlanketAgreement>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: true,
      cell: (pba) => (
        <TableLink onClick={() => open(pba)}>
          {pba.docNum ? pbaNumber(pba) : <Text tone="muted">Draft</Text>}
        </TableLink>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (pba) => (
        <TableStatus intent={PBA_STATUS_INTENT[pba.status]}>{pba.status}</TableStatus>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      sortable: true,
      cell: (pba) => <TableSubcontent subcopy={pba.vendorCode}>{pba.vendorName || '—'}</TableSubcontent>,
    },
    {
      key: 'description',
      header: 'Description',
      cell: (pba) => pba.description || <Text tone="muted">—</Text>,
    },
    {
      key: 'startDate',
      header: 'Start date',
      sortable: true,
      cell: (pba) => formatDate(pba.startDate),
    },
    {
      key: 'endDate',
      header: 'End date',
      sortable: true,
      cell: (pba) => pba.endDate ? formatDate(pba.endDate) : <Text tone="muted">—</Text>,
    },
    {
      key: 'total',
      header: 'Planned total',
      sortable: true,
      cell: (pba) => {
        const totals = pbaTotals(pba);
        return <span className="tabular-nums">{pba.currency} {formatAmount(totals.plannedTotal)}</span>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search agreements"
        searchPlaceholder="Search by no., vendor, or description"
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); setPage(1); }}
        icon="handshake"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${PBA_LIST_PATH}/new`)}>
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
              caption="Purchase blanket agreements"
              columns={columns}
              rows={paginated}
              getRowId={(pba) => pba.id}
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
