import type { ReactNode } from 'react';
import { Radio, Text } from '@jasperlepardo/sikat-design-system';
import { PRICE_MODES, type PriceMode } from '../../mocks/common';
import { getDocumentSettings } from '../../services/documentSettings';
import { round2 } from '../../services/num';

/** Whether the Net / Gross / Net-and-Gross price-entry toggle is enabled company-wide. */
export const priceModeEnabled = () => getDocumentSettings().separateNetGrossPriceMode;

/** The Net / Gross / Net-and-Gross radiogroup shown in a lines-table header. */
export function priceModeHeader(name: string, current: PriceMode, onChange: (m: PriceMode) => void): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-6 px-2" role="radiogroup" aria-label="Price mode">
      <Text variant="small" tone="muted">Price mode</Text>
      {PRICE_MODES.map((mode) => (
        <Radio key={mode} name={name} checked={current === mode} onChange={() => onChange(mode)}>{mode}</Radio>
      ))}
      <Text variant="small" tone="muted">
        {current === 'Net'
          ? 'Enter net prices; gross is calculated.'
          : current === 'Gross'
            ? 'Enter prices including tax; net is calculated.'
            : 'Edit either price; the other follows.'}
      </Text>
    </div>
  );
}

/**
 * The gross-price column binding for a price mode (sales and purchasing use the same shape): shows the
 * net and/or gross unit-price field, and backs the net out of a typed gross at the line's own tax rate
 * (0 for exempt/zero-rated — they keep the net price).
 */
export function grossPriceBinding<L extends { id: string; unitPrice: number }>(
  current: PriceMode,
  taxRate: (l: L) => number,
  patch: (id: string, p: Partial<L>) => void,
) {
  return {
    showNet: current !== 'Gross',
    showGross: current !== 'Net',
    get: (l: L) => round2(l.unitPrice * (1 + taxRate(l) / 100)),
    onChange: (l: L, g: number) => patch(l.id, { unitPrice: round2(g / (1 + taxRate(l) / 100)) } as Partial<L>),
  };
}
