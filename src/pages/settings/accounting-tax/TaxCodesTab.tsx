import { useState } from 'react';
import {
  Alert,
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
import { useCollection } from '../../../components/form/MasterLookup';
import {
  TAX_CATEGORIES,
  currentRate,
  type TaxCode,
  type TaxRatePeriod,
} from '../../../mocks/taxes';
import { birForms, percentageAtcs, taxCodes, vatAtcs, withholdingTaxes } from '../../../services/masterData';
import { BirFormsField, formNumbers } from './BirFormsField';
import { blockedDeactivation, describeTaxUsage, loadTaxUsage } from '../../../services/taxUsage';
import { useAsync } from '../../../services/useAsync';
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
  returnFormIds: ['wf-2550q'],
  legalBasis: '',
  active: true,
  notes: '',
  atc: '',
});

/** Which ATC catalog a tax code of this category files under. */
const catalogFor = (category: TaxCode['category']) =>
  category === 'Percentage tax' ? 'Percentage tax' : category === 'Reverse charge' ? 'Withholding VAT' : 'Value-added tax';

export function TaxCodesTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(taxCodes);
  const chart = useAccounts();
  const usage = useAsync(loadTaxUsage, [rows]);
  const usedBy = (t: TaxCode) => usage?.codes.get(t.code);
  const [notice, setNotice] = useState<string>();

  // The ATC catalogs, live from their tabs: Value-added tax, Withholding tax (WV codes), Percentage tax.
  const vat = useCollection(vatAtcs) ?? [];
  const pt = useCollection(percentageAtcs) ?? [];
  const wht = useCollection(withholdingTaxes) ?? [];
  const forms = useCollection(birForms) ?? [];
  const catalog = [
    ...vat.map((a) => ({ atc: a.code, kind: 'Value-added tax', text: a.coverage || a.description, description: a.description, rate: a.rate as number | undefined, active: a.active })),
    ...wht
      .filter((w) => w.kind === 'Withholding VAT' && w.atc)
      .map((w) => ({ atc: w.atc, kind: 'Withholding VAT', text: w.description, description: w.description, rate: undefined as number | undefined, active: w.active })),
    ...pt.map((a) => ({ atc: a.code, kind: 'Percentage tax', text: a.coverage || a.description, description: a.description, rate: a.rate as number | undefined, active: a.active })),
  ];
  const atcOf = (atc: string) => catalog.find((a) => a.atc === atc);
  /** BIR ATC pick options ('' = none), each tagged by its catalog so the ~80 codes stay navigable. A saved ATC stays listed when inactive. */
  const atcOptions = (current: string): Option[] => [
    ...catalog
      .filter((a, i) => (a.active || a.atc === current) && catalog.findIndex((x) => x.atc === a.atc) === i)
      .map((a) => ({ value: a.atc, label: a.atc, prefix: a.kind, subLabel: a.text, text: `${a.atc} ${a.kind} ${a.description}` })),
  ];

  // Tax codes the rules, items, groups or accounts use can't be deactivated.
  const setActiveChecked = async (picked: TaxCode[], active: boolean) => {
    const { allowed, notice: n } = blockedDeactivation(picked, active, usedBy, (t) => t.code);
    await setActive(allowed, active);
    setNotice(n);
  };

  return (
    <MasterList<TaxCode>
      {...route}
      icon="percent"
      title="Tax codes"
      noun="tax code"
      description="VAT and percentage tax applied on document rows. Rates are kept with effective dates, so older documents keep the rate of their posting date."
      rows={rows}
      onSetActive={setActiveChecked}
      intro={notice ? <Alert intent="warning" variant="outline" title="Some tax codes are in use">{notice}</Alert> : undefined}
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
        {
          key: 'atc',
          header: 'ATC',
          cell: (t) => {
            if (!t.atc) return <span className="text-muted">—</span>;
            const a = atcOf(t.atc);
            return a?.active ? <span title={a.description}>{t.atc}</span> : <span className="text-warning">{t.atc} ({a ? 'inactive' : 'not in the ATC lists'})</span>;
          },
        },
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
        { key: 'returnFormIds', header: 'BIR return', sortable: false, cell: (t) => formNumbers(t.returnFormIds, forms) || <span className="text-muted">—</span> },
        {
          key: 'usedBy',
          header: 'Used by',
          sortable: false,
          cell: (t) => {
            const u = describeTaxUsage(usedBy(t));
            return u ? <span className="max-w-xs whitespace-normal text-sm">{u}</span> : <span className="text-muted">—</span>;
          },
        },
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
        if (t.atc) {
          const a = atcOf(t.atc);
          const want = catalogFor(t.category);
          if (!a) e.atc = `${t.atc} isn't in the ATC lists. Add it on the ${want} tab first.`;
          else if (!a.active) e.atc = `${t.atc} is inactive on the ${a.kind} tab.`;
          else if (a.kind !== want) e.atc = `A ${t.category} code files under a ${want} ATC, not ${a.kind}.`;
        }
        if (!t.active && t.id && usage) {
          const u = describeTaxUsage(usedBy(t));
          if (u) e.active = `Still used by ${u}.`;
        }
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
            {f.lookup('atc', 'BIR ATC', atcOptions(t.atc), {
              clearable: true,
              error: errors.atc,
              hint: (() => {
                const a = t.atc ? atcOf(t.atc) : undefined;
                const today = currentRate(t);
                if (a?.rate !== undefined && today !== undefined && a.rate !== today)
                  return `BIR lists ${t.atc} at ${a.rate}%; this code charges ${today}% today (its rates below are what documents use).`;
                return `From the ${catalogFor(t.category)} tab. Leave as None for codes with no ATC (zero-rated, exempt, input VAT).`;
              })(),
            })}
            <BirFormsField
              label="BIR return"
              value={t.returnFormIds}
              onChange={(returnFormIds) => update({ returnFormIds })}
              categories={['VAT/Percentage Tax Returns', 'Payment/Remittance Forms']}
              error={errors.returnFormIds}
            />
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
            {f.status('active', 'Status', { error: errors.active })}
            {isNew ? null : <Text variant="small" tone="muted">Used by: {describeTaxUsage(usedBy(t)) || 'not used yet.'}</Text>}
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
