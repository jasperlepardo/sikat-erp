import { Children, type ComponentProps, type ReactNode } from 'react';
import { Card, Form, Select, Icon, ReadOnly as ReadOnlyValue, bind as dsBind, CtxFormField, FieldOrientationCtx, Fields as DsFields, FieldStack, Flags, emptyState } from '@jasperlepardo/sikat-design-system';
import type { FieldOptions, KeysOf, Option } from '@jasperlepardo/sikat-design-system';
import { formatDate } from '../../services/dates';
import { MasterLookup, type MasterDef, type MasterRow } from './MasterLookup';

export type { FieldOptions, KeysOf };
export { CtxFormField, FieldOrientationCtx, FieldStack, Flags, Form };

/**
 * The design system's field grid, but it renders nothing when it has no fields:
 * an all-conditional group whose fields are hidden would otherwise leave an empty
 * `sikat-form__group` div — a stray gap in the layout.
 */
export function Fields(props: ComponentProps<typeof DsFields>) {
  if (Children.toArray(props.children).length === 0) return null;
  return <DsFields {...props} />;
}

/** Field errors by key: top-level fields by name, row fields as `<row kind>:<id>:<field>`. */
export type Errors = Record<string, string>;

/**
 * Field builders bound to one object (a partner, an item, a contact row…), so a
 * tab reads as a list of fields: `f.text('name', 'Name', { required: true })`.
 *
 * A thin wrapper over the design system's `bind()` that adds `master()` (a
 * master-data lookup) and `status()` (a yes/no dropdown). Lock a field with the
 * design system's own `readOnly` / `disabled` options — they render the native
 * read-only control and lock icon.
 */
export function bind<T>(obj: T, update: (patch: Partial<T>) => void) {
  const f = dsBind(obj, update);
  const patch = (key: keyof T, value: unknown) => update({ [key]: value } as Partial<T>);
  const dash = (v: ReactNode) => (v === '' || v === undefined || v === null ? '—' : v);
  const str = (key: keyof T) => (obj[key] as unknown as string | number | undefined) ?? '';
  /**
   * A field locked by document stage renders as a flat read-only value (no input chrome, no hover
   * or edit affordance) rather than the design system's hover-to-edit read-only control — the same
   * look as `<ReadOnly>` and a read-only `master`. `readOnly: false`/absent keeps it editable.
   */
  const show = (label: ReactNode, o: FieldOptions, value: ReactNode) => (
    <ReadOnly label={label} value={value} hint={o.hint} error={o.error} orientation={o.orientation} />
  );

  return {
    ...f,

    text: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions = {}) =>
      o.readOnly ? show(label, o, dash(str(key))) : f.text(key, label, o),

    num: (key: KeysOf<T, number>, label: ReactNode, o: FieldOptions = {}) =>
      o.readOnly
        ? show(label, o, obj[key] == null ? '—' : <>{o.prefix}{String(obj[key])}{o.suffix ? <> {o.suffix}</> : null}</>)
        : f.num(key, label, o),

    pick: (key: KeysOf<T, string>, label: ReactNode, values: readonly string[], o: FieldOptions = {}) =>
      o.readOnly ? show(label, o, dash(str(key))) : f.pick(key, label, values, o),

    choose: (key: KeysOf<T, string>, label: ReactNode, options: Option[], o: FieldOptions = {}) =>
      o.readOnly ? show(label, o, emptyState(options, str(key) as string, o, 'Select…').display) : f.choose(key, label, options, o),

    lookup: (key: KeysOf<T, string>, label: ReactNode, options: Option[], o: FieldOptions = {}) =>
      o.readOnly ? show(label, o, emptyState(options, str(key) as string, o, 'Search…').display) : f.lookup(key, label, options, o),

    date: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions = {}) =>
      o.readOnly ? show(label, o, str(key) ? formatDate(str(key) as string) : '—') : f.date(key, label, o),

    area: (key: KeysOf<T, string>, label: ReactNode, o: FieldOptions & { rows?: number } = {}) =>
      o.readOnly ? show(label, o, dash(str(key))) : f.area(key, label, o),

    /**
     * Searchable picker over a master-data list, with "+ Add" when nothing matches. `where`
     * narrows the rows offered; `seed` presets fields on a row added from here. When read-only,
     * `MasterLookup` itself renders the resolved label as a flat value.
     */
    master: <R extends MasterRow>(
      key: KeysOf<T, string>,
      label: ReactNode,
      def: MasterDef<R>,
      o: FieldOptions & { where?: (row: R) => boolean; seed?: Partial<R>; extra?: string[] } = {},
    ) => {
      const value = (obj[key] as string | undefined) ?? '';
      return f.field(key, label, { ...o, hint: o.hint ?? `From ${def.title} in ${def.home}.` }, (p) => (
        <MasterLookup<R>
          def={def}
          fieldProps={p}
          value={value}
          onChange={(v) => patch(key, v)}
          where={o.where}
          seed={o.seed}
          extra={o.extra}
          placeholder={o.placeholder ?? (o.clearable ? 'None' : 'Search…')}
          clearable={o.clearable}
          disabled={o.disabled}
          readOnly={o.readOnly}
        />
      ));
    },

    /** A yes/no flag as a dropdown with both answers named (`yes` / `no`, default Active / Inactive). */
    status: (key: KeysOf<T, boolean>, label: ReactNode, o: FieldOptions & { yes?: string; no?: string } = {}) =>
      o.readOnly
        ? show(label, o, obj[key] ? (o.yes ?? 'Active') : (o.no ?? 'Inactive'))
        : f.field(key, label, o, (p) => (
            <Select
              {...p}
              options={[
                { value: 'yes', text: o.yes ?? 'Active', label: <StatusLabel intent="success">{o.yes ?? 'Active'}</StatusLabel> },
                { value: 'no', text: o.no ?? 'Inactive', label: <StatusLabel intent="default">{o.no ?? 'Inactive'}</StatusLabel> },
              ]}
              value={obj[key] ? 'yes' : 'no'}
              onValueChange={(v) => v && patch(key, v === 'yes')}
              disabled={o.disabled}
            />
          )),
  };
}

