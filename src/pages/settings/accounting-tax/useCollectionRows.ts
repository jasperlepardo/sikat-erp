import { useState } from 'react';
import { useAsync } from '../../../services/useAsync';

/** Rows of a master-data collection plus a `save` that reloads them. */
export function useCollectionRows<T extends { id: string }>(collection: {
  list: () => Promise<T[]>;
  save: (row: T) => Promise<T>;
}) {
  const [version, setVersion] = useState(0);
  const rows = useAsync(collection.list, [version]);
  const save = async (row: T) => {
    await collection.save(row);
    setVersion((v) => v + 1);
  };
  /** Bulk activate/deactivate (for rows with an `active` flag). */
  const setActive = async (picked: T[], active: boolean) => {
    for (const row of picked) await collection.save({ ...row, active });
    setVersion((v) => v + 1);
  };
  return { rows, save, setActive, reload: () => setVersion((v) => v + 1) };
}

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
