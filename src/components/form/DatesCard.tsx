import { useState, type ReactNode } from 'react';
import { Button, Icon } from '@jasperlepardo/sikat-design-system';
import { FieldOrientationCtx, Form, ReadOnly, Section, bind, type Errors, type KeysOf } from './fields';
import { formatDate } from '../../services/dates';

/**
 * One editable date row in the shared Dates card. `key` is a plain string (a date-field name on the
 * draft); it's cast to the draft's `KeysOf` inside `DatesCard`, so callers — and `dateRow()` — don't
 * thread the draft type through every row.
 */
export interface DateSpec {
  key: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  /** Stage-locked dates render flat read-only (see `bind().date`). */
  readOnly?: boolean;
  error?: string;
  /** Hidden when empty, behind the "+ Add date" control, until the user reveals it. */
  optional?: boolean;
}

interface DatesCardProps<T> {
  draft: T;
  update: (patch: Partial<T>) => void;
  /** The editable dates, rendered top to bottom. */
  dates: DateSpec[];
  /** A trailing read-only "Close date" row, shown only once the document is closed and the date is stamped. */
  closeDate?: string;
  /** Hint under the Close date row. */
  closeHint?: ReactNode;
  /** Extra non-date fields appended after the dates (e.g. indicator, order number on the "& references" variants). */
  children?: ReactNode;
  title?: string;
  icon?: string;
}

/**
 * Shared Dates card for document detail pages. Each document passes the dates it carries with its
 * own hints and read-only rules; the card owns the Section, layout and the Close-date row so every
 * document presents dates the same way. For "Dates & references" variants pass the reference fields
 * as children and set the title.
 */
export function DatesCard<T>({ draft, update, dates, closeDate, closeHint, children, title = 'Dates', icon = 'calendar_today' }: DatesCardProps<T>) {
  const h = bind(draft, update);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const hasValue = (key: string) => {
    const v = (draft as Record<string, unknown>)[key];
    return typeof v === 'string' ? v.trim() !== '' : v != null;
  };
  // An optional row shows once it has a value or the user reveals it; otherwise it's offered under "+ Add date".
  const shown = dates.filter((d) => !d.optional || hasValue(d.key) || revealed.has(d.key));
  const addable = dates.filter((d) => d.optional && !d.readOnly && !hasValue(d.key) && !revealed.has(d.key));
  return (
    <Section icon={icon} title={title}>
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {shown.map((d) => (
            <div key={String(d.key)}>
              {h.date(d.key as KeysOf<T, string>, d.label, { required: d.required, error: d.error, readOnly: d.readOnly, hint: d.hint })}
            </div>
          ))}
          {addable.length ? (
            <div className="flex flex-wrap gap-2">
              {addable.map((d) => (
                <Button
                  key={d.key}
                  type="button"
                  intent="white"
                  variant="solid"
                  size="small"
                  shape="pill"
                  leadingIcon={<Icon size={18}>add</Icon>}
                  onClick={() => setRevealed((prev) => new Set(prev).add(d.key))}
                >
                  {String(d.label)}
                </Button>
              ))}
            </div>
          ) : null}
          {children}
          {closeDate ? <ReadOnly label="Close date" value={formatDate(closeDate)} hint={closeHint} /> : null}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}

/**
 * A document's Dates card, declared centrally in `src/pages/documentDateDefs.tsx` (one entry per
 * document, typed to that document's draft `D`). `rows` builds the date specs from the draft, errors,
 * and whatever extra the document needs (`X` — e.g. `{ ctx }` or `{ readOnly }`). `cascade` lets a
 * header date also patch line dates (PO delivery, RFQ required); `closeField` names the field holding
 * the Close/Cancel stamp.
 */
export interface DatesDef<D, X extends object = object> {
  title?: string;
  icon?: string;
  closeField?: Extract<keyof D, string>;
  closeHint?: ReactNode;
  cascade?: (draft: D, patch: Partial<D>) => Partial<D>;
  rows: (a: { draft: D; errors: Errors } & X) => DateSpec[];
}

/** Renders a centrally-defined `DatesDef` through the shared `DatesCard`. */
export function DocumentDates<D, X extends object = object>(
  { def, draft, update, errors, ...extra }: { def: DatesDef<D, X>; draft: D; update: (patch: Partial<D>) => void; errors: Errors } & X,
) {
  const applyUpdate = def.cascade ? (patch: Partial<D>) => update(def.cascade!(draft, patch)) : update;
  const closeDate = def.closeField ? ((draft[def.closeField] as unknown as string) ?? '') : undefined;
  return (
    <DatesCard
      draft={draft}
      update={applyUpdate}
      title={def.title}
      icon={def.icon}
      closeDate={closeDate}
      closeHint={def.closeHint}
      dates={def.rows({ draft, errors, ...(extra as unknown as X) })}
    />
  );
}
