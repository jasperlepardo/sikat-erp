import { Combobox } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, ReadOnly, Section, SideFields, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { GrSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

interface GrAccountingCardProps extends GrSectionProps {
  readOnly: boolean;
}

export function GrAccountingCard({ draft, update, errors: _errors, m, ctx, readOnly: _readOnly }: GrAccountingCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;

  return (
    <Section icon="account_balance" title="Accounting">
      <SideFields>
        {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Goods Returns – vendor code".' })}
        {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the base document.' })}
        {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
        {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
        {h.master('projectId', 'BP project', projectDef, { clearable: true })}
        {h.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true })}
        <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
        <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO behind the lines." />
        <CtxFormField label="Consolidating BP" tooltip="Settle this return's credit through another partner.">
          {(p) => (
            <Combobox {...p} placeholder="None" options={m.vendors.filter((v) => v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))} value={draft.consolidatingBpId || null} onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })} />
          )}
        </CtxFormField>
      </SideFields>
    </Section>
  );
}
