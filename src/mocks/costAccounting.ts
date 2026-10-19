/**
 * Cost accounting (SAP B1 Financials › Cost Accounting): four dimensions, and the
 * distribution rules a posting row is tagged with in each. G/L accounts can require
 * a rule per dimension and propose a default one.
 * Seeded into a managed collection (services/costAccounting.ts); read that, not this.
 * Append to RULES; never reorder (ids are positional).
 */
import { idIn } from './masters';

export type DimensionNo = 1 | 2 | 3 | 4;
export const DIMENSION_NOS: DimensionNo[] = [1, 2, 3, 4];
export const DIMENSION_NAMES: Record<DimensionNo, string> = {
  1: 'Business Unit',
  2: 'Product',
  3: 'Office Location',
  4: 'Department',
};

export interface DistributionRule {
  id: string;
  code: string;
  name: string;
  dimension: DimensionNo;
  active: boolean;
}

const RULES = [
  ['RETAIL', 'Retail stores', 1],
  ['CORP', 'Corporate sales', 1],
  ['ONLINE', 'Online store', 1],
  ['SERVICE', 'After-sales service', 1],
  ['IPHONE', 'iPhone', 2],
  ['MAC', 'Mac', 2],
  ['IPAD', 'iPad', 2],
  ['WATCH', 'Apple Watch', 2],
  ['AUDIO', 'AirPods and audio', 2],
  ['ACCESSORY', 'Accessories', 2],
  ['CARE', 'AppleCare and services', 2],
  ['HO', 'Head office (Pasig)', 3],
  ['CEBU', 'Cebu (Robinsons Galleria)', 3],
  ['DAVAO', 'Davao (Abreeza)', 3],
  ['MAKATI', 'Makati (Greenbelt 3)', 3],
  ['MGMT', 'Management', 4],
  ['SALES', 'Sales', 4],
  ['SVC', 'Service', 4],
  ['FIN', 'Finance', 4],
  ['OPS', 'Operations', 4],
  ['PUR', 'Purchasing', 4],
  ['HR', 'Human Resources', 4],
] as const;

export const ruleId = idIn('ocr', RULES.map(([code]) => code));

export const SEED_DISTRIBUTION_RULES: DistributionRule[] = RULES.map(([code, name, dimension]) => ({
  id: ruleId(code),
  code,
  name,
  dimension,
  active: true,
}));

/** A posting row's rule in one dimension. Rows list only the dimensions filled in. */
export interface DimensionRule {
  dimension: DimensionNo;
  ruleId: string;
}

/** A G/L account's setting for one dimension. Accounts list only the dimensions set up. */
export interface AccountDimension {
  dimension: DimensionNo;
  /** Every posting to the account must name a rule in this dimension. */
  required: boolean;
  /** Proposed on rows that post to the account; '' = none. */
  defaultRuleId: string;
}

export const ruleOf = (rows: readonly DimensionRule[] | undefined, n: DimensionNo) => rows?.find((r) => r.dimension === n)?.ruleId ?? '';

export const withRule = (rows: readonly DimensionRule[] | undefined, n: DimensionNo, ruleId: string): DimensionRule[] =>
  [...(rows ?? []).filter((r) => r.dimension !== n), ...(ruleId ? [{ dimension: n, ruleId }] : [])].sort((a, b) => a.dimension - b.dimension);

export const accountDimension = (rows: readonly AccountDimension[] | undefined, n: DimensionNo): AccountDimension =>
  rows?.find((r) => r.dimension === n) ?? { dimension: n, required: false, defaultRuleId: '' };

/** Change one dimension's setting; a dimension neither required nor defaulted drops out. */
export const withAccountDimension = (rows: readonly AccountDimension[] | undefined, n: DimensionNo, patch: Partial<AccountDimension>): AccountDimension[] => {
  const next = { ...accountDimension(rows, n), ...patch, dimension: n };
  return [...(rows ?? []).filter((r) => r.dimension !== n), ...(next.required || next.defaultRuleId ? [next] : [])].sort((a, b) => a.dimension - b.dimension);
};
