import { useNavigate } from 'react-router';
import { TableAmount, TableLink, TableStatus, TableSubcontent, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { useAsync } from '../../../services/useAsync';
import { linkedDocuments, type CoveredLine, type DocKind, type LinkedDocument } from './documentLinks';

const RELATION_LABEL = { Base: '← Base', This: '● This document', Target: 'Target →' } as const;

/** "7 pc IPH-18P-256-BLK · 30 pc ACC-CASE-18P" for the lines a link covers. */
const coversText = (lines: CoveredLine[]) => lines.map((l) => `${l.quantity.toLocaleString('en-PH')} ${l.uomCode} ${l.itemNo}`).join(' · ');

/**
 * A document's Transactions view — SAP's relationship map as one list. Every document linked to
 * this one by copy-from / copy-to, however far back or forward, in chain order: its bases, this
 * document, then its targets.
 */
export function DocumentFlow({ kind, id, notes }: { kind: DocKind; id: string; notes: string }) {
  const navigate = useNavigate();
  const rows = useAsync(() => linkedDocuments(kind, id), [kind, id]);

  const columns: TableColumn<LinkedDocument>[] = [
    {
      key: 'relation',
      header: 'Relation',
      cell: (d) => (
        <TableSubcontent subcopy={d.via ? `via ${d.via}` : d.relation === 'Base' ? 'Copied from' : d.relation === 'Target' ? 'Copied to' : undefined}>
          {RELATION_LABEL[d.relation]}
        </TableSubcontent>
      ),
    },
    {
      key: 'number',
      header: 'Document',
      cell: (d) => (
        <TableSubcontent subcopy={d.type}>
          {d.relation === 'This' ? d.number : <TableLink onClick={() => navigate(d.href)}>{d.number}</TableLink>}
        </TableSubcontent>
      ),
    },
    { key: 'date', header: 'Posting date', cell: (d) => formatDate(d.date) },
    { key: 'covers', header: 'What it covers', cell: (d) => coversText(d.covers) || d.note || '—' },
    { key: 'total', header: 'Total', cell: (d) => <TableAmount currency={d.currency}>{formatAmount(d.total)}</TableAmount> },
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
      onRowAction={(d) => d.relation !== 'This' && navigate(d.href)}
      empty={
        <Text variant="small" tone="muted">
          {rows ? 'Not linked to any other document yet.' : 'Loading…'}
        </Text>
      }
    />
  );
}
