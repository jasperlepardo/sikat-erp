import {
  Button,
  Card,
  Icon,
  Table,
  TableStatus,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { FieldStack, Section, bind } from '../../../components/form/fields';
import { MasterList, type ListRoute } from '../../../components/form/MasterList';
import {
  PAY_FREQUENCIES,
  type BracketRow,
  type CompensationTable,
} from '../../../mocks/compensation';
import { formatAmount } from '../../../services/format';
import { compensationTax } from '../../../services/masterData';
import { newId, useCollectionRows } from '../../../services/useCollectionRows';
import { todayISO } from '../../../services/dates';

const today = () => todayISO();

const blankBracket = (): BracketRow => ({ from: 0, base: 0, rate: 0, over: 0 });

const blank = (): CompensationTable => ({
  id: newId('ct'),
  frequency: 'Monthly',
  effectiveFrom: today(),
  effectiveTo: '',
  brackets: [blankBracket()],
  active: true,
});

const tableName = (t: CompensationTable) =>
  t.frequency === 'Annual' ? 'Annual tax table' : `${t.frequency} withholding tax table`;

const period = (t: CompensationTable) =>
  t.effectiveTo ? `${t.effectiveFrom} to ${t.effectiveTo}` : `${t.effectiveFrom} and onwards`;

const order = (t: CompensationTable) =>
  `${9999 - Number(t.effectiveFrom.slice(0, 4))}-${PAY_FREQUENCIES.indexOf(t.frequency)}`;

export function CompensationTaxTab(route: ListRoute) {
  const { rows, save, setActive } = useCollectionRows(compensationTax);
  return (
    <MasterList<CompensationTable>
      {...route}
      icon="payments"
      title="Compensation tax"
      noun="tax table"
      description="BIR revised withholding tax tables (daily, weekly, semi-monthly, monthly) and annual tax tables. Payroll picks the table in force on the pay date."
      rows={rows}
      onSetActive={setActive}
      sortValue={(t, key) =>
        key === 'table' ? order(t) : key === 'brackets' ? t.brackets.length : String(t[key as keyof CompensationTable] ?? '').toLowerCase()
      }
      columns={[
        { key: 'table', header: 'Table', cell: (t) => tableName(t) },
        { key: 'effectiveFrom', header: 'Effective', cell: (t) => period(t) },
        { key: 'brackets', header: 'Brackets', cell: (t) => t.brackets.length },
        {
          key: 'active',
          header: 'Status',
          cell: (t) => (
            <TableStatus intent={t.active ? 'success' : 'default'}>{t.active ? 'Active' : 'Inactive'}</TableStatus>
          ),
        },
      ]}
      searchText={(t) => `${tableName(t)} ${period(t)}`}
      blank={blank}
      label={(t) => `${tableName(t)} (${period(t)})`}
      validate={(t) => {
        const e: Record<string, string> = {};
        if (!t.brackets.length) e.brackets = 'Add at least one bracket.';
        else if (t.brackets.some((b) => b.rate < 0 || b.rate > 100)) e.brackets = 'Rates must be between 0 and 100.';
        else if (t.brackets.some((b) => b.base < 0 || b.from < 0 || b.over < 0)) e.brackets = 'Amounts cannot be negative.';
        if (t.effectiveTo && t.effectiveTo < t.effectiveFrom) e.effectiveTo = 'Ends before it starts.';
        return e;
      }}
      onSave={(t) =>
        save({
          ...t,
          brackets: [...t.brackets].sort((a, b) => a.from - b.from),
        })
      }
      editor={(t, update, errors) => {
        const f = bind(t, update);
        return (
          <>
            <FieldStack>
              {f.pick('frequency', 'Table', PAY_FREQUENCIES)}
              {f.date('effectiveFrom', 'Effective from', { required: true })}
              {f.date('effectiveTo', 'Effective to', { error: errors.effectiveTo, hint: 'Blank = and onwards.' })}
            </FieldStack>
            <BracketEditor
              brackets={t.brackets}
              error={errors.brackets}
              onChange={(brackets) => update({ brackets })}
            />
            <FieldStack>{f.status('active', 'Status')}</FieldStack>
          </>
        );
      }}
    />
  );
}

function BracketEditor({
  brackets,
  error,
  onChange,
}: {
  brackets: BracketRow[];
  error?: string;
  onChange: (brackets: BracketRow[]) => void;
}) {
  const set = (i: number, patch: Partial<BracketRow>) =>
    onChange(brackets.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const rows = brackets.map((b, i) => ({ ...b, id: String(i) }));

  return (
    <Section
      icon="table_rows"
      title="Brackets"
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="Add bracket"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() => onChange([...brackets, blankBracket()])}
        >
          Add bracket
        </Button>
      }
    >
      <Card>
        <Table
          caption="Tax table brackets"
          getRowId={(r) => r.id}
          rows={rows}
          columns={[
            {
              key: 'from',
              header: 'Compensation from (PHP)',
              cell: (r) => (
                <TextField
                  aria-label="Compensation from"
                  type="number"
                  min={0}
                  prefix="₱"
                  value={String(r.from)}
                  onChange={(e) => set(Number(r.id), { from: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'base',
              header: 'Base tax (PHP)',
              cell: (r) => (
                <TextField
                  aria-label="Base tax"
                  type="number"
                  min={0}
                  prefix="₱"
                  value={String(r.base)}
                  onChange={(e) => set(Number(r.id), { base: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'rate',
              header: 'Rate (%)',
              cell: (r) => (
                <TextField
                  aria-label="Rate"
                  type="number"
                  min={0}
                  max={100}
                  suffix="%"
                  value={String(r.rate)}
                  onChange={(e) => set(Number(r.id), { rate: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'over',
              header: 'Rate on excess over (PHP)',
              cell: (r) => (
                <TextField
                  aria-label="Rate on excess over"
                  type="number"
                  min={0}
                  prefix="₱"
                  value={String(r.over)}
                  onChange={(e) => set(Number(r.id), { over: Number(e.currentTarget.value) })}
                />
              ),
            },
            {
              key: 'formula',
              header: 'Formula',
              cell: (r) =>
                r.rate
                  ? `₱${formatAmount(r.base)} + ${r.rate}% over ₱${formatAmount(r.over)}`
                  : r.base
                    ? `₱${formatAmount(r.base)}`
                    : 'No tax',
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
                  disabled={brackets.length === 1}
                  onClick={() => onChange(brackets.filter((_, j) => j !== Number(r.id)))}
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
