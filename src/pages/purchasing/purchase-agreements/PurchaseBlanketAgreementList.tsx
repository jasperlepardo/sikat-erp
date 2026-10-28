import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Alert,
  Panel,
  Table,
  TableContent,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { dateField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { PBA_STATUSES, type PurchaseBlanketAgreement } from '../../../mocks/purchaseBlanketAgreements';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPurchaseBlanketAgreements, pbaNumber, pbaTotals } from '../../../services/purchaseBlanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { useDocTitle } from '../../../services/useDocTitle';
import { cap } from '../../../components/form/noun';
import { PBA_LIST_PATH, PBA_NOUN, PBA_STATUS_INTENT } from '../paths';

export function PurchaseBlanketAgreementList() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const agreements = useAsync(listPurchaseBlanketAgreements, []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
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
    builtIns: statusViews(PBA_NOUN.many, PBA_STATUSES),
    defaultSort: { key: 'startDate', direction: 'desc' },
    rows: agreements,
    onChange: resetPage,
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

  const { visible: paginated, pagination } = paginate(rows);

  const columns: TableColumn<PurchaseBlanketAgreement>[] = [
    {
      key: 'no',
      header: 'No.',
      sortable: true,
      cell: (pba) => (
        <TableContent href={`#${PBA_LIST_PATH}/${pba.docNum ? pbaNumber(pba) : pba.id}`}>
          {pba.docNum ? pbaNumber(pba) : <Text tone="muted">Draft</Text>}
        </TableContent>
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
      cell: (pba) => <TableContent subcopy={pba.vendorCode}>{pba.vendorName || '—'}</TableContent>,
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
      <PageHeader
        showSearch
        searchLabel={`Search ${PBA_NOUN.many}`}
        searchPlaceholder="Search by no., vendor, or description"
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); resetPage(); }}
        icon="handshake"
        title={presets.menu}
        create={{ noun: PBA_NOUN, to: PBA_LIST_PATH }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        {agreements ? (
          <Table
            caption={cap(PBA_NOUN.many)}
            columns={columns}
            rows={paginated}
            getRowId={(pba) => pba.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading {PBA_NOUN.many}…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
