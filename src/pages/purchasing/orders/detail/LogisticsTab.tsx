import { Button } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES, PURCHASING_SETTINGS } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import { defaultShipTo, formatAddress, type PoTabProps } from './types';

export function LogisticsTab({ draft, update, m, ctx }: PoTabProps) {
  const f = bind(draft, update);
  const warehouses = [...new Set(draft.lines.map((l) => l.warehouse).filter(Boolean))];
  const bill = ctx.vendor?.addresses.find((a) => a.id === ctx.vendor?.defaultBillToId);
  const autoShipTo = defaultShipTo(draft.lines, m);

  return (
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          {f.area('shipTo', 'Ship to', {
            rows: 4,
            hint: (
              <>
                The warehouse’s address for items; the company address when the PO only has services.{' '}
                {autoShipTo && draft.shipTo !== autoShipTo ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ shipTo: autoShipTo })}>
                    Use default
                  </Button>
                ) : null}
              </>
            ),
          })}
          {f.area('payTo', 'Pay to', {
            rows: 4,
            hint: (
              <>
                The vendor’s default pay-to address.{' '}
                {bill ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ payTo: formatAddress(bill, ctx.vendor?.name) })}>
                    Use default
                  </Button>
                ) : null}
              </>
            ),
          })}
        </Fields>
      </Section>
      <Section icon="route" title="Delivery">
        <Fields>
          {f.choose(
            'shippingType',
            'Shipping type',
            [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)],
            { hint: 'Defaults from the vendor.' },
          )}
          {PURCHASING_SETTINGS.multiLanguageSupport
            ? f.pick('language', 'Language', LANGUAGES, { hint: 'Prints the PO in the vendor’s language.' })
            : null}
        </Fields>
        <Flags>
          {f.check('splitByWarehouse', 'Split purchase order', { disabled: ctx.added })}
          {f.check('approved', 'Approved')}
        </Flags>
        <p className="mt-2 text-sm text-muted">
          {ctx.added
            ? 'Split applies when a PO is added.'
            : draft.splitByWarehouse && warehouses.length > 1
              ? `Adding creates ${warehouses.length} POs, one per warehouse (${warehouses.join(', ')}).`
              : 'Split purchase order creates one PO per warehouse when lines go to several.'}{' '}
          Unapproved POs are saved as Not Confirmed and can’t be received until approved.
        </p>
      </Section>
    </div>
  );
}