export type StatusIntent = 'default' | 'primary' | 'warning' | 'success' | 'danger';

/** The Badge's status dot, tinted by intent (as `TableStatus` colors a status). */
function StatusDot({ intent }: { intent: StatusIntent }) {
  const color = intent === 'default' ? 'var(--color-fg-default-solid)' : `var(--color-fg-${intent})`;
  return (
    <span className="sikat-badge__dot-wrap" aria-hidden="true">
      <span className="sikat-badge__dot" style={{ backgroundColor: color }} />
    </span>
  );
}

/** A status name with its dot — a `Select` option label for a status dropdown (used by `bind().status`). */
function StatusLabel({ intent, children }: { intent: StatusIntent; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <StatusDot intent={intent} />
      {children}
    </span>
  );
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

interface ReadOnlyProps {
  label?: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  error?: string;
  subLabel?: ReactNode;
  subLabelPlacement?: 'top' | 'inline';
  description?: ReactNode;
  /** Label placement; defaults to the enclosing Fields/FieldStack orientation. */
  orientation?: FieldOptions['orientation'];
}

/**
 * A read-only value shown like a field (system-calculated or stage-locked values). Use inside `Fields`.
 * Renders without a lock icon — the label reads as a normal field whose value just can't be edited.
 */
export function ReadOnly({ label, value, hint, error, subLabel, subLabelPlacement, description, orientation }: ReadOnlyProps) {
  return (
    <CtxFormField label={label} tooltip={hint} error={error} disabled={false} orientation={orientation}>
      <ReadOnlyValue value={value} subLabel={subLabel} subLabelPlacement={subLabelPlacement} description={description} />
    </CtxFormField>
  );
}
