import {
  Button,
  Card,
  DatePicker,
  Icon,
  Table,
  TableStatus,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import type { Option } from '@jasperlepardo/sikat-design-system';
import { AccountField, useAccounts } from '../../../components/form/AccountField';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { accountProblem } from '../../../mocks/chartOfAccounts';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  BIR_RETURNS,
  SEED_PERCENTAGE_ATCS,
  SEED_VAT_ATCS,
  SEED_WITHHOLDING,
  TAX_CATEGORIES,
  currentRate,
  type TaxCode,
  type TaxRatePeriod,
} from '../../../mocks/taxes';
import { taxCodes } from '../../../services/masterData';
import { useCollectionRows } from '../../../services/useCollectionRows';
import { todayISO } from '../../../services/dates';

const today = () => todayISO();

const blank = (): TaxCode => ({
  // The id is set from the code on save: the code is the key.
  id: '',
  code: '',
  name: '',
  direction: 'Sales',
  category: 'Standard',
  rates: [{ from: today(), rate: 12 }],
  glAccount: '2310',
  birReturn: '2550Q',
  legalBasis: '',
  active: true,
  notes: '',
  atc: '',
});

/**
 * BIR ATC pick options; '' = no ATC. A tax code can point at an output/import VAT ATC (SEED_VAT_ATCS),
 * a withholding-VAT ATC (SEED_WITHHOLDING, kind "Withholding VAT") for reverse-charge codes, or a
 * percentage-tax ATC (SEED_PERCENTAGE_ATCS) — so the searchable picker draws from all three, each
 * tagged by type (prefix) so the ~80 codes stay navigable.
 */
const ATC_OPTIONS: Option[] = [
  { value: '', label: '— None —' },
  ...SEED_VAT_ATCS.map((a) => ({
    value: a.code, label: a.code, prefix: 'Value-added tax', subLabel: a.coverage || a.description,
    text: `${a.code} value-added tax VAT ${a.coverage} ${a.description}`,
  })),
  ...SEED_WITHHOLDING.filter((w) => w.kind === 'Withholding VAT').map((w) => ({
    value: w.atc, label: w.atc, prefix: 'Withholding VAT', subLabel: w.description,
    text: `${w.atc} withholding VAT ${w.description}`,
  })),
  ...SEED_PERCENTAGE_ATCS.map((a) => ({
    value: a.code, label: a.code, prefix: 'Percentage tax', subLabel: a.coverage || a.description,
    text: `${a.code} percentage tax ${a.coverage} ${a.description}`,
  })),
];

