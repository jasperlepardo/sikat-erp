import { type ReactNode } from 'react';
import {
  Badge,
  Button,
  Combobox,
  DatePicker,
  Icon,
  IconButton,
  MultiSelect,
  Select,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { useCollection, type MasterDef } from '../form/MasterLookup';
import { opLabel } from './aip160';
import {
  OPERATORS_BY_TYPE,
  activeRules,
  changeField,
  changeOp,
  describeRule,
  isMultiOp,
  newRule,
  valueArity,
  type FilterField,
  type FilterGroup,
  type Rule,
} from './engine';

type ValueOption = { value: string; label: string };

/**
 * Search box, plus the filter's rules as dismissible chips while it differs from the
 * picked preset. Rules are set in the preset panel (header menu › New / Edit).
 */
export function FilterBar<T>({
  fields,
  value,
  onChange,
  showChips = true,
  actions,
  children,
}: {
  fields: FilterField<T>[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  /** Show the active rules as chips (off when they're just the preset's). */
  showChips?: boolean;
  /** Extra buttons after the chips, e.g. "Save as preset". */
  actions?: ReactNode;
  /** The search field. */
  children?: ReactNode;
}) {
  const active = activeRules(value, fields);
  const removeRule = (id: string) => onChange({ ...value, rules: value.rules.filter((r) => r.id !== id) });
  // The search usually lives in the PanelHeader now — nothing to show without chips.
  if (children == null && !(showChips && active.length > 0)) return null;

  return (
    <div className="flex flex-col gap-2">
      {children}
      {showChips && active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((rule) => (
            <Badge
              key={rule.id}
              intent="primary"
              variant="outline"
              size="medium"
              onDismiss={() => removeRule(rule.id)}
              dismissLabel={`Remove filter: ${describeRule(rule, fields)}`}
            >
              {describeRule(rule, fields)}
            </Badge>
          ))}
          {active.length > 1 ? (
            <Badge intent="default" variant="ghost" size="medium">
              {value.match === 'all' ? 'Matching all' : 'Matching any'}
            </Badge>
          ) : null}
          <Button type="button" intent="primary" variant="link" size="small" onClick={() => onChange({ ...value, rules: [] })}>
            Clear all
          </Button>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** The rule rows and "Add filter", used by the preset panel. */
export function FilterRules<T>({
  fields,
  value,
  onChange,
  children,
}: {
  fields: FilterField<T>[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  /** Buttons on the right of the footer row. */
  children?: ReactNode;
}) {
  const setRules = (rules: Rule[]) => onChange({ ...value, rules });

  return (
    <div className="flex flex-col gap-2">
      {value.rules.length === 0 ? (
        <Text tone="muted">No filters. Add one to narrow the list.</Text>
      ) : (
        value.rules.map((rule, i) => (
          <RuleRow
            key={rule.id}
            index={i}
            rule={rule}
            fields={fields}
            match={value.match}
            onMatchChange={(match) => onChange({ ...value, match })}
            onChange={(next) => setRules(value.rules.map((r) => (r.id === next.id ? next : r)))}
            onRemove={() => setRules(value.rules.filter((r) => r.id !== rule.id))}
          />
        ))
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          intent="primary"
          variant="ghost"
          size="medium"
          leadingIcon={<Icon size={20}>add</Icon>}
          onClick={() => setRules([...value.rules, newRule(fields[0])])}
        >
          Add filter
        </Button>
        <div className="flex-1" />
        {children}
      </div>
    </div>
  );
}

function RuleRow<T>({
  index,
  rule,
  fields,
  match,
  onMatchChange,
  onChange,
  onRemove,
}: {
  index: number;
  rule: Rule;
  fields: FilterField<T>[];
  match: FilterGroup['match'];
  onMatchChange: (match: FilterGroup['match']) => void;
  onChange: (rule: Rule) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === rule.field) ?? fields[0];
  const word = match === 'all' ? 'and' : 'or';

  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex h-9 w-20 shrink-0 items-center">
        {index === 0 ? (
          <Text>Where</Text>
        ) : index === 1 ? (
          <Select
            aria-label="Match all or any filter"
            className="w-full"
            value={match}
            onValueChange={(v) => onMatchChange(v as FilterGroup['match'])}
            options={[
              { value: 'all', label: 'and' },
              { value: 'any', label: 'or' },
            ]}
          />
        ) : (
          <Text tone="muted">{word}</Text>
        )}
      </div>
      <div className="w-44 shrink-0">
        <Select
          aria-label="Field"
          value={field.key}
          onValueChange={(key) => {
            const next = fields.find((f) => f.key === key);
            if (next) onChange(changeField(rule, next));
          }}
          options={fields.map((f) => ({ value: f.key, label: f.label }))}
        />
      </div>
      <div className="w-56 shrink-0">
        <Select
          aria-label="Operator"
          value={rule.op}
          onValueChange={(op) => onChange(changeOp(rule, op as Rule['op']))}
          options={OPERATORS_BY_TYPE[field.type].map((op) => ({ value: op, label: opLabel(op) }))}
        />
      </div>
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <RuleValue field={field} rule={rule} onChange={onChange} />
      </div>
      <IconButton label="Remove filter" intent="default" variant="ghost" size="large" onClick={onRemove}>
        <Icon size={20}>close</Icon>
      </IconButton>
    </div>
  );
}

/** The value input(s) for a rule — shape depends on field type and operator. */
function RuleValue<T>({ field, rule, onChange }: { field: FilterField<T>; rule: Rule; onChange: (rule: Rule) => void }) {
  const arity = valueArity(rule.op);
  if (arity === 0) return null;

  const set = (key: 'value' | 'value2') => (v: unknown) => onChange({ ...rule, [key]: v });

  if (field.type === 'choice' || field.type === 'master') {
    const props = { multi: isMultiOp(rule.op), value: rule.value, onChange: set('value') };
    return field.def ? <MasterChoice def={field.def} {...props} /> : <Choice options={field.options ?? []} {...props} />;
  }

  if (rule.op === 'inLastDays') {
    return <NumberInput aria-label="Days" value={rule.value} onChange={set('value')} suffix="days" />;
  }

  const one = (key: 'value' | 'value2', label: string) =>
    field.type === 'date' ? (
      <DatePicker aria-label={label} className="flex-1" value={(rule[key] as string) ?? ''} onValueChange={(v) => set(key)(v || undefined)} />
    ) : field.type === 'number' ? (
      <NumberInput aria-label={label} value={rule[key]} onChange={set(key)} />
    ) : (
      <TextField
        aria-label={label}
        className="flex-1"
        placeholder="Value"
        value={(rule[key] as string) ?? ''}
        onChange={(e) => set(key)(e.currentTarget.value)}
      />
    );

  return arity === 2 ? (
    <>
      {one('value', 'From')}
      <Text tone="muted">and</Text>
      {one('value2', 'To')}
    </>
  ) : (
    one('value', 'Value')
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  'aria-label': ariaLabel,
}: {
  value: unknown;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  'aria-label': string;
}) {
  return (
    <TextField
      aria-label={ariaLabel}
      className="flex-1"
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

interface ChoiceProps {
  multi: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}

/** Master-list values, including inactive rows — old records still carry them. */
function MasterChoice({ def, ...props }: ChoiceProps & { def: MasterDef<any> }) {
  const rows = useCollection(def.collection);
  const seen = new Set<string>();
  const options = (rows ?? []).flatMap((row) => {
    const value = def.value(row);
    if (seen.has(value)) return [];
    seen.add(value);
    return [{ value, label: def.label(row) }];
  });
  return <Choice options={options} {...props} />;
}

function Choice({ options, multi, value, onChange }: ChoiceProps & { options: ValueOption[] }) {
  if (multi) {
    return (
      <MultiSelect
        aria-label="Values"
        className="flex-1"
        placeholder="Choose values"
        options={options}
        value={Array.isArray(value) ? (value as string[]) : []}
        onValueChange={(v) => onChange(v.length ? v : undefined)}
      />
    );
  }
  return (
    <Combobox
      aria-label="Value"
      className="flex-1"
      placeholder="Choose a value"
      clearable
      options={options}
      value={typeof value === 'string' ? value : null}
      onValueChange={(v) => onChange(v ?? undefined)}
    />
  );
}
