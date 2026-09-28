import { useEffect, useState } from 'react';
import { Text } from '@jasperlepardo/sikat-design-system';
import { BUSINESS_TYPES, TREATY_COUNTRIES } from '../../../mocks/masters';
import {
  EXEMPTION_BASES,
  SALES_VAT_TREATMENTS,
  SUPPLIER_VAT_STATUSES,
  type WithholdingTax,
} from '../../../mocks/taxes';
import { TreatyIncomesPanel } from './TreatyIncomesPanel';
import { withholdingTaxes } from '../../../services/masterData';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, ReadOnly, Section, bind } from './fields';

const NON_RESIDENT_TYPES = ['Non-resident foreign company', 'Non-resident foreign partnership'];
const RESIDENT_CORPORATE_TYPES = ['Company', 'Resident foreign company', 'Partnership', 'Resident foreign partnership'];


export function SettingsTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  // True when businessType itself determines nonResident (locks the checkbox either way).
  const nonResidentDrivenByType = NON_RESIDENT_TYPES.includes(draft.businessType) || RESIDENT_CORPORATE_TYPES.includes(draft.businessType);
  const [withholding, setWithholding] = useState<WithholdingTax[]>([]);
  useEffect(() => { withholdingTaxes.list().then(setWithholding); }, [draft.id]);

  // ── Customer VAT treatment rules ───────────────────────────────────────────
  useEffect(() => {
    if (!isCustomer) return;
    if (draft.businessType === 'Government' && draft.salesVatTreatment !== 'Government') {
      update({ salesVatTreatment: 'Government' });
    } else if (draft.businessType === 'Cooperative' && draft.salesVatTreatment !== 'Exempt entity') {
      update({ salesVatTreatment: 'Exempt entity', exemptionBasis: 'RA 9520 — Cooperative Code' });
    } else if (!['Government', 'Cooperative'].includes(draft.businessType) && draft.salesVatTreatment === 'Government') {
      update({ salesVatTreatment: 'Regular' });
    }
  }, [draft.businessType]);

  // ── Non-resident rules ─────────────────────────────────────────────────────
  // Non-resident foreign types → auto-set nonResident; resident types → clear it.
  useEffect(() => {
    if (NON_RESIDENT_TYPES.includes(draft.businessType) && !draft.nonResident) {
      update({ nonResident: true });
    } else if (RESIDENT_CORPORATE_TYPES.includes(draft.businessType) && draft.nonResident) {
      update({ nonResident: false });
    }
  }, [draft.businessType]);

  // Non-resident digital services → implies non-resident.
  // Non-resident → VAT-registered is not valid; reset to Non-VAT.
  useEffect(() => {
    if (!isVendor) return;
    if (draft.supplierVatStatus === 'Non-resident digital services' && !draft.nonResident) {
      update({ nonResident: true });
    }
  }, [draft.supplierVatStatus]);

  useEffect(() => {
    if (!isVendor) return;
    if (draft.nonResident && draft.supplierVatStatus === 'VAT-registered') {
      update({ supplierVatStatus: 'Non-VAT' });
    }
  }, [draft.nonResident]);

  // ── Derived option lists ───────────────────────────────────────────────────
  const payee = ['Individual', 'Sole proprietorship'].includes(draft.businessType) ? 'Individual' : 'Corporate';

  // Exemption bases available depend on business type.
  const exemptionBasisOptions = ['', ...EXEMPTION_BASES.filter((b) => {
    if (draft.businessType === 'Cooperative') return b === 'RA 9520 — Cooperative Code';
    if (draft.businessType === 'Individual') return true; // seniors/PWDs are individuals
    // Companies, partnerships: exclude senior/PWD basis
    return b !== 'RA 9994 / RA 10754 — Senior citizen / PWD';
  })];

  const certHint: Record<string, string> = {
    'RA 9520 — Cooperative Code': 'CDA Certificate of Registration number.',
    'Sec. 109 NIRC — BIR tax exemption ruling': 'BIR tax exemption ruling number.',
    'DepEd / CHED / TESDA — Educational institution': 'DepEd / CHED / TESDA accreditation certificate number.',
    'SEC registration — Non-stock non-profit / Religious / Charitable': 'SEC registration number of the non-stock non-profit entity.',
    'DFA certificate — Diplomatic mission': 'DFA certificate number.',
    'RA 9994 / RA 10754 — Senior citizen / PWD': 'Senior citizen / PWD ID or discount card number.',
  };

  // Government option is only valid for Government entities; all others exclude it.
  // Cooperative is locked to Exempt entity (handled by useEffect + disabled below).
  const vatTreatmentOptions = SALES_VAT_TREATMENTS.filter((t) =>
    draft.businessType === 'Government' ? true : t.value !== 'Government',
  );

  // Government vendor → only VAT-registered; non-resident → no VAT-registered.
  const vendorStatusOptions = SUPPLIER_VAT_STATUSES.filter((s) => {
    if (draft.businessType === 'Government') return s.value === 'VAT-registered';
    if (draft.nonResident) return s.value !== 'VAT-registered';
    return true;
  });

  // Non-resident → only FWT ATCs; otherwise EWT + FWT filtered by payee type.
  const withholdingOptions = [
    { value: '', label: 'Use the rules (by item and company status)' },
    ...withholding
      .filter((w) => {
        if (w.id === draft.withholdingOverrideId) return true;
        if (!w.active) return false;
        if (draft.nonResident) {
          if (w.kind !== 'Final (FWT)' || w.agent === 'Government') return false;
        } else {
          if (w.kind !== 'Expanded (EWT)' && w.kind !== 'Final (FWT)') return false;
          if (w.agent === 'Government') return false;
          if (w.payee !== payee && w.payee !== 'Any') return false;
        }
        return true;
      })
      .map((w) => ({
        value: w.id,
        label: `${w.atc || 'ATC to confirm'}${w.kind === 'Final (FWT)' ? ' (final)' : ''} · ${w.description}${w.condition ? ` — ${w.condition}` : ''} (${w.rate}%)`,
      })),
  ];

  const vatTreatmentLocked = draft.businessType === 'Government' || draft.businessType === 'Cooperative';
  const vendorStatusLocked = draft.businessType === 'Government';
  const nonResidentLocked = draft.supplierVatStatus === 'Non-resident digital services' || nonResidentDrivenByType;

  return (
    <>
      {/* ── Entity ── */}
      <Section icon="badge" title="Entity">
        <Fields>
          {f.pick('businessType', 'Type of business', BUSINESS_TYPES, {
            hint: 'Determines withholding payee type (Individual vs Corporate), non-resident status, and applicable ATC series.',
          })}
          {f.date('vatRegistrationDate', 'VAT registration date', {
            hint: 'Date BIR registered this partner for VAT. Used to validate input VAT claims on vendor invoices.',
          })}
        </Fields>
      </Section>

      {/* ── Customer tax ── */}
      {isCustomer ? (
        <Section icon="sell" title="Customer tax">
          <Fields>
            {f.choose('salesVatTreatment', 'VAT treatment', vatTreatmentOptions, {
              hint: "Government → 31 (buyer withholds 5% VAT) · Zero-rated → 32 · Exempt entity → 33 · Regular → the item's code.",
              disabled: vatTreatmentLocked,
            })}
            {draft.salesVatTreatment === 'Zero-rated' ? (
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
            {draft.salesVatTreatment === 'Exempt entity' ? (
              <>
                {f.pick('exemptionBasis', 'Exemption basis', exemptionBasisOptions, {
                  required: true,
                  disabled: draft.businessType === 'Cooperative',
                  hint: 'Legal ground for the VAT exemption.',
                })}
                {f.text('exemptionCertificate', 'Certificate / registration no.', {
                  required: true,
                  error: errors.exemptionCertificate,
                  hint: certHint[draft.exemptionBasis] ?? 'Reference number on the exemption document.',
                })}
                {f.date('exemptionValidUntil', 'Valid until', {
                  hint: 'Leave blank if the exemption has no expiry.',
                })}
              </>
            ) : null}
          </Fields>
        </Section>
      ) : null}

      {/* ── Vendor tax ── */}
      {isVendor ? (
        <Section icon="shopping_cart" title="Vendor tax">
          <Fields>
            {f.choose('supplierVatStatus', 'VAT status', vendorStatusOptions, {
              hint: 'Non-VAT → no input VAT (48) · Non-resident digital → you withhold the 12% VAT (45).',
              disabled: vendorStatusLocked,
            })}
            {f.choose('withholdingOverrideId', 'Withholding tax override', withholdingOptions, {
              hint: draft.nonResident
                ? 'Non-resident: showing final withholding (FWT) ATCs only.'
                : 'Leave on "Use the rules" unless this vendor always gets one specific ATC.',
            })}
            <ReadOnly label="Withholding payee type" value={payee} hint="From Type of business above." />
          </Fields>
          {(!draft.nonResident || !nonResidentLocked) ? (
            <Flags>
              {!draft.nonResident
                ? f.check(
                    'grossIncomeAboveThreshold',
                    `Gross income this year exceeds ${payee === 'Individual' ? '₱3M' : '₱720,000'}`,
                  )
                : null}
              {!nonResidentLocked
                ? f.check(
                    'nonResident',
                    'Non-resident — not doing business in the Philippines (final tax instead of EWT)',
                  )
                : null}
            </Flags>
          ) : null}
          {draft.nonResident ? (
            <Fields>
              {f.pick('taxTreatyCountry', 'Treaty country', ['', ...TREATY_COUNTRIES], {
                hint: 'Country whose tax treaty with the Philippines applies to this vendor.',
              })}
              {f.text('taxTreatyCertificate', 'Certificate of Residence ref', {
                hint: 'Reference number on the Certificate of Residence issued by the foreign tax authority.',
              })}
              {f.date('taxTreatyCertificateExpiry', 'Certificate valid until')}
            </Fields>
          ) : null}
          {draft.nonResident && draft.taxTreatyCountry ? (
            <TreatyIncomesPanel
              incomes={draft.taxTreatyIncomes}
              treatyCountry={draft.taxTreatyCountry}
              onChange={(taxTreatyIncomes) => update({ taxTreatyIncomes })}
            />
          ) : null}
          <Text variant="small" tone="muted">
            {draft.nonResident
              ? 'Non-residents are subject to final withholding tax — income tiers do not apply.'
              : payee === 'Individual'
                ? 'Individuals get the higher rate (e.g. WI011 10% instead of WI010 5%) above ₱3M, or when VAT-registered regardless of amount.'
                : 'Corporations get the higher rate (e.g. WC011 15% instead of WC010 10%) above ₱720,000.'
            }{' '}
            {!draft.nonResident ? 'Also adjusts an override set to an income-tiered ATC.' : ''}
          </Text>
        </Section>
      ) : null}
    </>
  );
}
