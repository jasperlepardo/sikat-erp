import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { LC_STATUSES } from '../../../mocks/landedCosts';
import type { LcStatus } from '../../../mocks/landedCosts';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { lcNumber, lcTotals, listLandedCosts } from '../../../services/landedCosts';
import { useAsync } from '../../../services/useAsync';
import { dateField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { LC_LIST_PATH, LC_NOUN, LC_STATUS_INTENT } from '../paths';

interface Row {
  id: string; docNum: number; number: string; vendorId: string; vendorCode: string; vendorName: string;
  postingDate: string; reference: string; fileNo: string; currency: string; total: number; status: LcStatus; search: string;
}

export function LandedCostsList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(listLandedCosts, []);

  const all: Row[] | undefined = useMemo(() => {
    if (!data) return undefined;
    return data.map((r) => ({
      id: r.id, docNum: r.docNum, number: lcNumber(r), vendorId: r.vendorId, vendorCode: r.vendorCode,
      vendorName: r.vendorName, postingDate: r.postingDate, reference: r.reference, fileNo: r.fileNo,
      currency: r.currency, total: lcTotals(r.costs), status: r.status,
      search: [lcNumber(r), r.vendorCode, r.vendorName, r.reference, r.fileNo].join(' ').toLowerCase(),
    }));
  }, [data]);

  const fields = [
    textField<Row>('no', 'No.', (r) => r.number),
    partnerField<Row>('vendor', 'Vendor', (r) => r.vendorId, (r) => r.vendorName, all),
    textField<Row>('vendorCode', 'Vendor code', (r) => r.vendorCode),
    textField<Row>('ref', 'Reference', (r) => r.reference),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    statusField<Row>(scopeStatuses(draftsOnly, LC_STATUSES)),
  ];

  const columns: TableColumn<Row>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableContent href={`#${LC_LIST_PATH}/${r.docNum ? r.number : r.id}`} subcopy={r.reference || undefined}>{r.number}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (r) => <TableContent subcopy={r.vendorCode}>{r.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'fileNo', header: 'File no.', cell: (r) => r.fileNo || '—' },
    { key: 'total', header: 'Total costs', sortable: true, cell: (r) => <span className="tabular-nums">{formatAmount(r.total)}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={LC_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={all}
      columns={columns}
      fields={fields}
      noun={LC_NOUN}
      icon="calculate"
      basePath={LC_LIST_PATH}
      listKey="landed-costs"
      builtIns={draftSplit(draftsOnly, LC_NOUN.many, LC_STATUSES)}
      scope={draftScope(draftsOnly, LC_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, reference or file no.', label: 'Search' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage="No landed costs yet. Create one to allocate import costs (freight, customs, insurance) to received inventory."
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? r.number : r.id}
      filterFn={(r, q) => !q || r.search.includes(q)}
      sortFn={(a, b, sort) => {
        const value = (r: Row): string | number =>
          sort.key === 'docNum' ? r.docNum : sort.key === 'total' ? r.total : String(r[sort.key as keyof Row] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
