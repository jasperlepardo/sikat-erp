import { formatDate } from '../../services/dates';
import { amountsIn, currencyChoices } from '../purchasing/shared/CurrencyToggle';

/**
 * How a document's amounts are shown: its own currency or local (PHP). A PHP document has the one
 * choice, so the toggle stays hidden. Switching to PHP is a read-only view — the prices stay in the
 * document currency. Sales and purchasing documents share this one engine (`amountsIn` /
 * `currencyChoices` / `CurrencyToggle`), so they convert identically; each module re-exports it as
 * `salesView` / `purchaseView`.
 */
export interface DocumentView {
  /** The currencies the amounts can be shown in: the document's and PHP (or just PHP). */
  choices: string[];
  /** The currency currently shown. */
  shown: string;
  /** Same as `shown`; the code to print in headers and amounts. */
  code: string;
  /** True when showing PHP for a foreign-currency document (amounts converted, lines locked). */
  converted: boolean;
  /** Document-currency amount → shown-currency amount (identity unless converted). */
  convert: (n: number) => number;
  /** Switch the shown currency. */
  onChange: (code: string) => void;
  /** Contents-card hint while converted (the rate note), else undefined. */
  note: string | undefined;
}

/**
 * Builds the currency view for a sales or purchasing document. Both only ever offer the document
 * currency and PHP (the partner's currency is the document's), so `amountsIn` needs no rate table —
 * the PHP factor is the document's own `fx`.
 */
export function documentView(
  docCurrency: string,
  fx: number,
  postingDate: string,
  value: string,
  onChange: (code: string) => void,
): DocumentView {
  const choices = currencyChoices(docCurrency);
  const shown = choices.includes(value) ? value : docCurrency;
  // No third ("System") currency on this toggle, so the rate table is never consulted here.
  const conv = amountsIn(shown, docCurrency, fx, [], postingDate);
  const converted = shown !== docCurrency;
  // Only a warning when the rate is missing; the toggle itself signals the PHP (read-only) view.
  const note = converted && !conv.factor
    ? `No ${docCurrency} exchange rate on or before ${formatDate(postingDate)}.`
    : undefined;
  return { choices, shown, code: conv.code, converted, convert: (n) => n * conv.factor, onChange, note };
}
