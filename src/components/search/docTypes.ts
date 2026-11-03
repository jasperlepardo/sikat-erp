/**
 * Every document type with its noun, list path, glyph and app: the global search index labels and
 * links documents from it, and the navbar's + menu builds its "New …" commands from it.
 * Imports only `paths.ts` modules, so the + menu stays out of the record-loading code.
 */
import type { Noun } from '../form/noun';
import { JE_LIST_PATH, JE_NOUN } from '../../pages/accounting/paths';
import {
  COUNT_LIST_PATH, COUNT_NOUN, ITEM_LIST_PATH, ITEM_NOUN, POSTING_LIST_PATH, POSTING_NOUN, TRANSFER_LIST_PATH,
  TRANSFER_NOUN, TRANSFER_REQUEST_LIST_PATH, TRANSFER_REQUEST_NOUN,
} from '../../pages/inventory/paths';
import {
  AP_LIST_PATH, AP_NOUN, APRI_LIST_PATH, APRI_NOUN, DPI_LIST_PATH, DPI_NOUN, DPR_LIST_PATH, DPR_NOUN, GR_LIST_PATH,
  GR_NOUN, GRR_LIST_PATH, GRR_NOUN, LC_LIST_PATH, LC_NOUN, MEMO_LIST_PATH, MEMO_NOUN, PAYMENT_LIST_PATH, PAYMENT_NOUN,
  PBA_LIST_PATH, PBA_NOUN, PO_LIST_PATH, PO_NOUN, PR_LIST_PATH, PR_NOUN, RETURN_LIST_PATH, RETURN_NOUN, RFQ_LIST_PATH,
  RFQ_NOUN,
} from '../../pages/purchasing/paths';
import {
  AR_CM_LIST_PATH, AR_LIST_PATH, AR_NOUN, ARCM_NOUN, BA_LIST_PATH, BA_NOUN, DI_LIST_PATH, DI_NOUN, DN_LIST_PATH,
  DN_NOUN, QT_LIST_PATH, QT_NOUN, RC_LIST_PATH, RC_NOUN, RI_LIST_PATH, RI_NOUN, SO_LIST_PATH, SO_NOUN, SR_LIST_PATH,
  SR_NOUN,
} from '../../pages/sales/paths';
import { ROLE_CONFIG, ROLE_ORDER } from '../../pages/partners/roles';

/** The app a document belongs to: its id in the app selector, and its name. */
type App = { id: string; label: string };
const SALES: App = { id: 'sales', label: 'Sales' };
const PURCHASING: App = { id: 'purchasing', label: 'Purchasing' };
const INVENTORY: App = { id: 'inventory', label: 'Inventory' };
const ACCOUNTING: App = { id: 'accounting', label: 'Accounting' };

interface DocType {
  /** The kind its link-graph node carries (`DocNode.kind`), or a local key for the rest. */
  kind: string;
  noun: Noun;
  path: string;
  glyph: string;
  app: App;
}

