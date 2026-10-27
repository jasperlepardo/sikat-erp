import { Button, Checkbox, Combobox, DatePicker, Icon, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { houseBankFor } from '../../../../services/partnerMasters';
import { newCardRow, newCheckRow, type CardRow, type CheckRow, type PaymentMeans } from '../../../../mocks/outgoingPayments';
import { formatAmount } from '../../../../services/format';
import { meansBalance, meansTotal, overallAmount } from '../../../../services/outgoingPayments';
import { cardBrandDef } from '../../../settings/masterDefs';
import { activeOptions } from '../../../../services/inventoryMasters';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { round2 } from '../../../../services/num';
import type { PaySectionProps } from './types';

type MeansRow =
  | { id: 'transfer'; kind: 'transfer'; account: string; date: string; reference: string; amount: number }
  | { id: 'cash'; kind: 'cash'; account: string; amount: number }
  | (CheckRow & { kind: 'check' })
  | (CardRow & { kind: 'card' });

const METHOD_LABEL: Record<string, string> = { transfer: 'Bank transfer', cash: 'Cash', check: 'Check', card: 'Credit card' };
const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Payment Means: how the money goes out. One row per method in a single table; each credits its
 * account, and together they must cover the overall amount plus any bank charge.
 */
export function PayMeansCard({ draft, update, m, readOnly }: PaySectionProps) {
  const means = draft.means;
  const set = (patch: Partial<PaymentMeans>) => update({ means: { ...means, ...patch } });
  const code = draft.currency;
  const balance = meansBalance(draft);
  const fill = (current: number) => round2(current + Math.max(0, balance));

  // Bank / cash / card accounts in the payment currency (peso accounts can pay any currency).
  const banks = m.accounts.filter((a) => a.cash && houseBankFor(a.code) && (a.currency === 'PHP' || a.currency === code));
  const cashAccounts = m.accounts.filter((a) => a.cash && !houseBankFor(a.code) && (a.currency === 'PHP' || a.currency === code));

  const patchCheck = (id: string, p: Partial<CheckRow>) => set({ checks: means.checks.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const patchCard = (id: string, p: Partial<CardRow>) => set({ cards: means.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const rows: MeansRow[] = [
    ...(means.transfer.amount > 0 ? [{ id: 'transfer' as const, kind: 'transfer' as const, ...means.transfer }] : []),
    ...(means.cash.amount > 0 ? [{ id: 'cash' as const, kind: 'cash' as const, ...means.cash }] : []),
    ...means.checks.map((c) => ({ ...c, kind: 'check' as const })),
    ...means.cards.map((c) => ({ ...c, kind: 'card' as const })),
  ];

  const baseColumns: TableColumn<MeansRow>[] = [
    { key: 'kind', header: 'Method', cell: (r) => <Text variant="small">{METHOD_LABEL[r.kind]}</Text> },
    {
      key: 'account',
      header: 'Account / Details',
      cell: (r) => {
        if (r.kind === 'transfer') {
          const bank = houseBankFor(r.account);
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                <Text variant="small">{r.account ? accountText(r.account, m.accounts) : '—'}</Text>
                {bank && <Text variant="small" tone="muted">{bank.branch} · {bank.accountNo}</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <Combobox aria-label="Bank account" className="w-64" options={activeOptions(banks, (a) => a.code, (a) => `${a.code} ${a.name}`, r.account)} value={r.account || null} onValueChange={(v) => set({ transfer: { ...means.transfer, account: v ?? '' } })} />
              {bank && <Text variant="small" tone="muted">{bank.branch} · {bank.accountNo}</Text>}
            </div>
          );
        }
        if (r.kind === 'cash') {
          if (readOnly) return <Text variant="small">{r.account ? accountText(r.account, m.accounts) : '—'}</Text>;
          return <Combobox aria-label="Cash account" className="w-64" options={activeOptions(cashAccounts, (a) => a.code, (a) => `${a.code} ${a.name}`, r.account)} value={r.account || null} onValueChange={(v) => set({ cash: { ...means.cash, account: v ?? '' } })} />;
        }
        if (r.kind === 'check') {
          const bank = houseBankFor(r.account);
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                <Text variant="small">{r.account ? accountText(r.account, m.accounts) : '—'}</Text>
                {bank && <Text variant="small" tone="muted">{bank.branch} · {bank.accountNo}</Text>}
                {(r.manual || r.checkNo) ? <Text variant="small" tone="muted">Check no. {r.checkNo || '—'}</Text> : <Text variant="small" tone="muted">Numbered when added</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <Combobox aria-label="House bank account" className="w-64" options={activeOptions(banks, (a) => a.code, (a) => `${a.code} ${a.name}`, r.account)} value={r.account || null} onValueChange={(v) => patchCheck(r.id, { account: v ?? '' })} />
              {bank && <Text variant="small" tone="muted">{bank.branch} · {bank.accountNo}</Text>}
              <Checkbox checked={r.manual} onChange={(e) => patchCheck(r.id, { manual: e.currentTarget.checked, checkNo: 0 })}>Manual check</Checkbox>
              {r.manual || r.checkNo ? (
                <TextField aria-label="Check no." type="number" className="w-32" readOnly={!r.manual} value={r.checkNo ? String(r.checkNo) : ''} onChange={(e) => patchCheck(r.id, { checkNo: num(e.currentTarget.value) })} />
              ) : (
                <Text variant="small" tone="muted">Numbered when added</Text>
              )}
            </div>
          );
        }
        // card
        if (readOnly) {
          return (
            <div className="flex flex-col gap-0.5">
              <Text variant="small">{r.account ? accountText(r.account, m.accounts) : '—'}</Text>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-1">
            <MasterLookup def={cardBrandDef} fieldProps={{ 'aria-label': 'Credit card', className: 'w-40' }} value={r.cardBrandId} onChange={(card) => patchCard(r.id, { cardBrandId: card })} />
            <Combobox aria-label="G/L account" className="w-64" options={activeOptions(m.accounts, (a) => a.code, (a) => `${a.code} ${a.name}`, r.account)} value={r.account || null} onValueChange={(v) => patchCard(r.id, { account: v ?? '' })} />
          </div>
        );
      },
    },
    {
      key: 'details',
      header: 'Date / Reference',
      cell: (r) => {
        if (r.kind === 'transfer') {
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                {r.date && <Text variant="small">{r.date}</Text>}
                {r.reference && <Text variant="small" tone="muted">{r.reference}</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <DatePicker aria-label="Transfer date" value={r.date || null} onValueChange={(v) => set({ transfer: { ...means.transfer, date: v ?? '' } })} />
              <TextField aria-label="Transfer reference" className="w-48" placeholder="Reference, e.g. InstaPay ref. no." value={r.reference} onChange={(e) => set({ transfer: { ...means.transfer, reference: e.currentTarget.value } })} />
            </div>
          );
        }
        if (r.kind === 'check') {
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                {r.dueDate && <Text variant="small">{r.dueDate}</Text>}
                {r.endorsable && <Text variant="small" tone="muted">Endorsable</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <DatePicker aria-label="Check due date" className="w-fit" value={r.dueDate || null} onValueChange={(v) => patchCheck(r.id, { dueDate: v ?? '' })} />
              <Checkbox checked={r.endorsable} onChange={(e) => patchCheck(r.id, { endorsable: e.currentTarget.checked })}>Endorsable</Checkbox>
            </div>
          );
        }
        if (r.kind === 'card') {
          if (readOnly) return <Text variant="small">{r.voucherNo || '—'}{r.payments > 1 ? ` · ${r.payments} payments` : ''}</Text>;
          return (
            <div className="flex flex-col gap-1">
              <TextField aria-label="Voucher no." className="w-36" placeholder="Voucher no." value={r.voucherNo} onChange={(e) => patchCard(r.id, { voucherNo: e.currentTarget.value })} />
              <TextField aria-label="No. of payments" type="number" min={1} className="w-28" value={String(r.payments)} onChange={(e) => patchCard(r.id, { payments: Math.max(1, num(e.currentTarget.value)) })} />
            </div>
          );
        }
        return null;
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      cell: (r) => {
        if (readOnly) return <Text variant="small" className="tabular-nums">{code} {formatAmount(r.amount)}</Text>;
        if (r.kind === 'transfer') {
          return (
            <div className="flex flex-col items-end gap-1">
              <TextField aria-label="Transfer amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => set({ transfer: { ...means.transfer, amount: round2(num(e.currentTarget.value)) } })} />
              {balance > 0 && <Button type="button" size="small" variant="ghost" onClick={() => set({ transfer: { ...means.transfer, amount: fill(r.amount) } })}>Pay balance ({code} {formatAmount(balance)})</Button>}
            </div>
          );
        }
        if (r.kind === 'cash') {
          return (
            <div className="flex flex-col items-end gap-1">
              <TextField aria-label="Cash amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => set({ cash: { ...means.cash, amount: round2(num(e.currentTarget.value)) } })} />
              {balance > 0 && <Button type="button" size="small" variant="ghost" onClick={() => set({ cash: { ...means.cash, amount: fill(r.amount) } })}>Pay balance ({code} {formatAmount(balance)})</Button>}
            </div>
          );
        }
        if (r.kind === 'check') return <TextField aria-label="Check amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => patchCheck(r.id, { amount: round2(num(e.currentTarget.value)) })} />;
        return <TextField aria-label="Card amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => patchCard(r.id, { amount: round2(num(e.currentTarget.value)) })} />;
      },
    },
  ];

  const removeColumn: TableColumn<MeansRow> = {
    key: '_remove',
    header: '',
    cell: (r) => (
      <Button
        type="button"
        intent="danger"
        variant="link"
        size="small"
        onClick={() => {
          if (r.kind === 'transfer') set({ transfer: { account: '', date: '', reference: '', amount: 0 } });
          else if (r.kind === 'cash') set({ cash: { account: '', amount: 0 } });
          else if (r.kind === 'check') set({ checks: means.checks.filter((c) => c.id !== r.id) });
          else set({ cards: means.cards.filter((c) => c.id !== r.id) });
        }}
      >
        <Icon size={16}>delete</Icon>
      </Button>
    ),
  };

  const columns = readOnly ? baseColumns : [...baseColumns, removeColumn];

  const footer = (
    <div className="flex flex-col gap-1 px-2 py-1">
      <div className="flex items-center justify-between gap-4">
        <Text variant="small" tone="muted">Overall amount</Text>
        <Text variant="small" className="tabular-nums">{code} {formatAmount(overallAmount(draft))}</Text>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Text variant="small" tone="muted">Bank charge</Text>
        {readOnly ? (
          <Text variant="small" className="tabular-nums">{code} {formatAmount(means.bankCharge)}</Text>
        ) : (
          <TextField aria-label="Bank charge" type="number" min={0} className="w-32" prefix={code} value={String(means.bankCharge)} onChange={(e) => set({ bankCharge: round2(num(e.currentTarget.value)) })} />
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <Text variant="small" tone="muted">Paid</Text>
        <Text variant="small" className="tabular-nums">{code} {formatAmount(meansTotal(means))}</Text>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
        <Text variant="small" weight="semibold" tone={balance ? 'danger' : 'heading'}>Balance due</Text>
        <Text variant="small" weight="semibold" tone={balance ? 'danger' : 'heading'} className="tabular-nums">{code} {formatAmount(balance)}</Text>
      </div>
    </div>
  );

  return (
    <DataTable<MeansRow>
      variant="card"
      icon="payments"
      title="Payment means"
      description="How the money goes out. Each method credits its own account until it clears."
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      noPagination
      cardFooter={footer}
      actions={
        !readOnly ? (
          <div className="flex flex-wrap gap-1">
            {!means.transfer.amount && (
              <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ transfer: { account: '', date: draft.postingDate, reference: '', amount: Math.max(0, balance) } })}>
                Add transfer
              </Button>
            )}
            {!means.cash.amount && (
              <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cash: { account: '', amount: Math.max(0, balance) } })}>
                Add cash
              </Button>
            )}
            <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ checks: [...means.checks, newCheckRow({ dueDate: draft.postingDate, amount: Math.max(0, balance), account: code === 'USD' ? '1018' : '1015' })] })}>
              Add check
            </Button>
            <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cards: [...means.cards, newCardRow({ amount: Math.max(0, balance) })] })}>
              Add card
            </Button>
          </div>
        ) : undefined
      }
      empty={<Text variant="small" tone="muted">No payment means yet. Add how the money goes out.</Text>}
    />
  );
}
