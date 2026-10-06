import type { Option } from '@jasperlepardo/sikat-design-system';
import type { MasterDef } from '../form/MasterLookup';

/**
 * Advanced filter: rows of "field · operator · value" combined with all (AND) or any (OR).
 * Pure logic — no UI. A list page declares its `FilterField`s once; `matches()` does the rest.
 */

export type FieldType = 'text' | 'number' | 'date' | 'choice' | 'master' | 'boolean';

export type Op =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'before'
  | 'after'
  | 'inLastDays'
  | 'in'
  | 'notIn'
  | 'isTrue'
  | 'isFalse'
  | 'empty'
  | 'notEmpty';

export interface FilterField<T> {
  key: string;
  label: string;
  type: FieldType;
  /** The row's value. May return an array (e.g. barcodes) — "is"/"contains" then match any element. */
  get: (row: T) => unknown;
  /** Value choices for 'choice' fields. */
  options?: Option[];
  /** Master list for 'master' fields — the value picker reuses `MasterLookup`. */
  def?: MasterDef<any>;
}

export interface Rule {
  id: string;
  field: string;
  op: Op;
  /** string for text/date/choice/master, number for number, string[] for in/notIn. */
  value?: unknown;
  /** Upper bound for 'between'. */
  value2?: unknown;
}

export interface FilterGroup {
  match: 'all' | 'any';
  rules: Rule[];
}

export const EMPTY_FILTER: FilterGroup = { match: 'all', rules: [] };

/** A filter of a single rule — handy for built-in presets ("Status is Open"). */
export const oneRule = (field: string, op: Op, value?: unknown): FilterGroup => ({
  match: 'all',
  rules: [{ id: field, field, op, value }],
});

export const OP_LABEL: Record<Op, string> = {
  is: 'is',
  isNot: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'between',
  before: 'before',
  after: 'after',
  inLastDays: 'in the last (days)',
  in: 'is any of',
  notIn: 'is none of',
  isTrue: 'is yes',
  isFalse: 'is no',
  empty: 'is empty',
  notEmpty: 'is not empty',
};

