import { useState } from 'react';
import { Card, Checkbox, DatePicker, FormField, Icon, Select, TableStatus, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  PAY_FREQUENCIES,
  YEAR_END_OUTCOMES,
  compensationTax as computeTax,
  parseRangeStart,
  parseTax,
  taxablePay,
  yearEndAdjustment,
  type CompensationBracket,
  type CompensationExclusion,
  type PayFrequency,
  type YearEndInput,
} from '../../../mocks/compensation';
import { formatAmount } from '../../../services/format';
import { compensationExclusions, compensationTax } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';

const blank = (): CompensationBracket => ({
  id: newId('ct'),
  frequency: 'Monthly',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  bracket: 1,
  rangeText: '',
  taxText: '',
  min: 0,
  base: 0,
  rate: 0,
  over: 0,
  active: true,
});

const period = (r: CompensationBracket) =>
  r.effectiveTo ? `${r.effectiveFrom} to ${r.effectiveTo}` : `${r.effectiveFrom} and onwards`;
const tableName = (r: CompensationBracket) => (r.frequency === 'Annual' ? 'Annual tax table' : `${r.frequency} withholding tax table`);

/** Newest table first, then Daily → Annual, then bracket 1 → 6. */
const order = (r: CompensationBracket) =>
  `${9999 - Number(r.effectiveFrom.slice(0, 4))}-${PAY_FREQUENCIES.indexOf(r.frequency)}-${String(r.bracket).padStart(2, '0')}`;

const today = () => new Date().toISOString().slice(0, 10);

function Amount({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <FormField label={label} tooltip={hint}>
      {(p) => <TextField {...p} type="number" min={0} prefix="PHP" value={String(value)} onChange={(e) => onChange(Number(e.currentTarget.value))} />}
    </FormField>
  );
}

