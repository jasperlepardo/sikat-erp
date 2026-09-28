import { useEffect, useState } from 'react';
import { Text } from '@jasperlepardo/sikat-design-system';
import { BUSINESS_TYPES, TREATY_COUNTRIES } from '../../../mocks/masters';
import type { WithholdingTax } from '../../../mocks/taxes';
import { ExemptionsSection } from './ExemptionsSection';
import { TreatyIncomesPanel } from './TreatyIncomesPanel';
import { withholdingTaxes } from '../../../services/masterData';
import type { TabProps } from './GeneralTab';
import { Fields, Flags, Section, bind } from './fields';

const NON_RESIDENT_TYPES = ['Non-resident foreign company', 'Non-resident foreign partnership'];
const RESIDENT_CORPORATE_TYPES = ['Company', 'Resident foreign company', 'Partnership', 'General professional partnership', 'Resident foreign partnership'];


export function SettingsTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  // True when businessType itself determines nonResident (locks the checkbox either way).
  const nonResidentDrivenByType = NON_RESIDENT_TYPES.includes(draft.businessType) || RESIDENT_CORPORATE_TYPES.includes(draft.businessType);
  const [withholding, setWithholding] = useState<WithholdingTax[]>([]);
  useEffect(() => { withholdingTaxes.list().then(setWithholding); }, [draft.id]);


  // ── Residency and VAT registration rules ──────────────────────────────────
  // One patch, so the rules can't overwrite each other:
  // · non-resident foreign types are non-resident; resident types, cooperatives and government are not
  // · digital services (RA 12023) implies non-resident
  // · a non-resident is outside the VAT system unless it's a digital service provider registered with BIR
  const alwaysResident = draft.businessType === 'Cooperative' || draft.businessType === 'Government';
  useEffect(() => {
    let { nonResident, nonResidentDigitalServices, vatRegistered } = draft;
    if (NON_RESIDENT_TYPES.includes(draft.businessType)) nonResident = true;
    else if (RESIDENT_CORPORATE_TYPES.includes(draft.businessType) || alwaysResident) {
      nonResident = false;
      nonResidentDigitalServices = false;
    } else if (nonResidentDigitalServices) nonResident = true;
    if (!nonResident) nonResidentDigitalServices = false;
    if (nonResident && !nonResidentDigitalServices) vatRegistered = false;
    if (
      nonResident !== draft.nonResident ||
      nonResidentDigitalServices !== draft.nonResidentDigitalServices ||
      vatRegistered !== draft.vatRegistered
    ) {
      update({ nonResident, nonResidentDigitalServices, vatRegistered });
    }
  }, [draft.businessType, draft.nonResident, draft.nonResidentDigitalServices, draft.vatRegistered]);

  // ── Derived option lists ───────────────────────────────────────────────────
  const payee = ['Individual', 'Sole proprietorship'].includes(draft.businessType) ? 'Individual' : 'Corporate';

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

  const nonResidentLocked = draft.nonResidentDigitalServices || nonResidentDrivenByType || alwaysResident;

  return (
    <>
      {/* ── Entity ── */}
      <Section icon="badge" title="Entity">
        <Fields>
          {f.pick('businessType', 'Type of business', BUSINESS_TYPES, {
            hint: 'Determines withholding payee type (Individual vs Corporate), non-resident status, and applicable ATC series.',
          })}
          {!draft.nonResident ? f.text('birCorNumber', 'BIR Certificate of Registration no.', {
            hint: 'Form 2303 number. Required for VAT and non-VAT registered entities.',
            placeholder: 'e.g. RC-0000123456',
          }) : null}
          {draft.vatRegistered && !draft.nonResident ? f.date('vatRegistrationDate', 'VAT registration date', {
            hint: 'Date BIR registered this partner for VAT. Used to validate input VAT claims on vendor invoices.',
          }) : null}
        </Fields>
        {draft.businessType !== 'Government' && !draft.nonResident ? (
          <Flags>
            {f.check('vatRegistered', 'BIR-registered for VAT')}
          </Flags>
        ) : null}
      </Section>

      {/* ── Government / non-resident customer notes ── */}
      {isCustomer && draft.businessType === 'Government' ? (
        <Section icon="sell" title="Customer tax">
          <Text variant="small" tone="muted">
            Government agency / GOCC — the buyer withholds 5% creditable VAT and issues BIR Form 2307. No exemption card needed.
          </Text>
        </Section>
      ) : null}
      {isCustomer && draft.nonResident && draft.businessType !== 'Government' ? (
        <Section icon="sell" title="Customer tax">
          <Text variant="small" tone="muted">
            Non-resident customer — Philippine VAT exemption certificates do not apply. Standard VAT rules govern the transaction.
          </Text>
        </Section>
      ) : null}
      {isCustomer && !draft.nonResident && draft.businessType !== 'Government' ? (
        <Section icon="sell" title="Customer tax">
          <Flags>{f.check('topWithholdingAgent', 'Top withholding agent (BIR-designated)')}</Flags>
          <Text variant="small" tone="muted">
            {draft.topWithholdingAgent
              ? 'Withholds 1% on goods and 2% on services from what it pays you, and gives you BIR Form 2307 to credit against income tax.'
              : 'Tick when BIR has designated this customer a top withholding agent (large taxpayers, top corporations).'}
          </Text>
        </Section>
      ) : null}

      {/* ── Exemptions (unified VAT + sworn declaration) ── */}
      <ExemptionsSection
        showVatExemptions={isCustomer && draft.businessType !== 'Government' && !draft.nonResident}
        exemptions={draft.vatExemptions}
        businessType={draft.businessType}
        onExemptionsChange={(vatExemptions) => update({ vatExemptions })}
        showSwornDeclaration={
          isVendor && !draft.nonResident && draft.businessType !== 'Government' && !(payee === 'Individual' && draft.vatRegistered)
        }
        swornDeclaration={{
          swornDeclarationRef: draft.swornDeclarationRef,
          swornDeclarationDate: draft.swornDeclarationDate,
          swornDeclarationAttachments: draft.swornDeclarationAttachments,
        }}
        payee={payee}
        onSwornDeclarationChange={(patch) => update(patch)}
      />

      {/* ── Vendor tax ── */}
      {isVendor ? (
        draft.businessType === 'Government' ? (
          <Section icon="shopping_cart" title="Vendor tax">
            <Text variant="small" tone="muted">
              Government agency / GOCC — payments to government entities are not subject to expanded withholding tax.
            </Text>
          </Section>
        ) : (
        <Section icon="shopping_cart" title="Vendor tax">
          <Fields>
            {f.choose('withholdingOverrideId', 'Withholding tax override', withholdingOptions, {
              hint: draft.nonResident
                ? 'Non-resident: showing final withholding (FWT) ATCs only.'
                : 'Leave on "Use the rules" unless this vendor always gets one specific ATC.',
            })}
          </Fields>
          {(!nonResidentLocked) ? (
            <Flags>
              {f.check(
                'nonResident',
                'Non-resident — not doing business in the Philippines (final tax instead of EWT)',
              )}
            </Flags>
          ) : null}
          {draft.nonResident ? (
            <>
            <Flags>
              {f.check('nonResidentDigitalServices', 'Provides digital services to Philippine consumers (RA 12023)')}
              {draft.nonResidentDigitalServices
                ? f.check('vatRegistered', 'Registered with BIR as a digital service provider — charges 12% VAT on its invoices')
                : null}
            </Flags>
            <Fields>
              {f.pick('taxTreatyCountry', 'Treaty country', ['', ...TREATY_COUNTRIES], {
                hint: 'Country whose tax treaty with the Philippines applies to this vendor.',
              })}
              {f.text('taxTreatyCertificate', 'Certificate of Residence ref', {
                hint: 'Reference number on the Certificate of Residence issued by the foreign tax authority.',
              })}
              {f.date('taxTreatyCertificateExpiry', 'Certificate valid until')}
            </Fields>
            </>
          ) : null}
          <Text variant="small" tone="muted">
            {draft.nonResident
              ? 'Non-residents are subject to final withholding tax — income tiers do not apply. On services and property lease you also withhold the 12% VAT (BIR Form 1600-VT), unless the vendor is a digital service provider registered with BIR. A treaty rate applies once the treaty income has an approved rate and a document, and the Certificate of Residence is on file and unexpired.'
              : payee === 'Individual'
                ? draft.vatRegistered
                  ? 'VAT-registered individuals always get the higher rate (e.g. WI011 10%), so no sworn declaration is needed.'
                  : 'Individuals: higher rate (e.g. WI011 10%) above ₱3M. Without a valid sworn declaration for this year, the higher rate applies regardless.'
                : 'Corporations: higher rate (e.g. WC011 15%) above ₱720,000. Without a valid sworn declaration for this year, the higher rate applies regardless.'
            }{' '}
            {!draft.nonResident ? 'Also adjusts an override set to an income-tiered ATC.' : ''}
          </Text>
        </Section>
        )
      ) : null}
      {isVendor && draft.nonResident && draft.taxTreatyCountry ? (
        <TreatyIncomesPanel
          incomes={draft.taxTreatyIncomes}
          treatyCountry={draft.taxTreatyCountry}
          onChange={(taxTreatyIncomes) => update({ taxTreatyIncomes })}
        />
      ) : null}
    </>
  );
}
