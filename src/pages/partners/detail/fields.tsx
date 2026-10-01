import { useState } from 'react';
import { Checkbox, Text } from '@jasperlepardo/sikat-design-system';
import type { Partner } from '../../../mocks/partners';
import type { Errors } from '../../../components/form/fields';

export { FieldStack, Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';

export type Draft = Omit<Partner, 'id'> & { id?: string };

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
}

/** The partner fields that point at the record documents start with. */
export type DefaultKey = 'defaultContactId' | 'defaultBillToId' | 'defaultShipToId' | 'defaultPaymentMethod';

/** One default a record can hold, as the edit panel shows it. */
export interface DefaultRole {
  /** A partner field (`DefaultKey`), or a panel's own key, e.g. a method's default account. */
  key: string;
  /** Checkbox text, e.g. "Default bill-to (mail) address". */
  label: string;
  /** Whether this record holds it (or, for a new record, should). */
  checked: boolean;
  /** Name of the other record holding it now, if any — ticking moves it here. */
  holder?: string;
}

export type DefaultPicks = Partial<Record<string, boolean>>;

/** The defaults an edit panel offers, with local state until Done. */
export function useDefaultPicks(roles: DefaultRole[]) {
  return useState<DefaultPicks>(() => Object.fromEntries(roles.map((r) => [r.key, r.checked])));
}

/** A checkbox per default; says which record it takes over from when another holds it. */
export function DefaultFlags({
  roles,
  picks,
  onChange,
}: {
  roles: DefaultRole[];
  picks: DefaultPicks;
  onChange: (picks: DefaultPicks) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {roles.map((r) => (
        <div key={r.key} className="flex flex-col gap-1">
          <Checkbox checked={!!picks[r.key]} onChange={(e) => onChange({ ...picks, [r.key]: e.currentTarget.checked })}>
            {r.label}
          </Checkbox>
          {picks[r.key] && r.holder ? (
            <Text variant="small" tone="muted">
              Replaces {r.holder}, the current default.
            </Text>
          ) : null}
        </div>
      ))}
    </div>
  );
}
