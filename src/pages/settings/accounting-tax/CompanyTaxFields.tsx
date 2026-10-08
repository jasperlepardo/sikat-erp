import { Combobox, MultiSelect, Text } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, bind, type Errors } from '../../../components/form/fields';
import { BUSINESS_ACTIVITIES, RDOS, paysExcise, type BusinessActivity, type CompanyTaxProfile } from '../../../mocks/taxes';
import { companyTax } from '../../../services/masterData';

const ACTIVITY_LABELS: Record<BusinessActivity, string> = {
  Manufacturer: 'Manufacturer (makes or assembles goods)',
  Importer: 'Importer (brings goods in through customs)',
  Reseller: 'Reseller (buys goods locally to sell)',
};

type StatusKey = 'vatRegistered' | 'topWithholdingAgent' | 'exportEnterprise' | 'governmentEntity';

/** The company's BIR registration, ready to edit: profiles saved before business activities existed count as a reseller. */
export async function loadTaxProfile(): Promise<CompanyTaxProfile> {
  const [stored] = await companyTax.list();
  return { ...stored, businessActivities: stored.businessActivities ?? ['Reseller'] };
}

/** Field errors for the tax profile (keys `tin`, `businessActivities`). */
export function validateTaxProfile(profile: CompanyTaxProfile): Errors {
  const e: Errors = {};
  if (!profile.businessActivities.length) e.businessActivities = 'Pick at least one business activity.';
  if (profile.tin && !/^\d{3}-\d{3}-\d{3}-\d{3,5}$/.test(profile.tin))
    e.tin = 'Use the BIR format 000-000-000-000 (branch code 000 for the head office).';
  return e;
}

/**
 * The company's own BIR registration — drives percentage tax and top-withholding-agent rules.
 * Saved with the company record (Settings › Company › Companies).
 */
export function CompanyTaxFields({
  profile,
  onChange,
  errors,
}: {
  profile: CompanyTaxProfile;
  onChange: (patch: Partial<CompanyTaxProfile>) => void;
  errors: Errors;
}) {
  const f = bind(profile, onChange);

  // A yes/no part of the registration, as a field with both answers spelled out.
  const status = (key: StatusKey, label: string, yes: string, no: string, tooltip?: string) => (
    <CtxFormField label={label} tooltip={tooltip}>
      {(p) => (
        <Combobox
          {...p}
          options={[
            { value: 'yes', label: yes },
            { value: 'no', label: no },
          ]}
          value={profile[key] ? 'yes' : 'no'}
          onValueChange={(v) => v && onChange({ [key]: v === 'yes' })}
        />
      )}
    </CtxFormField>
  );

  return (
    <>
      <Text variant="small" tone="muted">
        Tax registration, from the BIR Certificate of Registration (Form 2303). These settings run first in tax determination.
      </Text>
      <FieldStack>
        {f.text('tin', 'TIN', { placeholder: '000-000-000-000', error: errors.tin })}
        <CtxFormField label="RDO code" tooltip="Revenue District Office on the COR.">
          {(p) => (
            <Combobox
              {...p}
              options={RDOS}
              value={profile.rdoCode || null}
              placeholder="Search by code or area"
              onValueChange={(v) => onChange({ rdoCode: v ?? '' })}
            />
          )}
        </CtxFormField>
        {status('vatRegistered', 'VAT status', 'VAT-registered (charges 12% VAT)', 'Non-VAT (pays 3% percentage tax)', 'As on the COR.')}
        {status('topWithholdingAgent', 'Withholding agent', 'Top withholding agent (BIR-notified)', 'Regular', 'Only when BIR has notified you in writing.')}
        {status('exportEnterprise', 'Export registration', 'Registered export enterprise (PEZA, BOI or other IPA)', 'Not registered')}
        {status('governmentEntity', 'Entity type', 'Government (NGA, LGU, GOCC)', 'Private')}
        <CtxFormField label="Business activities" required error={errors.businessActivities} tooltip="Decides whether you pay excise yourself.">
          {(p) => (
            <MultiSelect
              {...p}
              options={BUSINESS_ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))}
              value={profile.businessActivities}
              placeholder="Pick one or more"
              onValueChange={(v) => onChange({ businessActivities: BUSINESS_ACTIVITIES.filter((a) => v.includes(a)) })}
            />
          )}
        </CtxFormField>
      </FieldStack>
      <Text variant="small" tone="muted">
        {paysExcise(profile)
          ? `You pay excise yourself ${[
              profile.businessActivities.includes('Manufacturer') && 'before goods leave your plant',
              profile.businessActivities.includes('Importer') && 'on import entries, before customs releases the goods',
            ].filter(Boolean).join(' and ')}.`
          : 'Reseller only: excise is already in what you pay suppliers, so it is part of item cost and never calculated.'}{' '}
        {profile.vatRegistered
          ? 'VAT-registered: sales carry output VAT from the item and customer.'
          : 'Not VAT-registered: every sale uses percentage tax (PT010), whatever the item says.'}{' '}
        {profile.governmentEntity
          ? 'Government entity: withholds 5% creditable VAT (WV010/WV020) or 3% percentage tax (WB080) from all supplier payments, and uses government EWT rates (WI640/WI157) on goods and services.'
          : profile.topWithholdingAgent
            ? 'As a top withholding agent, you withhold 1% on goods and 2% on services bought from regular suppliers.'
            : 'Not a top withholding agent: regular goods and services are not withheld (rent, contractors and professional fees still are).'}{' '}
        {profile.exportEnterprise
          ? 'As a registered export enterprise, suppliers may zero-rate qualifying purchases.'
          : 'Not an export enterprise: purchases in a zero-rated tax group are charged 12% instead.'}
      </Text>
    </>
  );
}
