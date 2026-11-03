import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { FieldOrientationCtx, Fields, Flags, Form, ReadOnly, Section, bind, type Errors, type KeysOf } from './fields';
import { AccountField } from './AccountField';
import { PAYMENT_METHODS } from '../../mocks/masters';
import { INDICATORS } from '../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../pages/settings/masterDefs';
import type { Account, AccountRole } from '../../mocks/chartOfAccounts';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const methodOptions = PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` }));

/** A per-field tweak: a hint, label override, read-only lock, or validation error. */
interface FieldOpt {
  hint?: ReactNode;
  label?: ReactNode;
  readOnly?: boolean;
  error?: string;
}

/** A read-only display row (installments, TIN, order number). The def computes the value. */
interface ReadonlyRow {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

/**
 * One document's payment config, built from the live draft. The five core fields use fixed draft
 * keys (`paymentTermId`, `paymentMethod`, `cashDiscountDays`, `journalRemark`, `projectId`,
 * `indicator`); the def only toggles presence and tweaks hints/readOnly/error. Account, flags,
 * reads and nodes cover the posting-document extras; `posting` is the read-only Dr/Cr block.
 */
interface PaymentConfig<D> {
  // ── Payment card ──
  paymentTerm?: FieldOpt | false;
  paymentMethod?: FieldOpt | false;
  cashDiscountDays?: FieldOpt | false;
  /** Editable installments count (sales). Purchasing shows `installmentsRead` instead. */
  installments?: FieldOpt | false;
  installmentsRead?: ReadonlyRow | false;
  flags?: { key: KeysOf<D, boolean>; label: ReactNode }[];
  // ── Journal entry card ──
  journalRemark?: FieldOpt | false;
  account?: {
    role: AccountRole;
    key: KeysOf<D, string>;
    label: string;
    accounts: Account[] | undefined;
    required?: boolean;
    readOnly?: boolean;
    error?: string;
    hint?: ReactNode;
  };
  project?: FieldOpt | false;
  indicator?: FieldOpt | false;
  /** Custom widgets that don't generalize (e.g. the consolidating-BP combobox). Rendered after the account. */
  nodes?: ReactNode[];
  /** Read-only rows (TIN, order number), after the fields. */
  reads?: ReadonlyRow[];
  /** The read-only Dr/Cr posting, merged in below the editable fields (posting documents only). */
  posting?: ReactNode;
}

/**
 * A document's payment cards, declared centrally in `src/pages/documentPaymentDefs.tsx` (one entry
 * per document, typed to that document's draft `D`). `build` turns the live draft/errors/extra into
 * a flat `PaymentConfig`; `X` carries whatever the config needs (ctx, masters).
 */
export interface PaymentDef<D, X extends object = object> {
  build: (a: { draft: D; update: (patch: Partial<D>) => void; errors: Errors } & X) => PaymentConfig<D>;
}

/**
 * The editable journal fields (control account, project, indicator, reads) in a 2-column grid.
 * The remark is excluded by default — the Journal entry card renders it as a textarea below the table
 * (`journalRemarkOf`); only the plain "Accounting" section (non-posting docs) keeps it inline here.
 */
function journalFieldsOf<T>(cfg: PaymentConfig<T>, draft: T, update: (patch: Partial<T>) => void, withRemark = false, inline = false): ReactNode {
  // No fields to show → render nothing, so the Journal entry card doesn't get an empty grid (a gap).
  const hasFields = (withRemark && cfg.journalRemark) || cfg.account || cfg.nodes?.length || cfg.project || cfg.indicator || cfg.reads?.length;
  if (!hasFields) return null;
  const f = bind(draft, update);
  const body = (
    <>
      {withRemark && cfg.journalRemark ? f.text('journalRemark' as KeysOf<T, string>, cfg.journalRemark.label ?? 'Journal remark', { hint: cfg.journalRemark.hint, readOnly: cfg.journalRemark.readOnly, error: cfg.journalRemark.error }) : null}
      {cfg.account ? (
        <AccountField
          label={cfg.account.label}
          role={cfg.account.role}
          value={(draft[cfg.account.key] as unknown as string) ?? ''}
          onChange={(code) => update({ [cfg.account!.key]: code } as Partial<T>)}
          accounts={cfg.account.accounts}
          required={cfg.account.required}
          error={cfg.account.error}
          readOnly={cfg.account.readOnly}
          hint={cfg.account.hint}
        />
      ) : null}
      {cfg.nodes?.map((node, i) => <Fragment key={i}>{node}</Fragment>)}
      {cfg.project ? f.master('projectId' as KeysOf<T, string>, cfg.project.label ?? 'BP project', projectDef, { clearable: true, hint: cfg.project.hint, readOnly: cfg.project.readOnly, error: cfg.project.error }) : null}
      {cfg.indicator ? f.choose('indicator' as KeysOf<T, string>, cfg.indicator.label ?? 'Indicator', asOptions(INDICATORS), { clearable: true, hint: cfg.indicator.hint, readOnly: cfg.indicator.readOnly, error: cfg.indicator.error }) : null}
      {cfg.reads?.map((r, i) => <ReadOnly key={i} label={r.label} value={r.value} hint={r.hint} />)}
    </>
  );
  return inline ? (
    <FieldOrientationCtx.Provider value="stacked">
      <Form.Group orientation="stacked">{body}</Form.Group>
    </FieldOrientationCtx.Provider>
  ) : (
    <Fields cols={2}>{body}</Fields>
  );
}

/** The journal remark as a textarea, rendered below the entry table in the Journal entry card. */
function journalRemarkOf<T>(cfg: PaymentConfig<T>, draft: T, update: (patch: Partial<T>) => void): ReactNode {
  if (!cfg.journalRemark) return null;
  const f = bind(draft, update);
  return f.area('journalRemark' as KeysOf<T, string>, cfg.journalRemark.label ?? 'Journal remark', {
    rows: 2,
    hint: cfg.journalRemark.hint,
    readOnly: cfg.journalRemark.readOnly,
    error: cfg.journalRemark.error,
  });
}

/**
 * The Payment section (terms, method, discount, flags), plus — for documents that never post — their
 * journal fields in a plain "Accounting" Section. Posting documents render their journal fields inside
 * the Journal entry card instead (`DocumentJournalEntry`, placed in the main panel after the content),
 * so this skips them when `cfg.posting` is set.
 */
function PaymentCard<T>({ draft, update, cfg }: { draft: T; update: (patch: Partial<T>) => void; cfg: PaymentConfig<T> }) {
  const f = bind(draft, update);
  const hasPayment = cfg.paymentTerm || cfg.paymentMethod || cfg.cashDiscountDays || cfg.installments || cfg.installmentsRead || cfg.flags?.length;
  const hasJournalFields = cfg.journalRemark || cfg.account || cfg.project || cfg.indicator || cfg.reads?.length || cfg.nodes?.length;
  return (
    <>
      {hasPayment ? (
        <Section icon="payments" title="Payment">
          <FieldOrientationCtx.Provider value="stacked">
            <Form.Group orientation="stacked">
              {cfg.paymentTerm ? f.master('paymentTermId' as KeysOf<T, string>, cfg.paymentTerm.label ?? 'Payment terms', paymentTermDef, { hint: cfg.paymentTerm.hint, readOnly: cfg.paymentTerm.readOnly, error: cfg.paymentTerm.error }) : null}
              {cfg.paymentMethod ? f.lookup('paymentMethod' as KeysOf<T, string>, cfg.paymentMethod.label ?? 'Payment method', methodOptions, { hint: cfg.paymentMethod.hint, readOnly: cfg.paymentMethod.readOnly, error: cfg.paymentMethod.error }) : null}
              {cfg.cashDiscountDays ? f.num('cashDiscountDays' as KeysOf<T, number>, cfg.cashDiscountDays.label ?? 'Cash discount date offset', { suffix: 'days', hint: cfg.cashDiscountDays.hint, readOnly: cfg.cashDiscountDays.readOnly, error: cfg.cashDiscountDays.error }) : null}
              {cfg.installments ? f.num('installments' as KeysOf<T, number>, cfg.installments.label ?? 'Installments', { hint: cfg.installments.hint, readOnly: cfg.installments.readOnly, error: cfg.installments.error }) : null}
              {cfg.installmentsRead ? <ReadOnly label={cfg.installmentsRead.label} value={cfg.installmentsRead.value} hint={cfg.installmentsRead.hint} /> : null}
            </Form.Group>
          </FieldOrientationCtx.Provider>
          {cfg.flags?.length ? <Flags>{cfg.flags.map((fl) => <Fragment key={String(fl.key)}>{f.check(fl.key, fl.label)}</Fragment>)}</Flags> : null}
        </Section>
      ) : null}

      {!cfg.posting && hasJournalFields ? (
        <Section icon="account_balance" title="Accounting">{journalFieldsOf(cfg, draft, update, true, true)}</Section>
      ) : null}
    </>
  );
}

/**
 * The self-contained "Journal entry" card for posting documents — the editable journal fields
 * injected above the Dr/Cr entry table (`cfg.posting`, a `JournalPreview`). Goes in the main panel
 * after the content, mirroring the Payment means → Journal entry order on the payment pages.
 */
function JournalEntryCard<T>({ draft, update, cfg }: { draft: T; update: (patch: Partial<T>) => void; cfg: PaymentConfig<T> }) {
  if (!isValidElement(cfg.posting)) return null;
  return cloneElement(cfg.posting as ReactElement<{ journalFields?: ReactNode; journalRemark?: ReactNode }>, {
    journalFields: journalFieldsOf(cfg, draft, update),
    journalRemark: journalRemarkOf(cfg, draft, update),
  });
}

/**
 * Renders a centrally-defined `PaymentDef` as the Payment section (and, for non-posting documents,
 * an Accounting fields section). `posting` is the document's read-only Dr/Cr block; passing it tells
 * this to leave the journal fields for `DocumentJournalEntry` (the Journal entry card) instead.
 */
export function DocumentPayment<D, X extends object = object>(
  { def, draft, update, errors, posting, ...extra }: { def: PaymentDef<D, X>; draft: D; update: (patch: Partial<D>) => void; errors: Errors; posting?: ReactNode } & X,
) {
  const cfg = def.build({ draft, update, errors, ...(extra as unknown as X) });
  return <PaymentCard draft={draft} update={update} cfg={{ ...cfg, posting: posting ?? cfg.posting }} />;
}

/**
 * The document's "Journal entry" card (journal fields + Dr/Cr entry table), built from the same
 * `PaymentDef`. Render it in the main panel after the content; keep `DocumentPayment` (Payment terms)
 * in the aside. `posting` is the `JournalPreview` block for this document.
 */
export function DocumentJournalEntry<D, X extends object = object>(
  { def, draft, update, errors, posting, ...extra }: { def: PaymentDef<D, X>; draft: D; update: (patch: Partial<D>) => void; errors: Errors; posting?: ReactNode } & X,
) {
  const cfg = def.build({ draft, update, errors, ...(extra as unknown as X) });
  return <JournalEntryCard draft={draft} update={update} cfg={{ ...cfg, posting: posting ?? cfg.posting }} />;
}
