import type { TaxCode, TaxDirection } from '../mocks/taxes';
import { activeOptions } from './inventoryMasters';

/**
 * A tax-code picker's options: the active codes for `direction`, plus `current` when it has since
 * been deactivated, so a saved line still shows its code.
 */
export const taxCodeOptions = (codes: readonly TaxCode[], direction: TaxDirection, current?: string) =>
  activeOptions(codes.filter((c) => c.direction === direction), (c) => c.code, (c) => c.name, current);
