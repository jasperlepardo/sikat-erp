import { useState } from 'react';
import { Card, DatePicker, FormField, Icon, Select, TableStatus, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  PAY_FREQUENCIES,
  compensationTax as computeTax,
  parseRangeStart,
  parseTax,
  type CompensationBracket,
  type PayFrequency,
} from '../../../mocks/compensation';
import { formatAmount } from '../../../services/format';
import { compensationTax } from '../../../services/masterData';
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

/** Tax on a compensation amount from the tables, to check them. */
function Calculator({ rows }: { rows: CompensationBracket[] }) {
  const [frequency, setFrequency] = useState<PayFrequency>('Monthly');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(50000);
  const result = computeTax(rows, amount, frequency, date);
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>calculate</Icon>}>Try it</Card.Header>
      <Card.Content>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
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
          <FormField label="Taxable compensation">
            {(p) => (
              <TextField {...p} type="number" min={0} prefix="PHP" value={String(amount)} onChange={(e) => setAmount(Number(e.currentTarget.value))} />
            )}
          </FormField>
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
      </Card.Content>
    </Card>
  );
}

export function CompensationTaxTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(compensationTax);
  return (
    <MasterList<CompensationBracket>
      {...route}
      icon="payments"
      title="Compensation tax"
      noun="tax table bracket"
      description="BIR revised withholding tax tables (daily, weekly, semi-monthly, monthly) and annual tax tables, as published. Payroll picks the table in force on the pay date."
      intro={rows ? <Calculator rows={rows} /> : null}
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
