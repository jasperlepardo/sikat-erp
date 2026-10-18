import { Button, Checkbox, Combobox, DatePicker, Icon, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import type { Account } from '../../../../mocks/chartOfAccounts';
import { INCOMING_DIFF_ALLOWED, newReceivedCard, newReceivedCheck, type IncomingMeans, type ReceivedCard, type ReceivedCheck } from '../../../../mocks/incomingPayments';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { amountDue, meansTotal, paymentDifference, type IncomingInput } from '../../../../services/incomingPayments';
import { banks as bankList, cardBrands, houseBankFor, nameIn } from '../../../../services/partnerMasters';
import { cardBrandDef } from '../../../settings/masterDefs';

type MeansRow =
  | { id: 'transfer'; kind: 'transfer'; account: string; date: string; reference: string; amount: number }
  | { id: 'cash'; kind: 'cash'; account: string; amount: number }
  | (ReceivedCheck & { kind: 'check' })
  | (ReceivedCard & { kind: 'card' });

const METHOD_LABEL: Record<string, string> = { transfer: 'Bank transfer', cash: 'Cash', check: 'Check', card: 'Credit card' };
const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function IncomingMeansSection({ draft, update, accounts, fx, readOnly }: { draft: IncomingInput; update: (p: Partial<IncomingInput>) => void; accounts: Account[]; fx: number; readOnly: boolean }) {
  const means = draft.means;
  const set = (patch: Partial<IncomingMeans>) => update({ means: { ...means, ...patch } });
  const code = draft.currency;
  const due = amountDue(draft);
  const received = meansTotal(means);
  const left = round2(due - received);
  const { diff, withinAllowance } = paymentDifference(draft, fx);

  const banks = accounts.filter((a) => a.cash && houseBankFor(a.code) && (a.currency === 'PHP' || a.currency === code || a.currency === 'All currencies'));
  const cashAccounts = accounts.filter((a) => a.cash && !houseBankFor(a.code));
  const allCardBrands = cardBrands.snapshot();

  const patchCheck = (id: string, p: Partial<ReceivedCheck>) => set({ checks: means.checks.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const patchCard = (id: string, p: Partial<ReceivedCard>) => set({ cards: means.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  const rows: MeansRow[] = [
    ...(means.transfer.amount > 0 ? [{ id: 'transfer' as const, kind: 'transfer' as const, ...means.transfer }] : []),
    ...(means.cash.amount > 0 ? [{ id: 'cash' as const, kind: 'cash' as const, ...means.cash }] : []),
    ...means.checks.map((c) => ({ ...c, kind: 'check' as const })),
    ...means.cards.map((c) => ({ ...c, kind: 'card' as const })),
  ];

  const baseColumns: TableColumn<MeansRow>[] = [
    {
      key: 'kind',
      header: 'Method',
      cell: (r) => <Text variant="small">{METHOD_LABEL[r.kind]}</Text>,
    },
    {
      key: 'account',
      header: 'Account / Details',
      cell: (r) => {
        if (r.kind === 'transfer') {
          const bank = houseBankFor(r.account);
          const acct = accounts.find((a) => a.code === r.account);
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                <Text variant="small">{acct ? `${acct.code} ${acct.name}` : r.account || '—'}</Text>
                {bank && <Text variant="small" tone="muted">{nameIn(bankList, bank.bankId)} · {bank.accountNo}</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <Combobox aria-label="Bank account" className="w-56" options={banks.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} value={r.account || null} onValueChange={(v) => set({ transfer: { ...means.transfer, account: v ?? '' } })} />
              {bank && <Text variant="small" tone="muted">{nameIn(bankList, bank.bankId)} · {bank.accountNo}</Text>}
            </div>
          );
        }
        if (r.kind === 'cash') {
          const acct = accounts.find((a) => a.code === r.account);
          if (readOnly) return <Text variant="small">{acct ? `${acct.code} ${acct.name}` : r.account || '—'}</Text>;
          return <Combobox aria-label="Cash account" className="w-56" options={cashAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} value={r.account || null} onValueChange={(v) => set({ cash: { ...means.cash, account: v ?? '' } })} />;
        }
        if (r.kind === 'check') {
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                {r.bank && <Text variant="small">{r.bank}{r.branch ? ` · ${r.branch}` : ''}</Text>}
                {r.checkNo && <Text variant="small" tone="muted">Check no. {r.checkNo}{r.accountNo ? ` · ${r.accountNo}` : ''}</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <TextField aria-label="Bank" className="w-40" placeholder="Bank, e.g. Metrobank" value={r.bank} onChange={(e) => patchCheck(r.id, { bank: e.currentTarget.value })} />
              <div className="flex gap-1">
                <TextField aria-label="Check no." className="w-28" placeholder="Check no." value={r.checkNo} onChange={(e) => patchCheck(r.id, { checkNo: e.currentTarget.value })} />
                <TextField aria-label="Drawer account no." className="w-32" placeholder="Acct no." value={r.accountNo} onChange={(e) => patchCheck(r.id, { accountNo: e.currentTarget.value })} />
              </div>
              <TextField aria-label="Branch" className="w-36" placeholder="Branch" value={r.branch} onChange={(e) => patchCheck(r.id, { branch: e.currentTarget.value })} />
            </div>
          );
        }
        // card
        const brand = allCardBrands.find((b) => b.id === r.cardBrandId);
        if (readOnly) {
          return (
            <div className="flex flex-col gap-0.5">
              <Text variant="small">{brand?.name ?? '—'}</Text>
              {r.last4 && <Text variant="small" tone="muted">···· {r.last4}</Text>}
            </div>
          );
        }
        return (
          <div className="flex items-start gap-2">
            <MasterLookup def={cardBrandDef} fieldProps={{ 'aria-label': 'Card brand', className: 'w-40' }} value={r.cardBrandId} onChange={(v) => patchCard(r.id, { cardBrandId: v })} />
            <TextField aria-label="Last four digits" className="w-24" maxLength={4} placeholder="Last 4" value={r.last4} onChange={(e) => patchCard(r.id, { last4: e.currentTarget.value.replace(/\D/g, '').slice(0, 4) })} />
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
                {r.date && <Text variant="small">{formatDate(r.date)}</Text>}
                {r.reference && <Text variant="small" tone="muted">{r.reference}</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <DatePicker aria-label="Transfer date" value={r.date || null} onValueChange={(v) => set({ transfer: { ...means.transfer, date: v ?? '' } })} />
              <TextField aria-label="Transfer reference" className="w-48" placeholder="InstaPay ref no." value={r.reference} onChange={(e) => set({ transfer: { ...means.transfer, reference: e.currentTarget.value } })} />
            </div>
          );
        }
        if (r.kind === 'check') {
          if (readOnly) {
            return (
              <div className="flex flex-col gap-0.5">
                {r.dueDate && <Text variant="small">{formatDate(r.dueDate)}</Text>}
                {r.endorsed && <Text variant="small" tone="muted">Endorsed</Text>}
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              <DatePicker aria-label="Check due date" className="w-fit" value={r.dueDate || null} onValueChange={(v) => patchCheck(r.id, { dueDate: v ?? '' })} />
              <Checkbox aria-label="Endorsed" checked={r.endorsed} onChange={(e) => patchCheck(r.id, { endorsed: e.currentTarget.checked })}>Endorsed</Checkbox>
            </div>
          );
        }
        if (r.kind === 'card') {
          if (readOnly) return <Text variant="small">{r.voucherNo || '—'}</Text>;
          return <TextField aria-label="Voucher no." className="w-36" placeholder="Voucher no." value={r.voucherNo} onChange={(e) => patchCard(r.id, { voucherNo: e.currentTarget.value })} />;
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
              <TextField aria-label="Transfer amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => set({ transfer: { ...means.transfer, amount: num(e.currentTarget.value) } })} />
              {left > 0 && <Button type="button" size="small" variant="ghost" onClick={() => set({ transfer: { ...means.transfer, amount: round2(r.amount + Math.max(0, left)) } })}>Fill {code} {formatAmount(left)}</Button>}
            </div>
          );
        }
        if (r.kind === 'cash') {
          return (
            <div className="flex flex-col items-end gap-1">
              <TextField aria-label="Cash amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => set({ cash: { ...means.cash, amount: num(e.currentTarget.value) } })} />
              {left > 0 && <Button type="button" size="small" variant="ghost" onClick={() => set({ cash: { ...means.cash, amount: round2(r.amount + Math.max(0, left)) } })}>Fill {code} {formatAmount(left)}</Button>}
            </div>
          );
        }
        if (r.kind === 'check') return <TextField aria-label="Check amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => patchCheck(r.id, { amount: num(e.currentTarget.value) })} />;
        return <TextField aria-label="Card amount" type="number" min={0} className="w-36" prefix={code} value={String(r.amount)} onChange={(e) => patchCard(r.id, { amount: num(e.currentTarget.value) })} />;
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

  const diffLabel = diff === 0 ? 'Balance' : withinAllowance ? (diff > 0 ? 'Overpayment (within allowance)' : 'Underpayment (within allowance)') : 'Open balance';
  const diffTone = diff !== 0 && !withinAllowance ? 'danger' : 'heading';

  const footer = (
    <div className="flex flex-col gap-1 px-2 py-1">
      <div className="flex items-center justify-between gap-4">
        <Text variant="small" tone="muted">Amount due</Text>
        <Text variant="small" className="tabular-nums">{code} {formatAmount(due)}</Text>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Text variant="small" tone="muted">Received</Text>
        <Text variant="small" className="tabular-nums">{code} {formatAmount(received)}</Text>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
        <Text variant="small" weight="semibold" tone={diffTone}>{diffLabel}</Text>
        <Text variant="small" weight="semibold" tone={diffTone} className="tabular-nums">{code} {formatAmount(diff)}</Text>
      </div>
      <Text variant="small" tone="muted">Up to PHP {formatAmount(INCOMING_DIFF_ALLOWED)} difference posts to Other Income or Miscellaneous Expense; more is an open balance and blocks adding.</Text>
    </div>
  );

  return (
    <DataTable<MeansRow>
      variant="plain"
      icon="payments"
      title="Payment means"
      description="How the money arrived. Each method debits its own account until deposited or reconciled."
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
              <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ transfer: { account: '', date: draft.postingDate, reference: '', amount: Math.max(0, left) } })}>
                Add transfer
              </Button>
            )}
            {!means.cash.amount && (
              <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cash: { account: '', amount: Math.max(0, left) } })}>
                Add cash
              </Button>
            )}
            <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ checks: [...means.checks, newReceivedCheck({ dueDate: draft.postingDate, amount: Math.max(0, left) })] })}>
              Add check
            </Button>
            <Button type="button" size="small" intent="white" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cards: [...means.cards, newReceivedCard({ amount: Math.max(0, left) })] })}>
              Add card
            </Button>
          </div>
        ) : undefined
      }
      empty={<Text variant="small" tone="muted">No payment means recorded.</Text>}
    />
  );
}
