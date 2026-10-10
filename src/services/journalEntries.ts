import type { Account } from '../mocks/chartOfAccounts';
import {
  CLOSED_THROUGH,
  FISCAL_YEAR_END,
  JE_SERIES,
  ORIGIN_LABEL,
  SEED_JOURNAL_ENTRIES,
  blankJournalEntry,
  newJeLine,
  type JeLine,
  type JournalEntry,
  type OriginType,
} from '../mocks/journalEntries';
import type { Partner } from '../mocks/partners';
import { jeSeries, seriesLookup, formatDocNum } from './allSeries';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { formatDate, todayISO } from './dates';
import { createCollection } from './store';
import { purchasingHistory } from './purchasingHistory';

/**
 * The seeded USD purchase chain points at its receipt, bill and payment by PO. They're numbered
 * in date order, so their numbers and ids depend on the rest of the purchasing history.
 */
const CHAIN: Record<string, () => { id: string; docNum: number } | undefined> = {
  'je-009': () => purchasingHistory().receipts.find((r) => r.lines.some((l) => l.baseId === 'po-007')),
  'je-010': () => {
    const gr = purchasingHistory().receipts.find((r) => r.lines.some((l) => l.baseId === 'po-007'));
    return purchasingHistory().invoices.find((i) => i.lines.some((l) => l.baseId === gr?.id));
  },
  'je-011': () => purchasingHistory().payments.find((p) => p.id === 'op-004'),
};
const SEEDED = () => SEED_JOURNAL_ENTRIES.map((e) => {
  const doc = CHAIN[e.id]?.();
  return doc ? { ...e, originId: doc.id, originNo: String(doc.docNum) } : e;
});
const entries = createCollection<JournalEntry>('sikat-erp:journal-entries:v3', SEEDED, 'je');

/** Reversals made before line ids were guaranteed saved rows without one; give them a stable id on read. */
const withLineIds = (je: JournalEntry): JournalEntry =>
  je.lines.every((l) => l.id) ? je : { ...je, lines: je.lines.map((l, i) => (l.id ? l : { ...l, id: `${je.id}-row${i + 1}` })) };

export const listJournalEntries = async () => (await entries.list()).map(withLineIds);
export const getJournalEntry = async (id: string) => {
  const je = await entries.get(id);
  return je && withLineIds(je);
};

export type JeInput = Omit<JournalEntry, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const seriesOf = (id: string) => seriesLookup(jeSeries, id, JE_SERIES);
export const jeNumber = (je: Pick<JournalEntry, 'number' | 'postingDate'> & { seriesId?: string }) =>
  je.seriesId
    ? formatDocNum(seriesOf(je.seriesId), je.number, je.postingDate, 'New')
    : je.number ? String(je.number) : 'New';

export function jeTotals(lines: JeLine[]) {
  const debit = round2(lines.reduce((n, l) => n + (l.debit || 0), 0));
  const credit = round2(lines.reduce((n, l) => n + (l.credit || 0), 0));
  return { debit, credit, difference: round2(debit - credit) };
}

/** A BP row's control account: A/P for vendors, A/R otherwise (customers, and partners that are both). */
export const controlAccountOf = (p: Pick<Partner, 'roles' | 'receivableAccount' | 'payableAccount'>) =>
  p.roles.includes('vendor') && !p.roles.includes('customer') ? p.payableAccount : p.receivableAccount;

/** The account a row actually posts to: its own, or (a manual BP row) the partner's control account. */
export const rowAccount = (l: JeLine, partners: readonly Partner[]) => {
  if (l.account || !l.partnerId) return l.account;
  const p = partners.find((x) => x.id === l.partnerId);
  return p ? controlAccountOf(p) : '';
};

/** Why `date` can't be posted to, or undefined. */
export function postingPeriodProblem(date: string, period13 = false) {
  if (!date) return 'Posting date is required.';
  if (date <= CLOSED_THROUGH) return `The posting period for ${formatDate(date)} is closed (closed through ${formatDate(CLOSED_THROUGH)}).`;
  if (date > FISCAL_YEAR_END) return `No posting period is set up for ${formatDate(date)} — periods run to ${formatDate(FISCAL_YEAR_END)}.`;
  if (period13 && date !== FISCAL_YEAR_END) return `Period 13 (year-end adjustment) postings are dated ${formatDate(FISCAL_YEAR_END)}.`;
  return undefined;
}

/**
 * Automatic Tax: replace the generated tax rows with one per tax code — the taxed rows' net ×
 * the code's rate on the posting date, to the code's G/L account, on the same side.
 */
