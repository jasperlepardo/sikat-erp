import { useEffect, useState } from 'react';
import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { GL_ACCOUNTS, PLANNING_GROUPS } from '../../../mocks/masters';
import type { Partner } from '../../../mocks/partners';
import { SALES_VAT_TREATMENTS, SUPPLIER_VAT_STATUSES, type WithholdingTax } from '../../../mocks/taxes';
import { withholdingTaxes } from '../../../services/masterData';
import { listPartners } from '../../../services/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

export function AccountingTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  const [others, setOthers] = useState<Partner[]>([]);
  const [withholding, setWithholding] = useState<WithholdingTax[]>([]);
  useEffect(() => {
    listPartners().then((all) => setOthers(all.filter((p) => p.id !== draft.id)));
    withholdingTaxes.list().then(setWithholding);
  }, [draft.id]);

  // Individuals and sole proprietors use WI codes; companies use WC codes.
  const payee = ['Individual', 'Sole proprietorship'].includes(draft.businessType) ? 'Individual' : 'Corporate';
  const withholdingOptions = [
    { value: '', label: 'Use the rules (by item and company status)' },
    ...withholding
      .filter((w) => (w.active && w.kind === 'Expanded (EWT)' && w.payee === payee) || w.id === draft.withholdingOverrideId)
      .map((w) => ({ value: w.id, label: `${w.atc || 'ATC to confirm'} · ${w.description}${w.condition ? ` — ${w.condition}` : ''} (${w.rate}%)` })),
  ];

  const consolidating = others.find((p) => p.id === draft.consolidatingPartnerId);
  const partnerOptions = ['— None —', ...others.map((p) => `${p.code} · ${p.name}`)];

  return (
    <>
      <Section icon="receipt_long" title="Tax">
        <Text variant="small" tone="muted">
          Used by tax determination: these statuses override the item’s default tax code. Test them in Settings › Accounting &
          Tax › Determination rules.
        </Text>
        <Fields>
          {isCustomer
            ? f.choose('salesVatTreatment', 'VAT treatment as a customer', SALES_VAT_TREATMENTS, {
                hint: 'Government → OVG12 · Zero-rated → OV0 · Exempt entity → OVX · Regular → the item’s code.',
              })
            : null}
          {isCustomer && draft.salesVatTreatment === 'Zero-rated' ? (
            <>
              {f.text('zeroRatedCertificate', 'Zero-rating certificate no.', {
                required: true,
                error: errors.zeroRatedCertificate,
                placeholder: 'e.g. PEZA-REE-2024-0183',
              })}
              {f.date('zeroRatedValidUntil', 'Certificate valid until', {
                hint: 'After this date sales fall back to regular VAT.',
              })}
            </>
          ) : null}
          {isVendor
            ? f.choose('supplierVatStatus', 'VAT status as a supplier', SUPPLIER_VAT_STATUSES, {
                hint: 'Non-VAT → no input VAT (INV) · Non-resident digital → you withhold the 12% VAT (IVD12).',
              })
            : null}
          {isVendor
            ? f.choose('withholdingOverrideId', 'Withholding tax override', withholdingOptions, {
                hint: 'Leave on “Use the rules” unless this vendor always gets one specific ATC.',
              })
            : null}
          <ReadOnly label="Withholding payee type" value={payee} hint="From Type of business on the General tab." />
        </Fields>
        {isVendor ? (
          <>
            <Flags>
              {f.check(
                'grossIncomeAboveThreshold',
                `Gross income this year exceeds ${payee === 'Individual' ? '₱3M' : '₱720,000'}`,
              )}
            </Flags>
            <Text variant="small" tone="muted">
              {payee === 'Individual'
                ? 'Individuals get the higher rate (e.g. WI011 10% instead of WI010 5%) above ₱3M, or when VAT-registered regardless of amount.'
                : 'Corporations get the higher rate (e.g. WC011 15% instead of WC010 10%) above ₱720,000.'}{' '}
              Also adjusts an override set to an income-tiered ATC.
            </Text>
          </>
        ) : null}
      </Section>

      <Section icon="account_tree" title="Control accounts">
        <Fields>
          {isCustomer
            ? f.pick('receivableAccount', 'Accounts receivable', GL_ACCOUNTS.receivable, {
                required: true,
                error: errors.receivableAccount,
                hint: 'Every invoice to this partner posts here.',
              })
            : null}
          {isVendor
            ? f.pick('payableAccount', 'Accounts payable', GL_ACCOUNTS.payable, {
                required: true,
                error: errors.payableAccount,
                hint: 'Every bill from this partner posts here.',
              })
            : null}
          {f.pick('downPaymentClearingAccount', 'Down payment clearing account', GL_ACCOUNTS.downPaymentClearing)}
          {f.pick('downPaymentInterimAccount', 'Down payment interim account', GL_ACCOUNTS.downPaymentInterim)}
        </Fields>
        {!isCustomer && !isVendor ? (
          <Text variant="small" tone="muted">
            Control accounts apply once this partner is a customer or vendor.
          </Text>
        ) : null}
      </Section>

      <Section icon="hub" title="Consolidation">
        <Fields>
          <PartnerPick
            label="Consolidating business partner"
            value={consolidating ? `${consolidating.code} · ${consolidating.name}` : '— None —'}
            options={partnerOptions}
            onChange={(v) =>
              update({ consolidatingPartnerId: others.find((p) => `${p.code} · ${p.name}` === v)?.id ?? '' })
            }
          />
        </Fields>
        {draft.consolidatingPartnerId ? (
          <div className="flex gap-6" role="radiogroup" aria-label="Consolidation type">
            <Radio
              name="consolidation"
              checked={draft.consolidationType === 'payment'}
              onChange={() => update({ consolidationType: 'payment' })}
            >
              Payment consolidation
            </Radio>
            <Radio
              name="consolidation"
              checked={draft.consolidationType === 'delivery'}
              onChange={() => update({ consolidationType: 'delivery' })}
            >
              Delivery consolidation
            </Radio>
          </div>
        ) : null}
        <Fields cols={1}>
          <ReadOnly
            label="Connected vendor / customer"
            value={
              isCustomer && isVendor
                ? 'Same record — this partner is both a customer and a vendor, so AR and AP can be netted directly.'
                : 'Not needed: add the Vendor or Customer role on the General tab instead of linking a second record.'
            }
          />
        </Fields>
      </Section>

      <Section icon="mark_email_unread" title="Dunning">
        <Fields>
          <ReadOnly label="Dunning level" value={draft.dunningLevel || '—'} hint="Updated by dunning runs." />
          <ReadOnly label="Last dunning date" value={draft.dunningDate || '—'} hint="Updated by dunning runs." />
        </Fields>
        <Flags>{f.check('blockDunning', 'Block dunning letters')}</Flags>
      </Section>

      <Section icon="tune" title="Other">
        <Fields>{f.pick('planningGroup', 'Planning group', PLANNING_GROUPS)}</Fields>
        <Flags>
          {f.check('affiliate', 'Affiliate (related company)')}
          {f.check('useShippedGoodsAccount', 'Use shipped goods account')}
        </Flags>
      </Section>
    </>
  );
}

/** Picks another business partner by display name; reports the chosen name. */
function PartnerPick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const obj = { value };
  return bind(obj, (p) => p.value !== undefined && onChange(p.value)).pick('value', label, options, {
    hint: 'Parent partner for consolidated payments or deliveries.',
  });
}
