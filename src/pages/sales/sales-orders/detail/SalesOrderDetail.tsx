import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { PageHeader } from '../../../../components/form/PageHeader';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress } from '../../../../mocks/address';
import type { Partner } from '../../../../mocks/partners';
import { SALES_SETTINGS, blankSalesOrder, newSoLine, openCommitted, type SalesOrder, type SoLine } from '../../../../mocks/salesOrders';
import { blankTransferRequest, newTransferRequestLine } from '../../../../mocks/inventoryTransferRequests';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { BASE_PRICE_LIST_ID } from '../../../../services/priceLists';
import { matchingSeries, soSeries } from '../../../../services/allSeries';
import { termDays } from '../../../../services/purchaseOrders';
import { cancelSalesOrder, closeSalesOrder, findDuplicateCustomerRef, getSalesOrder, listSalesOrders, openOrdersTotal, recallSalesOrder, saveSalesOrder, soDueDate, soNumber, soTotals } from '../../../../services/salesOrders';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { logRejection } from '../../../../services/approvalRules';
import { listDeliveries } from '../../../../services/deliveries';
import { SoLinesCard } from './SoLinesCard';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ALL_CURRENCIES, buildContext, linePricing, proposedTaxCode, shortages, type Shortage, type SoContext, type SoDraft, type SoMasters } from './types';
import type { PoSuggestion } from '../../../purchasing/purchase-orders/detail/types';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { SoDatesCard } from './SoDatesCard';
import { SoSettingsCard } from './SoSettingsCard';
import { BpChannelCard } from '../../shared/BpChannelCard';
import { SoAssignmentCard } from './SoAssignmentCard';
import { SoAttachmentsCard } from './SoAttachmentsCard';
import { CustomerCard } from '../../shared/CustomerCard';
import { SalesTotalsFooter } from '../../shared/TotalsFooter';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { SoAvailabilityPanel, type TransferGroup } from './SoAvailabilityPanel';
import { SO_LIST_PATH, SO_NOUN, SO_STATUS_INTENT } from '../../paths';
import { CreateFromPanel, createHopMenuItems } from '../../../purchasing/shared/CreateFromPanel';
import { SO_TO_DN, SO_TO_AR_GOODS, SO_TO_AR_SERVICES, type CopyHop } from '../../shared/copyHops';
import { PO_LIST_PATH } from '../../../purchasing/paths';
import { TRANSFER_REQUEST_LIST_PATH } from '../../../inventory/paths';

