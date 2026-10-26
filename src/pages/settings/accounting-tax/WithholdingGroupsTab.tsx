import { useState } from 'react';
import { Alert, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  TREATY_INCOME_TYPES,
  type WithholdingGroup,
} from '../../../mocks/taxes';
import { withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { blockedDeactivation, describeTaxUsage, loadTaxUsage } from '../../../services/taxUsage';
import { useAsync } from '../../../services/useAsync';
import { useCollectionRows } from '../../../services/useCollectionRows';

const blank = (): WithholdingGroup => ({
  // The id is set from the code on save: the code is the key.
  id: '',
  code: '',
  name: '',
  atcIndividual: null,
  atcIndividualHigh: null,
  atcCorporate: null,
  atcCorporateHigh: null,
  requiresTopWA: false,
  nrExempt: false,
  atcNrIndividual: null,
  atcNrCorporate: null,
  atcIndividualGov: null,
  atcCorporateGov: null,
  nrVat: null,
  treatyIncomeType: null,
  thresholdLabel: '',
  active: true,
  notes: '',
});

export function WithholdingGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingGroups);
  const usage = useAsync(loadTaxUsage, [rows]);
  const usedBy = (g: WithholdingGroup) => usage?.withholdingGroups.get(g.code);
  const [notice, setNotice] = useState<string>();
  // Withholding groups items, accounts or rules use can't be deactivated.
  const setActiveChecked = async (picked: WithholdingGroup[], active: boolean) => {
    const { allowed, notice: n } = blockedDeactivation(picked, active, usedBy, (g) => g.code);
    await setActive(allowed, active);
    setNotice(n);
  };
  const taxes = useAsync(withholdingTaxes.list, []) ?? [];

  const atcLabel = (atc: string | null) => {
    if (!atc) return '—';
    const w = taxes.find((t) => t.atc === atc);
    return w ? `${w.atc} · ${w.description}` : atc;
  };

  return (
    <MasterList<WithholdingGroup>
      {...route}
      icon="group"
      title="Withholding groups"
      noun="withholding group"
      description="Items carry a withholding group that determines which EWT/FWT ATC applies on purchase documents. The determination engine picks the right ATC by payee type, income tier, and whether the company is a government entity or top withholding agent."
      rows={rows}
      onSetActive={setActiveChecked}
      intro={notice ? <Alert intent="warning" variant="outline" title="Some withholding groups are in use">{notice}</Alert> : undefined}
      columns={[
        { key: 'code', header: 'Code', cell: (g) => <span className="font-semibold">{g.code}</span> },
        { key: 'name', header: 'Name', cell: (g) => g.name },
        {
          key: 'atcIndividual',
          header: 'Individual ATC',
          cell: (g) =>
            g.atcIndividual
              ? <span className="font-mono text-sm">{g.atcIndividual}{g.atcIndividualHigh ? ` / ${g.atcIndividualHigh}` : ''}</span>
              : <span className="text-muted">—</span>,
        },
        {
          key: 'atcCorporate',
          header: 'Corporate ATC',
          cell: (g) =>
            g.atcCorporate
              ? <span className="font-mono text-sm">{g.atcCorporate}{g.atcCorporateHigh ? ` / ${g.atcCorporateHigh}` : ''}</span>
              : <span className="text-muted">—</span>,
        },
        {
          key: 'thresholdLabel',
          header: 'Income tier',
          cell: (g) => (g.thresholdLabel ? <span className="text-sm">{g.thresholdLabel}</span> : <span className="text-muted">Not tiered</span>),
        },
        {
          key: 'usedBy',
          header: 'Used by',
          sortable: false,
          cell: (g) => {
            const u = describeTaxUsage(usedBy(g));
            return u ? <span className="max-w-xs whitespace-normal text-sm">{u}</span> : <span className="text-muted">—</span>;
          },
        },
        {
          key: 'active',
          header: 'Status',
          cell: (g) => (
            <TableStatus intent={g.active ? 'success' : 'default'}>{g.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(g) => [g.code, g.name, g.atcIndividual, g.atcCorporate, g.atcNrIndividual, g.atcNrCorporate].filter(Boolean).join(' ')}
      blank={blank}
      label={(g) => `${g.code} · ${g.name}`}
      validate={(g, all) => {
        const e: Record<string, string> = {};
        if (!g.code.trim()) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== g.id && x.code.toLowerCase() === g.code.trim().toLowerCase()))
          e.code = `${g.code} already exists.`;
        if (!g.name.trim()) e.name = 'Name is required.';
        if (!g.active && g.id && usage) {
          const u = describeTaxUsage(usedBy(g));
          if (u) e.active = `Still used by ${u}.`;
        }
        return e;
      }}
      onSave={(g) => save({ ...g, id: g.id || g.code.trim().toUpperCase(), code: g.code.trim().toUpperCase() })}
      editor={(g, update, errors, isNew) => {
        const f = bind(g, update);
        const atcOptions = () => [
          ...taxes
            .filter((t) => t.active || Object.values(g).includes(t.atc))
            .map((t) => ({ value: t.atc, label: `${t.atc} · ${t.description}` })),
        ];
        const pickAtc = (
          field: keyof Pick<WithholdingGroup,
            'atcIndividual' | 'atcIndividualHigh' | 'atcCorporate' | 'atcCorporateHigh' |
            'atcNrIndividual' | 'atcNrCorporate' | 'atcIndividualGov' | 'atcCorporateGov'
          >,
          label: string,
          hint?: string,
        ) =>
          f.lookup(field, label, atcOptions(), {
            clearable: true,
            hint: g[field] ? atcLabel(g[field] as string) : hint,
          });

        return (
          <>
            <FieldStack>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. WH-PROF', disabled: !isNew, hint: !isNew ? "Can't change once saved — items, partners and documents store it." : undefined })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.area('notes', 'Notes', { rows: 2 })}
            </FieldStack>

            <Section icon="person" title="Resident payee">
              <FieldStack>
                {pickAtc('atcIndividual', 'Individual — default / low tier', 'Low income tier or no tier.')}
                {pickAtc('atcIndividualHigh', 'Individual — high income tier', 'Leave blank if not tiered.')}
                {pickAtc('atcCorporate', 'Corporate — default / low tier')}
                {pickAtc('atcCorporateHigh', 'Corporate — high income tier', 'Leave blank if not tiered.')}
                {g.atcIndividualHigh || g.atcCorporateHigh
                  ? f.area('thresholdLabel', 'When the low tier applies', { rows: 2, hint: 'Shown beside the tiers. The thresholds and sworn-declaration check themselves are fixed in the tax rules.' })
                  : null}
                {f.check('requiresTopWA', 'Only applicable when the company is a top withholding agent')}
              </FieldStack>
            </Section>

            <Section icon="account_balance" title="Government withholding agent overrides">
              <FieldStack>
                {pickAtc('atcIndividualGov', 'Individual — government agent', 'Leave blank to use the regular individual ATC.')}
                {pickAtc('atcCorporateGov', 'Corporate — government agent', 'Leave blank to use the regular corporate ATC.')}
              </FieldStack>
            </Section>

            <Section icon="language" title="Non-resident payee">
              <FieldStack>
                {pickAtc('atcNrIndividual', 'Non-resident individual', 'Leave blank to fall back to WI330 (NRANETB 25%).')}
                {pickAtc('atcNrCorporate', 'Non-resident corporate', 'Leave blank to fall back to WC230 (NRFC 25%).')}
                {f.pick('nrVat', 'VAT type (Sec. 114(C))', ['Lease', 'Services'], {
                  clearable: true,
                  hint: 'Whether VAT must be withheld on payments to a non-resident. Lease = property/rights; Services = other. Leave blank for goods (import VAT rule applies instead).',
                })}
                {f.check('nrExempt', 'Goods from a non-resident — use import VAT rules, no EWT/FWT')}
              </FieldStack>
            </Section>

            <Section icon="handshake" title="Tax treaty">
              <FieldStack>
                {f.pick('treatyIncomeType', 'Treaty income type', [...TREATY_INCOME_TYPES], {
                  clearable: true,
                  hint: 'When set, the vendor\'s treaty rates are checked for this income type before applying the domestic rate.',
                })}
              </FieldStack>
            </Section>

            <FieldStack>
              {f.status('active', 'Status', { error: errors.active })}
              {isNew ? null : <Text variant="small" tone="muted">Used by: {describeTaxUsage(usedBy(g)) || 'not used yet.'}</Text>}
            </FieldStack>
          </>
        );
      }}
    />
  );
}