export function TaxCodesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(taxCodes);
  const chart = useAccounts();
  return (
    <MasterList<TaxCode>
      {...route}
      icon="percent"
      title="Tax codes"
      noun="tax code"
      description="VAT and percentage tax applied on document rows. Rates are kept with effective dates, so older documents keep the rate of their posting date."
      rows={rows}
      onSetActive={setActive}
      sortValue={(t, key) =>
        key === 'rate'
          ? (currentRate(t) ?? -1)
          : key === 'active'
            ? Number(t.active)
            : String(t[key as keyof TaxCode] ?? '').toLowerCase()
      }
      columns={[
        { key: 'code', header: 'Code', cell: (t) => t.code },
        { key: 'name', header: 'Name', cell: (t) => t.name },
        { key: 'category', header: 'Category', cell: (t) => <span className="text-muted">{t.category}</span> },
        { key: 'atc', header: 'ATC', cell: (t) => (t.atc ? t.atc : <span className="text-muted">—</span>) },
        {
          key: 'direction',
          header: 'Used on',
          cell: (t) => t.direction,
        },
        {
          key: 'rate',
          header: 'Rate today',
          cell: (t) => {
            const r = currentRate(t);
            return (
              <span>
                {r === undefined ? '—' : `${r}%`}
                {t.rates.length > 1 ? <span className="text-muted"> · {t.rates.length - 1} earlier</span> : null}
              </span>
            );
          },
        },
        { key: 'birReturn', header: 'BIR return', cell: (t) => t.birReturn },
        {
          key: 'active',
          header: 'Status',
          cell: (t) => (
            <TableStatus intent={t.active ? 'success' : 'default'}>{t.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(t) => `${t.code} ${t.atc} ${t.name} ${t.category} ${t.legalBasis}`}
      blank={blank}
      label={(t) => `${t.code} · ${t.name}`}
      validate={(t, all) => {
        const e: Record<string, string> = {};
        if (!t.code.trim()) e.code = 'Code is required.';
        else if (all.some((x) => x.id !== t.id && x.code.toLowerCase() === t.code.trim().toLowerCase()))
          e.code = `${t.code} already exists.`;
        if (!t.name.trim()) e.name = 'Name is required.';
        const gl = chart ? accountProblem(t.glAccount, 'tax', chart) : undefined;
        if (gl) e.glAccount = gl;
        if (!t.rates.length) e.rates = 'Add at least one rate.';
        else if (t.rates.some((r) => !r.from)) e.rates = 'Every rate needs an effective date.';
        else if (t.rates.some((r) => r.rate < 0 || r.rate > 100)) e.rates = 'Rates must be between 0 and 100.';
        else if (new Set(t.rates.map((r) => r.from)).size !== t.rates.length)
          e.rates = 'Two rates start on the same date.';
        return e;
      }}
      onSave={(t) =>
        save({
          ...t,
          id: t.id || t.code.trim().toUpperCase(),
          code: t.code.trim().toUpperCase(),
          rates: [...t.rates].sort((a, b) => a.from.localeCompare(b.from)),
        })
      }
      editor={(t, update, errors, isNew) => {
        const f = bind(t, update);
        return (
          <FieldStack>
            {f.text('code', 'Code', { required: true, error: errors.code, placeholder: 'e.g. OVAT', disabled: !isNew, hint: !isNew ? "Can't change once saved — items, partners and documents store it." : undefined })}
            {f.text('name', 'Name', { required: true, error: errors.name })}
            {f.pick('direction', 'Used on', ['Sales', 'Purchase'])}
            {f.pick('category', 'Category', TAX_CATEGORIES)}
            {f.lookup('atc', 'BIR ATC', ATC_OPTIONS, { hint: 'Search the BIR Alphanumeric Tax Code: output/import VAT, withholding VAT or percentage tax. Leave as None for codes with no ATC (zero-rated, exempt, input VAT).' })}
            {f.pick('birReturn', 'BIR return', BIR_RETURNS)}
            <AccountField
              label="G/L account"
              role="tax"
              accounts={chart}
              allowNone
              error={errors.glAccount}
              hint="Where this tax posts: a tax credit (input) or tax payable (output) account."
              value={t.glAccount}
              onChange={(glAccount) => update({ glAccount })}
            />
            {f.text('legalBasis', 'Legal basis', { placeholder: 'e.g. NIRC Sec. 106' })}
            {f.area('notes', 'Notes', { rows: 2 })}
            <RateHistory rates={t.rates} error={errors.rates} onChange={(rates) => update({ rates })} />
            {f.status('active', 'Status')}
          </FieldStack>
        );
      }}
    />
  );
}

/** Effective-dated rates: add a row when the law changes, don't overwrite the old rate. */
function RateHistory({
  rates,
  error,
  onChange,
}: {
  rates: TaxRatePeriod[];
  error?: string;
  onChange: (rates: TaxRatePeriod[]) => void;
}) {
  const rows = rates.map((r, i) => ({ ...r, id: String(i) }));
  const set = (i: number, patch: Partial<TaxRatePeriod>) =>
    onChange(rates.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const current = [...rates].sort((a, b) => b.from.localeCompare(a.from)).find((r) => r.from <= today());

  return (
    <Section
      icon="history"
      title="Rate history"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="New rate period"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => onChange([...rates, { from: today(), rate: rates[rates.length - 1]?.rate ?? 0 }])}
        >
          New rate
        </Button>
      }
    >
      <Text variant="small" tone="muted">
        When a rate changes, add a new period instead of editing the old one.
      </Text>
      <Card>
        <Table
          caption="Rate history"
          getRowId={(r) => r.id}
          rows={rows}
          columns={[
            {
              key: 'from',
              header: 'Effective from',
              cell: (r) => (
                <DatePicker
                  aria-label="Effective from"
                  value={r.from || null}
                  onValueChange={(from) => set(Number(r.id), { from })}
                />
              ),
            },
            {
              key: 'rate',
              header: 'Rate',
              cell: (r) => (
                <TextField
                  aria-label="Rate"
                  type="number"
                  min={0}
                  suffix="%"
                  value={String(r.rate)}
                  onChange={(e) => set(Number(r.id), { rate: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (r) =>
                r.from > today() ? (
                  <TableStatus intent="primary">Upcoming</TableStatus>
                ) : current && r.from === current.from ? (
                  <TableStatus intent="success">In force</TableStatus>
                ) : (
                  <TableStatus intent="default">Superseded</TableStatus>
                ),
            },
            {
              key: 'remove',
              header: 'Remove',
              srOnlyHeader: true,
              cell: (r) => (
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  intent="danger"
                  disabled={rates.length === 1}
                  onClick={() => onChange(rates.filter((_, j) => j !== Number(r.id)))}
                >
                  Remove
                </Button>
              ),
            },
          ]}
        />
      </Card>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
    </Section>
  );
}