type TabId = 'contents';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: SoDraft, ctx: SoContext, m: SoMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'header', 'deliveryDate', 'Delivery date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.salesItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't a sales item.`);
    need(d.status !== 'Draft' || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${d.postingDate}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.quantity >= l.deliveredQty, 'contents', `line:${l.id}:quantity`, `${n}: ${l.deliveredQty} already delivered — quantity can't be less.`);
    need(!item.inventoryItem || l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse it ships from.`);
  }
  need(!d.requiredDate || d.requiredDate >= d.postingDate, 'header', 'requiredDate', 'Required date is before the posting date.');
  need(!d.cancellationDate || d.cancellationDate >= d.postingDate, 'header', 'cancellationDate', 'Cancellation date is before the posting date.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

/** Keyed by record so moving between orders (or duplicating into /new) starts a fresh form. */
export function SalesOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesOrderForm key={id === 'new' ? location.key : id} />;
}

function SalesOrderForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const copyFrom = (location.state as { copyFrom?: SoDraft } | null)?.copyFrom;

  const approved = !needsApproval('SO');
  const [draft, setDraft] = useState<SoDraft | null | undefined>(isNew ? { ...(copyFrom ?? { ...blankSalesOrder(CURRENT_USER_ID), lines: [newSoLine({ warehouse: '' })] }), approved } : undefined);
  const [m, setM] = useState<SoMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${SO_LIST_PATH}/${id}`, tabParam);
  const [contentTab, setContentTab] = useState<'item' | 'delivery'>('item');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [warning, setWarning] = useState<string>();
  const [closeWarning, setCloseWarning] = useState<string>();
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [pendingOverrides, setPendingOverrides] = useState<Partial<SoDraft>>({});
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [createHop, setCreateHop] = useState<CopyHop<SalesOrder> | null>(null);
  const reject = useReject();
  const [openBalance, setOpenBalance] = useState(0);
  // What the order commits as saved — already in the items' Committed, so it's given back when checking stock.
  const [ownCommitted, setOwnCommitted] = useState(() => new Map<string, number>());
  const [vendors, setVendors] = useState<Partner[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'),
      listItems(),
      loadInventoryMasters(),
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
      withholdingGroups.list(),
      currencies.list(),
      exchangeRates.list(),
      accounts.list(),
      loadCurrentCompany(),
      soSeries.list(),
      listPartnersByRole('vendor'),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, series, vendorRows]) => {
      if (cancelled) return;
      setVendors(vendorRows);
      setM({ customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, soSeries: series });
    });
    if (!isNew && id) {
      getSalesOrder(id).then((so) => {
        if (cancelled) return;
        setDraft(so ?? null);
        if (so) setOwnCommitted(openCommitted(so));
      });
      listSalesOrders().then((all) => !cancelled && setSiblings(siblingKeys(all, soNumber)));
    }
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // The customer's other open orders, for the credit check.
  const customerId = draft?.customerId;
  useEffect(() => {
    if (!customerId || !m) return;
    openOrdersTotal(customerId, draft?.id, m.tax.codes).then(setOpenBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, m]);

  useDocTitle(draft == null || !draft.docNum ? undefined : isNew ? `New ${SO_NOUN.one}` : draft.status === 'Draft' ? `Draft ${SO_NOUN.one}` : soNumber(draft));
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales order…</Text>;
  if (draft === null) return <NotFound icon="shopping_bag" title="Sales order not found" backTo={SO_LIST_PATH} backLabel="Back to sales orders" />;

  const ctx = buildContext(draft, m, ownCommitted);
  const { customer } = ctx;
  const short = ctx.readOnly ? [] : shortages(draft, m, ownCommitted);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? soNumber(draft as SalesOrder) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const totalLc = totals.total * ctx.fx;
  const delivered = draft.lines.some((l) => l.deliveredQty > 0);
  const overCredit = SALES_SETTINGS.creditLimitCheck && customer && customer.creditLimit > 0 && openBalance + totalLc > customer.creditLimit && !ctx.readOnly;

  /** Tax codes re-proposed for the customer and date, except ones set by hand. */
  const retax = (lines: SoLine[], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });
  const update = (patch: Partial<SoDraft>) => {
    const next = { ...draft, ...patch };
    if (!ctx.readOnly && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    setDraft(next);
  };

  /** Picking the customer fills everything that defaults from it, and reprices the lines. */
  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
    const allSeries = m.soSeries;
    const context = { businessType: c.businessType, bpGroupId: c.bpGroupId, territoryId: c.territoryId, currency: c.currency === 'All currencies' ? 'PHP' : c.currency };
    const matched = matchingSeries(allSeries, context);
    const fallback = allSeries.find((s) => s.isDefault && s.active) ?? allSeries.find((s) => s.active);
    const seriesId = (matched ?? fallback)?.id ?? draft.seriesId;
    const next: SoDraft = {
      ...draft,
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      contactId: c.defaultContactId,
      currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
      paymentTermId: c.customerPaymentTermId,
      paymentMethod: c.defaultPaymentMethod || draft.paymentMethod,
      dueDate: soDueDate(draft.postingDate, termDays(c.customerPaymentTermId)),
      projectId: c.projectId,
      shippingType: c.shippingType,
      federalTaxId: c.tin,
      salesEmployeeId: c.salesEmployeeId,
      allowPartialDelivery: c.allowPartialDelivery,
      discountPct: c.totalDiscount || 0,
      seriesId,
      docNum: seriesId !== draft.seriesId ? 0 : draft.docNum,
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: defaultJournalRemark('sales-orders', { entityCode: c.code, entityName: c.name }),
    };
    const nextCtx = buildContext(next, m);
    // Tax codes and prices depend on the customer, so lines re-propose theirs.
    update({
      ...next,
      lines: retax(draft.lines, c, next.postingDate).map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (!item) return l;
        const priced = { ...l, priceListId: c.priceListId || BASE_PRICE_LIST_ID };
        return { ...priced, ...(nextCtx.fx ? linePricing(item, priced, next, nextCtx) : {}) };
      }),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<SoDraft> = {}, ackStock = false) => {
    e?.preventDefault();
    // Lines never given an item (or, on service orders, a description) are dropped.
    const doc: SoDraft = { ...draft, ...overrides, lines: draft.lines.filter((l) => l.itemId) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, buildContext(doc, m), m, effectiveDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) void first.tab; // scroll to section when panel support lands
      return;
    }
    // Short on stock? Raise the availability check — move stock in, buy, or continue short.
    if (!effectiveDraft && !ackStock && shortages(doc, m, ownCommitted).length) {
      setPendingOverrides(overrides);
      setAvailabilityOpen(true);
      return;
    }
    if (!effectiveDraft && !warning) {
      const dup = await findDuplicateCustomerRef(doc);
      const credit = overCredit ? `This order takes ${doc.customerName} to PHP ${formatAmount(openBalance + totalLc)} open, over their PHP ${formatAmount(customer!.creditLimit)} credit limit.` : '';
      const message = [dup ? `Order ${soNumber(dup)} from ${doc.customerName} already has Customer Ref. No. ${doc.customerRef}.` : '', credit].filter(Boolean).join(' ');
      if (message) return setWarning(message);
    }
    setSaving(true);
    try {
      const so = await saveSalesOrder(doc, { asDraft: effectiveDraft });
      navigate(SO_LIST_PATH, { state: { notice: effectiveDraft ? `Draft saved — ${so.customerName}.` : so.status === 'Not Confirmed' ? `Sales order ${soNumber(so)} submitted for approval — ${so.customerName}.` : `Sales order ${soNumber(so)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${so.customerName}.` } });
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<SalesOrder>, notice: string) => {
    try {
      const so = await run();
      navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(so)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: SoDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      customerRef: '',
      postingDate: today,
      documentDate: today,
      deliveryDate: '',
      closeDate: '',
      cancellationDate: '',
      dueDate: soDueDate(today, termDays(draft.paymentTermId), draft.dueMonths, draft.dueDays),
      attachments: [],
      lines: draft.lines.map((l) => ({ ...l, id: newSoLine().id, deliveredQty: 0, status: 'Open' as const })),
    };
    navigate(`${SO_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as SalesOrder;
  const closeIt = async () => {
    if (!closeWarning) {
      const dns = await listDeliveries();
      const openDns = dns.filter((d) => d.status === 'Open' && d.lines.some((l) => l.baseId === saved.id));
      if (openDns.length) {
        setCloseWarning(`This order has ${openDns.length} open deliver${openDns.length === 1 ? 'y' : 'ies'} — closing it will leave them unlinked. Click Close again to proceed.`);
        return;
      }
    }
    setCloseWarning(undefined);
    return act(() => closeSalesOrder(saved), 'closed');
  };
  const cancelIt = () => act(() => cancelSalesOrder(saved), 'cancelled');

  const warehouseName = (code: string) => m.inv.warehouses.find((w) => w.code === code)?.name ?? code;

  // What's still uncovered after incoming POs, one suggested PO per vendor.
  const toBuy = short.filter((s) => s.toOrder > 0);
  const vendorOf = (s: Shortage) => s.item.defaultVendorId || s.item.vendors[0]?.vendorId || '';
  const byVendor = [...new Set(toBuy.map(vendorOf))].map((vendorId) => ({
    vendorId,
    vendor: vendors.find((v) => v.id === vendorId),
    rows: toBuy.filter((s) => vendorOf(s) === vendorId),
  }));
  const suggestPo = (so: SalesOrder, vendorId: string, rows: Shortage[]) => {
    const suggest: PoSuggestion = {
      vendorId,
      lines: rows.map((s) => ({ itemId: s.item.id, warehouse: s.warehouse, qty: s.toOrder })),
      reference: { docType: 'Sales order', docNo: soNumber(so), docDate: draft.postingDate, remarks: `Stock short for ${draft.customerName}` },
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { suggest } });
  };

  // Shortfall that other warehouses could cover: greedily draw each short line from its most-stocked
  // sources, then one suggested transfer request per source warehouse.
  const toMove = short.filter((s) => s.transferable > 0);
  const bySource: TransferGroup[] = (() => {
    const map = new Map<string, TransferGroup['rows']>();
    for (const s of toMove) {
      let remaining = s.short;
      for (const src of s.elsewhere) {
        if (remaining <= 0) break;
        const qty = Math.min(remaining, src.available);
        if (qty <= 0) continue;
        const rows = map.get(src.warehouse) ?? [];
        rows.push({ item: s.item, destWarehouse: s.warehouse, qty });
        map.set(src.warehouse, rows);
        remaining -= qty;
      }
    }
    return [...map.entries()].map(([warehouse, rows]) => ({ warehouse, rows }));
  })();
  const suggestTransfer = (so: SalesOrder, sourceWarehouse: string, rows: TransferGroup['rows']) => {
    // Header destination is the one most lines need; a line keeps its own when it differs.
    const destCount = new Map<string, number>();
    for (const r of rows) destCount.set(r.destWarehouse, (destCount.get(r.destWarehouse) ?? 0) + 1);
    const toWarehouse = [...destCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const copyFrom = {
      ...blankTransferRequest(todayISO(), CURRENT_USER_ID),
      fromWarehouse: sourceWarehouse,
      toWarehouse,
      ref2: soNumber(so),
      remarks: `Stock for ${draft.customerName} — ${soNumber(so)}.`,
      lines: rows.map((r) =>
        newTransferRequestLine({
          itemId: r.item.id,
          itemNo: r.item.itemNo,
          name: r.item.name,
          description: r.item.description,
          quantity: r.qty,
          openQty: r.qty,
          uom: r.item.inventoryUom,
          toWarehouse: r.destWarehouse,
        }),
      ),
    };
    navigate(`${TRANSFER_REQUEST_LIST_PATH}/new`, { state: { copyFrom } });
  };

  // The availability panel's actions save the order (short) first, so the new document references a real number.
  const saveThen = async (after: (so: SalesOrder) => void) => {
    const doc: SoDraft = { ...draft, ...pendingOverrides, lines: draft.lines.filter((l) => l.itemId) };
    setSaving(true);
    try {
      const so = await saveSalesOrder(doc, { asDraft: false });
      setAvailabilityOpen(false);
      after(so);
    } finally {
      setSaving(false);
    }
  };
  const recallIt = async () => {
    const r = await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(r)} recalled to draft.` } });
  };
  const rejectIt = async (rejectionReason: string) => {
    await logRejection('SO', saved.id, saved.customerId, rejectionReason);
    await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' ? createHopMenuItems(saved, m.items, [SO_TO_DN, SO_TO_AR_GOODS, SO_TO_AR_SERVICES], setCreateHop) : []),
    ...(draft.status === 'Open'
      ? bySource.map(({ warehouse, rows }) => ({
          label: `Create stock transfer — from ${warehouseName(warehouse)}`,
          icon: 'move_up',
          onSelect: () => suggestTransfer(saved, warehouse, rows),
        }))
      : []),
    ...(draft.status === 'Open'
      ? byVendor.map(({ vendorId, vendor, rows }) => ({
          label: `Create purchase order${vendor ? ` — ${vendor.name}` : ''}`,
          icon: 'add_shopping_cart',
          onSelect: () => suggestPo(saved, vendorId, rows),
        }))
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !delivered ? [{ label: `Cancel ${SO_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  // A draft reads "Draft — {customer}" so a handed-off draft is recognisable; a fresh one stays "New …".
  const title =
    draft.status !== 'Draft'
      ? soNumber(draft)
      : draft.customerName
        ? `Draft — ${draft.customerName}`
        : isNew
          ? `New ${SO_NOUN.one}`
          : `Draft ${SO_NOUN.one}`;
  const continueLabel = ctx.added ? 'Save changes' : draft.approved ? `Create ${SO_NOUN.one}` : 'Submit for approval';
  const tabProps = { draft, update, errors, m, ctx };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="shopping_bag"
            parent={{ noun: SO_NOUN, to: SO_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={SO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <DetailActions
                noun={SO_NOUN}
                listPath={SO_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('SO') })}
                needsApproval={!draft.approved}
                remarksOnly={ctx.readOnly}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null, false)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: SO_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'SO', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow
                kind="SO"
                id={draft.id}
                notes="Everything linked to this order: the deliveries made against it, the invoices raised, and the payments collected."
              />
            </Panel.Body>
          ) : page === 'transactions' ? (
            <Panel.Body>
              <Text variant="small" tone="muted" className="p-4">Save the order first to see related documents.</Text>
            </Panel.Body>
          ) : null}
          {page === 'details' ? (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {reject.alert('Reject sales order', rejectIt)}
              {warning ? (
                <Alert intent="warning" variant="outline" title="Check before saving">
                  {warning} Press {ctx.added ? 'Save changes' : draft.approved ? `Create ${SO_NOUN.one}` : 'Submit for approval'} again to save anyway.
                </Alert>
              ) : null}
              {closeWarning ? (
                <Alert intent="warning" variant="outline" title="Check before closing">
                  {closeWarning}
                </Alert>
              ) : null}
              {ctx.readOnly ? (
                <Alert intent="default" variant="outline" title={`This sales order is ${draft.status.toLowerCase()}`}>
                  Only remarks and attachments can change{draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}. Its committed stock has been released.
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={ctx.added}
                    error={errors.customerId}
                    overCredit={!!overCredit}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <SoLinesCard
                    {...tabProps}
                    tabs={
                      <Tabs
                        variant="primary"
                        value={contentTab}
                        onValueChange={(v) => setContentTab(v as 'item' | 'delivery')}
                        items={[
                          { value: 'item', label: 'Item' },
                          { value: 'delivery', label: 'Delivery' },
                        ]}
                      />
                    }
                    contentTab={contentTab}
                    cardFooter={<SalesTotalsFooter {...tabProps} />}
                  />
                  <ReferencesTable
                    refs={draft.references}
                    onChange={(references) => update({ references })}
                    readOnly={ctx.readOnly}
                    description="Link the customer's PO, a quotation, or other source documents."
                  />
                  <SoAttachmentsCard {...tabProps} />
                </div>

                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <SoDatesCard {...tabProps} />
                  <SoSettingsCard {...tabProps} />
                  <BpChannelCard {...tabProps} placeholder="e.g. Lazada, Shopee, Apple online store" />
                  <SoAssignmentCard {...tabProps} />
                </aside>
              </div>
            </Panel.Body>
          ) : null}
        </Panel>
      </Form>
      <CustomerDetailsPanel
        customer={customer}
        draft={draft}
        update={update}
        readOnly={ctx.readOnly}
        noun="order"
        open={customerDetailsOpen}
        onClose={() => setCustomerDetailsOpen(false)}
        credit={{ overCredit: !!overCredit, openBalance, totalLc }}
      />
      {availabilityOpen ? (
        <SoAvailabilityPanel
          short={short}
          byVendor={byVendor}
          bySource={bySource}
          warehouseName={warehouseName}
          continueLabel={continueLabel}
          busy={saving}
          onPurchase={(vendorId, rows) => saveThen((so) => suggestPo(so, vendorId, rows))}
          onTransfer={(warehouse, rows) => saveThen((so) => suggestTransfer(so, warehouse, rows))}
          onContinue={() => {
            setAvailabilityOpen(false);
            void submit(null, false, pendingOverrides, true);
          }}
          onClose={() => setAvailabilityOpen(false)}
        />
      ) : null}
      {createHop ? <CreateFromPanel source={saved} hop={createHop} items={m.items} partyCard={<CustomerCard customers={m.customers} customerId={saved.customerId} customer={customer} onPickCustomer={() => {}} onOpenDetails={() => {}} locked />} onClose={() => setCreateHop(null)} /> : null}
    </>
  );
}
