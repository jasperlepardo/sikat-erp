import type { ReactNode } from 'react';
import {
  Card,
  Checkbox,
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
}

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

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
        <FormField key={String(key)} label={lockedLabel(label)} tooltip={o.hint} className={o.className}>
          <p className="px-2 py-2 text-sm text-body">{displayValue || '—'}</p>
        </FormField>
      );
    }
    return (
      <FormField key={String(key)} label={label} required={o.required} error={o.error} tooltip={o.hint} className={o.className}>
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

    pick: (key: KeysOf<T, string>, label: ReactNode, values: readonly string[], o: FieldOptions = {}) =>
      field(key, label, o, (p) => (
        <Select
          {...p}
          options={toOptions(values)}
          disabled={o.disabled}
          placeholder={o.placeholder}
          value={(obj[key] as string | undefined) ?? ''}
          onValueChange={(v) => patch(key, v)}
        />
      ), (obj[key] as string | undefined) || '—'),

    /** A select whose options show a label but store a value (e.g. a partner id). */
    choose: (
      key: KeysOf<T, string>,
      label: ReactNode,
      options: { value: string; label: string }[],
      o: FieldOptions = {},
    ) =>
      field(key, label, o, (p) => (
        <Select
          {...p}
          options={options}
          disabled={o.disabled}
          placeholder={o.placeholder}
          value={(obj[key] as string | undefined) ?? ''}
          onValueChange={(v) => patch(key, v)}
        />
      ), options.find((opt) => opt.value === (obj[key] as string))?.label || '—'),

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
