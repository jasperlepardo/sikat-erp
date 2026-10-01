import { useEffect, useState } from 'react';
import { Button, Combobox, FormField, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../components/form/fields';
import { RDOS, type CompanyTaxProfile } from '../../../mocks/taxes';
import { companyTax } from '../../../services/masterData';

/** The company's own BIR registration — drives percentage tax and top-withholding-agent rules. */
export function CompanyTaxTab() {
  const [profile, setProfile] = useState<CompanyTaxProfile>();
  const [saved, setSaved] = useState<CompanyTaxProfile>();
  const [error, setError] = useState('');

  useEffect(() => {
    companyTax.list().then(([p]) => {
      setProfile(p);
      setSaved(p);
    });
  }, []);

  if (!profile) return <Text tone="muted" className="p-4">Loading…</Text>;
  const f = bind(profile, (patch) => setProfile({ ...profile, ...patch }));
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);

  const save = async () => {
    if (profile.tin && !/^\d{3}-\d{3}-\d{3}-\d{3,5}$/.test(profile.tin)) {
      setError('Use the BIR format 000-000-000-000 (branch code 000 for the head office).');
      return;
    }
    setError('');
    const next = await companyTax.save(profile);
    setProfile(next);
    setSaved(next);
  };

  return (
    <Section
      icon="corporate_fare"
      title="Company tax profile"
      actions={
        <Button type="button" size="small" intent="primary" variant="solid" disabled={!dirty} onClick={save}>
          Save
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        From the company's BIR Certificate of Registration (Form 2303). These settings run first in tax determination.
      </Text>
      <Fields cols={3}>
        {f.text('registeredName', 'Registered name')}
        {f.text('tin', 'TIN', { placeholder: '000-000-000-000', error })}
        <FormField label="RDO code" tooltip="Revenue District Office on the COR.">
          {(p) => (
            <Combobox
              {...p}
              options={RDOS}
              value={profile.rdoCode || null}
              placeholder="Search by code or area"
              onValueChange={(v) => setProfile({ ...profile, rdoCode: v ?? '' })}
            />
          )}
        </FormField>
      </Fields>
      <Flags>
        {f.check('vatRegistered', 'VAT-registered')}
        {f.check('topWithholdingAgent', 'Top withholding agent (BIR-notified)')}
        {f.check('exportEnterprise', 'Registered export enterprise (PEZA, BOI or other IPA)')}
        {f.check('governmentEntity', 'Government entity (NGA, LGU, GOCC)')}
      </Flags>
      <Text variant="small" tone="muted">
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
    </Section>
  );
}
