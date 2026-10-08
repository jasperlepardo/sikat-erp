import { OPERATORS_BY_TYPE, OP_LABEL, isComplete, type FilterField, type FilterGroup, type Op, type Rule } from './engine';

/**
 * Filters as AIP-160 text (https://google.aip.dev/160) — what a real list API would take as
 * `?filter=`. `formatFilter()` prints a `FilterGroup`; `parseFilter()` reads one back.
 *
 *   status = "Open"                    is            status != "Open"          is not
 *   name:"iPhone"                      contains      NOT name:"iPhone"         does not contain
 *   name = "iPhone*"                   starts with   total >= 1000             > ≥ < ≤ (before/after on dates)
 *   (total >= 1000 AND total <= 5000)  between       postingDate > daysAgo(7)  in the last 7 days
 *   (status = "Open" OR status = "Draft")  is any of  — NOT ( … ) is none of
 *   vendorRef:*                        is not empty  NOT vendorRef:*           is empty
 *   active = true / active = false     yes / no
 *
 * Rules join with AND (match all) or OR (match any). Only filters the rule builder can show
 * are accepted — a field on every restriction, no mixing AND and OR at the top level.
 */

// ---------- printing ----------

/** Each operator's AIP-160 form, for the operator menu: "contains  :", "is not  !=". */
export const AIP_OP: Record<Op, string> = {
  is: '=',
  isNot: '!=',
  contains: ':',
  notContains: 'NOT :',
  startsWith: '= "…*"',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  between: '>= AND <=',
  before: '<',
  after: '>',
  inLastDays: '> daysAgo()',
  in: 'OR',
  notIn: 'NOT (OR)',
  isTrue: '= true',
  isFalse: '= false',
  empty: 'NOT :*',
  notEmpty: ':*',
};

/** Menu label: the operator's words with its AIP-160 form; symbols alone (≥ → >=). */
export const opLabel = (op: Op) => (/^[<>≤≥]$/.test(OP_LABEL[op]) ? AIP_OP[op] : `${OP_LABEL[op]}  ${AIP_OP[op]}`);

const str = (v: unknown) => JSON.stringify(String(v ?? ''));

function literal<T>(field: FilterField<T>, v: unknown): string {
  if (field.type === 'number') return String(v);
  return str(v);
}

function formatRule<T>(rule: Rule, field: FilterField<T>): string {
  const k = field.key;
  const v = literal(field, rule.value);
  switch (rule.op) {
    case 'is': return `${k} = ${v}`;
    case 'isNot': return `${k} != ${v}`;
    case 'contains': return `${k}:${v}`;
    case 'notContains': return `NOT ${k}:${v}`;
    case 'startsWith': return `${k} = ${str(`${rule.value}*`)}`;
    case 'gt': case 'after': return `${k} > ${v}`;
    case 'gte': return `${k} >= ${v}`;
    case 'lt': case 'before': return `${k} < ${v}`;
    case 'lte': return `${k} <= ${v}`;
    case 'between': return `(${k} >= ${v} AND ${k} <= ${literal(field, rule.value2)})`;
    case 'inLastDays': return `${k} > daysAgo(${Number(rule.value)})`;
    case 'in': case 'notIn': {
      const list = (Array.isArray(rule.value) ? rule.value : [rule.value]).map((w) => `${k} = ${literal(field, w)}`);
      const any = list.length > 1 ? `(${list.join(' OR ')})` : list[0];
      return rule.op === 'in' ? any : `NOT ${any}`;
    }
    case 'isTrue': return `${k} = true`;
    case 'isFalse': return `${k} = false`;
    case 'notEmpty': return `${k}:*`;
    case 'empty': return `NOT ${k}:*`;
  }
}

