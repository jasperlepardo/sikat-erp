import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { formatAmount } from '../../../../services/format';
import { poWithholding } from '../../../../services/purchaseOrders';
import { expenseAccountFor } from '../../../../services/goodsReceipts';
import { inventoryAccountFor } from '../../../../services/inventoryTransfers';
import { rateAt, vatNotPaidToVendor } from '../../../../mocks/taxes';
import type { JournalLine } from '../../../../services/inventoryTransfers';
import type { ApriSectionProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

const WITHHOLDING_PAYABLE: Record<string, string> = {
  'Expanded (EWT)': '2340',
  'Final (FWT)': '2345',
  'Withholding VAT': '2330',
  'Percentage tax': '2320',
};

function buildJournal(
  draft: ApriSectionProps['draft'],
  fx: number,
  ctx: ApriSectionProps['ctx'],
  m: ApriSectionProps['m'],
): JournalLine[] {
  const codes = m.tax.codes;
  const vatAccount = (code: string) => codes.find((c) => c.code === code)?.glAccount || '1410';
  const reverse = (code: string) => vatNotPaidToVendor(codes.find((c) => c.code === code));
  const rateOf = (code: string) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, draft.postingDate) ?? 0) : 0; };
  const factor = 1 - draft.discountPct / 100;
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };

  for (const l of draft.lines) {
    const item = m.items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const net = round2(l.unitPrice * l.quantity * (1 - l.discountPct / 100) * factor * fx);
    const ownAccount = item.inventoryItem
      ? inventoryAccountFor(item, l.warehouse, m.inv.groups)
      : expenseAccountFor(item, m.inv.groups);
    add(ownAccount, net);
    if (!reverse(l.taxCode)) add(vatAccount(l.taxCode), round2((net * rateOf(l.taxCode)) / 100));
  }

  const withholding = poWithholding(
    draft as Parameters<typeof poWithholding>[0],
    ctx.vendor,
    m.items,
    m.tax,
    draft.postingDate,
  );
  const debits = round2([...totals.values()].reduce((n, v) => n + v, 0));
  let withheld = 0;
  for (const w of withholding.filter((x) => x.deducted)) {
    const amt = round2(w.amount * fx);
    add(WITHHOLDING_PAYABLE[w.kind] ?? '2340', -amt);
    withheld += amt;
  }
  if (debits) add(draft.controlAccount || '2010', -round2(debits - withheld));

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

export function ApriJournalCard({ draft, m, ctx }: ApriSectionProps) {
  if (!ctx.fx) return null;
  const journal = buildJournal(draft, ctx.fx, ctx, m);

  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item
              key={j.account}
              title={accountText(j.account, m.accounts)}
              content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
            />
          ))}
        </List.Group>
      ) : null}
      <Text variant="small" tone="muted">
        {journal.length
          ? `In PHP${draft.currency === 'PHP' ? '' : ` at ${ctx.fx}`}. No stock movement on posting — goods are received when a Goods Receipt is created from this invoice.`
          : 'Made when the invoice is added: Dr purchase accounts and Input VAT / Cr the vendor and any withholding tax. Add lines to see it.'}
      </Text>
    </Section>
  );
}