export function withAutoTax(je: Pick<JournalEntry, 'lines' | 'automaticTax' | 'postingDate'>, codes: readonly TaxCode[]): JeLine[] {
  const base = je.lines.filter((l) => !l.taxOf);
  if (!je.automaticTax) return base.map((l) => ({ ...l, taxCode: '' }));
  const byCode = new Map<string, number>();
  for (const l of base) if (l.taxCode) byCode.set(l.taxCode, (byCode.get(l.taxCode) ?? 0) + (l.debit || 0) - (l.credit || 0));
  const tax: JeLine[] = [];
  for (const [code, net] of byCode) {
    const c = codes.find((x) => x.code === code);
    const amount = c ? round2((net * (rateAt(c, je.postingDate) ?? 0)) / 100) : 0;
    if (!c || !amount || !c.glAccount) continue;
    tax.push(newJeLine({ id: `tax-${code}`, account: c.glAccount, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, taxOf: code, remarks: `${c.code} ${c.name}` }));
  }
  return [...base, ...tax];
}

/** Row problems: what to fix before the entry can be added. Keys are `line:<id>:<field>`. */
export function lineProblems(lines: JeLine[], accounts: readonly Account[], partners: readonly Partner[], date: string, manual: boolean) {
  const out: { key: string; message: string }[] = [];
  lines.forEach((l, i) => {
    if (l.taxOf) return;
    const n = `Row ${i + 1}`;
    if (!l.account && !l.partnerId) return out.push({ key: `line:${l.id}:account`, message: `${n}: pick a G/L account or business partner.` });
    if ((l.debit || 0) < 0 || (l.credit || 0) < 0) out.push({ key: `line:${l.id}:amount`, message: `${n}: amounts can't be negative.` });
    if (l.debit && l.credit) out.push({ key: `line:${l.id}:amount`, message: `${n}: enter a debit or a credit, not both.` });
    if (!l.debit && !l.credit) out.push({ key: `line:${l.id}:amount`, message: `${n}: enter an amount.` });
    if (l.partnerId) {
      const p = partners.find((x) => x.id === l.partnerId);
      if (!p) out.push({ key: `line:${l.id}:account`, message: `${n}: the business partner no longer exists.` });
      else if (!controlAccountOf(p)) out.push({ key: `line:${l.id}:account`, message: `${n}: ${p.name} has no control account — set it on the partner's Accounting tab.` });
      return;
    }
    const a = accounts.find((x) => x.code === l.account);
    if (!a) return out.push({ key: `line:${l.id}:account`, message: `${n}: account ${l.account} doesn't exist.` });
    if (a.title) out.push({ key: `line:${l.id}:account`, message: `${n}: ${a.code} ${a.name} is a title account — post to an account under it.` });
    if (!a.active) out.push({ key: `line:${l.id}:account`, message: `${n}: ${a.code} ${a.name} is inactive.` });
    if ((a.validFrom && date < a.validFrom) || (a.validTo && date > a.validTo)) out.push({ key: `line:${l.id}:account`, message: `${n}: ${a.code} isn't valid on ${formatDate(date)}.` });
    if (manual && a.control) out.push({ key: `line:${l.id}:account`, message: `${n}: ${a.code} ${a.name} is a control account — post to the business partner instead.` });
    else if (manual && a.blockManualPosting) out.push({ key: `line:${l.id}:account`, message: `${n}: ${a.code} ${a.name} only takes postings from documents.` });
  });
  return out;
}

async function nextNumbers(seriesId: string) {
  const all = await entries.list();
  const s = seriesOf(seriesId);
  return {
    number: Math.max(s.firstNo - 1, ...all.filter((e) => e.seriesId === s.id).map((e) => e.number)) + 1,
    transNo: Math.max(0, ...all.map((e) => e.transNo)) + 1,
  };
}

export class JePostError extends Error {}

/** The offsetting entry: same rows with debit and credit swapped. */
const reversalOf = (je: JournalEntry, date: string, numbers: { number: number; transNo: number }): JeInput => ({
  ...je,
  ...numbers,
  id: undefined,
  status: 'Posted',
  postingDate: date,
  documentDate: date,
  dueDate: date,
  remarks: `Reversal of ${jeNumber(je)}${je.remarks ? ` — ${je.remarks}` : ''}`,
  reverse: false,
  reversalDate: '',
  reversedBy: '',
  reverses: je.id,
  period13: false,
  attachments: [],
  lines: je.lines.map((l) => newJeLine({ ...l, id: undefined, debit: l.credit, credit: l.debit })),
});

/**
 * Add (post) an entry. Debits must equal credits and the posting date must be in an open period.
 * With Reverse ticked, the reversing entry is posted too, dated the reversal date.
 */
