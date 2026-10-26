import { Alert, List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { accountText } from '../../../../mocks/chartOfAccounts';
import type { Item } from '../../../../mocks/items';
import { apJournal, lineValueLc, receiptValueLc } from '../../../../services/apInvoices';
import { formatAmount } from '../../../../services/format';
import { docWithholding } from '../../../../services/withholding';
import type { ApSectionProps } from './types';

function differenceTarget(item: Item | undefined) {
  if (!item?.inventoryItem) return "the item's cost account (it isn't stocked)";
  return item.warehouses.reduce((n, w) => n + w.inStock, 0) > 0 ? 'inventory (the item cost re-averages)' : 'cost of sales (the stock is gone)';
}

export function ApJournalCard({ draft, m, ctx }: ApSectionProps) {
  if (!ctx.fx) return null;

  const withholding = docWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const journal = apJournal(draft, ctx.fx, { itemsById: new Map(m.items.map((i) => [i.id, i])), groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding });
  const differences = draft.lines
    .filter((l) => l.baseType === 'GRPO')
    .map((l) => ({ l, gr: m.receipts.find((r) => r.id === l.baseId), diff: Math.round((lineValueLc(l, draft, ctx.fx) - receiptValueLc(l)) * 100) / 100 }))
    .filter((x) => x.diff);

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
      {differences.length ? (
        <Alert intent="warning" variant="outline" title="Billed at a different price or rate than received">
          {differences.map(({ l, gr, diff }) => (
            <div key={l.id}>
              {l.itemNo}: receipt {l.baseDocNo}
              {gr && gr.currency !== 'PHP' ? ` at ${gr.fxRate}, billed at ${ctx.fx}` : ''} — PHP {formatAmount(Math.abs(diff))} {diff > 0 ? 'more' : 'less'}, posted to{' '}
              {differenceTarget(m.items.find((i) => i.id === l.itemId))}.
            </div>
          ))}
        </Alert>
      ) : null}
      <Text variant="small" tone="muted">
        {journal.length
          ? `In PHP${draft.currency === 'PHP' ? '' : ` at ${ctx.fx}`}. Receipt lines clear Goods Received Not Invoiced at the receipt's cost; other stocked lines receive the stock now. Realized exchange gains and losses come when the bill is paid.`
          : 'Made when the invoice is added: Dr Goods Received Not Invoiced (or Inventory) and Input VAT / Cr the vendor and any withholding tax. Add lines to see it.'}
      </Text>
    </Section>
  );
}
