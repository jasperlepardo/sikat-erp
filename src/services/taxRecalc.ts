import { birFormNo, type BirForm } from '../mocks/birForms';
import type { TaxCode } from '../mocks/taxes';

/**
 * Re-proposing line tax codes when the partner or posting date changes, without undoing the
 * user's own choices. Pure: callers pass the proposal (each document has its own `proposedTaxCode`).
 */

export interface RecalcableLine {
  id: string;
  itemId: string;
  taxCode: string;
  taxOverridden?: boolean;
  baseId?: string;
  baseType?: string;
}

/** Copied from a base document: the line keeps the source's tax code. */
const isCopied = (l: RecalcableLine) => Boolean(l.baseType || l.baseId);

/**
 * Re-propose the tax code on every line except ones the user set by hand (`taxOverridden`) or
 * copied from a base document. Lines with no item, or whose proposal comes back empty, keep their code.
 */
export function recalcLineTaxes<L extends RecalcableLine>(lines: readonly L[], propose: (itemId: string) => string): L[] {
  return lines.map((l) => {
    if (!l.itemId || l.taxOverridden || isCopied(l)) return l;
    const taxCode = propose(l.itemId);
    return taxCode && taxCode !== l.taxCode ? { ...l, taxCode, ...UNSTAMPED } : l;
  });
}

/** A new tax code drops the ATC and return stamped from the old one (e.g. on a line copied from an added document). */
const UNSTAMPED = { taxAtc: undefined, taxReturn: undefined };

/** Patch for a manual tax-code edit: store the code and mark it overridden so recalc leaves it alone. Clearing it hands the line back to recalc. */
export const editTaxCode = (taxCode: string) => ({ taxCode, taxOverridden: Boolean(taxCode), ...UNSTAMPED });

/** The ATC a line files under: stamped on an added document (`added`), else its tax code's current one. */
export const lineAtc = (l: { taxCode: string; taxAtc?: string }, codes: readonly Pick<TaxCode, 'code' | 'atc'>[], added: boolean) =>
  (added ? l.taxAtc : undefined) ?? codes.find((c) => c.code === l.taxCode)?.atc ?? '';

/** The BIR returns a tax code is filed on, as form numbers ("2550Q / 1600-VT"); '' for none. */
export const returnsOf = (code: Pick<TaxCode, 'returnFormIds'> | undefined, forms: readonly BirForm[]) =>
  (code?.returnFormIds ?? []).map((id) => forms.find((f) => f.id === id)).filter((f): f is BirForm => Boolean(f)).map(birFormNo).join(' / ');

/** Stamp each line's ATC and BIR return from its tax code, so the VAT/percentage tax return keeps them. */
export const withTaxFiling = <L extends { taxCode: string }>(
  lines: readonly L[],
  codes: readonly Pick<TaxCode, 'code' | 'atc' | 'returnFormIds'>[],
  forms: readonly BirForm[],
): L[] =>
  lines.map((l) => {
    const c = codes.find((x) => x.code === l.taxCode);
    return { ...l, taxAtc: c?.atc ?? '', taxReturn: returnsOf(c, forms) };
  });
