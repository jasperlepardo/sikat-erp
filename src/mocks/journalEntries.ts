/**
 * Journal entries: the one ledger file every posting lands in, whether typed in by hand or made
 * by a document (Accounting › Journal Entries). Fields follow the SAP B1 Journal Entry field map.
 *
 * Settled here, for the prototype:
 * - An entry is posted the moment it's added and is never edited after — only its remarks and
 *   attachments change. Undoing one is a reversal: a new entry with debits and credits swapped,
 *   the original marked Reversed. Entries made by documents are reversed by cancelling the
 *   document, which posts the reversal.
 * - Reverse (scheduled reversal) creates the reversing entry right away, dated the reversal
 *   date, rather than waiting for that day.
 * - A row posts to a G/L account or to a business partner; a BP row posts to the partner's
 *   control account (A/R for customers, A/P for vendors). Document entries carry the partner on
 *   their control-account rows, as SAP shows them.
 * - Automatic Tax adds a tax row per tax code to the code's G/L account. Deferred tax and
 *   withholding tax (the sub-options) and journal templates aren't built.
 * - Amounts are in PHP (local currency); the document's own currency stays on the document.
 * - Posting periods: everything through CLOSED_THROUGH is closed, and periods exist only through
 *   FISCAL_YEAR_END. Period 13 (year-end adjustment) postings are dated FISCAL_YEAR_END.
 * - Origin codes follow SAP's legend (JE, IM, PD, PU, PS, RD, PC, DN, IN, RC); IQ for Inventory Posting is a
 *   placeholder until the "Transaction Type Abbreviations Legend" is confirmed.
 * - Seeded documents from before the prototype's data have no entries (except the seeded
 *   September count), so balances start from what's posted in the app.
 */
import type { Attachment } from './common';

export type JeStatus = 'Posted' | 'Reversed';

export type OriginType = 'JE' | 'IM' | 'IQ' | 'PD' | 'PU' | 'PS' | 'RD' | 'PC' | 'DN' | 'IN' | 'RC';
export const ORIGIN_LABEL: Record<OriginType, string> = {
  JE: 'Journal Entry',
  IM: 'Inventory Transfer',
  IQ: 'Inventory Posting',
  PD: 'Goods Receipt PO',
  PU: 'A/P Invoice',
  PS: 'Outgoing Payment',
  RD: 'Goods Return',
  PC: 'A/P Credit Memo',
  DN: 'Delivery',
  IN: 'A/R Invoice',
  RC: 'Incoming Payment',
};
/** Where each origin document opens (once its screens exist). */
export const ORIGIN_PATH: Partial<Record<OriginType, string>> = {
  IM: '/inventory/stock-movements',
  IQ: '/inventory/stock-counts/postings',
  PD: '/purchasing/goods-receipts',
  PU: '/purchasing/bills',
  PS: '/purchasing/payments-made',
  DN: '/sales/deliveries',
  RD: '/purchasing/returns-and-debits/returns',
  PC: '/purchasing/returns-and-debits/credit-memos',
};

export const TRANS_CODES = ['', 'ACCR', 'DEPR', 'RECL', 'CORR', 'YEND'];
export const TRANS_CODE_LABEL: Record<string, string> = {
  '': '— None —',
  ACCR: 'ACCR · Accrual',
  DEPR: 'DEPR · Depreciation',
  RECL: 'RECL · Reclassification',
  CORR: 'CORR · Correction',
  YEND: 'YEND · Year-end adjustment',
};

/** Posting periods through this date are closed. */
export const CLOSED_THROUGH = '2026-08-31';
/** Last day of the latest fiscal year with periods set up; Period 13 postings use it. */
export const FISCAL_YEAR_END = '2026-12-31';

export interface JeLine {
  id: string;
  /** The G/L account posted to. '' on a manual BP row: it posts to the partner's control account. */
  account: string;
  /** The business partner on the row ('' for a G/L row). */
  partnerId: string;
  debit: number;
  credit: number;
  /** Automatic Tax: the row's tax code ('' = none). */
  taxCode: string;
  /** Set on the tax rows Automatic Tax adds. */
  taxOf?: string;
  dueDate: string;
  project: string;
  remarks: string;
}

