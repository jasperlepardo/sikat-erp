/**
 * Exchange Rate Differences (Accounting › Exchange Rate Differences): revaluing open
 * foreign-currency balances at a period-end rate, as SAP B1's Exchange Rate Differences run does.
 *
 * Settled here, for the prototype:
 * - It revalues open A/R invoices and A/P bills in a foreign currency: their open balance in that
 *   currency × (the revaluation date's rate − the rate they were booked at). A/R up is a gain, A/P
 *   up is a loss. The difference is unrealized; payments still realize against the booked rate.
 * - The run posts one journal entry (Dr/Cr each partner's control account, Cr 7020 Foreign
 *   Exchange Gain / Dr 8020 Foreign Exchange Loss) and reverses it automatically on the day after,
 *   so the next run starts again from the booked rates.
 * - Rates default to the BSP reference rate on the date (Settings › Accounting & Tax › Exchange
 *   rates) and can be typed over for the run.
 * - Foreign-currency G/L balances (the USD bank account) aren't revalued: the ledger holds peso
 *   amounts only, with no foreign-currency amounts to revalue.
 */

export type ErdDocType = 'IN' | 'PU';

/** One open document in a run. */
export interface ErdRow {
  id: string;
  docType: ErdDocType;
  docId: string;
  docNo: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  /** Open balance in the document currency on the run date. */
  balanceFc: number;
  bookedRate: number;
  rate: number;
  /** PHP: balance × (rate − booked rate). Positive raises the balance in pesos. */
  difference: number;
  controlAccount: string;
  selected: boolean;
}

export interface ErdRun {
  id: string;
  /** Revaluation (posting) date. */
  date: string;
  reversalDate: string;
  /** The rate used per currency (PHP per unit). */
  rates: Record<string, number>;
  rows: ErdRow[];
  /** The journal entry it posted. */
  journalEntryId: string;
  journalEntryNo: number;
  gain: number;
  loss: number;
  remarks: string;
}

export const FX_REVALUATION_TRANS_CODE = 'FXRV';

export const SEED_ERD_RUNS: ErdRun[] = [];
