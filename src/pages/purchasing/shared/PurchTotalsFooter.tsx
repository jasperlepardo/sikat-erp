import type { ReactNode } from 'react';
import { Text, TextField } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../services/format';

export interface PurchTotals {
  beforeDiscount: number;
  discount: number;
  freight: number;
  rounding?: number;
  tax: number;
  total: number;
  reverseCharge?: number;
}

const BORDER = { borderColor: 'var(--color-border-neutral-subtle)' };

const amt = (v: number, code: string) =>
  v < 0 ? `–${code} ${formatAmount(-v)}` : `${code} ${formatAmount(v)}`;

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
    return (
      <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={BORDER}>
        <Text variant="small" weight="semibold" tone="heading">{label}</Text>
        <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{amt(value, code)}</Text>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Text variant="small" className="text-caption">{label}</Text>
        {input ? <span className="min-w-24 flex-none">{input}</span> : null}
      </div>
      <Text variant="small" className="text-body tabular-nums">{amt(value, code)}</Text>
    </div>
  );
}

/** A full-width muted note row. */
export function PurchTotalNote({ children }: { children: ReactNode }) {
  return <Text variant="small" className="text-caption">{children}</Text>;
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
  /** Label for the strong total row. Default: "Total payment due" */
  totalLabel?: string;
  /** Extra rows after the total (withholding, applied amount, balance, etc.). */
  extraRows?: ReactNode;
  /** Shows a "≈ PHP …" note below extraRows when currency ≠ PHP. */
  fx?: { rate: number; source: string };
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
  totalLabel = 'Total payment due',
  extraRows,
  fx,
}: PurchTotalsFooterProps) {
  const showDiscount = discountPct > 0 || !readOnly;
  const showFreight = freightInput && (!readOnly || totals.freight > 0);

  return (
    <fieldset disabled={readOnly} className="contents">
      <div className="flex flex-col gap-1 px-2 py-1">
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
        {currency !== 'PHP' && fx ? (
          <Text variant="small" className="text-caption text-right">
            ≈ PHP {formatAmount(totals.total * fx.rate)} at {fx.rate} ({fx.source}).
          </Text>
        ) : null}
      </div>
    </fieldset>
  );
}
