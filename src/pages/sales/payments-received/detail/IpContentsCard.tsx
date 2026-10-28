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
import { AR_LIST_PATH } from '../../paths';

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
      header: 'Document',
      cell: (r) => (
        <div className="flex flex-col whitespace-nowrap">
          <Link intent="primary" onClick={() => navigate(`${AR_LIST_PATH}/${r.invoiceId}`)}>{r.docNo}</Link>
          <Text variant="small" tone="muted">
            A/R invoice{r.installment ? ` · installment ${r.installment} of ${r.installments}` : ''}{r.projectId ? ` · ${projectLabel(r.projectId)}` : ''}
          </Text>
          {r.blocked ? <Text variant="small" tone="danger">Payment block</Text> : null}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      align: 'end',
      cell: (r) => {
        const d = overdueDays(r, draft.postingDate);
        return (
          <div className="flex flex-col items-end whitespace-nowrap">
            <Text variant="small">{formatDate(r.docDate)}</Text>
            {d > 0 ? <Text variant="small" tone="danger">{d} {d === 1 ? 'day' : 'days'} overdue</Text> : null}
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'end',
      cell: (r) => (
        <div className="flex flex-col items-end whitespace-nowrap tabular-nums">
          <Text variant="small">{formatAmount(r.total)}</Text>
          {r.wtAmount ? <Text variant="small" tone="muted">WT {formatAmount(r.wtAmount)}</Text> : null}
        </div>
      ),
    },
    { key: 'balance', header: 'Balance due', align: 'end', cell: (r) => <Text variant="small" className="whitespace-nowrap tabular-nums">{formatAmount(r.balanceDue)}</Text> },
    {
      key: 'discount',
      header: 'Cash disc.',
      align: 'end',
      cell: (r) =>
        readOnly ? (
          <Text variant="small" className="whitespace-nowrap tabular-nums">{r.cashDiscountPct ? `${r.cashDiscountPct}% · ${formatAmount(rowDiscount(r))}` : '—'}</Text>
        ) : (
          <div className="flex w-24 flex-col">
            <TextField aria-label={`Cash discount % for ${r.docNo}`} type="number" min={0} suffix="%" readOnly={!r.selected} value={String(r.cashDiscountPct)} onChange={(e) => patch(r.id, { cashDiscountPct: Math.min(100, num(e.currentTarget.value)) })} />
            {rowDiscount(r) ? <Text variant="small" tone="muted">{formatAmount(rowDiscount(r))}</Text> : null}
          </div>
        ),
    },
    {
      key: 'amount',
      header: 'Total payment',
      align: 'end',
      cell: (r) =>
        readOnly ? (
          <Text variant="small" className="whitespace-nowrap tabular-nums">{r.selected ? `${code} ${formatAmount(r.amount)}` : '—'}</Text>
        ) : (
          <TextField
            aria-label={`Total payment for ${r.docNo}`}
            type="number"
            min={0}
            className="w-36"
            prefix={code}
            readOnly={!r.selected || draft.addInSequence}
            invalid={Boolean(errors[`row:${r.id}`])}
            value={String(r.amount)}
            onChange={(e) => patch(r.id, { amount: num(e.currentTarget.value) })}
          />
        ),
    },
  ];

  return (
    <DataTable
      noPagination
      icon="request_quote"
      title="Contents"
      description={errors.rows ?? `The customer's open A/R invoices in ${code}. Tick what's being paid; change Total payment to pay part of one.`}
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
  const postable = (current: string) => accounts.filter((a) => !a.title && !a.control && (a.active || a.code === current)).map((a) => ({ value: a.code, label: `${a.code} ${a.name}`, text: `${a.code} ${a.name}` }));
  const columns: TableColumn<IncomingAccountRow>[] = [
    { key: 'account', header: 'G/L account', cell: (r) => <div className="w-72"><Combobox aria-label="G/L account" disabled={readOnly} invalid={Boolean(errors[`acct:${r.id}`])} options={postable(r.account)} value={r.account || null} onValueChange={(v) => patch(r.id, { account: v ?? '' })} /></div> },
    { key: 'remarks', header: 'Doc. remarks', cell: (r) => <TextField aria-label="Doc. remarks" className="w-72" readOnly={readOnly} value={r.remarks} onChange={(e) => patch(r.id, { remarks: e.currentTarget.value })} /> },
    { key: 'amount', header: 'Amount', cell: (r) => <TextField aria-label="Amount" type="number" min={0} className="w-40" prefix={draft.currency} readOnly={readOnly} value={String(r.amount)} onChange={(e) => patch(r.id, { amount: num(e.currentTarget.value) })} /> },
  ];
  return (
    <DataTable
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
