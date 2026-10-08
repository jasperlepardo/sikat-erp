import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  IconButton,
  Panel,
  PanelHeader,
  Text,
  panelHeaderIcons,
} from '@jasperlepardo/sikat-design-system';
import { Section, type Errors } from '../../../components/form/fields';
import { MasterDefList } from '../../../components/form/MasterLookup';
import type { ListRoute } from '../../../components/form/MasterList';
import type { Company } from '../../../mocks/companies';
import type { CompanyTaxProfile } from '../../../mocks/taxes';
import { CompanyTaxFields, loadTaxProfile, validateTaxProfile } from '../accounting-tax/CompanyTaxFields';
import { OfficesCard } from './OfficesCard';
import { companyDef } from '../masterDefs';
import { companies } from '../../../services/companies';
import { companyTax } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';

/** Companies list; when a record is open, a two-card company detail page. */
export function CompaniesTab({ basePath, recordId }: ListRoute) {
  if (!recordId) return <MasterDefList def={companyDef} basePath={basePath} />;
  return <CompanyDetail basePath={basePath} recordId={recordId} />;
}

function CompanyDetail({ basePath, recordId }: { basePath: string; recordId: string }) {
  const navigate = useNavigate();
  const rows = useAsync(() => companies.list(), []);
  const [draft, setDraft] = useState<Company | null>(null);
  // The BIR registration is saved with the company, by the same Save.
  const savedTax = useAsync(loadTaxProfile, []);
  const [taxDraft, setTaxDraft] = useState<CompanyTaxProfile | null>(null);
  const tax = taxDraft ?? savedTax;
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const isNew = recordId === 'new';
  const loaded = rows !== undefined && savedTax !== undefined;
  const fresh = useMemo(() => (isNew && loaded ? companyDef.blank('') : null), [isNew, loaded]);
  const existing = isNew ? undefined : rows?.find((r) => r.id === recordId);
  const row = draft ?? fresh ?? (existing ? structuredClone(existing) : null);
  const back = () => navigate(basePath);

  if (!loaded) return <Text tone="muted" className="p-4">Loading…</Text>;
  if (!row) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="domain" title="Company not found" />
        <Panel.Body>
          <Button onClick={back}>Back to companies</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const siblings = [...(rows ?? [])]
    .sort((a, b) => companyDef.label(a).localeCompare(companyDef.label(b)))
    .map((r) => r.id);
  const at = siblings.indexOf(recordId);
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at < siblings.length - 1 ? siblings[at + 1] : undefined;

  const save = async () => {
    const found = { ...companyDef.validate(row, rows ?? []), ...(tax && !isNew ? validateTaxProfile(tax) : {}) };
    if (!isNew && !row.registeredOffice) found.registeredOffice = 'Mark an office under Office addresses as the registered address.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const company = await companies.save(companyDef.normalize ? companyDef.normalize(row) : row);
      // The tax profile's registered name is the company's.
      if (tax && !isNew) await companyTax.save({ ...tax, registeredName: company.name });
      back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="flex-1">
      <PanelHeader
        type="details"
        icon="domain"
        title={isNew ? 'New company' : companyDef.label(row)}
        subcopy="Company"
        leading={
          isNew ? undefined : (
            <>
              <IconButton
                type="button"
                label="Next"
                intent="default"
                variant="solid"
                size="extra-large"
                disabled={!nextId}
                onClick={() => navigate(`${basePath}/${nextId}`)}
              >
                {panelHeaderIcons.arrowDownward}
              </IconButton>
              <IconButton
                type="button"
                label="Previous"
                intent="default"
                variant="solid"
                size="extra-large"
                disabled={!prevId}
                onClick={() => navigate(`${basePath}/${prevId}`)}
              >
                {panelHeaderIcons.arrowUpward}
              </IconButton>
            </>
          )
        }
        actions={
          <>
            <Button type="button" intent="default" variant="solid" size="extra-large" onClick={back}>
              Cancel
            </Button>
            <Button
              type="button"
              intent="primary"
              variant="solid"
              size="extra-large"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <div className="grid grid-cols-12 gap-2">
        <div className="col-span-6 col-start-4 flex flex-col gap-2">
          {Object.keys(errors).length ? (
            <Text variant="small" tone="danger">Fix the highlighted fields to save.</Text>
          ) : null}
          <Section icon={isNew ? 'add_circle' : 'edit'} title="Details">
            {companyDef.editor(row, (patch) => setDraft({ ...row, ...patch }), errors, isNew)}
            {tax && !isNew ? (
              <CompanyTaxFields profile={tax} onChange={(patch) => setTaxDraft({ ...tax, ...patch })} errors={errors} />
            ) : null}
          </Section>
          {isNew ? null : (
            <OfficesCard
              registered={row.registeredOffice}
              onRegister={(code) => setDraft({ ...row, registeredOffice: code })}
              error={errors.registeredOffice}
            />
          )}
        </div>
        </div>
      </Panel.Body>
    </Panel>
  );
}
