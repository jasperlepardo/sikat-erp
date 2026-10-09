import { useState } from 'react';
import { banks as bankList, houseBankFor, nameIn } from '../../../../services/partnerMasters';
import { Button, Checkbox, Combobox, DatePicker, Icon, List, Tabs, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { Fields, Section } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import { INCOMING_DIFF_ALLOWED, newReceivedCard, newReceivedCheck, type IncomingMeans, type ReceivedCard, type ReceivedCheck } from '../../../../mocks/incomingPayments';
import { formatAmount } from '../../../../services/format';
import { amountDue, meansTotal, paymentDifference, type IncomingInput } from '../../../../services/incomingPayments';
import { cardBrandDef } from '../../../settings/masterDefs';

type MeansTab = 'transfer' | 'cash' | 'check' | 'card';
const LABEL: Record<MeansTab, string> = { transfer: 'Bank transfer', cash: 'Cash', check: 'Check', card: 'Credit card' };
const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payment Means: how the money arrived. Each means debits its account — the bank for a transfer,
 * a clearing account for cash, checks and cards until they're deposited.
 */
export function IncomingMeansSection({ draft, update, accounts, fx, readOnly }: { draft: IncomingInput; update: (p: Partial<IncomingInput>) => void; accounts: Account[]; fx: number; readOnly: boolean }) {
  const means = draft.means;
  const [tab, setTab] = useState<MeansTab>(means.checks.length ? 'check' : means.cash.amount ? 'cash' : means.cards.length ? 'card' : 'transfer');
  const set = (patch: Partial<IncomingMeans>) => update({ means: { ...means, ...patch } });
  const code = draft.currency;
  const due = amountDue(draft);
  const received = meansTotal(means);
  const left = round2(due - received);
  const { diff, withinAllowance } = paymentDifference(draft, fx);
  const banks = accounts.filter((a) => a.cash && houseBankFor(a.code) && (a.currency === 'PHP' || a.currency === code || a.currency === 'All currencies'));
  const cashAccounts = accounts.filter((a) => a.cash && !houseBankFor(a.code));
  const transferBank = houseBankFor(means.transfer.account);
  const fill = (current: number) => round2(current + Math.max(0, left));
  const patchCheck = (id: string, p: Partial<ReceivedCheck>) => set({ checks: means.checks.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const patchCard = (id: string, p: Partial<ReceivedCard>) => set({ cards: means.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const amountOf = (t: MeansTab) => (t === 'transfer' ? means.transfer.amount : t === 'cash' ? means.cash.amount : t === 'check' ? means.checks.reduce((n, c) => n + c.amount, 0) : means.cards.reduce((n, c) => n + c.amount, 0));
  const fillButton = (onClick: () => void) =>
    !readOnly && left > 0 ? (
      <Button type="button" size="small" variant="ghost" onClick={onClick}>
        Receive the balance ({code} {formatAmount(left)})
      </Button>
    ) : null;
  const accountPicker = (label: string, value: string, options: Account[], onChange: (v: string) => void) => (
    <Combobox aria-label={label} disabled={readOnly} options={options.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} value={value || null} onValueChange={(v) => onChange(v ?? '')} />
  );

  const checkColumns: TableColumn<ReceivedCheck>[] = [
    { key: 'dueDate', header: 'Due date', cell: (c) => <DatePicker aria-label="Check due date" className="w-fit" value={c.dueDate || null} onValueChange={(v) => patchCheck(c.id, { dueDate: v ?? '' })} /> },
    { key: 'amount', header: 'Amount', cell: (c) => <TextField aria-label="Check amount" type="number" min={0} className="w-36" prefix={code} readOnly={readOnly} value={String(c.amount)} onChange={(e) => patchCheck(c.id, { amount: num(e.currentTarget.value) })} /> },
    { key: 'bank', header: 'Bank', cell: (c) => <TextField aria-label="Bank" className="w-40" placeholder="e.g. Metrobank" readOnly={readOnly} value={c.bank} onChange={(e) => patchCheck(c.id, { bank: e.currentTarget.value })} /> },
    { key: 'branch', header: 'Branch', cell: (c) => <TextField aria-label="Branch" className="w-32" readOnly={readOnly} value={c.branch} onChange={(e) => patchCheck(c.id, { branch: e.currentTarget.value })} /> },
    { key: 'accountNo', header: 'Account', cell: (c) => <TextField aria-label="Drawer's account no." className="w-36" readOnly={readOnly} value={c.accountNo} onChange={(e) => patchCheck(c.id, { accountNo: e.currentTarget.value })} /> },
    { key: 'checkNo', header: 'Check no.', cell: (c) => <TextField aria-label="Check no." className="w-28" readOnly={readOnly} value={c.checkNo} onChange={(e) => patchCheck(c.id, { checkNo: e.currentTarget.value })} /> },
    { key: 'endorsed', header: 'Endorsed', cell: (c) => <Checkbox aria-label="Endorsed" disabled={readOnly} checked={c.endorsed} onChange={(e) => patchCheck(c.id, { endorsed: e.currentTarget.checked })} /> },
  ];
  const cardColumns: TableColumn<ReceivedCard>[] = [
    { key: 'card', header: 'Card', cell: (c) => <MasterLookup def={cardBrandDef} fieldProps={{ 'aria-label': 'Card brand', className: 'w-40' }} value={c.cardBrandId} onChange={(card) => patchCard(c.id, { cardBrandId: card })} disabled={readOnly} /> },
    { key: 'last4', header: 'Card no. (last 4)', cell: (c) => <TextField aria-label="Last four digits" className="w-28" maxLength={4} readOnly={readOnly} value={c.last4} onChange={(e) => patchCard(c.id, { last4: e.currentTarget.value.replace(/\D/g, '').slice(0, 4) })} /> },
    { key: 'voucherNo', header: 'Voucher no.', cell: (c) => <TextField aria-label="Voucher no." className="w-36" readOnly={readOnly} value={c.voucherNo} onChange={(e) => patchCard(c.id, { voucherNo: e.currentTarget.value })} /> },
    { key: 'amount', header: 'Amount', cell: (c) => <TextField aria-label="Card amount" type="number" min={0} className="w-36" prefix={code} readOnly={readOnly} value={String(c.amount)} onChange={(e) => patchCard(c.id, { amount: num(e.currentTarget.value) })} /> },
  ];

  return (
    <Section icon="payments" title="Payment means">
      <Tabs variant="outline" value={tab} onValueChange={(v) => setTab(v as MeansTab)} items={(Object.keys(LABEL) as MeansTab[]).map((t) => ({ value: t, label: LABEL[t], badge: amountOf(t) ? formatAmount(amountOf(t)) : undefined }))} />
      {tab === 'transfer' ? (
        <Fields>
          <div>
            <Text variant="small" tone="muted">Bank account</Text>
            {accountPicker('Bank account', means.transfer.account, banks, (account) => set({ transfer: { ...means.transfer, account } }))}
            {transferBank ? <Text variant="small" tone="muted">{nameIn(bankList, transferBank.bankId)} · {transferBank.accountNo}</Text> : null}
          </div>
          <div>
            <Text variant="small" tone="muted">Transfer date</Text>
            <DatePicker aria-label="Transfer date" value={means.transfer.date || null} onValueChange={(date) => set({ transfer: { ...means.transfer, date: date ?? '' } })} />
          </div>
          <TextField aria-label="Transfer reference" placeholder="Reference, e.g. InstaPay ref no." readOnly={readOnly} value={means.transfer.reference} onChange={(e) => set({ transfer: { ...means.transfer, reference: e.currentTarget.value } })} />
          <div className="flex flex-col gap-1">
            <TextField aria-label="Transfer amount" type="number" min={0} prefix={code} readOnly={readOnly} value={String(means.transfer.amount)} onChange={(e) => set({ transfer: { ...means.transfer, amount: num(e.currentTarget.value) } })} />
            {fillButton(() => set({ transfer: { ...means.transfer, amount: fill(means.transfer.amount) } }))}
          </div>
          <Text variant="small" tone="muted" className="md:col-span-2">Posts straight to the bank account — no clearing account.</Text>
        </Fields>
      ) : tab === 'cash' ? (
        <Fields>
          <div>
            <Text variant="small" tone="muted">Cash account</Text>
            {accountPicker('Cash account', means.cash.account, cashAccounts, (account) => set({ cash: { ...means.cash, account } }))}
          </div>
          <div className="flex flex-col gap-1">
            <TextField aria-label="Cash amount" type="number" min={0} prefix={code} readOnly={readOnly} value={String(means.cash.amount)} onChange={(e) => set({ cash: { ...means.cash, amount: num(e.currentTarget.value) } })} />
            {fillButton(() => set({ cash: { ...means.cash, amount: fill(means.cash.amount) } }))}
          </div>
          <Text variant="small" tone="muted" className="md:col-span-2">Cash on hand is a clearing account until it's deposited (Banking › Deposits).</Text>
        </Fields>
      ) : tab === 'check' ? (
        <DataTable
          icon="money"
          title="Checks received"
          description="The customer's checks, as printed. They sit in the clearing account until deposited."
          rows={means.checks}
          getRowId={(c) => c.id}
          columns={checkColumns}
          unsortable={checkColumns.map((c) => c.key)}
          noPagination
          onRemove={readOnly ? undefined : (picked) => set({ checks: means.checks.filter((c) => !picked.includes(c)) })}
          actions={
            readOnly ? null : (
              <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ checks: [...means.checks, newReceivedCheck({ dueDate: draft.postingDate, amount: Math.max(0, left) })] })}>
                Add check
              </Button>
            )
          }
          empty={<Text variant="small" tone="muted">No checks.</Text>}
        />
      ) : (
        <DataTable
          icon="credit_card"
          title="Credit cards"
          description="Card receipts; only the last four digits are kept. They post to the card settlements account until the acquirer pays out."
          rows={means.cards}
          getRowId={(c) => c.id}
          columns={cardColumns}
          unsortable={cardColumns.map((c) => c.key)}
          noPagination
          onRemove={readOnly ? undefined : (picked) => set({ cards: means.cards.filter((c) => !picked.includes(c)) })}
          actions={
            readOnly ? null : (
              <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cards: [...means.cards, newReceivedCard({ amount: Math.max(0, left) })] })}>
                Add card
              </Button>
            )
          }
          empty={<Text variant="small" tone="muted">No card payments.</Text>}
        />
      )}
      <List.Group divider>
        <List.Item title="Amount due" content={<span className="tabular-nums">{code} {formatAmount(due)}</span>} />
        <List.Item title="Received" content={<span className="tabular-nums">{code} {formatAmount(received)}</span>} />
        <List.Item
          title={diff === 0 ? 'Balance' : withinAllowance ? (diff > 0 ? 'Overpayment (within allowance)' : 'Underpayment (within allowance)') : 'Open balance'}
          content={
            <Text as="span" tone={diff !== 0 && !withinAllowance ? 'danger' : 'default'}>
              <span className="tabular-nums">{code} {formatAmount(diff)}</span>
            </Text>
          }
        />
      </List.Group>
      <Text variant="small" tone="muted">Up to PHP {formatAmount(INCOMING_DIFF_ALLOWED)} difference posts to Other Income or Miscellaneous Expense; more is an open balance and blocks adding.</Text>
    </Section>
  );
}