/** Tax on a compensation amount from the tables, to check them. */
function Calculator({ rows }: { rows: CompensationBracket[] }) {
  const [frequency, setFrequency] = useState<PayFrequency>('Monthly');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(50000);
  const [mwe, setMwe] = useState(false);
  const [other, setOther] = useState(0);
  // A minimum wage earner's `amount` is their exempt pay; only `other` is taxed.
  const taxable = taxablePay({ basic: amount, holiday: 0, overtime: 0, nightShift: 0, hazard: 0, other }, mwe);
  const result = computeTax(rows, mwe ? taxable : amount, frequency, date);
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>calculate</Icon>}>Try it</Card.Header>
      <Card.Content>
        <div className={`grid grid-cols-1 gap-2 ${mwe ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <FormField label="Table">
            {(p) => (
              <Select
                {...p}
                options={PAY_FREQUENCIES.map((f) => ({ value: f, label: f }))}
                value={frequency}
                onValueChange={(v) => setFrequency(v as PayFrequency)}
              />
            )}
          </FormField>
          <FormField label="Pay date">
            {(p) => <DatePicker {...p} value={date} onValueChange={(v) => setDate(v || date)} />}
          </FormField>
          {mwe ? (
            <>
              <Amount
                label="Minimum wage and premium pay"
                hint="Statutory minimum wage, holiday, overtime, night shift and hazard pay — exempt."
                value={amount}
                onChange={setAmount}
              />
              <Amount label="Other taxable pay" hint="E.g. commissions, taxable allowances." value={other} onChange={setOther} />
            </>
          ) : (
            <Amount label="Taxable compensation" value={amount} onChange={setAmount} />
          )}
          <FormField label="Withholding tax">
            {() =>
              result ? (
                <div className="py-1">
                  <p className="text-lg font-semibold text-heading">PHP {formatAmount(result.tax)}</p>
                  <Text variant="small" tone="muted">
                    Bracket {result.bracket.bracket}: {result.bracket.taxText} ({period(result.bracket)})
                  </Text>
                </div>
              ) : (
                <Text variant="small" tone="danger">
                  No {frequency.toLowerCase()} table in force on {date}.
                </Text>
              )
            }
          </FormField>
        </div>
        <div className="mt-2">
          <Checkbox checked={mwe} onChange={(e) => setMwe(e.currentTarget.checked)}>
            Minimum wage earner
          </Checkbox>
        </div>
      </Card.Content>
    </Card>
  );
}

/** BIR's annualized withholding tax formula for the last payroll of the year. */
function YearEndCalculator({ rows, exclusions }: { rows: CompensationBracket[]; exclusions: CompensationExclusion[] }) {
  const [date, setDate] = useState(today());
  const [input, setInput] = useState<YearEndInput>({ gross: 900000, benefits: 75000, contributions: 30000, otherNonTaxable: 0, withheld: 100000 });
  const set = (key: keyof YearEndInput) => (v: number) => setInput((i) => ({ ...i, [key]: v }));
  const r = yearEndAdjustment(rows, exclusions, input, date);
  const peso = (n: number) => `PHP ${formatAmount(n)}`;
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>event_available</Icon>}>Year-end adjustment</Card.Header>
      <Card.Content>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Amount label="Gross compensation" hint="Present + previous employer." value={input.gross} onChange={set('gross')} />
          <Amount
            label="13th month pay and other benefits"
            hint={r && Number.isFinite(r.benefitsCap) ? `Excluded up to ${peso(r.benefitsCap)}; the rest is taxable.` : undefined}
            value={input.benefits}
            onChange={set('benefits')}
          />
          <Amount label="SSS, GSIS, PHIC, HDMF and union dues" hint="Employee share." value={input.contributions} onChange={set('contributions')} />
          <Amount
            label="Other non-taxable compensation"
            hint="De minimis, minimum wage earner exempt pay, other exclusions."
            value={input.otherNonTaxable}
            onChange={set('otherNonTaxable')}
          />
          <Amount label="Tax withheld, January to November" hint="Or to termination date." value={input.withheld} onChange={set('withheld')} />
          <FormField label="Last pay date">
            {(p) => <DatePicker {...p} value={date} onValueChange={(v) => setDate(v || date)} />}
          </FormField>
        </div>
        {r ? (
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            <div>
              <Text variant="small" tone="muted">Taxable compensation</Text>
              <p className="font-semibold text-heading">{peso(r.taxable)}</p>
              <Text variant="small" tone="muted">{peso(input.gross)} less {peso(r.nonTaxable)} non-taxable</Text>
            </div>
            <div>
              <Text variant="small" tone="muted">Tax due</Text>
              <p className="font-semibold text-heading">{peso(r.due.tax)}</p>
              <Text variant="small" tone="muted">{r.due.bracket.taxText}</Text>
            </div>
            <div>
              <Text variant="small" tone="muted">Tax withheld</Text>
              <p className="font-semibold text-heading">{peso(input.withheld)}</p>
            </div>
            <div>
              <Text variant="small" tone="muted">{r.outcome === 'Refund' ? 'Refund' : 'To withhold on last payroll'}</Text>
              <p className="text-lg font-semibold text-heading">{peso(Math.abs(r.balance))}</p>
              <Text variant="small" tone="muted">{YEAR_END_OUTCOMES[r.outcome]}</Text>
            </div>
          </div>
        ) : (
          <Text variant="small" tone="danger">No annual tax table in force on {date}.</Text>
        )}
      </Card.Content>
    </Card>
  );
}

export function CompensationTaxTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(compensationTax);
  const { rows: exclusions } = useCollectionRows(compensationExclusions);
  return (
    <MasterList<CompensationBracket>
      {...route}
      icon="payments"
      title="Compensation tax"
      noun="tax table bracket"
      description="BIR revised withholding tax tables (daily, weekly, semi-monthly, monthly) and annual tax tables, as published. Payroll picks the table in force on the pay date."
      intro={
        rows ? (
          <>
            <Calculator rows={rows} />
            {exclusions && <YearEndCalculator rows={rows} exclusions={exclusions} />}
          </>
        ) : null
      }
      rows={rows}
      onSetActive={setActive}
      columns={[
        { key: 'table', header: 'Table', cell: (r) => tableName(r) },
        { key: 'effectiveFrom', header: 'Effective', cell: (r) => period(r) },
        { key: 'bracket', header: 'Bracket', cell: (r) => r.bracket },
        { key: 'rangeText', header: 'Compensation range', cell: (r) => r.rangeText },
        { key: 'taxText', header: 'Prescribed withholding tax', cell: (r) => r.taxText },
        {
          key: 'active',
          header: 'Status',
          cell: (r) => <TableStatus intent={r.active ? 'success' : 'default'}>{r.active ? 'Active' : 'Inactive'}</TableStatus>,
        },
      ]}
      sortValue={(r, key) =>
        key === 'table' ? order(r) : key === 'bracket' ? r.bracket : String(r[key as keyof CompensationBracket] ?? '').toLowerCase()
      }
      searchText={(r) => `${tableName(r)} ${period(r)} ${r.rangeText} ${r.taxText}`}
      blank={blank}
      label={(r) => `${tableName(r)} · bracket ${r.bracket} (${period(r)})`}
      validate={(r) => {
        const e: Record<string, string> = {};
        if (!r.rangeText.trim()) e.rangeText = 'Enter the compensation range as BIR publishes it.';
        if (!r.taxText.trim()) e.taxText = 'Enter the prescribed withholding tax as BIR publishes it.';
        else if (/\d%/.test(r.taxText) && !parseTax(r.taxText).rate && !/^0(\.0+)?%$/.test(r.taxText.trim()))
          e.taxText = 'Couldn’t read the rate — write it like “₱1,875.00 +20% over ₱33,333”.';
        if (r.effectiveTo && r.effectiveTo < r.effectiveFrom) e.effectiveTo = 'Ends before it starts.';
        if (r.bracket < 1) e.bracket = 'Bracket numbers start at 1.';
        return e;
      }}
      // The numbers used for calculation always come from the published text.
      onSave={(r) => save({ ...r, min: parseRangeStart(r.rangeText), ...parseTax(r.taxText) })}
      editor={(r, update, errors) => {
        const f = bind(r, update);
        const parsed = { min: parseRangeStart(r.rangeText), ...parseTax(r.taxText) };
        return (
          <>
            <Fields cols={3}>
              {f.pick('frequency', 'Table', PAY_FREQUENCIES)}
              {f.date('effectiveFrom', 'Effective from', { required: true })}
              {f.date('effectiveTo', 'Effective to', { error: errors.effectiveTo, hint: 'Blank = and onwards.' })}
              {f.num('bracket', 'Bracket', { error: errors.bracket })}
              {f.text('rangeText', 'Compensation range', {
                required: true,
                error: errors.rangeText,
                className: 'md:col-span-2',
                placeholder: 'e.g. ₱33,333 - ₱66,666',
              })}
              {f.text('taxText', 'Prescribed withholding tax', {
                required: true,
                error: errors.taxText,
                className: 'md:col-span-3',
                placeholder: 'e.g. ₱1,875.00 +20% over ₱33,333',
              })}
              <ReadOnly label="Starts at" value={`PHP ${formatAmount(parsed.min)}`} hint="Read from the range." />
              <ReadOnly
                label="Calculated as"
                value={parsed.rate ? `PHP ${formatAmount(parsed.base)} + ${parsed.rate}% over PHP ${formatAmount(parsed.over)}` : 'No tax'}
                hint="Read from the prescribed tax."

              />
            </Fields>
            <Flags>{f.check('active', 'Active')}</Flags>
          </>
        );
      }}
    />
  );
}
