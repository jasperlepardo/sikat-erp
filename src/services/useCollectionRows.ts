import { useCollection } from '../components/form/MasterLookup';
import type { Collection } from './store';

/** Rows of a master-data collection, live (see `useCollection`), plus a `save`. Read-only: edit a copy. */
export function useCollectionRows<T extends { id: string }>(collection: Collection<T>) {
  const rows = useCollection(collection);
  const save = async (row: T) => {
    await collection.save(row);
  };
  /** Bulk activate/deactivate (for rows with an `active` flag). */
  const setActive = async (picked: readonly T[], active: boolean) => {
    await collection.saveMany(picked.map((row) => ({ ...row, active })));
  };
  return { rows, save, setActive };
}

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
