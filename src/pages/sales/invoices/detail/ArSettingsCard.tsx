import { Select, Text } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, Flags, Section, bind } from '../../../../components/form/fields';
import { SHIPPED_GOODS_ACCOUNT } from '../../../../mocks/deliveries';
import { type SoDocType } from '../../../../mocks/salesOrders';
import { customerWithholds, shipsStock } from '../../../../services/arInvoices';
import type { ArSectionProps } from './types';

export function ArSettingsCard({ draft, update, ctx, m }: ArSectionProps) {
  const h = bind(draft, update);
  const hasLines = draft.lines.some((l) => l.itemId || l.description);
  const withholds = customerWithholds(ctx.customer);
  const ships = draft.lines.some((l) => shipsStock(l, m.items));
  const shipped = m.accounts.find((a) => a.code === SHIPPED_GOODS_ACCOUNT);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <CtxFormField label="Item/Service type" hint={hasLines && !ctx.added ? 'Remove the lines to change it.' : undefined}>
          {(p) => (
            <Select
              {...p}
              disabled={ctx.added || hasLines}
              options={(['Item', 'Service'] as SoDocType[]).map((t) => ({ value: t, label: t }))}
              value={draft.docType}
              onValueChange={(docType) => update({ docType: docType as SoDocType, lines: [] })}
            />
          )}
        </CtxFormField>
        {ctx.customer ? (
          <Text variant="small" tone="muted">
            {withholds ? `${ctx.customer.name} withholds tax — WTax liable lines default on.` : `${ctx.customer.name} doesn't withhold.`}
          </Text>
        ) : null}
        <Flags>{h.check('useShippedGoodsAccount', 'Use shipped goods account', { disabled: !ships })}</Flags>
        <Text variant="small" tone="muted">
          {!ships
            ? 'Only for stock this invoice ships itself — lines from a delivery were already costed by it.'
            : draft.useShippedGoodsAccount
              ? `The cost of the stock it ships goes to ${shipped ? `${shipped.code} ${shipped.name}` : SHIPPED_GOODS_ACCOUNT} instead of COGS.`
              : 'The cost of the stock it ships goes to COGS.'}
        </Text>
      </Section>
    </fieldset>
  );
}
