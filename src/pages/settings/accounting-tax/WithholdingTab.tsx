import { TableStatus, TableSubcontent } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import { WITHHOLDING_AGENTS, WITHHOLDING_BASES, WITHHOLDING_KINDS, type WithholdingKind, type WithholdingTax } from '../../../mocks/taxes';
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
  base: 'Amount net of VAT',
  birForms: '2307 · 0619-E · 1601-EQ',
  legalBasis: '',
  active: true,
  notes: '',
});

const KIND_SHORT: Record<WithholdingKind, string> = {
  'Expanded (EWT)': 'Expanded (WE)',
  'Final (FWT)': 'Final (WF)',
  'Withholding VAT': 'VAT (WV)',
  'Percentage tax': 'Percentage (WB)',
};

export function WithholdingTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(withholdingTaxes);
  return (
    <MasterList<WithholdingTax>
      {...route}
      icon="request_quote"
      title="Withholding tax"
      noun="withholding tax"
      description="Taxes you withhold when paying suppliers and other payees, by BIR Alphanumeric Tax Code (ATC): WI for individual payees, WC for corporate. Expanded (WE) is creditable to the payee (BIR Form 2307); final (WF) is the payee’s full income tax on that income (BIR Form 2306). WV and WB are VAT and percentage taxes withheld on government money payments and some private payments."
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
          key: 'description',
          header: 'Income payment',
          cell: (w) => (
            <TableSubcontent subcopy={w.condition || undefined}>
              <span className="line-clamp-2 max-w-xl whitespace-normal">{w.description}</span>
            </TableSubcontent>
          ),
        },
        {
          key: 'kind',
          header: 'Kind',
          cell: (w) => (
            <TableSubcontent subcopy={w.agent === 'Any' ? undefined : `${w.agent} agents only`}>{KIND_SHORT[w.kind]}</TableSubcontent>
          ),
        },
        { key: 'payee', header: 'Payee', cell: (w) => (w.payee === 'Individual' ? 'Individual (WI)' : w.payee === 'Corporate' ? 'Corporate (WC)' : w.payee) },
        { key: 'rate', header: 'Rate', cell: (w) => `${w.rate}%` },
        { key: 'base', header: 'Applied to', cell: (w) => w.base },
        {
          key: 'active',
          header: 'Status',
          cell: (w) => (
            <TableStatus intent={w.active ? 'success' : 'default'}>{w.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(w) => `${w.atc} ${w.description} ${w.condition} ${w.kind} ${KIND_SHORT[w.kind]} ${w.agent} ${w.payee} ${w.legalBasis} ${w.notes}`}
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
              {f.text('description', 'Income payment', {
                required: true,
                error: errors.description,
                className: 'md:col-span-2',
              })}
              {f.pick('kind', 'Kind', WITHHOLDING_KINDS, {
                hint: w.kind === 'Final (FWT)' ? 'The payee’s full and final income tax on this income. Under-withholding is collected from you.' : undefined,
              })}
              {f.pick('payee', 'Payee', ['Individual', 'Corporate', 'Any'])}
              {f.pick('agent', 'Withholding agent', WITHHOLDING_AGENTS, {
                hint: 'Government: NGAs, GOCCs and LGUs only. Private: private agents only.',
              })}
              {f.num('rate', 'Rate', { required: true, error: errors.rate, suffix: '%' })}
              {f.text('condition', 'Applies when', {
                className: 'md:col-span-3',
                placeholder: 'e.g. Gross income this year ≤ ₱3M',
                hint: 'For ATCs that split by the payee’s gross income or VAT registration. Leave blank if it always applies.',
              })}
              {f.pick('base', 'Applied to', WITHHOLDING_BASES)}
              {f.text('birForms', 'BIR forms')}
              {f.text('legalBasis', 'Legal basis')}
              {f.area('notes', 'Notes', { rows: 2, className: 'md:col-span-3' })}
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
