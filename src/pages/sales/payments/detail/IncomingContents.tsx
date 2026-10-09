import { Button, Checkbox, Combobox, Icon, Link, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { projectLabel } from '../../../../services/partnerMasters';
import { useNavigate } from 'react-router';
import { DataTable } from '../../../../components/form/DataTable';
import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import { newIncomingAccountRow, type IncomingAccountRow, type IncomingRow } from '../../../../mocks/incomingPayments';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { allocateInSequence, amountDue, overdueDays, rowDiscount, type IncomingInput } from '../../../../services/incomingPayments';

const num = (v: string) => (v === '' ? 0 : Number(v));

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  errors: Errors;
  accounts: Account[];
  fx: number;
  readOnly: boolean;
}

/** Contents for a Customer payment: the open invoices to tick, payment on account and Add in Sequence. */
export function IncomingDocuments({ draft, update, errors, fx, readOnly }: Props) {
  const navigate = useNavigate();
  const rows = draft.rows;
  const code = draft.currency;
  const patch = (id: string, p: Partial<IncomingRow>) => update({ rows: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const due = amountDue(draft);
  const sequenceTotal = rows.filter((r) => r.selected).reduce((n, r) => n + r.amount, 0);

  const columns: TableColumn<IncomingRow>[] = [
    {
      key: 'pick',
      header: '',
      cell: (r) => (
        <Checkbox aria-label={`Pay ${r.docNo}`} disabled={readOnly || r.blocked || draft.addInSequence} checked={r.selected} onChange={(e) => patch(r.id, { selected: e.currentTarget.checked, amount: r.amount || r.balanceDue })} />
      ),
    },
    {
      key: 'docNo',
      header: 'Document No.',
      cell: (r) => (
        <div className="flex flex-col">
          <Link intent="primary" onClick={() => navigate(`/sales/invoices/${r.invoiceId}`)}>{r.docNo}</Link>
          <Text variant="small" tone="muted">IN · A/R invoice</Text>
        </div>
      ),
    },
    { key: 'installment', header: 'Installment', cell: (r) => (r.installment ? `${r.installment} of ${r.installments}` : '—') },
    { key: 'date', header: 'Date', cell: (r) => formatDate(r.docDate) },
    {
      key: 'overdue',
      header: 'Overdue days',
      cell: (r) => {
        const d = overdueDays(r, draft.postingDate);
        return (
          <Text variant="small" tone={d > 0 ? 'danger' : 'default'}>
            {d > 0 ? '* ' : ''}
            {d}
          </Text>
        );
      },
    },
    { key: 'total', header: 'Total', cell: (r) => <span className="tabular-nums">{formatAmount(r.total)}</span> },
    { key: 'wt', header: 'WT amount', cell: (r) => <span className="tabular-nums">{r.wtAmount ? formatAmount(r.wtAmount) : '—'}</span> },
    { key: 'balance', header: 'Balance due', cell: (r) => <span className="tabular-nums">{formatAmount(r.balanceDue)}</span> },
    { key: 'blocked', header: 'Blocked', cell: (r) => (r.blocked ? <Text variant="small" tone="danger">* Payment block</Text> : '') },
    {
      key: 'discount',
      header: 'Cash disc. %',
      cell: (r) => (
        <div className="flex w-24 flex-col">
          <TextField aria-label={`Cash discount % for ${r.docNo}`} type="number" min={0} suffix="%" readOnly={readOnly || !r.selected} value={String(r.cashDiscountPct)} onChange={(e) => patch(r.id, { cashDiscountPct: Math.min(100, num(e.currentTarget.value)) })} />
          {rowDiscount(r) ? <Text variant="small" tone="muted">{formatAmount(rowDiscount(r))}</Text> : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Total payment',
      cell: (r) => (
        <TextField
          aria-label={`Total payment for ${r.docNo}`}
          type="number"
          min={0}
          className="w-36"
          prefix={code}
          readOnly={readOnly || !r.selected || draft.addInSequence}
          invalid={Boolean(errors[`row:${r.id}`])}
          value={String(r.amount)}
          onChange={(e) => patch(r.id, { amount: num(e.currentTarget.value) })}
        />
      ),
    },
    { key: 'project', header: 'Project', cell: (r) => (r.projectId ? projectLabel(r.projectId) : '—') },
  ];

  return (
    <DataTable
      variant="card"
      noPagination
      icon="request_quote"
      title="Contents"
      description={errors.rows ?? `The customer's open A/R invoices in ${code}. Tick what's being paid; change Total Payment to pay part of one. Overdue rows are marked *.`}
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      empty={<Text variant="small" tone="muted">{draft.customerId ? `No open invoices in ${code} — record it as a payment on account.` : 'Pick a customer to list its open invoices.'}</Text>}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-end gap-2">
          <Checkbox disabled={readOnly} checked={draft.onAccount > 0 || Boolean(errors.onAccount)} onChange={(e) => update({ onAccount: e.currentTarget.checked ? Math.max(0.01, draft.onAccount) : 0 })}>
            Payment on account
          </Checkbox>
          {draft.onAccount > 0 ? (
            <TextField aria-label="Payment on account" type="number" min={0} className="w-40" prefix={code} readOnly={readOnly} value={String(draft.onAccount)} onChange={(e) => update({ onAccount: num(e.currentTarget.value) })} />
          ) : null}
        </div>
        <div className="flex items-end gap-2">
          <Checkbox
            disabled={readOnly || !rows.length}
            checked={draft.addInSequence}
            onChange={(e) => update({ addInSequence: e.currentTarget.checked, rows: e.currentTarget.checked ? allocateInSequence(rows, sequenceTotal || rows.reduce((n, r) => n + r.balanceDue, 0)) : rows })}
          >
            Add in sequence
          </Checkbox>
          {draft.addInSequence ? (
            <TextField aria-label="Amount to spread in sequence" type="number" min={0} className="w-40" prefix={code} readOnly={readOnly} value={String(Math.round(sequenceTotal * 100) / 100)} onChange={(e) => update({ rows: allocateInSequence(rows, num(e.currentTarget.value)) })} />
          ) : null}
        </div>
        <Text variant="small" tone="muted">
          Total amount due: {code} {formatAmount(due)}
          {code !== 'PHP' && fx ? ` · PHP ${formatAmount(due * fx)}` : ''}
        </Text>
      </div>
    </DataTable>
  );
}

/** Contents for an Account payment: G/L lines with Doc. Remarks. */
export function IncomingAccounts({ draft, update, errors, accounts, readOnly }: Props) {
  const rows = draft.accountRows;
  const patch = (id: string, p: Partial<IncomingAccountRow>) => update({ accountRows: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const postable = accounts.filter((a) => !a.title && a.active && !a.control).map((a) => ({ value: a.code, label: `${a.code} ${a.name}`, text: `${a.code} ${a.name}` }));
  const columns: TableColumn<IncomingAccountRow>[] = [
    { key: 'account', header: 'G/L account', cell: (r) => <div className="w-72"><Combobox aria-label="G/L account" disabled={readOnly} invalid={Boolean(errors[`acct:${r.id}`])} options={postable} value={r.account || null} onValueChange={(v) => patch(r.id, { account: v ?? '' })} /></div> },
    { key: 'remarks', header: 'Doc. remarks', cell: (r) => <TextField aria-label="Doc. remarks" className="w-72" readOnly={readOnly} value={r.remarks} onChange={(e) => patch(r.id, { remarks: e.currentTarget.value })} /> },
    { key: 'amount', header: 'Amount', cell: (r) => <TextField aria-label="Amount" type="number" min={0} className="w-40" prefix={draft.currency} readOnly={readOnly} value={String(r.amount)} onChange={(e) => patch(r.id, { amount: num(e.currentTarget.value) })} /> },
  ];
  return (
    <DataTable
      variant="card"
      noPagination
      icon="account_balance"
      title="Accounts"
      description={errors.rows ?? 'Money received with no business partner: each line credits its G/L account.'}
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      onRemove={readOnly ? undefined : (picked) => update({ accountRows: rows.filter((r) => !picked.includes(r)) })}
      actions={
        readOnly ? null : (
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ accountRows: [...rows, newIncomingAccountRow()] })}>
            Add line
          </Button>
        )
      }
      empty={<Text variant="small" tone="muted">Add the accounts the money goes to.</Text>}
    />
  );
}
