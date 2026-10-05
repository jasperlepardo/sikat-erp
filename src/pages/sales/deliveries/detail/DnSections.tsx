import { Button, CardField, FormField, Icon, Select, Text, TextField, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { SHIPPED_GOODS_ACCOUNT } from '../../../../mocks/deliveries';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { contactName, type PartnerAddress } from '../../../../mocks/partners';
import { INDICATORS, LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { DnSectionProps } from './types';

const locationIcon = <Icon size={16}>location_on</Icon>;
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

function addressFields(a: PostalAddress) {
  return [
    { label: 'Address', value: a.addressLine },
    { label: 'Barangay', value: a.block },
    { label: 'City', value: a.city },
    ...(a.country === 'Philippines' ? [{ label: 'Province', value: a.province }] : []),
    { label: 'ZIP code', value: a.zip },
    ...(a.country !== 'Philippines' ? [{ label: 'Country', value: a.country }] : []),
  ].filter((x) => !!x.value);
}

export function DnLogistics({ draft, update, m, ctx }: DnSectionProps) {
  const f = bind(draft, update);
  const customer = ctx.customer;
  const addresses = customer?.addresses ?? [];
  const text = (a: PartnerAddress) => formatAddress(a, customer?.name);
  const options = (current: string, defaultId: string | undefined, tag: string): CardFieldOption[] => {
    const known: CardFieldOption[] = addresses.map((a) => ({ value: a.id, label: `${a.label || 'Untitled address'}${a.id === defaultId ? ` (${tag})` : ''}`, icon: locationIcon, fields: addressFields(a) }));
    if (!current || addresses.some((a) => text(a) === current)) return known;
    const lines = current.split('\n').filter(Boolean);
    return [{ value: '__custom__', label: lines[0] ?? 'Address on this delivery', icon: locationIcon, fields: lines.slice(1).map((value) => ({ label: '', value })) }, ...known];
  };
  const picked = (current: string) => addresses.find((a) => text(a) === current)?.id ?? (current ? '__custom__' : '');
  const fill = (field: 'shipTo' | 'billTo', id: string) => {
    const a = addresses.find((x) => x.id === id);
    if (a) update({ [field]: text(a) });
  };

  return (
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          <CardField label="Ship to" options={options(draft.shipTo, customer?.defaultShipToId, 'default ship-to')} value={picked(draft.shipTo)} onValueChange={(v) => fill('shipTo', v)} placeholder={customer ? 'Select a delivery address' : 'Pick a customer first'} readOnly={ctx.readOnly} />
          <CardField label="Bill to" options={options(draft.billTo, customer?.defaultBillToId, 'default bill-to')} value={picked(draft.billTo)} onValueChange={(v) => fill('billTo', v)} placeholder={customer ? 'Select a billing address' : 'Pick a customer first'} readOnly={ctx.readOnly} />
        </Fields>
      </Section>
      <Section icon="route" title="Shipment">
        <Fields>
          {f.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
          {SALES_SETTINGS.multiLanguageSupport ? f.pick('language', 'Language', LANGUAGES) : null}
          {f.text('trackingNo', 'Tracking no.', { placeholder: 'e.g. LBC-7710-2290-14', hint: 'The courier’s tracking number; printed on the delivery note.' })}
          {f.text('stampNo', 'Stamp no.', { hint: 'Customs or regulatory stamp reference, where one applies.' })}
          {f.text('pickPackRemarks', 'Pick and pack remarks', { hint: 'Printed on the picking and packing documents.' })}
        </Fields>
      </Section>
      <Section icon="storefront" title="BP channel">
        <Fields>
          {f.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee' })}
          <FormField label="BP channel contact">
            {(p) => (
              <Select {...p} disabled={ctx.readOnly || !customer} options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]} value={draft.bpChannelContact} onValueChange={(bpChannelContact) => update({ bpChannelContact })} />
            )}
          </FormField>
        </Fields>
      </Section>
    </div>
  );
}

export function DnAccounting({ draft, update, errors, m }: DnSectionProps) {
  const f = bind(draft, update);
  const computedDue = soDueDate(draft.postingDate, termDays(draft.paymentTerms), draft.dueMonths, draft.dueDays);
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, termDays(draft.paymentTerms), next.dueMonths, next.dueDays) });
  };
  const shipped = m.accounts.find((a) => a.code === SHIPPED_GOODS_ACCOUNT);

  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & payment">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Deliveries – customer code”; the journal entry’s remark.' })}
          {f.master('project', 'BP project', projectDef, { clearable: true })}
          {f.master('paymentTerms', 'Payment terms', paymentTermDef, { hint: 'From the order or customer; carries to the invoice.' })}
          {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          {f.date('dueDate', 'Due date', {
            error: errors.dueDate,
            hint: (
              <>
                = {computedDue || '—'}.{' '}
                {draft.dueDate !== computedDue ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ dueDate: computedDue })}>
                    Recalculate due date
                  </Button>
                ) : null}
              </>
            ),
          })}
          <div className="grid grid-cols-2 gap-2">
            <TextField aria-label="Recalculate due date: months" type="number" min={0} suffix="months" value={String(draft.dueMonths)} onChange={(e) => setRecalc({ dueMonths: Number(e.currentTarget.value) || 0 })} />
            <TextField aria-label="Recalculate due date: days" type="number" min={0} suffix="days" value={String(draft.dueDays)} onChange={(e) => setRecalc({ dueDays: Number(e.currentTarget.value) || 0 })} />
            <Text variant="small" tone="muted" className="col-span-2">
              Manually recalculate due date: months and days from the posting date instead of the terms.
            </Text>
          </div>
          {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
        </Fields>
      </Section>
      <Section icon="event" title="References">
        <Fields>
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly label="Federal tax ID" value={draft.federalTaxId || <span className="text-muted">Customer has no TIN on file</span>} />
          {f.text('orderNumber', 'Order number', { hint: 'Set by Copy from sales order.' })}
        </Fields>
        <Flags>{f.check('useShippedGoodsAccount', 'Use shipped goods account')}</Flags>
        <Text variant="small" tone="muted">
          {draft.useShippedGoodsAccount
            ? `The cost goes to ${shipped ? `${shipped.code} ${shipped.name}` : SHIPPED_GOODS_ACCOUNT} until the A/R invoice moves it to COGS.`
            : 'The cost goes straight to COGS when the delivery is added.'}
        </Text>
      </Section>
    </div>
  );
}
