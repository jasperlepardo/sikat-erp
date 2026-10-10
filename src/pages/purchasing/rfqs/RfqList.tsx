import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
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
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { RFQ_STATUSES, type Rfq } from '../../../mocks/rfqs';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { useAsync } from '../../../services/useAsync';
import { RFQ_LIST_PATH, STATUS_INTENT } from './detail/RfqDetail';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';

export function RfqList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listRfqs(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

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
    builtIns: statusViews('purchase quotations', RFQ_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: rfqs,
    onChange: () => setPage(1),
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

  const open = (rfq: Rfq) => navigate(`${RFQ_LIST_PATH}/${rfq.docNum ? rfqNumber(rfq) : rfq.id}`);

  const today = new Date().toISOString().slice(0, 10);

  const columns: TableColumn<Rfq>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (rfq) => (
        <TableSubcontent subcopy={rfq.vendorRef ? `Vendor ref. ${rfq.vendorRef}` : undefined}>
          <TableLink onClick={() => open(rfq)}>{rfqNumber(rfq)}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (rfq) => <TableSubcontent subcopy={rfq.vendorCode}>{rfq.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (rfq) => rfq.postingDate },
    {
      key: 'validUntil',
      header: 'Valid until',
      sortable: true,
      cell: (rfq) =>
        rfq.validUntil ? (
          <span className={rfq.status === 'Open' && rfq.validUntil < today ? 'text-danger' : undefined}>
            {rfq.validUntil}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (rfq) => {
        const total = rfq.lines.length;
        const quoted = rfq.lines.filter((l) => l.quotedQty > 0 || l.quotedDate).length;
        return (
          <TableSubcontent subcopy={total ? `${quoted} of ${total} quoted` : undefined}>
            {total} {total === 1 ? 'line' : 'lines'}
          </TableSubcontent>
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
      cell: (rfq) => (
        <div className="flex flex-col gap-0.5">
          <TableStatus intent={STATUS_INTENT[rfq.status]}>{rfq.status}</TableStatus>
          {rfq.status === 'Open' && rfq.validUntil && rfq.validUntil < today ? (
            <Badge size="small" intent="warning">Expired</Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search purchase quotations"
        searchPlaceholder="Search by RFQ no., vendor, ref. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="description"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${RFQ_LIST_PATH}/new`)}
          >
            New RFQ
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {rfqs ? (
            <Table
              caption="Purchase quotations"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(q) => q.id}
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
            <Text tone="muted" className="p-4">
              Loading purchase quotations…
            </Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
