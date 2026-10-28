import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { todayISO, formatDate } from '../../../services/dates';
import {
  Alert,
  Panel,
  Table,
  TableAmount,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { RFQ_STATUSES, type Rfq } from '../../../mocks/rfqs';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { useListPage } from '../../../components/form/DataTable';
import { cap } from '../../../components/form/noun';
import { RFQ_LIST_PATH, RFQ_NOUN, RFQ_STATUS_INTENT } from '../paths';

export function RfqList() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listRfqs(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const [rfqs, codes] = data ?? [undefined, []];
  const totalOf = (q: Rfq) => rfqTotal(q, codes);

  const fields = [
    textField<Rfq>('no', 'No.', rfqNumber),
    textField<Rfq>('vendor', 'Vendor', (d) => d.vendorName),
    textField<Rfq>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<Rfq>('vendorRef', 'Vendor ref.', (d) => d.vendorRef),
    dateField<Rfq>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<Rfq>('validUntil', 'Valid until', (d) => d.validUntil),
    numberField<Rfq>('total', 'Total', totalOf),
    statusField<Rfq>(RFQ_STATUSES),
    masterField<Rfq>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<Rfq>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<Rfq>(),
  ];

  const presets = useListPresets({
    list: 'purchase-quotations',
    fields,
    builtIns: statusViews(RFQ_NOUN.many, RFQ_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: rfqs,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(rfqs ?? []).filter(
      (rfq) =>
        !q ||
        [rfqNumber(rfq), rfq.vendorCode, rfq.vendorName, rfq.vendorRef, ...rfq.lines.map((l) => `${l.itemNo} ${l.description}`)]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (rfq: Rfq): string | number =>
      sort.key === 'total' ? totalOf(rfq) : sort.key === 'docNum' ? rfq.docNum : String(rfq[sort.key as keyof Rfq] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqs, presets.filter, query, sort, codes]);

  const today = todayISO();

  const columns: TableColumn<Rfq>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (rfq) => (
        <TableContent href={`#${RFQ_LIST_PATH}/${rfq.docNum ? rfqNumber(rfq) : rfq.id}`} subcopy={rfq.vendorRef ? `Vendor ref. ${rfq.vendorRef}` : undefined}>{rfqNumber(rfq)}</TableContent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (rfq) => <TableContent subcopy={rfq.vendorCode}>{rfq.vendorName || '—'}</TableContent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (rfq) => formatDate(rfq.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      sortable: true,
      // An open RFQ past its date is still open — the vendor's quote has lapsed, so say so here.
      cell: (rfq) =>
        !rfq.validUntil ? (
          '—'
        ) : rfq.status === 'Open' && rfq.validUntil < today ? (
          <TableContent subcopy="Expired">
            <span className="text-danger">{formatDate(rfq.validUntil)}</span>
          </TableContent>
        ) : (
          formatDate(rfq.validUntil)
        ),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (rfq) => {
        const total = rfq.lines.length;
        const quoted = rfq.lines.filter((l) => l.quotedQty > 0 || l.quotedDate).length;
        return (
          <TableContent subcopy={total ? `${quoted} of ${total} quoted` : undefined}>
            {total} {total === 1 ? 'line' : 'lines'}
          </TableContent>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      cell: (rfq) => <TableAmount currency={rfq.currency}>{formatAmount(totalOf(rfq))}</TableAmount>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (rfq) => <TableStatus intent={RFQ_STATUS_INTENT[rfq.status]}>{rfq.status}</TableStatus>,
    },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel="Search purchase quotations"
        searchPlaceholder="Search by RFQ no., vendor, ref. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="description"
        title={presets.menu}
        create={{ noun: RFQ_NOUN, to: RFQ_LIST_PATH }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        {rfqs ? (
          <Table
            caption={cap(RFQ_NOUN.many)}
            columns={columns}
            rows={visible}
            getRowId={(q) => q.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">
            Loading purchase quotations…
          </Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
