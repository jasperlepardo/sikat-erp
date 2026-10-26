import { Fields, Section, bind } from '../../../../components/form/fields';
import type { CmSectionProps } from './types';

interface CmLogisticsCardProps extends CmSectionProps {
  addressOptions: { value: string; label: string }[];
}

export function CmLogisticsCard({ draft, update, errors: _errors, m, ctx, addressOptions }: CmLogisticsCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const withCurrent = (opts: { value: string; label: string }[], v: string) =>
    !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts];

  return (
    <Section icon="local_shipping" title="Logistics">
      <Fields>
        {h.lookup('shipTo', 'Ship to', withCurrent(addressOptions, draft.shipTo), { hint: "The vendor's return address, for goods sent back.", disabled: !vendor })}
        {h.lookup('payTo', 'Pay to', withCurrent(addressOptions, draft.payTo), { disabled: !vendor })}
        {h.lookup('shippingType', 'Shipping type', m.inv.shipping.filter((s) => s.active || s.id === draft.shippingType).map((s) => ({ value: s.id, label: s.name })), { clearable: true })}
      </Fields>
    </Section>
  );
}