/** The filter as AIP-160 text. Incomplete rules and unknown fields are left out; '' when nothing filters. */
export function formatFilter<T>(group: FilterGroup, fields: FilterField<T>[]): string {
  const parts = group.rules.flatMap((rule) => {
    const field = fields.find((f) => f.key === rule.field);
    return field && isComplete(rule) ? [formatRule(rule, field)] : [];
  });
  return parts.join(group.match === 'all' ? ' AND ' : ' OR ');
}

// ---------- lexing ----------

type Tok =
  | { t: 'word'; v: string; at: number }
  | { t: 'string'; v: string; at: number }
  | { t: 'op'; v: '=' | '!=' | '<' | '<=' | '>' | '>=' | ':'; at: number }
  | { t: '(' | ')' | ',' | '-' | 'end'; at: number };

class FilterSyntaxError extends Error {}

function lex(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    const at = i;
    if (c === '"' || c === "'") {
      let v = '';
      i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        v += text[i++];
      }
      if (i >= text.length) throw new FilterSyntaxError(`Close the quote opened at character ${at + 1}.`);
      i++;
      out.push({ t: 'string', v, at });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '!=' || two === '<=' || two === '>=') { out.push({ t: 'op', v: two, at }); i += 2; continue; }
    if (c === '=' || c === '<' || c === '>' || c === ':') { out.push({ t: 'op', v: c, at }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, at }); i++; continue; }
    // '-' negates when it starts a term; '-5' is a number.
    if (c === '-' && !/[0-9.]/.test(text[i + 1] ?? '')) { out.push({ t: '-', at }); i++; continue; }
    const m = /^[^\s"'()=!<>:,]+/.exec(text.slice(i));
    if (!m) throw new FilterSyntaxError(`Unexpected “${c}” at character ${at + 1}.`);
    out.push({ t: 'word', v: m[0], at });
    i += m[0].length;
  }
  out.push({ t: 'end', at: text.length });
  return out;
}

// ---------- parsing (AIP-160 grammar) ----------

type Value = { kind: 'string' | 'word'; v: string } | { kind: 'call'; name: string; args: Value[] };

type Node =
  | { n: 'and' | 'or'; items: Node[] }
  | { n: 'not'; item: Node }
  | { n: 'cmp'; field: string; op: Extract<Tok, { t: 'op' }>['v']; value: Value; at: number }
  | { n: 'bare'; value: Value; at: number };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const isWord = (w: string) => peek().t === 'word' && (peek() as { v: string }).v === w;
  const fail = (msg: string): never => {
    throw new FilterSyntaxError(`${msg} (character ${peek().at + 1}).`);
  };

  const flat = (n: 'and' | 'or', items: Node[]): Node => (items.length === 1 ? items[0] : { n, items });

  // expression : sequence {AND sequence}   — a sequence is factors side by side (also AND)
  const expression = (): Node => {
    const items = [factor()];
    for (;;) {
      if (isWord('AND')) { p++; items.push(factor()); continue; }
      const t = peek().t;
      if (t === 'end' || t === ')') break;
      items.push(factor());
    }
    return flat('and', items);
  };

  // factor : term {OR term}   — OR binds tighter than AND in AIP-160
  const factor = (): Node => {
    const items = [term()];
    while (isWord('OR')) { p++; items.push(term()); }
    return flat('or', items);
  };

  const term = (): Node => {
    if (isWord('NOT') || peek().t === '-') { p++; return { n: 'not', item: simple() }; }
    return simple();
  };

  const simple = (): Node => {
    if (peek().t === '(') {
      p++;
      const inner = expression();
      if (peek().t !== ')') fail('Close the parenthesis');
      p++;
      return inner;
    }
    const at = peek().at;
    const left = comparable();
    const t = peek();
    if (t.t !== 'op') return { n: 'bare', value: left, at };
    p++;
    if (left.kind !== 'word') fail('Put a field name before the operator');
    return { n: 'cmp', field: (left as { v: string }).v, op: t.v, value: comparable(), at };
  };

  const comparable = (): Value => {
    const t = peek();
    if (t.t === 'string') { p++; return { kind: 'string', v: t.v }; }
    if (t.t !== 'word') return fail(t.t === 'end' ? 'The filter ends too soon' : 'Expected a field or value');
    if (t.v === 'AND' || t.v === 'OR' || t.v === 'NOT') return fail(`Expected a field or value, not ${t.v}`);
    p++;
    if (peek().t !== '(') return { kind: 'word', v: t.v };
    p++;
    const args: Value[] = [];
    while (peek().t !== ')') {
      args.push(comparable());
      if (peek().t === ',') p++;
      else if (peek().t !== ')') fail('Separate function arguments with commas');
    }
    p++;
    return { kind: 'call', name: t.v, args };
  };

  if (peek().t === 'end') return { n: 'and', items: [] };
  const root = expression();
  if (peek().t !== 'end') fail('Unexpected text');
  return root;
}