export interface JournalEntry {
  id: string;
  seriesId: string;
  /** 0 until added. */
  number: number;
  /** Internal transaction number, across all series. */
  transNo: number;
  status: JeStatus;
  postingDate: string;
  dueDate: string;
  documentDate: string;
  remarks: string;
  origin: OriginType;
  /** The source document's number (empty for manual entries — the entry is its own origin). */
  originNo: string;
  /** The source document's id, to open it. */
  originId: string;
  indicator: string;
  project: string;
  transCode: string;
  ref1: string;
  ref2: string;
  ref3: string;
  blanketAgreement: string;
  revaluationReporting: boolean;
  /** Reverse on `reversalDate`. */
  reverse: boolean;
  reversalDate: string;
  /** Year-end adjustment period. */
  period13: boolean;
  automaticTax: boolean;
  /** The entry that reverses this one, and the one this one reverses (ids). */
  reversedBy: string;
  reverses: string;
  attachments: Attachment[];
  lines: JeLine[];
}

export const JE_SERIES = [{ id: 'je-primary', name: 'Primary', firstNo: 1 }];

export const newJeLine = (patch: Partial<JeLine> = {}): JeLine => ({
  account: '',
  partnerId: '',
  debit: 0,
  credit: 0,
  taxCode: '',
  dueDate: '',
  project: '',
  remarks: '',
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `jl-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankJournalEntry(today: string): Omit<JournalEntry, 'id'> {
  return {
    seriesId: JE_SERIES[0].id,
    number: 0,
    transNo: 0,
    status: 'Posted',
    postingDate: today,
    dueDate: today,
    documentDate: today,
    remarks: '',
    origin: 'JE',
    originNo: '',
    originId: '',
    indicator: '— None —',
    project: '',
    transCode: '',
    ref1: '',
    ref2: '',
    ref3: '',
    blanketAgreement: '',
    revaluationReporting: false,
    reverse: false,
    reversalDate: '',
    period13: false,
    automaticTax: false,
    reversedBy: '',
    reverses: '',
    attachments: [],
    lines: [newJeLine(), newJeLine()],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const row = (id: string, account: string, debit: number, credit: number, patch: Partial<JeLine> = {}) => newJeLine({ id, account, debit, credit, ...patch });

const je = (id: string, number: number, transNo: number, patch: Partial<JournalEntry>): JournalEntry => ({
  ...blankJournalEntry('2026-09-30'),
  id,
  number,
  transNo,
  ...patch,
});

export const SEED_JOURNAL_ENTRIES: JournalEntry[] = [
  je('je-001', 1, 1, {
    remarks: 'Accrue September Greenbelt 3 store rent — invoice not yet received.',
    transCode: 'ACCR',
    ref1: 'ACCR-2026-09-01',
    reverse: true,
    reversalDate: '2026-10-01',
    reversedBy: 'je-002',
    status: 'Reversed',
    lines: [row('je-001-1', '6100', 385000, 0, { remarks: 'Rent – Greenbelt 3, September' }), row('je-001-2', '2030', 0, 385000, { remarks: 'Accrued rent' })],
  }),
  je('je-002', 2, 2, {
    postingDate: '2026-10-01',
    documentDate: '2026-10-01',
    dueDate: '2026-10-01',
    remarks: 'Reversal of 1 — Accrue September Greenbelt 3 store rent — invoice not yet received.',
    transCode: 'ACCR',
    ref1: 'ACCR-2026-09-01',
    reverses: 'je-001',
    lines: [row('je-002-1', '6100', 0, 385000, { remarks: 'Rent – Greenbelt 3, September' }), row('je-002-2', '2030', 385000, 0, { remarks: 'Accrued rent' })],
  }),
  je('je-003', 3, 3, {
    remarks: 'Inventory Posting – WH-MNL month-end count',
    origin: 'IQ',
    originNo: '320001',
    originId: 'ip-001',
    ref2: 'CS-MNL-2026-09',
    lines: [row('je-003-1', '5050', 78564, 0), row('je-003-2', '1310', 0, 78564)],
  }),
  je('je-004', 4, 4, {
    remarks: 'September depreciation — store fixtures and IT equipment.',
    transCode: 'DEPR',
    ref1: 'DEP-2026-09',
    lines: [
      row('je-004-1', '6310', 214500, 0, { remarks: 'Depreciation expense' }),
      row('je-004-2', '1511', 0, 96500, { remarks: 'Furniture and fixtures' }),
      row('je-004-3', '1531', 0, 118000, { remarks: 'IT and office equipment' }),
    ],
  }),
];
