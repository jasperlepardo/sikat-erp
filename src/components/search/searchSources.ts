/**
 * The global search index: pages and settings (built once, synchronously) and
 * records — documents, partners, items (built async, cached until the next store write).
 */
import { glyphOf, navPages, pathOf } from '../../app/nav';
import { SETTINGS_NAV } from '../../app/settingsNav';
import { cap } from '../form/noun';
import { formatDate } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { numberTerms, termsOf, type SearchEntry, type SearchIntent } from '../../services/globalSearch';
import { listJournalEntries, jeNumber } from '../../services/journalEntries';
import { listVouchers } from '../../services/journalVouchers';
import { listTransfers, transferNumber } from '../../services/inventoryTransfers';
import { listTransferRequests, transferRequestNumber } from '../../services/inventoryTransferRequests';
import { countNumber, listCountings, listPostings, postingNumber } from '../../services/inventoryCountings';
import { snapshotItems } from '../../services/items';
import { listPartners } from '../../services/partners';
import { cachedUntilChange } from '../../services/store';
import type { Partner } from '../../mocks/partners';
import { purchaseDocNodes, type DocNode } from '../../pages/purchasing/shared/documentLinks';
import { salesDocNodes } from '../../pages/sales/shared/salesDocumentLinks';
import { JE_STATUS_INTENT, JV_LIST_PATH } from '../../pages/accounting/paths';
import { COUNT_STATUS_INTENT, ITEM_LIST_PATH, TRANSFER_REQUEST_STATUS_INTENT, TRANSFER_STATUS_INTENT } from '../../pages/inventory/paths';
import { MASTER_CONFIG, ROLE_CONFIG, ROLE_ORDER } from '../../pages/partners/roles';
import { DOC_TYPES } from './docTypes';

const DOC_GLYPH = new Map(DOC_TYPES.map((t) => [t.kind, t.glyph]));

const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');

// ── Pages and settings ─────────────────────────────────────────────────────

const pageEntries = (): SearchEntry[] =>
  navPages().map((p) => ({
    key: `page:${p.id}`,
    group: 'Pages',
    icon: p.glyph,
    title: p.label,
    subtitle: p.app,
    href: pathOf(p.id),
    terms: termsOf(p.label, `${p.app} ${p.label}`),
  }));

const settingsEntries = (): SearchEntry[] =>
  SETTINGS_NAV.flatMap((section) => section.items)
    .filter((hub) => hub.id !== 'home')
    .flatMap((hub) =>
      (hub.items?.length ? hub.items : [hub]).map((leaf) => ({
        key: `settings:${leaf.id}`,
        group: 'Settings' as const,
        icon: glyphOf(leaf.icon),
        title: leaf.label,
        subtitle: leaf === hub ? 'Settings' : `Settings › ${hub.label}`,
        href: pathOf(leaf.id),
        terms: termsOf(leaf.label, `${hub.label} ${leaf.label}`, `settings ${leaf.label}`),
      })),
    );

let staticIndex: SearchEntry[] | undefined;
/** Pages and settings: no data to load, so they show the moment the results open. */
export const staticEntries = () => (staticIndex ??= [...pageEntries(), ...settingsEntries()]);

// ── Records ──────────────────────────────────────────────────────────────────

const amount = (currency: string, total: number) => (total ? `${currency} ${formatAmount(total)}` : undefined);

function docEntry(n: DocNode, partners: Map<string, Partner>): SearchEntry {
  const draft = n.number === n.id; // an unnumbered draft: never show its id
  const partner = partners.get(n.partnerId);
  return {
    key: `${n.kind}:${n.id}`,
    group: 'Documents',
    icon: DOC_GLYPH.get(n.kind) ?? 'description',
    title: draft ? n.type : n.number,
    subtitle: join(!draft && n.type, partner?.name, n.date && formatDate(n.date), amount(n.currency, n.total)),
    status: n.status,
    intent: n.intent,
    href: n.href,
    terms: [...(draft ? [] : numberTerms(n.number)), ...termsOf(n.type, partner?.name, partner?.code)],
    date: n.date,
  };
}