export async function addJournalEntry(input: JeInput): Promise<JournalEntry> {
  const t = jeTotals(input.lines);
  if (t.difference) throw new JePostError(`Debits and credits differ by ${Math.abs(t.difference).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`);
  const period = postingPeriodProblem(input.postingDate, input.period13);
  if (period) throw new JePostError(period);
  if (input.reverse) {
    const rev = postingPeriodProblem(input.reversalDate);
    if (!input.reversalDate || input.reversalDate <= input.postingDate) throw new JePostError('Reversal date must be after the posting date.');
    if (rev) throw new JePostError(`Reversal: ${rev}`);
  }
  const posted = await entries.save({ ...input, ...(await nextNumbers(input.seriesId)), status: 'Posted' });
  if (!input.reverse) return posted;
  const reversal = await entries.save(reversalOf(posted, input.reversalDate, await nextNumbers(input.seriesId)));
  return entries.save({ ...posted, status: 'Reversed', reversedBy: reversal.id });
}

/** Reverse a posted entry now: a new offsetting entry dated `date`; the original stays as it was, marked Reversed. */
export async function reverseJournalEntry(id: string, date = todayISO()) {
  const je = await entries.get(id);
  if (!je) throw new JePostError('This entry no longer exists.');
  if (je.status === 'Reversed') throw new JePostError('This entry is already reversed.');
  if (je.reverses) throw new JePostError('This entry is itself a reversal.');
  const period = postingPeriodProblem(date);
  if (period) throw new JePostError(period);
  const reversal = await entries.save(reversalOf(je, date, await nextNumbers(je.seriesId)));
  await entries.save({ ...je, status: 'Reversed', reversedBy: reversal.id });
  return reversal;
}

/** Posted entries keep everything but their remarks and attachments. */
export async function saveJournalEntryNotes(id: string, patch: Pick<JournalEntry, 'remarks' | 'attachments'>) {
  const je = await entries.get(id);
  if (!je) throw new JePostError('This entry no longer exists.');
  return entries.save({ ...je, ...patch });
}

/**
 * The entry a document makes when it posts (Origin = its type and number). Rows on the
 * document's control account carry its business partner. Rows with nothing on them are
 * dropped; nothing is posted when nothing is left.
 */
export async function postDocumentEntry(o: {
  origin: Exclude<OriginType, 'JE'>;
  originNo: string | number;
  originId: string;
  postingDate: string;
  dueDate?: string;
  remarks: string;
  ref2?: string;
  /** The business partner, and the control account its rows post to. */
  partnerId?: string;
  controlAccount?: string;
  lines: { account: string; debit: number; credit: number }[];
}) {
  const lines = o.lines
    .filter((l) => l.debit || l.credit)
    .map((l) => newJeLine({ account: l.account, debit: l.debit, credit: l.credit, partnerId: o.partnerId && l.account === o.controlAccount ? o.partnerId : '' }));
  if (!lines.length) return undefined;
  const base = blankJournalEntry(o.postingDate);
  return entries.save({
    ...base,
    ...(await nextNumbers(base.seriesId)),
    dueDate: o.dueDate || o.postingDate,
    origin: o.origin,
    originNo: String(o.originNo),
    originId: o.originId,
    remarks: o.remarks,
    ref2: o.ref2 ?? '',
    lines,
  });
}

/**
 * Cancelling a document: reverse the entry it made (if it made one), dated Mon Oct  5 19:11:51 PST 2026. A closed
 * period moves the reversal to the first open day.
 */
export async function reverseDocumentEntry(originId: string, date = todayISO()) {
  const je = (await entries.list()).find((e) => e.originId === originId && e.origin !== 'JE' && e.status === 'Posted' && !e.reverses);
  if (!je) return undefined;
  const open = date <= CLOSED_THROUGH ? nextDay(CLOSED_THROUGH) : date;
  const reversal = await entries.save({ ...reversalOf(je, open, await nextNumbers(je.seriesId)), remarks: `Cancellation of ${ORIGIN_LABEL[je.origin]} ${je.originNo}` });
  await entries.save({ ...je, status: 'Reversed', reversedBy: reversal.id });
  return reversal;
}

const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Import from Excel: rows of Account | Debit | Credit | Remarks (tab-separated text, as
 * readXlsxText gives it). A header row and blank rows are skipped.
 */
export function parseJeRows(text: string): { lines: JeLine[]; skipped: number } {
  const lines: JeLine[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split('\t').map((c) => c.trim());
    if (!cells.some(Boolean)) continue;
    const num = (v = '') => Number(v.replace(/,/g, '')) || 0;
    const [account, debit, credit, remarks = ''] = cells;
    if (!/^\d{3,}$/.test(account ?? '')) {
      skipped++;
      continue;
    }
    lines.push(newJeLine({ account, debit: num(debit), credit: num(credit), remarks }));
  }
  return { lines, skipped };
}
