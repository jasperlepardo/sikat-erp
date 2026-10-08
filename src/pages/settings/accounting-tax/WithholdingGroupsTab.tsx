import { TableStatus } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  TREATY_INCOME_TYPES,
  type WithholdingGroup,
} from '../../../mocks/taxes';
import { withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const blank = (): WithholdingGroup => ({
  id: newId('wg'),
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
  active: true,
  notes: '',
});

export function WithholdingGroupsTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingGroups);
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
      onSetActive={setActive}
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
        return e;
      }}
      onSave={(g) => save({ ...g, code: g.code.trim().toUpperCase() })}
      editor={(g, update, errors) => {
        const f = bind(g, update);
        const atcOptions = (includeNull: boolean) => [
          ...(includeNull ? [{ value: '', label: '— None —' }] : []),
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
          f.lookup(field, label, atcOptions(true), {
            clearable: true,
            hint: g[field] ? atcLabel(g[field] as string) : hint,
          });

        return (
          <>
            <FieldStack>
              {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. WH-PROF' })}
              {f.text('name', 'Name', { required: true, error: errors.name })}
              {f.area('notes', 'Notes', { rows: 2 })}
            </FieldStack>

            <Section icon="person" title="Resident payee">
              <FieldStack>
                {pickAtc('atcIndividual', 'Individual — default / low tier', 'Low income tier or no tier.')}
                {pickAtc('atcIndividualHigh', 'Individual — high income tier', 'Leave blank if not tiered.')}
                {pickAtc('atcCorporate', 'Corporate — default / low tier')}
                {pickAtc('atcCorporateHigh', 'Corporate — high income tier', 'Leave blank if not tiered.')}
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

            <FieldStack>{f.status('active', 'Status')}</FieldStack>
          </>
        );
      }}
    />
  );
}
