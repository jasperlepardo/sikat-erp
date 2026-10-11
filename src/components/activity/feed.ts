import { ACTIVITY_ICON, type Activity, type ActivityTargetKind } from '../../mocks/activities';
import { isLinkedTo } from '../../services/activities';
import { manilaDateTime } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { listPartners } from '../../services/partners';
import type { AuditEvent } from '../../services/store';
import { purchaseDocNodes, type DocNode } from '../../pages/purchasing/shared/documentLinks';
import { lineage, type LinkedDocument } from '../../pages/purchasing/shared/lineage';
import { salesDocNodes } from '../../pages/sales/shared/salesDocumentLinks';

/** The record a timeline is for. `ids` adds records it speaks for, e.g. a parent item's variants. */
export interface FeedTarget {
  kind: ActivityTargetKind;
  id: string;
  ids?: string[];
}

/** One line on a timeline. */
export interface FeedEntry {
  id: string;
  /** yyyy-mm-dd, or yyyy-mm-ddTHH:mm (Philippine time) when there's a time. */
  at: string;
  source: 'system' | 'activity';
  icon: string;
  title: string;
  detail?: string;
  /** Where the entry opens. */
  href?: string;
  /** Who did it: the employee on an activity, the user on a change. */
  actor?: string;
  status?: string;
  intent?: DocNode['intent'];
  activity?: Activity;
  /** Breaks ties on the same day: higher reads first. */
  order?: number;
}

/** What each document is a step of, in the quote-to-cash and procure-to-pay chains. */
const STEP: Record<string, { verb: string; icon: string }> = {
  PR: { verb: 'Requested', icon: 'inbox' },
  RFQ: { verb: 'Quotation requested', icon: 'description' },
  PO: { verb: 'Ordered', icon: 'receipt_long' },
  DPR: { verb: 'Down payment requested', icon: 'request_quote' },
  GRPO: { verb: 'Received', icon: 'inventory' },
  APINV: { verb: 'Billed', icon: 'request_quote' },
  PAY: { verb: 'Paid', icon: 'payments' },
  GRET: { verb: 'Returned to vendor', icon: 'assignment_return' },
  APCM: { verb: 'Credited by vendor', icon: 'assignment_return' },
  QT: { verb: 'Quoted', icon: 'request_quote' },
  SO: { verb: 'Ordered', icon: 'shopping_bag' },
  DN: { verb: 'Delivered', icon: 'local_shipping' },
  ARINV: { verb: 'Invoiced', icon: 'receipt' },
  RCV: { verb: 'Payment received', icon: 'savings' },
  SRT: { verb: 'Returned by customer', icon: 'assignment_return' },
  ARCM: { verb: 'Credited', icon: 'assignment_return' },
};

const SALES_KINDS = new Set(['QT', 'SO', 'DN', 'ARINV', 'RCV', 'ARCM', 'SRT']);

const verbOf = (d: DocNode) => (d.status === 'Draft' ? 'Draft saved' : STEP[d.kind]?.verb ?? 'Posted');
const amount = (d: DocNode) => (d.total ? `${d.currency} ${formatAmount(d.total)}` : undefined);

/** "7 pc IPH-18P-256-BLK · 30 pc ACC-CASE-18P" */
const linesText = (lines: { quantity: number; uomCode: string; itemNo: string }[]) =>
  lines.map((l) => `${l.quantity.toLocaleString('en-PH')} ${l.uomCode} ${l.itemNo}`).join(' · ');

const docEntry = (d: DocNode, detail: string | undefined, order: number, self = false): FeedEntry => ({
  id: `doc:${d.kind}:${d.id}`,
  at: d.date,
  source: 'system',
  icon: STEP[d.kind]?.icon ?? 'description',
  title: `${verbOf(d)}: ${d.type} ${d.number}`,
  detail,
  href: self ? undefined : d.href,
  status: d.status,
  intent: d.intent,
  order,
});

/**
 * A document's chain, one entry per document, so its timeline reads as the whole flow it's part
 * of: quotation → order → delivery → invoice → payment, or request → order → receipt → bill → payment.
 */
