import { Fields, Section, bind } from '../../../../components/form/fields';
import { activeOptions } from '../../../../services/inventoryMasters';
import { customerAddressOptions } from './types';
import type { QtTabProps } from './types';

export function QtLogisticsCard({ draft, update, ctx, m }: QtTabProps) {
  const h = bind(draft, update);
  const addressOpts = customerAddressOptions(ctx.customer);
  const withCurrent = (opts: { value: string; label: string }[], v: string) =>
    !v || opts.some((o) => o.value === v) ? opts : [{ value: v, label: v.split('\n')[0] }, ...opts];
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="local_shipping" title="Logistics">
        <Fields cols={1}>
          {h.lookup('shipTo', 'Ship to', withCurrent(addressOpts, draft.shipTo), { disabled: !ctx.customer })}
          {h.lookup('billTo', 'Bill to', withCurrent(addressOpts, draft.billTo), { disabled: !ctx.customer })}
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
        </Fields>
      </Section>
    </fieldset>
  );
}
