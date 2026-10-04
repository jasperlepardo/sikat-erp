import type { ReactNode } from 'react';
import {
  Card,
  Icon,
  ReadOnlyField,
  bind as dsBind,
  CtxFormField,
  Fields,
  FieldStack,
  Flags,
} from '@jasperlepardo/sikat-design-system';
import type { FieldOptions, KeysOf, Option } from '@jasperlepardo/sikat-design-system';
import { MasterLookup, type MasterDef, type MasterRow } from './MasterLookup';

export type { FieldOptions, KeysOf, Option };
export { CtxFormField, Fields, FieldStack, Flags };

/** Field errors by key: top-level fields by name, row fields as `<row kind>:<id>:<field>`. */
export type Errors = Record<string, string>;

/**
 * Field builders bound to one object (a partner, an item, a contact row…), so a
 * tab reads as a list of fields: `f.text('name', 'Name', { required: true })`.
 */
export function bind<T>(obj: T, update: (patch: Partial<T>) => void) {
  const f = dsBind(obj, update);
  const patch = (key: keyof T, value: unknown) => update({ [key]: value } as Partial<T>);

  return {
    ...f,

    /**
     * Searchable picker over a master-data list, with "+ Add" when nothing matches. `where`
     * narrows the rows offered; `seed` presets fields on a row added from here.
     */
    master: <R extends MasterRow>(
      key: KeysOf<T, string>,
      label: ReactNode,
      def: MasterDef<R>,
      o: FieldOptions & { where?: (row: R) => boolean; seed?: Partial<R>; extra?: string[] } = {},
    ) => {
      const value = (obj[key] as string | undefined) ?? '';
      const fieldO: FieldOptions = { ...o, hint: o.hint ?? `From ${def.title} in ${def.home}.` };
      return f.field(key, label, fieldO, (p) => (
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

/** A read-only value shown like a field (system-calculated values). Use inside `Fields`. */
export function ReadOnly(props: Parameters<typeof ReadOnlyField>[0]) {
  return <ReadOnlyField {...props} />;
}
