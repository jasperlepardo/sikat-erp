import { type ReactNode } from 'react';
import { type DateSpec } from './DatesCard';

/**
 * The document-date registry — the single source of truth for the date roles shared across every
 * document (see `docs/document-dates-plan.md`). Each role carries its static identity (field key,
 * default label, default hint, required). A document declares the roles it carries and supplies the
 * dynamic bits (`error`, `readOnly`) — and any label/hint override — through `dateRow()`.
 */

/** Static identity of a document-date role. */
export interface DocDateDef {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
}

export const DOC_DATE = {
  /** The document's primary date — drives FX rate, tax rates, prices and the GL period. */
  effective: { key: 'postingDate', label: 'Posting date', required: true, hint: 'Sets the period, exchange rate, tax rates and prices.' },
  /** The legal / BIR date, often the counterparty's own document date. */
  document: { key: 'documentDate', label: 'Document date', required: true, hint: 'The date for BIR / tax purposes. Defaults to today.' },
  /** Payment due — posting date + payment terms. */
  due: { key: 'dueDate', label: 'Due date', hint: 'From the payment terms.' },
  /** When goods are expected / shipped. */
  delivery: { key: 'deliveryDate', label: 'Delivery date' },
  /** When the requester needs it — planning only. */
  required: { key: 'requiredDate', label: 'Required date' },
  /** Offer / request expiry. */
  validUntil: { key: 'validUntil', label: 'Valid until' },
  /** Auto-lapse date. */
  cancellation: { key: 'cancellationDate', label: 'Cancellation date' },
} as const satisfies Record<string, DocDateDef>;

interface DateRowOverrides {
  error?: string;
  readOnly?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  /** Hide this row when empty, behind the card's "+ Add date" control until the user needs it. */
  optional?: boolean;
}

/** Merge a role def with a document's dynamic bits + optional label/hint/required override. */
export function dateRow(def: DocDateDef, o: DateRowOverrides = {}): DateSpec {
  return {
    key: def.key,
    label: o.label ?? def.label,
    hint: o.hint ?? def.hint,
    required: o.required ?? def.required,
    error: o.error,
    readOnly: o.readOnly,
    optional: o.optional,
  };
}
