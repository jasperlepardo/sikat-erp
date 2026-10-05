import { Button, Checkbox, Icon, Link, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../../components/form/AccountField';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { Fields, Flags, Section } from '../../../../components/form/fields';
import { newAccountRow, type AccountRow, type PaymentRow } from '../../../../mocks/outgoingPayments';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { overallAmount, rowDiscount, rowFxDifference } from '../../../../services/outgoingPayments';
import { projectDef } from '../../../settings/masterDefs';
import { AP_LIST_PATH } from '../../invoices/detail/ApInvoiceDetail';
import { overdueDays, type PaySectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Vendor payments: the vendor's open invoices, ticked and paid in full or in part, plus any amount on account. */
export function VendorRows({ draft, update, errors, m, fx, readOnly }: PaySectionProps) {
  const rows = draft.rows;
  const blocked = (r: PaymentRow) => Boolean(m.invoices.find((i) => i.id === r.invoiceId)?.paymentBlock);
  const patch = (id: string, p: Partial<PaymentRow>) => update({ rows: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const code = draft.currency;
  const foreign = code !== 'PHP';

  const columns: TableColumn<PaymentRow>[] = [
    {
      key: 'selected',
      header: '',
      cell: (r) => (
        <Checkbox
          aria-label={`Pay ${r.docNo}`}
          checked={r.selected}
          disabled={readOnly || blocked(r)}
          onChange={(e) => patch(r.id, { selected: e.currentTarget.checked, amount: e.currentTarget.checked ? r.balanceDue : 0 })}
        />
      ),
    },
    {
      key: 'docNo',
      header: 'Document',
      cell: (r) => (
        <div className="flex flex-col">
          <Link intent="primary" href={`#${AP_LIST_PATH}/${r.invoiceId}`}>
            {r.docNo}
            {overdueDays(r.dueDate, draft.postingDate) > 0 ? ' *' : ''}
          </Link>
          <Text variant="small" tone="muted">
            A/P invoice{r.vendorRef ? ` · ${r.vendorRef}` : ''}
            {blocked(r) ? ' · Blocked *' : ''}
          </Text>
        </div>
      ),
    },
    { key: 'docDate', header: 'Date', cell: (r) => formatDate(r.docDate) },
    {
      key: 'overdue',
      header: 'Overdue days',
      cell: (r) => {
        const days = overdueDays(r.dueDate, draft.postingDate);
        return <Text variant="small" tone={days > 0 ? 'danger' : 'default'}>{days}</Text>;
      },
    },
    { key: 'total', header: 'Total', cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatAmount(r.total)}</span> },
    { key: 'wtAmount', header: 'WT amount', cell: (r) => <span className="tabular-nums">{formatAmount(r.wtAmount)}</span> },
    { key: 'balanceDue', header: 'Balance due', cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatAmount(r.balanceDue)}</span> },
    {
      key: 'cashDiscountPct',
      header: 'Cash discount %',
      cell: (r) => (
        <TextField
          aria-label={`Cash discount % on ${r.docNo}`}
          type="number"
          min={0}
          max={100}
          suffix="%"
          className="w-24"
          disabled={!r.selected}
          value={String(r.cashDiscountPct)}
          // Taking a discount lowers what's paid, so the row still settles the balance.
          onChange={(e) => {
            const cashDiscountPct = Math.min(100, num(e.currentTarget.value));
            patch(r.id, { cashDiscountPct, amount: round2(r.balanceDue / (1 + cashDiscountPct / 100)) });
          }}
        />
      ),
    },
    {
      key: 'amount',
      header: `Total payment (${code})`,
      cell: (r) => (
        <div className="flex w-40 flex-col gap-1">
          <TextField
            aria-label={`Total payment on ${r.docNo}`}
            type="number"
            min={0}
            className="w-40"
            disabled={!r.selected}
            invalid={Boolean(errors[`row:${r.id}`])}
            value={String(r.amount)}
            onChange={(e) => patch(r.id, { amount: round2(num(e.currentTarget.value)) })}
          />
          {r.selected && rowDiscount(r) ? <Text variant="small" tone="muted">+ {formatAmount(rowDiscount(r))} discount</Text> : null}
          {r.selected && foreign && fx ? (
            <Text variant="small" tone="muted">
              Booked at {r.invoiceFx}; {rowFxDifference(r, fx) > 0 ? 'loss' : rowFxDifference(r, fx) < 0 ? 'gain' : 'no difference'}
              {rowFxDifference(r, fx) ? ` PHP ${formatAmount(Math.abs(rowFxDifference(r, fx)))}` : ''}
            </Text>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        variant="card"
        noPagination
        icon="receipt_long"
        title="Open documents"
        description={
          errors.rows ??
          `${draft.payeeName ? `${draft.payeeName}'s` : "The vendor's"} open A/P invoices in ${code}, oldest due first. Tick what this payment settles; lower Total payment to pay part. * = overdue or blocked.`
        }
        rows={rows}
        getRowId={(r) => r.id}
        columns={columns}
        unsortable={columns.map((c) => c.key)}
        empty={<Text variant="small" tone="muted">{draft.vendorId ? `No open A/P invoices in ${code}. Pay on account, or pick another currency.` : 'Pick a vendor to see its open invoices.'}</Text>}
      />
      <Section icon="account_balance_wallet" title="Payment on account">
        <Fields>
          <TextField
            aria-label="Amount on account"
            type="number"
            min={0}
            prefix={code}
            disabled={readOnly || !draft.vendorId}
            value={String(draft.onAccount)}
            onChange={(e) => update({ onAccount: round2(num(e.currentTarget.value)) })}
          />
          <AccountField
            label="Control account"
            role="payable"
            value={draft.controlAccount}
            onChange={(controlAccount) => update({ controlAccount })}
            accounts={m.accounts}
            disabled={readOnly}
            hint="Takes the amount on account. Defaults to the vendor's payable account."
          />
        </Fields>
        <Flags>
          <Checkbox checked={draft.proForma} disabled={readOnly} onChange={(e) => update({ proForma: e.currentTarget.checked })}>
            Pro forma — this is a down payment (advance) to the vendor
          </Checkbox>
        </Flags>
        <Text variant="small" tone="muted">
          Paid without matching an invoice — for example an advance. It sits on the vendor's account until an invoice is matched to it.
        </Text>
      </Section>
      <Text variant="small" tone="muted" className="px-1">
        Overall amount: {code} {formatAmount(overallAmount(draft))}
      </Text>
    </div>
  );
}

/** Account payments: G/L lines, each with its amount and project. */
export function AccountRows({ draft, update, errors, m, readOnly }: PaySectionProps) {
  const rows = draft.accountRows;
  const patch = (id: string, p: Partial<AccountRow>) => update({ accountRows: rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const columns: TableColumn<AccountRow>[] = [
    {
      key: 'account',
      header: 'G/L account',
      cell: (r) => (
        <div className="w-72">
          <AccountField
            label=""
            role="general"
            value={r.account}
            onChange={(account) => patch(r.id, { account })}
            accounts={m.accounts.filter((a) => a.currency === draft.currency || a.currency === 'All currencies' || draft.currency === 'PHP')}
            error={errors[`acct:${r.id}`]}
            disabled={readOnly}
          />
        </div>
      ),
    },
    { key: 'remarks', header: 'Doc. remarks', cell: (r) => <TextField aria-label="Doc. remarks" className="w-56" value={r.remarks} onChange={(e) => patch(r.id, { remarks: e.currentTarget.value })} /> },
    { key: 'project', header: 'Project', cell: (r) => <MasterLookup def={projectDef} fieldProps={{ 'aria-label': 'Project', className: 'w-48' }} clearable value={r.project} onChange={(project) => patch(r.id, { project })} /> },
    {
      key: 'amount',
      header: `Amount (${draft.currency})`,
      cell: (r) => (
        <TextField aria-label="Amount" type="number" min={0} className="w-36" invalid={Boolean(errors[`acct:${r.id}`])} value={String(r.amount)} onChange={(e) => patch(r.id, { amount: round2(num(e.currentTarget.value)) })} />
      ),
    },
  ];
  return (
    <DataTable
      variant="card"
      noPagination
      icon="account_tree"
      title="Accounts"
      description={errors.accountRows ?? 'Pay straight to G/L accounts — no business partner. Split one payment across accounts and projects, e.g. a utility bill shared by stores.'}
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      onRemove={readOnly ? undefined : (picked) => update({ accountRows: rows.filter((r) => !picked.includes(r)) })}
      actions={
        readOnly ? null : (
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ accountRows: [...rows, newAccountRow({ project: draft.project })] })}>
            Add account
          </Button>
        )
      }
      empty={<Text variant="small" tone="muted">Add the accounts this payment goes to.</Text>}
    />
  );
}
