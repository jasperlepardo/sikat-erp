import type { ReactNode } from 'react';
import { TextField } from '@jasperlepardo/sikat-design-system';
import { amt, TotalsBar, TotalsNote, TotalsRow } from '../../../components/form/TotalsFooterParts';

export interface PurchTotals {
  beforeDiscount: number;
  discount: number;
  freight: number;
  rounding?: number;
  tax: number;
  total: number;
  reverseCharge?: number;
}

/** A label + value row matching the SalesTotalsFooter layout. */
export function PurchTotalRow({
  label,
  value,
  code,
  input,
  strong,
}: {
  label: ReactNode;
  value: number;
  code: string;
  input?: ReactNode;
  strong?: boolean;
}) {
  if (strong) {
    return <TotalsBar label={label} value={amt(value, code)} />;
  }
  return <TotalsRow label={label} value={amt(value, code)} input={input ? <span className="min-w-24 flex-none">{input}</span> : undefined} />;
}

/** A full-width muted note row. */
export function PurchTotalNote({ children }: { children: ReactNode }) {
  return <TotalsNote>{children}</TotalsNote>;
}

interface PurchTotalsFooterProps {
  totals: PurchTotals;
  currency: string;
  readOnly: boolean;
  discountPct: number;
  onDiscountChange: (pct: number) => void;
  /** Freight row input (TextField + optional tax-code Combobox). Omit to hide the row. */
  freightInput?: ReactNode;
  /** Rounding row label; omit to hide the row. */
  roundingLabel?: string;
  /** Rows inserted between rounding and tax (e.g. DPM %, down payment). */
  midRows?: ReactNode;
  /** Label for the strong total row. Default "Total"; the amount actually owed is the "Net payment due"/"Balance due" row. A credit doc passes "Total credit". */
  totalLabel?: string;
  /** Extra rows after the total (withholding, applied amount, balance, etc.). */
  extraRows?: ReactNode;
}

/** Shared totals footer for purchasing documents: before-discount → discount → freight → rounding → tax → total. */
export function PurchTotalsFooter({
  totals,
  currency,
  readOnly,
  discountPct,
  onDiscountChange,
  freightInput,
  roundingLabel,
  midRows,
  totalLabel = 'Total',
  extraRows,
}: PurchTotalsFooterProps) {
  const showDiscount = discountPct > 0 || !readOnly;
  const showFreight = freightInput && (!readOnly || totals.freight > 0);

  return (
    <div className="flex flex-col">
      <PurchTotalRow label="Subtotal" value={totals.beforeDiscount} code={currency} />
      {showDiscount ? (
        <PurchTotalRow
          label="Discount"
          value={totals.discount ? -totals.discount : 0}
          code={currency}
          input={readOnly ? undefined : (
            <TextField
              aria-label="Document discount %"
              type="number"
              min={0}
              className="w-24"
              suffix="%"
              value={String(discountPct)}
              onChange={(e) => onDiscountChange(Math.min(100, Number(e.currentTarget.value)))}
            />
          )}
        />
      ) : null}
      {showFreight ? <PurchTotalRow label="Freight" value={totals.freight} code={currency} input={readOnly ? undefined : freightInput} /> : null}
      {roundingLabel ? <PurchTotalRow label={roundingLabel} value={totals.rounding ?? 0} code={currency} /> : null}
      {midRows}
      <PurchTotalRow label="VAT" value={totals.tax + (totals.reverseCharge ?? 0)} code={currency} />
      {totals.reverseCharge ? (
        <PurchTotalRow label="Reverse charge VAT" value={-totals.reverseCharge} code={currency} />
      ) : null}
      <PurchTotalRow label={totalLabel} value={totals.total} code={currency} strong />
      {extraRows}
    </div>
  );
}