/** A document outside the purchasing/sales link graph. */
function otherDoc(
  kind: string,
  id: string,
  number: string | undefined,
  date: string,
  status: string | undefined,
  intent: SearchIntent | undefined,
  detail?: string,
): SearchEntry {
  const type = DOC_TYPES.find((t) => t.kind === kind)!;
  const typeLabel = cap(type.noun.one);
  return {
    key: `${kind}:${id}`,
    group: 'Documents',
    icon: type.glyph,
    title: number ?? typeLabel,
    subtitle: join(number && typeLabel, detail, date && formatDate(date)),
    status,
    intent,
    href: `${type.path}/${id}`,
    terms: [...(number ? numberTerms(number) : []), ...termsOf(type.noun.one, detail)],
    date,
  };
}

function partnerEntry(p: Partner): SearchEntry {
  const role = ROLE_ORDER.slice().reverse().find((r) => p.roles.includes(r)); // customer/vendor before lead
  const home = role ? ROLE_CONFIG[role] : MASTER_CONFIG;
  return {
    key: `BP:${p.id}`,
    group: 'Partners',
    icon: home.icon,
    title: p.name,
    subtitle: join(p.code, p.roles.map((r) => ROLE_CONFIG[r].singular).join(', '), p.tin && `TIN ${p.tin}`),
    href: `${home.basePath}/${p.id}`,
    terms: termsOf(p.name, p.code, p.foreignName, p.tin),
  };
}

function itemEntries(): SearchEntry[] {
  const items = snapshotItems();
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((i) => {
    const parent = i.parentItemId ? byId.get(i.parentItemId) : undefined;
    return {
      key: `ITEM:${i.id}`,
      group: 'Items',
      icon: 'inventory_2',
      title: i.description || i.name,
      subtitle: join(i.itemNo, parent && `Variant of ${parent.name}`, i.variantAxes.length > 0 && 'Has variants'),
      href: `${ITEM_LIST_PATH}/${i.id}`,
      terms: termsOf(i.itemNo, i.name, i.description, i.foreignName, i.sellingItemNo, i.gtin, ...i.barcodes.map((b) => b.barcode)),
    };
  });
}

/** Documents, partners and items. Loads every collection once; rebuilt only after a write. */
export const recordEntries = cachedUntilChange(async (): Promise<SearchEntry[]> => {
  const [purchase, sales, partners, entries, vouchers, transfers, requests, counts, postings] = await Promise.all([
    purchaseDocNodes(),
    salesDocNodes(),
    listPartners(),
    listJournalEntries(),
    listVouchers(),
    listTransfers(),
    listTransferRequests(),
    listCountings(),
    listPostings(),
  ]);
  const byId = new Map(partners.map((p) => [p.id, p]));
  return [
    // Journal entries come from their own collection below; the sales graph only has some.
    ...[...purchase, ...sales].filter((n) => n.kind !== 'JE').map((n) => docEntry(n, byId)),
    ...entries.map((je) =>
      otherDoc('JE', je.id, jeNumber(je), je.postingDate, je.status, JE_STATUS_INTENT[je.status as keyof typeof JE_STATUS_INTENT], je.remarks),
    ),
    ...vouchers.map((v): SearchEntry => ({
      key: `JV:${v.id}`,
      group: 'Documents',
      icon: 'folder_open',
      title: `Journal voucher ${v.voucherNo}`,
      subtitle: join(`${v.entries.length} entries`, v.createdOn && formatDate(v.createdOn)),
      href: `${JV_LIST_PATH}/${v.id}`,
      terms: termsOf(`jv${v.voucherNo}`, `journal voucher ${v.voucherNo}`),
      date: v.createdOn,
    })),
    ...transfers.map((t) =>
      otherDoc('TRANSFER', t.id, t.docNum ? transferNumber(t) : undefined, t.postingDate, t.status, TRANSFER_STATUS_INTENT[t.status], t.remarks),
    ),
    ...requests.map((r) =>
      otherDoc('TRANSFER_REQUEST', r.id, r.docNum ? transferRequestNumber(r) : undefined, r.postingDate, r.status, TRANSFER_REQUEST_STATUS_INTENT[r.status]),
    ),
    ...counts.map((c) => otherDoc('COUNT', c.id, c.docNum ? countNumber(c) : undefined, c.countDate, c.status, COUNT_STATUS_INTENT[c.status])),
    ...postings.map((p) => otherDoc('POSTING', p.id, p.docNum ? postingNumber(p) : undefined, p.postingDate, undefined, undefined, p.reference)),
    ...partners.map(partnerEntry),
    ...itemEntries(),
  ];
});
