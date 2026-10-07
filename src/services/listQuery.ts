import { parseFilter } from '../components/filter/aip160';
import { applyFilter, type FilterField } from '../components/filter/engine';

/**
 * Query options for a list call, shaped like AIP-132 `List` requests: `filter` is AIP-160
 * text (https://google.aip.dev/160). `fields` names what it may filter on — a real API
 * declares these server-side; the mock takes them from the list page.
 */
export interface ListQuery<T> {
  filter?: string;
  fields?: FilterField<T>[];
}

/** A filter that doesn't parse — what an API answers with 400 INVALID_ARGUMENT. */
export class InvalidFilterError extends Error {
  constructor(
    readonly filter: string,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidFilterError';
  }
}

/** The rows matching an AIP-160 filter. Empty text matches everything. */
export function filterRows<T>(rows: T[], filter: string | undefined, fields: FilterField<T>[] = []): T[] {
  if (!filter?.trim()) return rows;
  const parsed = parseFilter(filter, fields);
  if (!parsed.ok) throw new InvalidFilterError(filter, parsed.error);
  return applyFilter(rows, parsed.filter, fields);
}
