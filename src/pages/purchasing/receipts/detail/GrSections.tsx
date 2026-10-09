import { CardField, Icon, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { countryName } from '../../../../services/partnerMasters';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS, LANGUAGES } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { ReferencesTable } from '../../orders/detail/AccountingTab';
import type { PoMasters } from '../../orders/detail/types';
import type { GrContext, GrDraft, GrSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const locationIcon = <Icon size={16}>location_on</Icon>;

function addressFields(a: PostalAddress) {
  return [
    { label: 'Address', value: a.addressLine },
    { label: 'Barangay', value: a.block },
    { label: 'City', value: a.city },
    ...(a.countryCode === 'PH' ? [{ label: 'Province', value: a.province }] : []),
    { label: 'ZIP code', value: a.zip },
    ...(a.countryCode !== 'PH' ? [{ label: 'Country', value: countryName(a.countryCode) }] : []),
  ].filter((x) => !!x.value);
}

/** An option for every address, keyed by its formatted text — what the document stores. */
const option = (name: string, a: PostalAddress, tag = ''): CardFieldOption => ({
  value: formatAddress(a, name),
  label: `${name}${tag}`,
  icon: locationIcon,
  fields: addressFields(a),
});

/** Ship To, Pay To and shipping — shared by receipts and A/P invoices. */
type LogisticsDraft = Pick<GrDraft, 'shipTo' | 'payTo' | 'shippingType' | 'language'>;

export function GrLogistics({
  draft,
  update,
  m,
  ctx,
}: {
  draft: LogisticsDraft;
  update: (patch: Partial<LogisticsDraft>) => void;
  m: PoMasters;
  ctx: Pick<GrContext, 'vendor' | 'readOnly'>;
}) {
  const f = bind(draft, update);
  const vendor = ctx.vendor;
  // Ship To is ours: the company, or the warehouse the goods went into (stores restock by transfer).
  const shipOptions = [
    option(m.company.name, m.company.address),
    ...m.inv.warehouses.filter((w) => (w.active && receivesFromVendors(w)) || formatAddress(w.address, w.name) === draft.shipTo).map((w) => option(w.name, w.address)),
  ];
  // Pay To is the vendor's: where its invoice comes from and payment goes.
  const payOptions = (vendor?.addresses ?? []).map((a) =>
    option(vendor!.name, a, ` · ${a.label || 'Untitled address'}${a.id === vendor?.defaultBillToId ? ' (default bill-to)' : ''}`),
  );
  const withCurrent = (options: CardFieldOption[], current: string) =>
    !current || options.some((o) => o.value === current)
      ? options
      : [{ value: current, label: current.split('\n')[0], icon: locationIcon, fields: current.split('\n').slice(1).map((value) => ({ label: '', value })) }, ...options];

  return (
    <Section icon="local_shipping" title="Logistics">
      <Fields>
        <CardField
          label="Ship to"
          options={withCurrent(shipOptions, draft.shipTo)}
          value={draft.shipTo}
          onValueChange={(shipTo) => update({ shipTo })}
          placeholder="Where the goods were received"
          readOnly={ctx.readOnly}
        />
        <CardField
          label="Pay to"
          options={withCurrent(payOptions, draft.payTo)}
          value={draft.payTo}
          onValueChange={(payTo) => update({ payTo })}
          placeholder={vendor ? 'Vendor address for invoicing and payment' : 'Pick a vendor first'}
          readOnly={ctx.readOnly || !vendor}
        />
        {f.lookup(
          'shippingType',
          'Shipping type',
          [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)],
          { hint: 'Defaults from the vendor or the PO.' },
        )}
        {getPurchasingSettings().multiLanguageSupport ? f.pick('language', 'Language', LANGUAGES, { hint: 'Language the receipt prints in.' }) : null}
      </Fields>
    </Section>
  );
}

export function GrAccounting({ draft, update, ctx }: GrSectionProps) {
  const f = bind(draft, update);
  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Accounting">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Goods Receipt PO – vendor code”. It’s the remark on the journal entry.' })}
          {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor or the PO.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the PO; sets the due date.' })}
          {f.lookup(
            'paymentMethod',
            'Payment method',
            PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })),
            { hint: 'Defaults from the vendor.' },
          )}
          {f.num('cashDiscountDays', 'Cash discount date offset', {
            suffix: 'days',
            hint: 'Days added to the posting date before the early-payment discount window starts.',
          })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly
            label="Federal tax ID"
            value={ctx.vendor?.tin || <span className="text-muted">{ctx.vendor ? 'Not on the vendor record' : '—'}</span>}
            hint="The vendor’s TIN, from its business partner record."
          />
          <ReadOnly
            label="Order number"
            value={draft.orderNumber || '—'}
            hint="The PO the lines were copied from. Blank for a receipt entered without one."
          />
        </Fields>
      </Section>
      <ReferencesTable
        refs={draft.references}
        onChange={(references) => update({ references })}
        readOnly={ctx.readOnly}
        description="Other documents this receipt refers to, e.g. the vendor's delivery receipt or a courier waybill."
      />
    </div>
  );
}

