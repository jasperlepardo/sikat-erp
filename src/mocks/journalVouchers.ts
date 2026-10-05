/**
 * Journal vouchers (Accounting › Journal Vouchers): folders of draft manual journal entries,
 * reviewed and finished before they post. Fields follow the SAP B1 Journal Voucher notes.
 *
 * Settled here, for the prototype:
 * - An entry in a voucher has a journal entry's fields and no G/L impact. It can be saved
 *   unbalanced (with a warning); posting it needs everything a journal entry needs, and makes a
 *   manual journal entry (origin JE). The voucher entry then shows that entry's number, read-only.
 * - Entries post one at a time or all together. A voucher with some entries posted stays Open;
 *   it closes when all are posted.
 * - Unposted entries, and vouchers with nothing posted, can be deleted. Posted entries are
 *   corrected by reversing their journal entry.
 * - "Cost Accounting Adjustment Entry" vouchers and printing are left out.
 */
import { blankJournalEntry, newJeLine, type JournalEntry } from './journalEntries';

/** An entry inside a voucher: Open while it's a draft, Closed once posted. */
export type VoucherEntryStatus = 'Open' | 'Closed';
export type VoucherStatus = 'Open' | 'Closed';

/**
 * A draft journal entry. `transNo` is its number within the voucher; `number` is the posted
 * journal entry's number (0 until posted).
 */
export interface VoucherEntry extends Omit<JournalEntry, 'id' | 'status'> {
  id: string;
  entryStatus: VoucherEntryStatus;
  /** The journal entry it posted as. */
  journalEntryId: string;
}

export interface JournalVoucher {
  id: string;
  voucherNo: number;
  createdOn: string;
  createdBy: string;
  entries: VoucherEntry[];
}

export const newVoucherEntry = (today: string, transNo: number): VoucherEntry => ({
  ...blankJournalEntry(today),
  id: `jve-${crypto.randomUUID().slice(0, 8)}`,
  transNo,
  entryStatus: 'Open',
  journalEntryId: '',
});

// ── Seed ─────────────────────────────────────────────────────────────────────
// October month-end accruals, waiting for the controller's review: one balanced, one still being
// worked on (the bonus split isn't final, so it doesn't balance yet).

const row = (id: string, account: string, debit: number, credit: number, remarks: string) => newJeLine({ id, account, debit, credit, remarks });

const entry = (id: string, transNo: number, patch: Partial<VoucherEntry>): VoucherEntry => ({
  ...newVoucherEntry('2026-10-31', transNo),
  id,
  ...patch,
});

export const SEED_JOURNAL_VOUCHERS: JournalVoucher[] = [
  {
    id: 'jv-001',
    voucherNo: 1,
    createdOn: '2026-10-05',
    createdBy: 'Andrea Ramos',
    entries: [
      entry('jve-001-1', 1, {
        remarks: 'Accrue October utilities — Meralco and Manila Water bills arrive after cut-off.',
        transCode: 'ACCR',
        ref1: 'ACCR-2026-10-01',
        reverse: true,
        reversalDate: '2026-11-01',
        lines: [
          row('jve-001-1-1', '6110', 182400, 0, 'Utilities — October estimate'),
          row('jve-001-1-2', '2030', 0, 182400, 'Accrued utilities'),
        ],
      }),
      entry('jve-001-2', 2, {
        remarks: 'Accrue Q4 staff bonus — October share. Split by store still being confirmed with HR.',
        transCode: 'ACCR',
        ref1: 'ACCR-2026-10-02',
        lines: [
          row('jve-001-2-1', '6020', 420000, 0, 'Bonus — stores'),
          row('jve-001-2-2', '6020', 95000, 0, 'Bonus — head office (pending)'),
          row('jve-001-2-3', '2030', 0, 420000, 'Accrued bonus'),
        ],
      }),
    ],
  },
];
