import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Badge, Button, Icon, Panel, PanelHeader, Table, TableContent, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { GRR_STATUSES, type GoodsReturnRequest } from '../../../mocks/goodsReturnRequests';
import { formatDate } from '../../../services/dates';
import { listGoodsReturnRequests, grrNumber } from '../../../services/goodsReturnRequests';
import { useAsync } from '../../../services/useAsync';
import { dateField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { GRR_LIST_PATH, GRR_STATUS_INTENT } from '../paths';

export function GoodsReturnRequestList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const requests = useAsync(listGoodsReturnRequests, []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const fields = [
    textField<GoodsReturnRequest>('no', 'No.', grrNumber),
    textField<GoodsReturnRequest>('vendor', 'Vendor', (r) => r.vendorName),
    dateField<GoodsReturnRequest>('postingDate', 'Posting date', (r) => r.postingDate),
    statusField<GoodsReturnRequest>(GRR_STATUSES),
  ];
  const presets = useListPresets({
    list: 'goods-return-requests',
    fields,
    builtIns: statusViews('return requests', GRR_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: requests,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(requests ?? []).filter((r) =>
      !q || [grrNumber(r), r.vendorName, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: GoodsReturnRequest): string | number =>
      sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof GoodsReturnRequest] ?? '');
    return [...filtered].sort((a, b) => { const x = value(a), y = value(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, presets.filter, query, sort]);

  const columns: TableColumn<GoodsReturnRequest>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableContent href={`#${GRR_LIST_PATH}/${r.docNum ? grrNumber(r) : r.id}`}>{grrNumber(r)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (r) => r.vendorName || '—' },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'requiredDate', header: 'Required by', cell: (r) => r.requiredDate ? formatDate(r.requiredDate) : '—' },
    { key: 'lines', header: 'Lines', cell: (r) => <TableContent subcopy={`${r.lines.filter((l) => l.status === 'Open').length} open`}>{r.lines.length}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <Badge size="small" intent={GRR_STATUS_INTENT[r.status]}>{r.status}</Badge> },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search return requests"
        searchPlaceholder="Search by no., vendor or item"
        searchValue={query}
        onSearchChange={(v) => { setQuery(v); resetPage(); }}
        icon="assignment_return"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${GRR_LIST_PATH}/new`)}>
            New request
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        {requests ? (
          <Table caption="Goods return requests" columns={columns} rows={visible} getRowId={(r) => r.id} sort={sort} onSortChange={setSort} layout="fill" pagination={pagination} />
        ) : (
          <Text tone="muted" className="p-4">Loading goods return requests…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
