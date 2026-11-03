import { Checkbox, DatePicker, Divider, DropdownItem, Icon, Select, Text, TextField, type Option } from '@jasperlepardo/sikat-design-system';
import { useCollection, type MasterDef } from '../form/MasterLookup';
import {
  OP_LABEL,
  OPERATORS_BY_TYPE,
  PERIODS,
  changeOp,
  valueArity,
  type FilterField,
  type Rule,
} from './engine';

/**
 * The body of a filter chip's popover: the value input(s) for one rule, plus an
 * operator picker. The field type drives both — choice/master show a checkbox list
 * of values with an "is" / "is not" toggle below (always multi-select), dates a
 * calendar, numbers a numeric input. Pure UI over `engine.ts`; the matching logic
 * lives there, not here.
 *
 * Lifted from `FilterBar`'s rule-row editor and reshaped for the inline popover
 * (new chip-first filter UX). See `docs/list-filter-ux-plan.md`.
 */
export function FilterValueEditor<T>({
  field,
  rule,
  onChange,
}: {
  field: FilterField<T>;
  rule: Rule;
  onChange: (rule: Rule) => void;
}) {
  if (field.type === 'date') return <DateEditor field={field} rule={rule} onChange={onChange} />;
  if (field.type === 'choice' || field.type === 'master') return <ChoiceEditor field={field} rule={rule} onChange={onChange} />;
  return (
    <div className="flex flex-col gap-2 p-2">
      <Select
        aria-label="Operator"
        value={rule.op}
        onValueChange={(op) => onChange(changeOp(rule, op as Rule['op']))}
        options={OPERATORS_BY_TYPE[field.type].map((op) => ({ value: op, label: OP_LABEL[op] }))}
      />
      <RuleValue field={field} rule={rule} onChange={onChange} />
    </div>
  );
}