/** In each app's sidebar order. */
export const DOC_TYPES: DocType[] = [
  { kind: 'QT', noun: QT_NOUN, path: QT_LIST_PATH, glyph: 'request_quote', app: SALES },
  { kind: 'SO', noun: SO_NOUN, path: SO_LIST_PATH, glyph: 'shopping_bag', app: SALES },
  { kind: 'DN', noun: DN_NOUN, path: DN_LIST_PATH, glyph: 'local_shipping', app: SALES },
  { kind: 'ARINV', noun: AR_NOUN, path: AR_LIST_PATH, glyph: 'receipt', app: SALES },
  { kind: 'RI', noun: RI_NOUN, path: RI_LIST_PATH, glyph: 'receipt_long', app: SALES },
  { kind: 'ARDI', noun: DI_NOUN, path: DI_LIST_PATH, glyph: 'receipt_long', app: SALES },
  { kind: 'SRT', noun: SR_NOUN, path: SR_LIST_PATH, glyph: 'assignment_return', app: SALES },
  { kind: 'ARCM', noun: ARCM_NOUN, path: AR_CM_LIST_PATH, glyph: 'undo', app: SALES },
  { kind: 'RCV', noun: RC_NOUN, path: RC_LIST_PATH, glyph: 'savings', app: SALES },
  { kind: 'BA', noun: BA_NOUN, path: BA_LIST_PATH, glyph: 'description', app: SALES },
  { kind: 'PR', noun: PR_NOUN, path: PR_LIST_PATH, glyph: 'inbox', app: PURCHASING },
  { kind: 'RFQ', noun: RFQ_NOUN, path: RFQ_LIST_PATH, glyph: 'description', app: PURCHASING },
  { kind: 'PO', noun: PO_NOUN, path: PO_LIST_PATH, glyph: 'receipt_long', app: PURCHASING },
  { kind: 'GRPO', noun: GR_NOUN, path: GR_LIST_PATH, glyph: 'inventory', app: PURCHASING },
  { kind: 'GRR', noun: GRR_NOUN, path: GRR_LIST_PATH, glyph: 'assignment', app: PURCHASING },
  { kind: 'GRET', noun: RETURN_NOUN, path: RETURN_LIST_PATH, glyph: 'assignment_return', app: PURCHASING },
  { kind: 'LC', noun: LC_NOUN, path: LC_LIST_PATH, glyph: 'calculate', app: PURCHASING },
  { kind: 'APINV', noun: AP_NOUN, path: AP_LIST_PATH, glyph: 'request_quote', app: PURCHASING },
  { kind: 'APRI', noun: APRI_NOUN, path: APRI_LIST_PATH, glyph: 'receipt_long', app: PURCHASING },
  { kind: 'DPR', noun: DPR_NOUN, path: DPR_LIST_PATH, glyph: 'savings', app: PURCHASING },
  { kind: 'APDPI', noun: DPI_NOUN, path: DPI_LIST_PATH, glyph: 'receipt_long', app: PURCHASING },
  { kind: 'APCM', noun: MEMO_NOUN, path: MEMO_LIST_PATH, glyph: 'receipt', app: PURCHASING },
  { kind: 'PAY', noun: PAYMENT_NOUN, path: PAYMENT_LIST_PATH, glyph: 'payments', app: PURCHASING },
  { kind: 'PBA', noun: PBA_NOUN, path: PBA_LIST_PATH, glyph: 'description', app: PURCHASING },
  { kind: 'TRANSFER_REQUEST', noun: TRANSFER_REQUEST_NOUN, path: TRANSFER_REQUEST_LIST_PATH, glyph: 'move_up', app: INVENTORY },
  { kind: 'TRANSFER', noun: TRANSFER_NOUN, path: TRANSFER_LIST_PATH, glyph: 'move_down', app: INVENTORY },
  { kind: 'COUNT', noun: COUNT_NOUN, path: COUNT_LIST_PATH, glyph: 'inventory', app: INVENTORY },
  { kind: 'POSTING', noun: POSTING_NOUN, path: POSTING_LIST_PATH, glyph: 'fact_check', app: INVENTORY },
  { kind: 'JE', noun: JE_NOUN, path: JE_LIST_PATH, glyph: 'menu_book', app: ACCOUNTING },
];

/** One "New …" command in the + menu. */
interface CreateAction {
  key: string;
  /** "New purchase order". */
  label: string;
  glyph: string;
  href: string;
}

interface CreateGroup {
  app: App;
  actions: CreateAction[];
}

const newOf = (key: string, one: string, glyph: string, listPath: string): CreateAction => ({
  key,
  label: `New ${one}`,
  glyph,
  href: `${listPath}/new`,
});

/** The + menu's commands by app; `currentAppId`'s group comes first. Partners (CRM) and items open each app's list too. */
export function createGroups(currentAppId?: string): CreateGroup[] {
  const partner = (role: (typeof ROLE_ORDER)[number]) => {
    const c = ROLE_CONFIG[role];
    return newOf(role, c.singular.toLowerCase(), c.icon, c.basePath);
  };
  const groups: CreateGroup[] = [
    { app: SALES, actions: [partner('customer')] },
    { app: PURCHASING, actions: [partner('vendor')] },
    { app: INVENTORY, actions: [newOf('item', ITEM_NOUN.one, 'inventory_2', ITEM_LIST_PATH)] },
    { app: ACCOUNTING, actions: [] },
    { app: { id: 'crm', label: 'CRM' }, actions: [partner('lead')] },
  ];
  for (const t of DOC_TYPES) groups.find((g) => g.app.id === t.app.id)!.actions.push(newOf(t.kind, t.noun.one, t.glyph, t.path));
  const current = groups.findIndex((g) => g.app.id === currentAppId);
  if (current > 0) groups.unshift(...groups.splice(current, 1));
  return groups;
}
