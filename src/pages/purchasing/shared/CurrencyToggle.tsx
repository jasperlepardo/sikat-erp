import { Button } from '@jasperlepardo/sikat-design-system';
import type { ExchangeRate } from '../../../mocks/currencies';
import { rateOn } from '../../../services/masterData';

/**
 * The currencies a document's amounts can be shown in: its own and local (PHP). A PHP
 * document has just the one, so the toggle stays hidden.
 */
export function currencyChoices(docCurrency: string): string[] {
  return docCurrency === 'PHP' ? ['PHP'] : [docCurrency, 'PHP'];
}

/**
 * How to show a document's amounts in `view`: the code to print and the factor from the
 * document currency. `fx` is PHP per unit of the document currency; another foreign
 * currency goes through PHP at its own rate on `date`. Factor 0 when there's no rate.
 */
export function amountsIn(view: string, docCurrency: string, fx: number, rates: readonly ExchangeRate[], date: string) {
  if (view === docCurrency) return { code: docCurrency, factor: 1, rate: undefined };
  if (view === 'PHP') return { code: 'PHP', factor: fx, rate: undefined };
  const rate = rateOn(rates as ExchangeRate[], view, date);
  return { code: view, factor: rate?.rate ? fx / rate.rate : 0, rate };
}

/** Switches the currency a document's amounts are shown in. Hidden when there's only one. */
export function CurrencyToggle({ choices, value, onChange }: { choices: string[]; value: string; onChange: (code: string) => void }) {
  if (choices.length < 2) return null;
  return (
    <Button.ToggleGroup aria-label="Show amounts in" value={value} onValueChange={(v) => { if (v) onChange(v as string); }} size="small">
      {choices.map((c) => <Button.Toggle key={c} value={c}>{c}</Button.Toggle>)}
    </Button.ToggleGroup>
  );
}