async function documentEntries(kind: string, id: string): Promise<FeedEntry[]> {
  const nodes = SALES_KINDS.has(kind) ? await salesDocNodes() : await purchaseDocNodes();
  const chain: LinkedDocument[] = lineage(nodes, kind, id);
  return chain.map((d, i) => {
    const what = linesText(d.covers) || d.note;
    const detail =
      d.relation === 'This'
        ? ['This document', amount(d)].filter(Boolean).join(' · ')
        : [d.relation === 'Base' ? 'Copied into this document' : 'Made from this document', what, d.via && `via ${d.via}`].filter(Boolean).join(' · ');
    return docEntry(d, detail, i, d.relation === 'This');
  });
}

/** Every document with the partner on it. */
async function partnerEntries(id: string): Promise<FeedEntry[]> {
  const nodes = (await Promise.all([purchaseDocNodes(), salesDocNodes()])).flat();
  return nodes.filter((d) => d.partnerId === id).map((d, i) => docEntry(d, amount(d), i));
}

/** Every document with the item (or one of its variants) on a line, with what it moved. */
async function itemEntries(ids: string[]): Promise<FeedEntry[]> {
  const [nodes, partners] = await Promise.all([Promise.all([purchaseDocNodes(), salesDocNodes()]).then((n) => n.flat()), listPartners()]);
  const names = new Map(partners.map((p) => [p.id, p.name]));
  return nodes.flatMap((d, i) => {
    const lines = d.items.filter((l) => l.itemId && ids.includes(l.itemId));
    if (!lines.length) return [];
    // One entry per document: the same item on two rows adds up.
    const byItem = new Map<string, { quantity: number; uomCode: string; itemNo: string }>();
    for (const l of lines) {
      const key = `${l.itemNo}|${l.uomCode}`;
      const sum = byItem.get(key);
      byItem.set(key, sum ? { ...sum, quantity: sum.quantity + l.quantity } : { quantity: l.quantity, uomCode: l.uomCode, itemNo: l.itemNo });
    }
    return [docEntry(d, [linesText([...byItem.values()]), names.get(d.partnerId)].filter(Boolean).join(' · '), i)];
  });
}

/** The timeline's derived part: the documents behind the record. Loaded once per record. */
export function systemEntries(target: FeedTarget): Promise<FeedEntry[]> {
  if (target.kind === 'BP') return partnerEntries(target.id);
  if (target.kind === 'ITEM') return itemEntries([target.id, ...(target.ids ?? [])]);
  return documentEntries(target.kind, target.id);
}

const AUDIT_ICON = { created: 'add_circle', updated: 'edit', removed: 'delete' } as const;

/** Changes made in the app to this record. */
export const auditEntries = (target: FeedTarget, log: AuditEvent[]): FeedEntry[] => {
  const ids = [target.id, ...(target.ids ?? [])];
  return log
    .filter((e) => e.kind === target.kind && ids.includes(e.recordId))
    .map((e) => ({
      id: `audit:${e.id}`,
      at: manilaDateTime(e.at),
      source: 'system' as const,
      icon: AUDIT_ICON[e.action],
      title: e.action === 'created' ? 'Created' : e.action === 'removed' ? 'Removed' : e.changes[0] ?? 'Edited',
      detail: e.action === 'updated' ? e.changes.slice(1).join(' · ') || undefined : undefined,
      actor: e.by,
    }));
};

/** Activities logged against this record (or, for a partner, for it). */
export const activityEntries = (target: FeedTarget, all: Activity[], ownerName: (id: string) => string): FeedEntry[] => {
  const ids = [target.id, ...(target.ids ?? [])];
  return all
    .filter((a) => isLinkedTo(a, target.kind, ids))
    .map((a) => ({
      id: `act:${a.id}`,
      at: a.time ? `${a.date}T${a.time}` : a.date,
      source: 'activity' as const,
      icon: ACTIVITY_ICON[a.kind],
      title: a.subject,
      detail: a.notes || undefined,
      actor: a.ownerId ? ownerName(a.ownerId) : undefined,
      activity: a,
    }));
};

/** Newest first; on the same day, timed entries and later steps of a chain first. */
export const sortFeed = (entries: FeedEntry[]) =>
  [...entries].sort((a, b) => b.at.localeCompare(a.at) || (b.order ?? 0) - (a.order ?? 0));
