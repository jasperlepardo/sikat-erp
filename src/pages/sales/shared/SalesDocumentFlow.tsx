import { TableContent, TableStatus, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { useAsync } from '../../../services/useAsync';
import { linkedSalesDocuments, type CoveredLine, type LinkedDocument, type SalesDocKind } from './salesDocumentLinks';

const RELATION_LABEL = { Base: '← Base', This: '● This document', Target: 'Target →' } as const;

const coversText = (lines: CoveredLine[]) =>
  lines.map((l) => `${l.quantity.toLocaleString('en-PH')} ${l.uomCode} ${l.description || l.itemNo}`).join(' · ');

export function SalesDocumentFlow({ kind, id, notes }: { kind: SalesDocKind; id: string; notes: string }) {
  const rows = useAsync(() => linkedSalesDocuments(kind, id), [kind, id]);

  const columns: TableColumn<LinkedDocument>[] = [
    {
      key: 'relation',
      header: 'Relation',
      cell: (d) => (
        <TableContent subcopy={d.via ? `via ${d.via}` : d.relation === 'Base' ? 'Copied from' : d.relation === 'Target' ? (d.kind === 'JE' ? 'Accounting entry' : 'Copied to') : undefined}>
          {RELATION_LABEL[d.relation]}
        </TableContent>
      ),
    },
    {
      key: 'number',
      header: 'Document',
      cell: (d) => (
        <TableContent subcopy={d.type}>
          {d.relation === 'This' ? d.number : <TableContent href={`/#${d.href}`}>{d.number}</TableContent>}
        </TableContent>
      ),
    },
    { key: 'date', header: 'Posting date', cell: (d) => formatDate(d.date) },
    { key: 'covers', header: 'What it covers', cell: (d) => coversText(d.covers) || d.note || coversText(d.items) || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (d) => `${d.currency} ${formatAmount(d.total)}` },
    { key: 'status', header: 'Status', cell: (d) => <TableStatus intent={d.intent}>{d.status}</TableStatus> },
  ];

  const linked = rows?.filter((d) => d.relation !== 'This').length ?? 0;
  return (
    <DataTable
      variant="card"
      noPagination
      icon="account_tree"
      title="Related documents"
      description={notes}
      rows={rows && linked ? rows : []}
      getRowId={(d) => `${d.kind}:${d.id}`}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      empty={
        <Text variant="small" tone="muted">
          {rows ? 'Not linked to any other document yet.' : 'Loading…'}
        </Text>
      }
    />
  );
}
