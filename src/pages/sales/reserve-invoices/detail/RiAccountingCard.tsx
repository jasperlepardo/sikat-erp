import { Select, Text } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, Section } from '../../../../components/form/fields';
import type { SoDocType } from '../../../../mocks/salesOrders';
import { customerWithholds } from '../../../../services/withholding';
import type { RiSectionProps } from './types';

export function RiAccountingCard({ draft, update, ctx, m: _ }: RiSectionProps) {
  const hasLines = draft.lines.some((l) => l.itemId || l.description);
  const withholds = customerWithholds(ctx.customer);
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
            {withholds
              ? `${ctx.customer.name} withholds tax — WTax liable lines default on.`
              : `${ctx.customer.name} doesn't withhold.`}
          </Text>
        ) : null}
        <Text variant="small" tone="muted">
          Reserve invoices post A/R and revenue immediately. Stock is relieved when the delivery is created.
        </Text>
      </Section>
    </fieldset>
  );
}