// ---------- AST → rules ----------

let seq = 0;
const ruleId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

const NEGATE: Partial<Record<Op, Op>> = {
  is: 'isNot', isNot: 'is',
  contains: 'notContains', notContains: 'contains',
  in: 'notIn', notIn: 'in',
  empty: 'notEmpty', notEmpty: 'empty',
  isTrue: 'isFalse', isFalse: 'isTrue',
  gt: 'lte', lte: 'gt', gte: 'lt', lt: 'gte',
};

function toRules<T>(fields: FilterField<T>[]) {
  const findField = (key: string) => {
    const field = fields.find((f) => f.key === key) ?? fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
    if (!field) throw new FilterSyntaxError(`Unknown field “${key}”. Use one of: ${fields.map((f) => f.key).join(', ')}.`);
    return field;
  };

  const scalar = (field: FilterField<T>, value: Value): unknown => {
    if (value.kind === 'call') throw new FilterSyntaxError(`${field.key} can't be compared to ${value.name}().`);
    if (field.type === 'number') {
      const n = Number(value.v);
      if (value.v === '' || Number.isNaN(n)) throw new FilterSyntaxError(`${field.key} needs a number, not “${value.v}”.`);
      return n;
    }
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(value.v))
      throw new FilterSyntaxError(`${field.key} needs a date like "2026-01-31", not “${value.v}”.`);
    if (field.options) {
      const w = value.v.toLowerCase();
      const option = field.options.find((o) => o.value.toLowerCase() === w || String(o.label).toLowerCase() === w);
      if (!option) throw new FilterSyntaxError(`${field.key} can't be “${value.v}”. Use one of: ${field.options.map((o) => o.value).join(', ')}.`);
      return option.value;
    }
    return value.v;
  };

  const check = (field: FilterField<T>, op: Op): Op => {
    if (!OPERATORS_BY_TYPE[field.type].includes(op)) throw new FilterSyntaxError(`That comparison isn't available for ${field.key}.`);
    return op;
  };

  /** `inRange`: one bound of a "between" — dates allow >= / <= only there. */
  const restriction = (node: Extract<Node, { n: 'cmp' }>, inRange = false): Rule => {
    const field = findField(node.field);
    const rule = (op: Op, value?: unknown, value2?: unknown): Rule => ({
      id: ruleId(),
      field: field.key,
      op: inRange && (op === 'gte' || op === 'lte') ? op : check(field, op),
      value,
      value2,
    });
    const { op, value } = node;

    if (op === ':' && value.kind === 'word' && value.v === '*') return rule('notEmpty');
    if (field.type === 'boolean') {
      if ((op === '=' || op === '!=') && value.kind === 'word' && (value.v === 'true' || value.v === 'false'))
        return rule((value.v === 'true') === (op === '=') ? 'isTrue' : 'isFalse');
      throw new FilterSyntaxError(`${field.key} is yes/no — use ${field.key} = true or ${field.key} = false.`);
    }
    if (field.type === 'date' && op === '>' && value.kind === 'call' && value.name === 'daysAgo') {
      const n = value.args[0]?.kind === 'word' ? Number(value.args[0].v) : NaN;
      if (!Number.isFinite(n) || n < 0) throw new FilterSyntaxError('daysAgo() takes a number of days, e.g. daysAgo(30).');
      return rule('inLastDays', n);
    }
    if (op === ':') return rule('contains', scalar(field, value));

    // Wildcards on text: "abc*" starts with, "*abc*" contains.
    if (field.type === 'text' && (op === '=' || op === '!=') && value.kind !== 'call' && value.v.endsWith('*')) {
      const positive = value.v.startsWith('*')
        ? rule('contains', value.v.slice(1, -1))
        : rule('startsWith', value.v.slice(0, -1));
      return op === '=' ? positive : negate(positive);
    }

    const v = scalar(field, value);
    const date = field.type === 'date';
    switch (op) {
      case '=': return rule('is', v);
      case '!=': return rule('isNot', v);
      case '>': return rule(date ? 'after' : 'gt', v);
      case '<': return rule(date ? 'before' : 'lt', v);
      case '>=': return rule('gte', v);
      default: return rule('lte', v);
    }
  };

  const negate = (rule: Rule): Rule => {
    const op = NEGATE[rule.op];
    if (!op) throw new FilterSyntaxError('That comparison can’t be negated with NOT.');
    return { ...rule, op };
  };

  // "(x >= a AND x <= b)" → between; "(x = a OR x = b)" → is any of.
  const group = (node: Extract<Node, { n: 'and' | 'or' }>): Rule => {
    const parts = node.items.map((item) => (item.n === 'cmp' ? restriction(item, node.n === 'and') : undefined));
    const sameField = parts.every((r) => r && r.field === parts[0]!.field);
    if (sameField && node.n === 'and' && parts.length === 2) {
      const lo = parts.find((r) => r!.op === 'gte');
      const hi = parts.find((r) => r!.op === 'lte');
      if (lo && hi) {
        const field = findField(lo.field);
        return { id: ruleId(), field: field.key, op: check(field, 'between'), value: lo.value, value2: hi.value };
      }
    }
    if (sameField && node.n === 'or' && parts.every((r) => r!.op === 'is')) {
      const field = findField(parts[0]!.field);
      return { id: ruleId(), field: field.key, op: check(field, 'in'), value: parts.map((r) => r!.value) };
    }
    throw new FilterSyntaxError(
      node.n === 'and'
        ? 'AND inside OR only works as a range on one field: (total >= 1000 AND total <= 5000).'
        : 'OR inside AND only works as a list on one field: (status = "Open" OR status = "Draft").',
    );
  };

  const one = (node: Node): Rule => {
    switch (node.n) {
      case 'cmp': return restriction(node);
      case 'not': return negate(one(node.item));
      case 'and': case 'or': return group(node);
      case 'bare':
        throw new FilterSyntaxError(`Name a field for “${node.value.kind === 'call' ? `${node.value.name}()` : node.value.v}”, e.g. name:"iPhone".`);
    }
  };

  return (root: Node): FilterGroup => {
    if (root.n === 'and' || root.n === 'or') {
      // A whole-filter range or list is still one rule.
      try {
        if (root.items.length) return { match: 'all', rules: [group(root)] };
      } catch {
        /* not a single range/list — read it as separate rules */
      }
      return { match: root.n === 'and' ? 'all' : 'any', rules: root.items.map(one) };
    }
    return { match: 'all', rules: [one(root)] };
  };
}

export type ParseResult = { ok: true; filter: FilterGroup } | { ok: false; error: string };

/** Read AIP-160 text into rules the builder can show. Never throws; '' is an empty filter. */
export function parseFilter<T>(text: string, fields: FilterField<T>[]): ParseResult {
  try {
    return { ok: true, filter: toRules(fields)(parse(lex(text))) };
  } catch (e) {
    if (e instanceof FilterSyntaxError) return { ok: false, error: e.message };
    throw e;
  }
}
