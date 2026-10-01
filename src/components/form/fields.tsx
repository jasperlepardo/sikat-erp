import type { ReactNode } from 'react';
import {
  Card,
  Checkbox,
  Combobox,
  DatePicker,
  Form,
  FormField,
  Icon,
  Select,
  TextField,
  Textarea,
} from '@jasperlepardo/sikat-design-system';
/** Field errors by key: top-level fields by name, row fields as `<row kind>:<id>:<field>`. */
export type Errors = Record<string, string>;

/** Keys of T whose values are V (ignoring undefined). */
type KeysOf<T, V> = { [K in keyof T]-?: NonNullable<T[K]> extends V ? K : never }[keyof T];

interface FieldOptions {
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  type?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Dropdowns: show a ✕ that empties an optional field. */
  clearable?: boolean;
  /** `vertical` puts the label in a column beside the control (the design system's naming); default stacks it above. */
  orientation?: 'horizontal' | 'vertical';
}

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** The old "nothing picked" option. Some lists and records still store it as the value itself. */
const NONE_LABEL = '— None —';
const isNone = (v: string | null | undefined) => !v || v === NONE_LABEL;

type Option = { value: string; label: string };

/**
 * An optional dropdown clears with the field's ✕ (`clearable`), not a "— None —" option.
 * A "— None —" or blank option still passed in is dropped and makes the field clearable; its
 * wording, if it isn't just "None" (e.g. "Use the rules"), becomes the placeholder.
 */
export function emptyState(options: Option[], value: string | undefined, o: { placeholder?: string; clearable?: boolean }, fallback: string) {
  const none = options.find((opt) => isNone(opt.value));
  const clearable = o.clearable ?? Boolean(none);
  const noneText = none?.label && none.label !== NONE_LABEL ? none.label : 'None';
  return {
    options: options.filter((opt) => !isNone(opt.value)),
    value: isNone(value) ? '' : value!,
    clearable,
    placeholder: o.placeholder ?? (none ? noneText : clearable ? 'None' : fallback),
    /** Read-only display of the current value. */
    display: isNone(value) ? '—' : options.find((opt) => opt.value === value)?.label || '—',
  };
}

/**
 * Field builders bound to one object (a partner, an item, a contact row…), so a
 * tab reads as a list of fields: `f.text('name', 'Name', { required: true })`.
 */
