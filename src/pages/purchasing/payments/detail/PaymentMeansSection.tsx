import { useState } from 'react';
import { Button, Checkbox, DatePicker, Icon, List, Tabs, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../../components/form/AccountField';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { Fields, Section } from '../../../../components/form/fields';
import { HOUSE_BANKS, newCardRow, newCheckRow, type CardRow, type CheckRow, type PaymentMeans } from '../../../../mocks/outgoingPayments';
import { formatAmount } from '../../../../services/format';
import { meansBalance, meansTotal, overallAmount } from '../../../../services/outgoingPayments';
import { cardBrandDef } from '../../../settings/masterDefs';
import type { PaySectionProps } from './types';

type MeansTab = 'transfer' | 'cash' | 'check' | 'card';
const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payment Means: how the money goes out. Each means credits its account; together they must
 * cover the overall amount plus any bank charge.
 */
export function PaymentMeansSection({ draft, update, m, readOnly }: PaySectionProps) {
  const means = draft.means;
  const [tab, setTab] = useState<MeansTab>(means.checks.length ? 'check' : means.cash.amount ? 'cash' : means.cards.length ? 'card' : 'transfer');
  const set = (patch: Partial<PaymentMeans>) => update({ means: { ...means, ...patch } });
  const code = draft.currency;
  const balance = meansBalance(draft);
  // Bank and cash accounts in the payment currency (peso accounts can pay any currency; the bank converts).
  const cashAccounts = m.accounts.filter((a) => a.cash && (a.currency === 'PHP' || a.currency === code));
  const fill = (current: number) => round2(current + Math.max(0, balance));
  const patchCheck = (id: string, p: Partial<CheckRow>) => set({ checks: means.checks.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const patchCard = (id: string, p: Partial<CardRow>) => set({ cards: means.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const amountOf = (t: MeansTab) =>
    t === 'transfer' ? means.transfer.amount : t === 'cash' ? means.cash.amount : t === 'check' ? means.checks.reduce((n, c) => n + c.amount, 0) : means.cards.reduce((n, c) => n + c.amount, 0);
  const label = { transfer: 'Bank transfer', cash: 'Cash', check: 'Check', card: 'Credit card' } as const;

  const fillButton = (onClick: () => void) =>
    !readOnly && balance > 0 ? (
      <Button type="button" size="small" variant="ghost" onClick={onClick}>
        Pay the balance ({code} {formatAmount(balance)})
      </Button>
    ) : null;

  const checkColumns: TableColumn<CheckRow>[] = [
    {
      key: 'account',
      header: 'Bank account',
      cell: (c) => (
        <div className="w-64">
          <AccountField label="" role="cash" value={c.account} onChange={(account) => patchCheck(c.id, { account })} accounts={cashAccounts.filter((a) => HOUSE_BANKS[a.code])} disabled={readOnly} />
          {HOUSE_BANKS[c.account] ? <Text variant="small" tone="muted">{HOUSE_BANKS[c.account].branch} · {HOUSE_BANKS[c.account].accountNo}</Text> : null}
        </div>
      ),
    },
    { key: 'dueDate', header: 'Due date', cell: (c) => <DatePicker aria-label="Check due date" className="w-fit" value={c.dueDate || null} onValueChange={(v) => patchCheck(c.id, { dueDate: v ?? '' })} /> },
    {
      key: 'checkNo',
      header: 'Check no.',
      cell: (c) => (
        <div className="flex w-40 flex-col gap-1">
          <Checkbox checked={c.manual} disabled={readOnly} onChange={(e) => patchCheck(c.id, { manual: e.currentTarget.checked, checkNo: 0 })}>
            Manual check
          </Checkbox>
          {c.manual || c.checkNo ? (
            <TextField aria-label="Check no." type="number" readOnly={!c.manual || readOnly} value={c.checkNo ? String(c.checkNo) : ''} onChange={(e) => patchCheck(c.id, { checkNo: num(e.currentTarget.value) })} />
          ) : (
            <Text variant="small" tone="muted">Numbered when added</Text>
          )}
        </div>
      ),
    },
    { key: 'endorsable', header: 'Endors.', cell: (c) => <Checkbox aria-label="Endorsable" checked={c.endorsable} disabled={readOnly} onChange={(e) => patchCheck(c.id, { endorsable: e.currentTarget.checked })} /> },
    { key: 'amount', header: `Amount (${code})`, cell: (c) => <TextField aria-label="Check amount" type="number" min={0} className="w-36" value={String(c.amount)} onChange={(e) => patchCheck(c.id, { amount: round2(num(e.currentTarget.value)) })} /> },
  ];

  const cardColumns: TableColumn<CardRow>[] = [
    { key: 'card', header: 'Credit card', cell: (c) => <MasterLookup def={cardBrandDef} fieldProps={{ 'aria-label': 'Credit card', className: 'w-40' }} value={c.cardBrandId} onChange={(card) => patchCard(c.id, { cardBrandId: card })} /> },
    { key: 'account', header: 'G/L account', cell: (c) => <div className="w-64"><AccountField label="" role="general" value={c.account} onChange={(account) => patchCard(c.id, { account })} accounts={m.accounts} disabled={readOnly} /></div> },
    { key: 'voucherNo', header: 'Voucher no.', cell: (c) => <TextField aria-label="Voucher no." className="w-32" value={c.voucherNo} onChange={(e) => patchCard(c.id, { voucherNo: e.currentTarget.value })} /> },
    { key: 'payments', header: 'No. of payments', cell: (c) => <TextField aria-label="No. of payments" type="number" min={1} className="w-20" value={String(c.payments)} onChange={(e) => patchCard(c.id, { payments: Math.max(1, num(e.currentTarget.value)) })} /> },
    { key: 'amount', header: `Amount (${code})`, cell: (c) => <TextField aria-label="Card amount" type="number" min={0} className="w-36" value={String(c.amount)} onChange={(e) => patchCard(c.id, { amount: round2(num(e.currentTarget.value)) })} /> },
  ];

  return (
    <Section icon="payments" title="Payment means">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Tabs
            variant="outline"
            value={tab}
            onValueChange={(v) => setTab(v as MeansTab)}
            items={(Object.keys(label) as MeansTab[]).map((t) => ({ value: t, label: label[t], badge: amountOf(t) ? formatAmount(amountOf(t)) : undefined }))}
          />
          {tab === 'transfer' ? (
            <Fields>
              <AccountField label="G/L account" role="cash" value={means.transfer.account} onChange={(account) => set({ transfer: { ...means.transfer, account } })} accounts={cashAccounts} disabled={readOnly} hint="The bank account the transfer goes out of." />
              <TextField aria-label="Transfer amount" type="number" min={0} prefix={code} disabled={readOnly} value={String(means.transfer.amount)} onChange={(e) => set({ transfer: { ...means.transfer, amount: round2(num(e.currentTarget.value)) } })} />
              <DatePicker aria-label="Transfer date" value={means.transfer.date || null} onValueChange={(date) => set({ transfer: { ...means.transfer, date: date ?? '' } })} />
              <TextField aria-label="Transfer reference" placeholder="Reference, e.g. InstaPay ref. no." disabled={readOnly} value={means.transfer.reference} onChange={(e) => set({ transfer: { ...means.transfer, reference: e.currentTarget.value } })} />
              <div className="md:col-span-2">{fillButton(() => set({ transfer: { ...means.transfer, amount: fill(means.transfer.amount) } }))}</div>
            </Fields>
          ) : tab === 'cash' ? (
            <Fields>
              <AccountField label="G/L account" role="cash" value={means.cash.account} onChange={(account) => set({ cash: { ...means.cash, account } })} accounts={cashAccounts.filter((a) => !HOUSE_BANKS[a.code])} disabled={readOnly} hint="The cash fund the money comes out of." />
              <TextField aria-label="Cash amount" type="number" min={0} prefix={code} disabled={readOnly} value={String(means.cash.amount)} onChange={(e) => set({ cash: { ...means.cash, amount: round2(num(e.currentTarget.value)) } })} />
              <div className="md:col-span-2">{fillButton(() => set({ cash: { ...means.cash, amount: fill(means.cash.amount) } }))}</div>
            </Fields>
          ) : tab === 'check' ? (
            <DataTable
              icon="money"
              title="Checks"
              description="Checks drawn on the house bank accounts. Automatic checks get the account's next number when the payment is added."
              rows={means.checks}
              getRowId={(c) => c.id}
              columns={checkColumns}
              unsortable={checkColumns.map((c) => c.key)}
              noPagination
              onRemove={readOnly ? undefined : (picked) => set({ checks: means.checks.filter((c) => !picked.includes(c)) })}
              actions={
                readOnly ? null : (
                  <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ checks: [...means.checks, newCheckRow({ dueDate: draft.postingDate, amount: Math.max(0, balance), account: code === 'USD' ? '1018' : '1015' })] })}>
                    Add check
                  </Button>
                )
              }
              empty={<Text variant="small" tone="muted">No checks. Add one for the balance.</Text>}
            />
          ) : (
            <DataTable
              icon="credit_card"
              title="Credit cards"
              description="Paid with a corporate card: credits the card's payable account until the card statement is settled."
              rows={means.cards}
              getRowId={(c) => c.id}
              columns={cardColumns}
              unsortable={cardColumns.map((c) => c.key)}
              noPagination
              onRemove={readOnly ? undefined : (picked) => set({ cards: means.cards.filter((c) => !picked.includes(c)) })}
              actions={
                readOnly ? null : (
                  <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => set({ cards: [...means.cards, newCardRow({ amount: Math.max(0, balance) })] })}>
                    Add card
                  </Button>
                )
              }
              empty={<Text variant="small" tone="muted">No card payments.</Text>}
            />
          )}
        </div>
        <List.Group divider>
          <List.Item title="Currency" content={code} />
          <List.Item title="Overall amount" content={<span className="tabular-nums">{formatAmount(overallAmount(draft))}</span>} />
          <List.Item
            title="Bank charge"
            content={<TextField aria-label="Bank charge" type="number" min={0} className="w-32" disabled={readOnly} value={String(means.bankCharge)} onChange={(e) => set({ bankCharge: round2(num(e.currentTarget.value)) })} />}
          />
          <List.Item title="Paid" content={<span className="tabular-nums">{formatAmount(meansTotal(means))}</span>} />
          <List.Item
            title={<Text as="span" weight="semibold" tone="heading">Balance due</Text>}
            content={<Text as="span" weight="semibold" tone={balance ? 'danger' : 'heading'}>{formatAmount(balance)}</Text>}
          />
        </List.Group>
      </div>
    </Section>
  );
}
