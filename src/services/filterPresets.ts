import type { TableSort } from '@jasperlepardo/sikat-design-system';
import type { FilterGroup } from '../components/filter/engine';
import { createCollection } from './store';

/**
 * A named view of a list: an advanced filter plus a sort ("High credit customers").
 * Saved presets live here; each list's built-in presets are declared in code instead.
 */
export interface FilterPreset {
  id: string;
  /** Which list it belongs to: 'customers', 'vendors'… */
  list: string;
  name: string;
  filter: FilterGroup;
  sort: TableSort | null;
}

export const filterPresets = createCollection<FilterPreset>('sikat-erp:filter-presets', [], 'fp');
