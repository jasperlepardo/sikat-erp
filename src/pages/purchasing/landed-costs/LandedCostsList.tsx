import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableContent,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { lcNumber, lcTotals, listLandedCosts } from '../../../services/landedCosts';
import { useAsync } from '../../../services/useAsync';
import type { LcStatus } from '../../../mocks/landedCosts';
import { LC_STATUSES } from '../../../mocks/landedCosts';
import { LC_LIST_PATH, LC_STATUS_INTENT } from '../paths';

interface Row {
  id: string;
  docNum: number;
  number: string;
  vendorCode: string;
  vendorName: string;
  postingDate: string;
  reference: string;
  fileNo: string;
  currency: string;
  total: number;
  status: LcStatus;
  search: string;
}

export function LandedCostsList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => listLandedCosts(), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const all: Row[] | undefined = useMemo(() => {
    if (!data) return undefined;
    return data.map((r) => ({
      id: r.id,
      docNum: r.docNum,
      number: lcNumber(r),
      vendorCode: r.vendorCode,
      vendorName: r.vendorName,
      postingDate: r.postingDate,
      reference: r.reference,
      fileNo: r.fileNo,
      currency: r.currency,
      total: lcTotals(r.costs),
      status: r.status,
      search: [lcNumber(r), r.vendorCode, r.vendorName, r.reference, r.fileNo].join(' ').toLowerCase(),
    }));
  }, [data]);

  const fields = [
    textField<Row>('no', 'No.', (r) => r.number),
    textField<Row>('vendor', 'Vendor', (r) => r.vendorName),
    textField<Row>('vendorCode', 'Vendor code', (r) => r.vendorCode),
    textField<Row>('ref', 'Reference', (r) => r.reference),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    statusField<Row>(LC_STATUSES),
  ];

  const presets = useListPresets({
    list: 'landed-costs',
    fields,
    builtIns: statusViews('landed costs', LC_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: all,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(all ?? []).filter((r) => !q || r.search.includes(q));
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: Row): string | number =>
      sort.key === 'docNum' ? r.docNum : sort.key === 'total' ? r.total : String(r[sort.key as keyof Row] ?? '');
    return [...filtered].sort((a, b) => (value(a) < value(b) ? -1 : value(a) > value(b) ? 1 : 0) * dir);
  }, [all, presets.filter, query, sort]);

  const columns: TableColumn<Row>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (r) => (
        <TableContent href={`#${LC_LIST_PATH}/${r.docNum ? r.number : r.id}`} subcopy={r.reference || undefined}>
          {r.number}
        </TableContent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (r) => <TableContent subcopy={r.vendorCode}>{r.vendorName || '—'}</TableContent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'fileNo', header: 'File no.', cell: (r) => r.fileNo || '—' },
    { key: 'total', header: 'Total costs', sortable: true, cell: (r) => <span className="tabular-nums">{formatAmount(r.total)}</span> },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (r) => <TableStatus intent={LC_STATUS_INTENT[r.status]}>{r.status}</TableStatus>,
    },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search"
        searchPlaceholder="Search by no., vendor, reference or file no."
        searchValue={query}
        onSearchChange={(value) => { setQuery(value); resetPage(); }}
        icon="calculate"
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
            onClick={() => navigate(`${LC_LIST_PATH}/new`)}
          >
            New landed cost
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        {!all ? (
          <Text tone="muted" className="p-4">Loading…</Text>
        ) : all.length ? (
          <Table
            caption="Landed costs"
            columns={columns}
            rows={visible}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">
            No landed costs yet. Create one to allocate import costs (freight, customs, insurance) to received inventory.
          </Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
