import { Button, FormField, Icon, Link, Select, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import type { CardRow, CheckRow, PaymentMeans } from '../../../../mocks/outgoingPayments';
import { formatDate } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { overallAmount } from '../../../../services/outgoingPayments';
import { cardBrandDef } from '../../../settings/masterDefs';
import { houseBankText, vendorBankAccount, vendorBankText } from '../payables';
import { MEANS_LABEL, type MeansTab, type OpSectionProps } from './types';

const TABS: MeansTab[] = ['transfer', 'cash', 'card', 'check'];

/**
 * Payment Method: one means per payment, Bank Transfer by default. "Paid from" names our bank
 * account and shows its balance — never a G/L code. The amount always equals what's being paid.
 */
export function OpMethodCard({ draft, update, errors, m, ctx, tab, onTabChange }: OpSectionProps & { tab: MeansTab; onTabChange: (tab: MeansTab) => void }) {
  const { means } = draft;
  const code = draft.currency;
  const amount = overallAmount(draft);
  const set = (patch: Partial<PaymentMeans>) => update({ means: { ...means, ...patch } });
  const transfer = bind(means.transfer, (p) => set({ transfer: { ...means.transfer, ...p } }));
  const check = means.checks[0];
  const card = means.cards[0];
  const setCheck = (p: Partial<CheckRow>) => check && set({ checks: [{ ...check, ...p }] });
  const setCard = (p: Partial<CardRow>) => card && set({ cards: [{ ...card, ...p }] });

  const usable = (gl: string) => {
    const a = m.accounts.find((x) => x.code === gl);
    return a?.active !== false && (a?.currency === 'PHP' || a?.currency === code || a?.currency === 'All currencies');
  };
  const balanceText = (gl: string) => `Balance PHP ${formatAmount(m.balances.get(gl) ?? 0)}`;
  const bankOptions = (current: string) =>
    m.houseBanks
      .filter((h) => (h.active && usable(h.glAccount)) || h.glAccount === current)
      .map((h) => ({ value: h.glAccount, label: houseBankText(h.glAccount, m), text: houseBankText(h.glAccount, m), description: balanceText(h.glAccount) }));
  const cashOptions = m.accounts
    .filter((a) => (a.cash && a.active && !m.houseBanks.some((h) => h.glAccount === a.code) && usable(a.code)) || a.code === means.cash.account)
    .map((a) => ({ value: a.code, label: a.name, description: balanceText(a.code) }));
  const payTo = vendorBankAccount(ctx.vendor);

  const paidFrom = (value: string, onChange: (gl: string) => void, label = 'Paid from') => (
    <FormField label={label} required error={errors.paidFrom} hint={value ? balanceText(value) : undefined}>
      {(p) => <Select {...p} placeholder="Pick a bank account" disabled={ctx.readOnly} options={bankOptions(value)} value={value} onValueChange={onChange} />}
    </FormField>
  );
  const amountField = <ReadOnly label="Amount" value={`${code} ${formatAmount(amount)}`} hint="Equals the amount to pay." />;

  if (ctx.readOnly) {
    const route =
      tab === 'transfer'
        ? `${houseBankText(means.transfer.account, m)} → ${draft.payTo || '—'} · ${formatDate(means.transfer.date)}${means.transfer.reference ? ` · ${means.transfer.reference}` : ''}`
        : tab === 'check' && check
        ? `Check ${check.checkNo || ''} on ${houseBankText(check.account, m)} · ${check.dueDate ? formatDate(check.dueDate) : '—'}`
        : tab === 'card' && card
        ? `${m.cardBrands.find((b) => b.id === card.cardBrandId)?.name ?? 'Card'} ••${card.last4 || '····'}${card.voucherNo ? ` · voucher ${card.voucherNo}` : ''}`
        : `Cash from ${houseBankText(means.cash.account, m) || 'cash'}`;
    return (
      <Section icon="account_balance" title="Payment Method">
        <ReadOnly label={MEANS_LABEL[tab]} value={route} />
        {amountField}
      </Section>
    );
  }

  return (
    <Section icon="account_balance" title="Payment Method">
      <Tabs variant="outline" value={tab} onValueChange={(v) => onTabChange(v as MeansTab)} items={TABS.map((t) => ({ value: t, label: MEANS_LABEL[t] }))} />
      <Fields>
        {tab === 'transfer' ? (
          <>
            {paidFrom(means.transfer.account, (account) => set({ transfer: { ...means.transfer, account } }))}
            {payTo ? (
              <ReadOnly label="Pay to" value={vendorBankText(payTo, m)} description={payTo.accountName} />
            ) : (
              <FormField label="Pay to" error={errors.payTo}>
                {() => (
                  <Text variant="small" tone={errors.payTo ? 'danger' : 'muted'}>
                    No bank account on file.{' '}
                    {ctx.vendor ? <Link intent="primary" href={`#/purchasing/vendors/${ctx.vendor.id}`}>Add one on the vendor</Link> : null}
                  </Text>
                )}
              </FormField>
            )}
            {transfer.date('date', 'Transfer date')}
            {transfer.text('reference', 'Reference', { hint: 'The bank’s transaction reference.' })}
          </>
        ) : tab === 'cash' ? (
          <FormField label="Cash account" required error={errors.paidFrom}>
            {(p) => <Select {...p} placeholder="Pick a cash fund" options={cashOptions} value={means.cash.account} onValueChange={(account) => set({ cash: { ...means.cash, account } })} />}
          </FormField>
        ) : tab === 'card' && card ? (
          <>
            <FormField label="Card brand" required error={errors.cardBrand}>
              {() => <MasterLookup def={cardBrandDef} value={card.cardBrandId} onChange={(cardBrandId) => setCard({ cardBrandId })} where={(b) => b.active} />}
            </FormField>
            {bind(card, setCard).text('last4', 'Last 4 digits', { hint: 'Never the full card number.' })}
            {bind(card, setCard).text('voucherNo', 'Voucher no.')}
          </>
        ) : tab === 'check' && check ? (
          <>
            {paidFrom(check.account, (account) => setCheck({ account }), 'Bank')}
            <ReadOnly label="Branch" value={m.houseBanks.find((h) => h.glAccount === check.account)?.branch || '—'} />
            {/* A typed number makes it a manual check; 0 takes the next number on the account when posted. */}
            {bind(check, (p) => setCheck({ ...p, manual: (p.checkNo ?? check.checkNo) > 0 })).num('checkNo', 'Check no.', { hint: 'Leave at 0 to take the next number on the account.' })}
            {bind(check, setCheck).date('dueDate', 'Check date')}
          </>
        ) : null}
        {amountField}
      </Fields>
      <div>
        <Button type="button" intent="white" variant="ghost" size="small" leadingIcon={<Icon size={20}>add</Icon>} disabled title="Combined payment means come later">
          Add payment line
        </Button>
      </div>
    </Section>
  );
}
