import { TableStatus, TableSubcontent } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { WITHHOLDING_AGENTS, WITHHOLDING_KINDS, WITHHOLDING_KIND_INFO, type WithholdingTax } from '../../../mocks/taxes';
import { withholdingTaxes } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const blank = (): WithholdingTax => ({
  id: newId('wt'),
  atc: '',
  description: '',
  condition: '',
  kind: 'Expanded (EWT)',
  agent: 'Any',
  payee: 'Corporate',
  rate: 1,
  base: '',
  birForms: WITHHOLDING_KIND_INFO['Expanded (EWT)'].forms,
  legalBasis: '',
  active: true,
  notes: '',
});

const PAYEE: Record<WithholdingTax['payee'], string> = { Individual: 'IND', Corporate: 'CORP', Any: '—' };
const AGENT: Record<WithholdingTax['agent'], string | undefined> = {
  Any: undefined,
  Government: 'Government withholding agent only',
  Private: 'Private withholding agent only',
};

export function WithholdingTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingTaxes);
  return (
    <MasterList<WithholdingTax>
      {...route}
      icon="request_quote"
      title="Withholding tax"
      noun="withholding tax"
      description="BIR Alphanumeric Tax Codes (ATC) from the BIR Withholding Tax page: WE expanded, WF final, WV GMP value added taxes, WB GMP percentage taxes. IND = individual payee, CORP = corporate."
      rows={rows}
      onSetActive={setActive}
      columns={[
        {
          key: 'atc',
          header: 'ATC',
          cell: (w) =>
            w.atc ? <span className="font-semibold">{w.atc}</span> : <span className="text-warning">To confirm</span>,
        },
        {
          key: 'kind',
          header: 'Tax type',
          cell: (w) => <TableSubcontent subcopy={AGENT[w.agent]}>{WITHHOLDING_KIND_INFO[w.kind].type}</TableSubcontent>,
        },
        {
          key: 'description',
          header: 'Description',
          cell: (w) => (
            <TableSubcontent subcopy={w.condition || undefined}>
              <span className="line-clamp-2 max-w-xl whitespace-normal">{w.description}</span>
            </TableSubcontent>
          ),
        },
        { key: 'payee', header: 'IND / CORP', cell: (w) => PAYEE[w.payee] },
        { key: 'rate', header: 'Tax rate', cell: (w) => `${w.rate}%` },
        {
          key: 'active',
          header: 'Status',
          cell: (w) => (
            <TableStatus intent={w.active ? 'success' : 'default'}>{w.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(w) => `${w.atc} ${w.description} ${w.condition} ${WITHHOLDING_KIND_INFO[w.kind].type} ${WITHHOLDING_KIND_INFO[w.kind].name} ${PAYEE[w.payee]} ${w.notes}`}
      blank={blank}
      label={(w) => `${w.atc || 'No ATC'} · ${w.description}`}
      validate={(w, all) => {
        const e: Record<string, string> = {};
        if (!w.description.trim()) e.description = 'Describe the income payment.';
        if (w.atc && all.some((x) => x.id !== w.id && x.atc === w.atc.trim().toUpperCase()))
          e.atc = `${w.atc} already exists.`;
        if (w.rate < 0 || w.rate > 100) e.rate = 'Rate must be between 0 and 100.';
        return e;
      }}
      onSave={(w) => save({ ...w, atc: w.atc.trim().toUpperCase() })}
      editor={(w, update, errors) => {
        const f = bind(w, update);
        return (
          <>
            <Fields cols={3}>
              {f.text('atc', 'ATC', {
                error: errors.atc,
                placeholder: 'e.g. WC158',
                hint: 'Leave blank until confirmed.',
              })}
              {f.text('description', 'Description', {
                required: true,
                error: errors.description,
                className: 'md:col-span-2',
              })}
              {f.choose(
                'kind',
                'Tax type',
                WITHHOLDING_KINDS.map((k) => ({ value: k, label: `${WITHHOLDING_KIND_INFO[k].type} · ${WITHHOLDING_KIND_INFO[k].name}` })),
                { hint: WITHHOLDING_KIND_INFO[w.kind].definition, className: 'md:col-span-2' },
              )}
              {f.pick('payee', 'IND / CORP', ['Individual', 'Corporate', 'Any'])}
              {f.pick('agent', 'Withholding agent', WITHHOLDING_AGENTS, {
                hint: 'Government = applicable to government withholding agent only. Any = both government and private.',
              })}
              {f.num('rate', 'Tax rate', { required: true, error: errors.rate, suffix: '%' })}
              {f.text('condition', 'Condition', {
                placeholder: 'e.g. if gross income exceeds ₱ 720,000.00',
                hint: 'The sub-row of the BIR table this ATC applies to, if any.',
              })}
              {f.text('birForms', 'BIR forms', { hint: WITHHOLDING_KIND_INFO[w.kind].forms ? `BIR forms for this tax type: ${WITHHOLDING_KIND_INFO[w.kind].forms}` : undefined })}
              {f.area('notes', 'Notes', { rows: 2, className: 'md:col-span-3' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
