import type { ReactNode } from 'react';
import { FieldOrientationCtx, Form, ReadOnly, Section, bind } from './fields';
import { SeriesNoFields } from './SeriesNoFields';
import { formatExchangeRate } from '../../services/format';
import { activeOptions } from '../../services/inventoryMasters';
import type { Currency } from '../../mocks/currencies';
import type { DocumentSeries } from '../../mocks/common';

/** The numbering half of the card. Pass it only while it should show (hidden once the document is added). */
export interface DocumentSeriesProps {
  rows: DocumentSeries[];
  seriesId: string;
  docNum: number;
  /** The formatted number, shown once the series has assigned it. */
  number: string;
  /** Noun for the manual-entry placeholder, e.g. "PO" → "PO number". */
  noun: string;
  error?: string;
  readOnly?: boolean;
  onSeries: (seriesId: string) => void;
  onNumber: (docNum: number) => void;
}

/** The currency + exchange-rate half of the card. Omit to hide both rows (e.g. purchase requests). */
export interface DocumentCurrencyProps {
  code: string;
  currencies: Currency[];
  /** Provide to edit the currency inline; omit (or `readOnly`) to show it as a flat value. */
  onChange?: (code: string) => void;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  /** The rate used for `code`, with the bulletin day and source it comes from. PHP → undefined (rate shows "—"). */
  rate?: { rate: number; date: string; source: string };
  /** Help text under the exchange rate; hidden for PHP. */
  rateHint?: ReactNode;
  /** Set false to hide the exchange-rate row (e.g. agreements, which carry a currency but no daily rate). */
  showRate?: boolean;
}

/**
 * The **Document** card every detail page shares: series + number, the document currency, and the
 * read-only exchange rate that converts its totals to PHP. Pass `series` only while it should show
 * (drop it once the document is added) and `currency` only on documents that carry one.
 */
export function DocumentCard({ series, currency, extra, icon = 'tag', title = 'Document' }: {
  series?: DocumentSeriesProps;
  currency?: DocumentCurrencyProps;
  /** Document-specific fields shown after the currency/rate (e.g. a payment's transaction no.). */
  extra?: ReactNode;
  icon?: string;
  title?: ReactNode;
}) {
  const h = bind({ currency: currency?.code ?? '' }, (p) => currency?.onChange?.(p.currency ?? ''));
  const options = currency
    ? activeOptions(currency.currencies, (c) => c.code, (c) => `${c.code} · ${c.name}`, currency.code)
    : [];
  if (!series && !currency && !extra) return null;
  return (
    <Section icon={icon} title={title}>
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {series && (
            <SeriesNoFields
              series={series.rows}
              seriesId={series.seriesId}
              docNum={series.docNum}
              number={series.number}
              noun={series.noun}
              error={series.error}
              readOnly={series.readOnly}
              onSeries={series.onSeries}
              onNumber={series.onNumber}
            />
          )}
          {currency && (
            <>
              {h.lookup('currency', 'Currency', options, { hint: currency.hint, readOnly: currency.readOnly || !currency.onChange, required: currency.required, error: currency.error })}
              {currency.showRate !== false && (
                <ReadOnly
                  label="Exchange rate"
                  value={formatExchangeRate(currency.code, currency.rate?.rate ?? 0, { date: currency.rate?.date, source: currency.rate?.source })}
                  hint={currency.code === 'PHP' ? undefined : currency.rateHint}
                />
              )}
            </>
          )}
          {extra}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
