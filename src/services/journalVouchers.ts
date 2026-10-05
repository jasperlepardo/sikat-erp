import { SEED_JOURNAL_VOUCHERS, newVoucherEntry, type JournalVoucher, type VoucherEntry, type VoucherStatus } from '../mocks/journalVouchers';
import { JePostError, addJournalEntry, jeNumber, withAutoTax, type JeInput } from './journalEntries';
import { taxCodes } from './masterData';
import { createCollection } from './store';

const vouchers = createCollection<JournalVoucher>('sikat-erp:journal-vouchers', SEED_JOURNAL_VOUCHERS, 'jv');

export const listVouchers = vouchers.list;
export const getVoucher = vouchers.get;

/** Open while any entry (or none yet) waits to post; Closed once every entry is posted. */
export const voucherStatus = (v: Pick<JournalVoucher, 'entries'>): VoucherStatus =>
  v.entries.length && v.entries.every((e) => e.entryStatus === 'Closed') ? 'Closed' : 'Open';

export const hasPosted = (v: Pick<JournalVoucher, 'entries'>) => v.entries.some((e) => e.entryStatus === 'Closed');

export { newVoucherEntry };

const nextTransNo = (v: Pick<JournalVoucher, 'entries'>) => Math.max(0, ...v.entries.map((e) => e.transNo)) + 1;

/**
 * Save an entry into its voucher — or into a new voucher (`voucherId` 'new'), as "Add Journal
 * Entry to New Voucher". No G/L impact; it may be unbalanced. Posted entries can't change.
 */
export async function saveVoucherEntry(voucherId: string, entry: VoucherEntry, by: string, today: string) {
  if (entry.entryStatus === 'Closed') throw new JePostError('This entry is posted — reverse its journal entry instead.');
  let voucher: Omit<JournalVoucher, 'id'> & { id?: string };
  if (voucherId === 'new') {
    const all = await vouchers.list();
    voucher = { voucherNo: Math.max(0, ...all.map((v) => v.voucherNo)) + 1, createdOn: today, createdBy: by, entries: [] };
  } else {
    const found = await vouchers.get(voucherId);
    if (!found) throw new JePostError('This voucher no longer exists.');
    voucher = found;
  }
  const exists = voucher.entries.some((e) => e.id === entry.id);
  const saved = exists ? entry : { ...entry, transNo: nextTransNo(voucher) };
  const v = await vouchers.save({ ...voucher, entries: exists ? voucher.entries.map((e) => (e.id === entry.id ? saved : e)) : [...voucher.entries, saved] });
  return { voucher: v, entry: saved };
}

/** Delete unposted entries. Posted ones stay: their journal entries are permanent. */
export async function deleteVoucherEntries(voucherId: string, entryIds: string[]) {
  const v = await vouchers.get(voucherId);
  if (!v) throw new JePostError('This voucher no longer exists.');
  return vouchers.save({ ...v, entries: v.entries.filter((e) => !entryIds.includes(e.id) || e.entryStatus === 'Closed') });
}

/** Delete a voucher that has nothing posted. */
export async function deleteVoucher(id: string) {
  const v = await vouchers.get(id);
  if (v && hasPosted(v)) throw new JePostError('Entries in this voucher are posted — delete only the open ones.');
  await vouchers.remove(id);
}

/** The journal entry a voucher entry posts as: same fields, Automatic Tax rows included, empty rows dropped. */
export function toJournalEntry(e: VoucherEntry, codes: Parameters<typeof withAutoTax>[1]): JeInput {
  const { id: _id, entryStatus: _s, journalEntryId: _j, ...fields } = e;
  const lines = withAutoTax(e, codes).filter((l) => l.taxOf || l.account || l.partnerId || l.debit || l.credit);
  return { ...fields, number: 0, transNo: 0, status: 'Posted', reversedBy: '', reverses: '', lines };
}

/**
 * Post entries, in Trans. No. order. Each becomes a manual journal entry through the journal
 * entry rules (balanced, open period, valid reversal). An entry that's refused stops the run:
 * the ones before it stay posted, it and the rest stay open, and the error names it.
 */
export async function postVoucherEntries(voucherId: string, entryIds: string[]) {
  const codes = await taxCodes.list();
  let v = await vouchers.get(voucherId);
  if (!v) throw new JePostError('This voucher no longer exists.');
  const picked = v.entries.filter((e) => entryIds.includes(e.id) && e.entryStatus === 'Open').sort((a, b) => a.transNo - b.transNo);
  const posted: { transNo: number; number: string }[] = [];
  for (const e of picked) {
    try {
      const je = await addJournalEntry(toJournalEntry(e, codes));
      const done: VoucherEntry = { ...e, entryStatus: 'Closed', journalEntryId: je.id, number: je.number, lines: je.lines };
      v = await vouchers.save({ ...v, entries: v.entries.map((x) => (x.id === e.id ? done : x)) });
      posted.push({ transNo: e.transNo, number: jeNumber(je) });
    } catch (err) {
      if (!(err instanceof JePostError)) throw err;
      throw new VoucherPostError(e.id, `Entry ${e.transNo}: ${err.message}`, posted);
    }
  }
  return { voucher: v, posted };
}

/** A post stopped at one entry; `posted` lists the ones that went through before it. */
export class VoucherPostError extends JePostError {
  constructor(
    readonly entryId: string,
    message: string,
    readonly posted: { transNo: number; number: string }[],
  ) {
    super(message);
  }
}
