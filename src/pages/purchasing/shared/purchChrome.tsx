import type { ReactNode } from 'react';
import { Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { PurchTotalsFooter, type PurchTotals } from './PurchTotalsFooter';

/**
 * Card-level chrome for purchasing documents, as config-driven builders so the
 * descriptors (`prDoc`/`rfqDoc`/…) stay pure config with no inline JSX.
 */

/** The Summary-type control rendered above a lines table (grid layout only, not data). */
export function summaryTypeHeader(cfg: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  summarized?: boolean;
}): ReactNode {
  return (
    <div className="flex items-center gap-2 px-2">
      <Text variant="small" tone="muted">Summary type</Text>
      <Select
        aria-label="Summary type"
        className="w-40"
        options={cfg.options.map((s) => ({ value: s, label: s }))}
        value={cfg.value}
        onValueChange={(v) => v && cfg.onChange(v)}
        disabled={cfg.disabled}
      />
      {cfg.summarized ? <Text variant="small" tone="muted">Grouped by item — read-only view.</Text> : null}
    </div>
  );
}

/** The totals footer with an optional freight input, built from config. */
export function purchFooter(cfg: {
  totals: PurchTotals;
  currency: string;
  readOnly?: boolean;
  discount?: { value: number; onChange: (v: number) => void };
  freight?: { value: number; onChange: (v: number) => void; show?: boolean };
  fx?: { rate: number; source: string };
  totalLabel?: string;
}): ReactNode {
  const readOnly = cfg.readOnly ?? false;
  const freight = cfg.freight && (cfg.freight.show ?? true)
    ? (
      <TextField
        aria-label={`Freight (${cfg.currency})`}
        type="number"
        min={0}
        className="w-32"
        prefix={cfg.currency}
        value={String(cfg.freight.value)}
        onChange={(e) => cfg.freight!.onChange(Number(e.currentTarget.value))}
        disabled={readOnly}
      />
    )
    : undefined;
  return (
    <PurchTotalsFooter
      totals={cfg.totals}
      currency={cfg.currency}
      readOnly={readOnly}
      discountPct={cfg.discount?.value ?? 0}
      onDiscountChange={cfg.discount?.onChange ?? (() => {})}
      freightInput={freight}
      fx={cfg.fx}
      totalLabel={cfg.totalLabel}
    />
  );
}