/** Date fields lead with quick ranges (`inPeriod`); "Custom date…" reveals the operator + calendar. */
function DateEditor<T>({ field, rule, onChange }: { field: FilterField<T>; rule: Rule; onChange: (rule: Rule) => void }) {
  const custom = rule.op !== 'inPeriod';
  return (
    <div className="flex flex-col gap-1">
      {PERIODS.map((p) => (
        <DropdownItem
          key={p.value}
          selected={rule.op === 'inPeriod' && rule.value === p.value}
          onSelect={() => onChange({ ...rule, op: 'inPeriod', value: p.value, value2: undefined })}
        >
          {p.label}
        </DropdownItem>
      ))}
      <DropdownItem selected={custom} onSelect={() => onChange({ ...rule, op: 'is', value: undefined, value2: undefined })}>
        Custom date…
      </DropdownItem>
      {custom ? (
        <div className="flex flex-col gap-2 px-2 pb-2 pt-1">
          <Select
            aria-label="Operator"
            value={rule.op}
            onValueChange={(op) => onChange(changeOp(rule, op as Rule['op']))}
            options={OPERATORS_BY_TYPE.date.filter((op) => op !== 'inPeriod').map((op) => ({ value: op, label: OP_LABEL[op] }))}
          />
          <RuleValue field={field} rule={rule} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

/** The value input(s) for number/text/date rules — shape depends on field type and operator. */
function RuleValue<T>({ field, rule, onChange }: { field: FilterField<T>; rule: Rule; onChange: (rule: Rule) => void }) {
  const arity = valueArity(rule.op);
  if (arity === 0) return null;

  const set = (key: 'value' | 'value2') => (v: unknown) => onChange({ ...rule, [key]: v });

  if (rule.op === 'inLastDays') {
    return <NumberInput aria-label="Days" value={rule.value} onChange={set('value')} suffix="days" />;
  }

  // `grow` adds flex-1 only inside the horizontal From/To row. On a single value the
  // field is the sole child of the editor's vertical column, where flex-1 would set
  // flex-basis:0 and collapse the field's height — DS fields are width:100% anyway.
  const one = (key: 'value' | 'value2', label: string, grow = false) => {
    const className = grow ? 'flex-1' : undefined;
    return field.type === 'date' ? (
      <DatePicker aria-label={label} className={className} value={(rule[key] as string) ?? ''} onValueChange={(v) => set(key)(v || undefined)} />
    ) : field.type === 'number' ? (
      <NumberInput aria-label={label} className={className} value={rule[key]} onChange={set(key)} />
    ) : (
      <TextField
        aria-label={label}
        className={className}
        placeholder="Value"
        value={(rule[key] as string) ?? ''}
        onChange={(e) => set(key)(e.currentTarget.value)}
      />
    );
  };

  return arity === 2 ? (
    <div className="flex items-center gap-2">
      {one('value', 'From', true)}
      <Text tone="muted">and</Text>
      {one('value2', 'To', true)}
    </div>
  ) : (
    one('value', 'Value')
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  className,
  'aria-label': ariaLabel,
}: {
  value: unknown;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  className?: string;
  'aria-label': string;
}) {
  return (
    <TextField
      aria-label={ariaLabel}
      className={className}
      type="number"
      inputMode="decimal"
      placeholder="0"
      suffix={suffix}
      value={typeof value === 'number' ? String(value) : ''}
      onChange={(e) => {
        const text = e.currentTarget.value;
        onChange(text === '' ? undefined : Number(text));
      }}
    />
  );
}

/** choice/master: a checkbox list of values, picked into `in` / `notIn`. */
function ChoiceEditor<T>({ field, rule, onChange }: { field: FilterField<T>; rule: Rule; onChange: (rule: Rule) => void }) {
  return field.def ? (
    <MasterChecklist def={field.def} rule={rule} onChange={onChange} />
  ) : (
    <ChoiceBody options={field.options ?? []} rule={rule} onChange={onChange} />
  );
}

/** Master-list values, including inactive rows — old records still carry them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a filter field can be over any master
function MasterChecklist({ def, rule, onChange }: { def: MasterDef<any>; rule: Rule; onChange: (rule: Rule) => void }) {
  const rows = useCollection(def.collection);
  const seen = new Set<string>();
  const options = (rows ?? []).flatMap((row) => {
    const value = def.value(row);
    if (seen.has(value)) return [];
    seen.add(value);
    return [{ value, label: def.label(row) }];
  });
  return <ChoiceBody options={options} rule={rule} onChange={onChange} />;
}

/** The flat popover body: value checkboxes above an "is" / "is not" operator toggle. */
function ChoiceBody({ options, rule, onChange }: { options: Option[]; rule: Rule; onChange: (rule: Rule) => void }) {
  const selected = Array.isArray(rule.value) ? (rule.value as string[]) : [];
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    onChange({ ...rule, value: next.length ? next : undefined });
  };
  // The checkbox fill / leading checkmark already signals selection, so we don't pass
  // `selected` (its tinted background would double up). Hover state still applies.
  const op = (next: 'in' | 'notIn', label: string) => (
    <DropdownItem
      leadingIcon={rule.op === next ? <Icon size={20}>check</Icon> : <span className="inline-block size-5" />}
      onSelect={() => onChange(changeOp(rule, next))}
    >
      {label}
    </DropdownItem>
  );
  return (
    <div className="flex flex-col">
      <div className="flex max-h-60 flex-col overflow-auto">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <DropdownItem
              key={o.value}
              // Controlled (not readOnly) so the box shows its active/checked fill; the
              // row's onSelect is the single toggle, so the box itself ignores pointer events.
              leadingIcon={<Checkbox checked={checked} onChange={() => {}} tabIndex={-1} aria-hidden className="pointer-events-none" />}
              onSelect={() => toggle(o.value)}
            >
              {o.label}
            </DropdownItem>
          );
        })}
        {options.length === 0 ? <Text tone="muted" className="px-2 py-1.5">No options</Text> : null}
      </div>
      <Divider className="mx-2 !w-auto" />
      {op('in', 'Is')}
      {op('notIn', 'Is not')}
    </div>
  );
}