/** Operators each field type offers, in menu order. The first is the default. */
export const OPERATORS_BY_TYPE: Record<FieldType, Op[]> = {
  text: ['contains', 'notContains', 'is', 'isNot', 'startsWith', 'empty', 'notEmpty'],
  number: ['is', 'isNot', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
  date: ['is', 'isNot', 'before', 'after', 'between', 'inLastDays', 'empty', 'notEmpty'],
  choice: ['is', 'isNot', 'in', 'notIn', 'empty', 'notEmpty'],
  master: ['is', 'isNot', 'in', 'notIn', 'empty', 'notEmpty'],
  boolean: ['isTrue', 'isFalse'],
};

const NO_VALUE: ReadonlySet<Op> = new Set(['isTrue', 'isFalse', 'empty', 'notEmpty']);

/** How many value inputs an operator needs: 0, 1, or 2 (between). */
export function valueArity(op: Op): 0 | 1 | 2 {
  if (NO_VALUE.has(op)) return 0;
  return op === 'between' ? 2 : 1;
}

/** True when the operator takes a list of values (multi-select). */
export const isMultiOp = (op: Op) => op === 'in' || op === 'notIn';

let seq = 0;
const ruleId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A fresh rule for a field, with its type's default operator. */
export function newRule<T>(field: FilterField<T>): Rule {
  return { id: ruleId(), field: field.key, op: OPERATORS_BY_TYPE[field.type][0] };
}

/** Switch a rule to another field, keeping the operator only if the new type allows it. */
export function changeField<T>(rule: Rule, field: FilterField<T>): Rule {
  const ops = OPERATORS_BY_TYPE[field.type];
  return { id: rule.id, field: field.key, op: ops.includes(rule.op) ? rule.op : ops[0] };
}

/** Switch operator, dropping values that no longer fit (single ↔ list). */
export function changeOp(rule: Rule, op: Op): Rule {
  const keep = isMultiOp(op) === isMultiOp(rule.op) && valueArity(op) > 0;
  return { ...rule, op, value: keep ? rule.value : undefined, value2: op === 'between' && keep ? rule.value2 : undefined };
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'number' && Number.isNaN(v));

/** A rule the user hasn't finished (no value yet). Incomplete rules are ignored by `matches()`. */
export function isComplete(rule: Rule): boolean {
  const n = valueArity(rule.op);
  if (n === 0) return true;
  if (isBlank(rule.value)) return false;
  return n === 1 || !isBlank(rule.value2);
}

/** Rules that actually filter — complete and pointing at a known field. */
export function activeRules<T>(group: FilterGroup, fields: FilterField<T>[]): Rule[] {
  return group.rules.filter((r) => isComplete(r) && fields.some((f) => f.key === r.field));
}

// ---------- comparison ----------

const norm = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase();
const toNum = (v: unknown) => (typeof v === 'number' ? v : v === '' || v == null ? NaN : Number(v));
/** 'YYYY-MM-DD' from a date string, ISO timestamp or Date. Compared as strings. */
const toDay = (v: unknown) => (v instanceof Date ? localDay(v) : String(v ?? '').slice(0, 10));

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

/** One scalar value against a positive-form operator. */
function test(type: FieldType, op: Op, v: unknown, rule: Rule, today: string): boolean {
  switch (type) {
    case 'number': {
      const x = toNum(v);
      const a = toNum(rule.value);
      if (Number.isNaN(x)) return false;
      switch (op) {
        case 'is': return x === a;
        case 'gt': return x > a;
        case 'gte': return x >= a;
        case 'lt': return x < a;
        case 'lte': return x <= a;
        case 'between': {
          const b = toNum(rule.value2);
          return x >= Math.min(a, b) && x <= Math.max(a, b);
        }
      }
      return false;
    }
    case 'date': {
      const x = toDay(v);
      if (!x) return false;
      const a = toDay(rule.value);
      switch (op) {
        case 'is': return x === a;
        case 'before': return x < a;
        case 'after': return x > a;
        case 'between': {
          const b = toDay(rule.value2);
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          return x >= lo && x <= hi;
        }
        case 'inLastDays': {
          const n = toNum(rule.value);
          return !Number.isNaN(n) && x <= today && x > addDays(today, -n);
        }
      }
      return false;
    }
    case 'boolean':
      return op === 'isTrue' ? v === true : v !== true;
    default: {
      // text, choice, master
      const x = norm(v);
      switch (op) {
        case 'is': return x === norm(rule.value);
        case 'contains': return x.includes(norm(rule.value));
        case 'startsWith': return x.startsWith(norm(rule.value));
        case 'in': return (Array.isArray(rule.value) ? rule.value : [rule.value]).some((w) => x === norm(w));
      }
      return false;
    }
  }
}

/** Negative operators are evaluated as NOT(positive) so "is not X" also keeps blanks. */
const NEGATION: Partial<Record<Op, Op>> = { isNot: 'is', notContains: 'contains', notIn: 'in' };

function ruleMatches<T>(row: T, rule: Rule, field: FilterField<T>, today: string): boolean {
  const raw = field.get(row);
  if (rule.op === 'empty') return isBlank(raw);
  if (rule.op === 'notEmpty') return !isBlank(raw);
  if (field.type === 'boolean') return test('boolean', rule.op, raw, rule, today);

  const values = Array.isArray(raw) ? raw : [raw];
  const positive = NEGATION[rule.op];
  if (positive) return !values.some((v) => test(field.type, positive, v, rule, today));
  return values.some((v) => test(field.type, rule.op, v, rule, today));
}

/**
 * Does the row pass the filter? Incomplete rules and unknown fields are skipped;
 * an empty filter matches everything.
 */
export function matches<T>(row: T, group: FilterGroup, fields: FilterField<T>[], today = localDay()): boolean {
  const checks = group.rules.flatMap((rule) => {
    const field = fields.find((f) => f.key === rule.field);
    return field && isComplete(rule) ? [() => ruleMatches(row, rule, field, today)] : [];
  });
  if (checks.length === 0) return true;
  return group.match === 'all' ? checks.every((c) => c()) : checks.some((c) => c());
}

/** Filter many rows at once (resolves fields once). */
export function applyFilter<T>(rows: T[], group: FilterGroup, fields: FilterField<T>[], today = localDay()): T[] {
  if (activeRules(group, fields).length === 0) return rows;
  return rows.filter((row) => matches(row, group, fields, today));
}

// ---------- display ----------

/** A value as the user would read it — option labels for choice fields. */
export function formatValue<T>(field: FilterField<T>, value: unknown): string {
  const one = (v: unknown) =>
    field.type === 'number' && typeof v === 'number'
      ? v.toLocaleString('en-PH')
      : field.options?.find((o) => o.value === v)?.label ?? String(v ?? '');
  return Array.isArray(value) ? value.map(one).join(', ') : one(value);
}

/** "Status is not Closed", "Total between 1,000 and 5,000" — for chips and summaries. */
export function describeRule<T>(rule: Rule, fields: FilterField<T>[]): string {
  const field = fields.find((f) => f.key === rule.field);
  if (!field) return '';
  const head = `${field.label} ${OP_LABEL[rule.op]}`;
  switch (valueArity(rule.op)) {
    case 0: return head;
    case 2: return `${head} ${formatValue(field, rule.value)} and ${formatValue(field, rule.value2)}`;
    default:
      return rule.op === 'inLastDays'
        ? `${field.label} in the last ${rule.value} days`
        : `${head} ${formatValue(field, rule.value)}`;
  }
}

// ---------- URL state ----------

/** Compact text for a filter, for a URL search param (rule ids aren't stored). '' when there are no rules. */
export function encodeFilter(group: FilterGroup): string {
  const rules = group.rules.filter(isComplete);
  if (rules.length === 0) return '';
  const compact = { m: group.match === 'any' ? 1 : 0, r: rules.map((r) => [r.field, r.op, r.value, r.value2]) };
  return JSON.stringify(compact);
}

/** Inverse of `encodeFilter`. Bad or tampered text yields an empty filter, never throws. */
export function decodeFilter(text: string | null | undefined): FilterGroup {
  if (!text) return EMPTY_FILTER;
  try {
    const parsed = JSON.parse(text) as { m?: number; r?: unknown[] };
    const rules = (Array.isArray(parsed.r) ? parsed.r : []).flatMap((entry): Rule[] => {
      if (!Array.isArray(entry)) return [];
      const [field, op, value, value2] = entry;
      if (typeof field !== 'string' || !(op in OP_LABEL)) return [];
      return [{ id: ruleId(), field, op: op as Op, value: value ?? undefined, value2: value2 ?? undefined }];
    });
    return { match: parsed.m === 1 ? 'any' : 'all', rules };
  } catch {
    return EMPTY_FILTER;
  }
}