export function bind<T>(obj: T, update: (patch: Partial<T>) => void) {
  const patch = (key: keyof T, value: unknown) => update({ [key]: value } as Partial<T>);

  const lockedLabel = (label: ReactNode) => (
    <span className="inline-flex items-center gap-1">
      {label}
      <Icon size={12}>lock</Icon>
    </span>
  );

  const field = (key: keyof T, label: ReactNode, o: FieldOptions, control: (p: object) => ReactNode, displayValue?: ReactNode) => {
    if (o.disabled) {
      return (
        <FormField key={String(key)} orientation={o.orientation} label={lockedLabel(label)} tooltip={o.hint} className={o.className}>
          <p className="px-2 py-2 text-sm text-body">{displayValue || '—'}</p>
        </FormField>
      );
    }
    return (
      <FormField
        key={String(key)}
        orientation={o.orientation}
        label={label}
        required={o.required}
        error={o.error}
        tooltip={o.hint}
        className={o.className}
      >
        {(p) => control(p)}
      </FormField>
    );
  };

  return {
    text: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions = {}) =>
      field(key, label, o, (p) => (
        <TextField
          {...p}
          type={o.type}
          placeholder={o.placeholder}
          readOnly={o.readOnly}
          prefix={o.prefix}
          suffix={o.suffix}
          value={(obj[key] as string | undefined) ?? ''}
          onChange={(e) => patch(key, e.currentTarget.value)}
        />
      ), (obj[key] as string | undefined) || '—'),

    num: (key: KeysOf<T, number>, label: ReactNode, o: FieldOptions = {}) =>
      field(key, label, o, (p) => (
        <TextField
          {...p}
          type="number"
          min={0}
          readOnly={o.readOnly}
          prefix={o.prefix}
          suffix={o.suffix}
          value={String(obj[key] ?? 0)}
          onChange={(e) => patch(key, Number(e.currentTarget.value))}
        />
      ), String(obj[key] ?? 0)),

    pick: (key: KeysOf<T, string>, label: ReactNode, values: readonly string[], o: FieldOptions = {}) => {
      const e = emptyState(toOptions(values), obj[key] as string | undefined, o, 'Select…');
      return field(key, label, o, (p) => (
        <Select
          {...p}
          options={e.options}
          disabled={o.disabled}
          placeholder={e.placeholder}
          clearable={e.clearable}
          value={e.value}
          onValueChange={(v) => patch(key, v ?? '')}
        />
      ), e.display);
    },

    /** A select whose options show a label but store a value (e.g. a partner id). */
    choose: (
      key: KeysOf<T, string>,
      label: ReactNode,
      options: Option[],
      o: FieldOptions = {},
    ) => {
      const e = emptyState(options, obj[key] as string | undefined, o, 'Select…');
      return field(key, label, o, (p) => (
        <Select
          {...p}
          options={e.options}
          disabled={o.disabled}
          placeholder={e.placeholder}
          clearable={e.clearable}
          value={e.value}
          onValueChange={(v) => patch(key, v ?? '')}
        />
      ), e.display);
    },

    /** Like `choose`, but searchable: for options drawn from another table (partners, tax codes, UoMs…). */
    lookup: (
      key: KeysOf<T, string>,
      label: ReactNode,
      options: Option[],
      o: FieldOptions = {},
    ) => {
      const e = emptyState(options, obj[key] as string | undefined, o, 'Search…');
      return field(key, label, o, (p) => (
        <Combobox
          {...p}
          options={e.options}
          disabled={o.disabled}
          placeholder={e.placeholder}
          clearable={e.clearable}
          value={e.value}
          onValueChange={(v) => patch(key, v ?? '')}
        />
      ), e.display);
    },

    date: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions = {}) =>
      field(key, label, o, (p) => (
        <DatePicker
          {...p}
          disabled={o.disabled}
          value={(obj[key] as string | undefined) || null}
          onValueChange={(v) => patch(key, v)}
        />
      ), (obj[key] as string | undefined) || '—'),

    area: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions & { rows?: number } = {}) =>
      field(key, label, o, (p) => (
        <Textarea
          {...p}
          rows={o.rows ?? 3}
          placeholder={o.placeholder}
          value={(obj[key] as string | undefined) ?? ''}
          onChange={(e) => patch(key, e.currentTarget.value)}
        />
      ), (obj[key] as string | undefined) || '—'),

    check: (key: KeysOf<T, boolean>, label: ReactNode, o: { disabled?: boolean } = {}) => (
      <Checkbox
        key={String(key)}
        checked={Boolean(obj[key])}
        disabled={o.disabled}
        onChange={(e) => patch(key, e.currentTarget.checked)}
      >
        {label}
      </Checkbox>
    ),
  };
}

/** A titled card, the unit every tab is built from. */
export function Section({
  icon,
  title,
  actions,
  children,
}: {
  icon: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <Card.Header icon={<Icon size={24}>{icon}</Icon>} actions={actions}>
        {title}
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

/**
 * Two-column field grid. `grid!` because Form.Group's own display:flex is
 * unlayered CSS and would beat a plain `grid` utility.
 */
export function Fields({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const colClass = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';
  return <Form.Group className={`grid! gap-2 ${colClass}`}>{children}</Form.Group>;
}

/**
 * A single column of fields 4px apart, e.g. side-labelled fields in a narrow column. A plain div
 * rather than Form.Group: Form.Group's 16px gap is unlayered design-system CSS a utility can't
 * override. `-mx-2` matches Form.Group's negative margin so fields line up with other sections.
 */
export function FieldStack({ children }: { children: ReactNode }) {
  return <div className="-mx-2 flex flex-col gap-1">{children}</div>;
}

/** A row of checkboxes (flags) under a grid. */
export function Flags({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-6 gap-y-3">{children}</div>;
}

/** A read-only value shown like a field (system-calculated values). Use inside `Fields`. */
export function ReadOnly({ label, value, hint, error }: { label: string; value: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <FormField
      label={<span className="inline-flex items-center gap-1">{label}<Icon size={12}>lock</Icon></span>}
      tooltip={hint}
      error={error}
    >
      <p className="px-2 py-2 text-sm text-body">{value}</p>
    </FormField>
  );
}
