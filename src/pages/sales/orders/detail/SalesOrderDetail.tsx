import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Card, CardField, Form, FormField, Icon, IconButton, Link, List, Panel, PanelHeader, Select, SidePanel, Tabs, Text, TextField, Tooltip, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { fileIcon, formatSize, toAttachments } from '../../../../components/form/AttachmentsCard';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, Flags, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { RowMenu } from '../../../../components/form/RowMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { contactName, type Partner, type PartnerAddress } from '../../../../mocks/partners';
import { countryName } from '../../../../services/partnerMasters';
import { NO_SALES_EMPLOYEE, SALES_SETTINGS, blankSalesOrder, newSoLine, openCommitted, type SalesOrder, type SoStatus } from '../../../../mocks/salesOrders';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { BASE_PRICE_LIST_ID } from '../../../../services/priceLists';
import { matchingSeries, soSeries } from '../../../../services/allSeries';
import { termDays } from '../../../../services/purchaseOrders';
import { cancelSalesOrder, closeSalesOrder, getSalesSettings, openQty, findDuplicateCustomerRef, getSalesOrder, listSalesOrders, openOrdersTotal, recallSalesOrder, saveSalesOrder, soDueDate, soNumber, soTotals, soWithholding } from '../../../../services/salesOrders';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { logRejection } from '../../../../services/approvalRules';
import { listDeliveries } from '../../../../services/deliveries';
import { determineTax } from '../../../../services/taxDetermination';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import { ContentsTab } from './ContentsTab';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ALL_CURRENCIES, SO_LIST_PATH, buildContext, linePricing, proposedTaxCode, shortages, type Shortage, type SoContext, type SoDraft, type SoMasters } from './types';
import { PO_LIST_PATH } from '../../../purchasing/orders/detail/PurchaseOrderDetail';
import type { PoSuggestion } from '../../../purchasing/orders/detail/types';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';

type TabId = 'contents' | 'logistics' | 'accounting' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting', attachments: 'Attachments' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const SO_STATUS_INTENT: Record<SoStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

/** Required and conditional fields from the field map, checked on Add / Update. Drafts only need a customer. */
function validate(d: SoDraft, ctx: SoContext, m: SoMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'accounting', 'postingDate', 'Posting date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'accounting', 'deliveryDate', 'Delivery date is before the posting date.');
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
  need(!d.requiredDate || d.requiredDate >= d.postingDate, 'accounting', 'requiredDate', 'Required date is before the posting date.');
  need(!d.cancellationDate || d.cancellationDate >= d.postingDate, 'accounting', 'cancellationDate', 'Cancellation date is before the posting date.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'accounting', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

/** Keyed by record so moving between orders (or duplicating into /new) starts a fresh form. */
export function SalesOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesOrderForm key={id === 'new' ? location.key : id} />;
}

function SalesOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: SoDraft } | null)?.copyFrom;

  const approved = !getSalesSettings().requireSoApproval;
  const attachInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<SoDraft | null | undefined>(isNew ? { ...(copyFrom ?? { ...blankSalesOrder(CURRENT_USER_ID), lines: [newSoLine({ warehouse: '' })] }), approved } : undefined);
  const [m, setM] = useState<SoMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [contentTab, setContentTab] = useState<'item' | 'delivery'>('item');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [warning, setWarning] = useState<string>();
  const [closeWarning, setCloseWarning] = useState<string>();
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [editDiscount, setEditDiscount] = useState(false);
  const [editFreight, setEditFreight] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
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
      listSalesOrders().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((o) => o.docNum ? soNumber(o) : o.id)));
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

  useDocTitle(draft == null || !draft.docNum ? undefined : isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft));
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales order…</Text>;
  if (draft === null) return <NotFound icon="shopping_bag" title="Sales order not found" backTo={SO_LIST_PATH} backLabel="Back to sales orders" />;

  const ctx = buildContext(draft, m, ownCommitted);
  const { customer } = ctx;
  const short = ctx.readOnly ? [] : shortages(draft, m, ownCommitted);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? soNumber(draft as SalesOrder) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = soTotals(draft, ctx.rateOf, docCurrency?.rounding);
  const withholdingLines = m ? soWithholding(draft, customer, m.items, m.tax) : [];

  const withholdingTotal = withholdingLines.reduce((n, w) => n + w.amount, 0);
  const delivered = draft.lines.some((l) => l.deliveredQty > 0);
  const totalLc = totals.total * ctx.fx;
  const overCredit = SALES_SETTINGS.creditLimitCheck && customer && customer.creditLimit > 0 && openBalance + totalLc > customer.creditLimit && !ctx.readOnly;
  // What the customer does on their side (withholding), from the tax rules — notes, not totals.
  const taxNotes = [
    ...new Set(
      draft.lines.flatMap((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item && customer ? determineTax('Sales', item, customer, m.tax, draft.postingDate).notes : [];
      }),
    ),
  ];

  const update = (patch: Partial<SoDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);

  const locationIcon = <Icon size={16}>location_on</Icon>;
  const customerAddresses = customer?.addresses ?? [];
  const addrText = (a: PartnerAddress) => formatAddress(a, customer?.name);
  const addrFields = (a: PostalAddress) => {
    const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
    return line ? [{ label: 'Address', value: line }] : [];
  };
  const addrOptions = (current: string, defaultId: string | undefined, tag: string) => {
    const known = customerAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addrFields(a),
    }));
    if (!current || customerAddresses.some((a) => addrText(a) === current)) return known;
    const lines = current.split('\n').filter(Boolean);
    const rest = lines.slice(1).join(', ');
    return [{ value: '__custom__', label: lines[0] ?? 'Address on this order', icon: locationIcon, fields: rest ? [{ label: 'Address', value: rest }] : [] }, ...known];
  };
  const addrPicked = (current: string) => customerAddresses.find((a) => addrText(a) === current)?.id ?? (current ? '__custom__' : '');
  const fillAddr = (field: 'shipTo' | 'billTo', id: string) => {
    const a = customerAddresses.find((x) => x.id === id);
    if (a) update({ [field]: addrText(a) });
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
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (!item) return l;
        const taxCode = proposedTaxCode(item, c, m, next.postingDate);
        const priced = { ...l, taxCode, priceListId: c.priceListId || BASE_PRICE_LIST_ID };
        return { ...priced, ...(nextCtx.fx ? linePricing(item, priced, next, nextCtx) : {}) };
      }),
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<SoDraft> = {}) => {
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
    if (!effectiveDraft && !warning) {
      const dup = await findDuplicateCustomerRef(doc);
      const credit = overCredit ? `This order takes ${doc.customerName} to PHP ${formatAmount(openBalance + totalLc)} open, over their PHP ${formatAmount(customer!.creditLimit)} credit limit.` : '';
      const stock = shortages(doc, m, ownCommitted).map(shortageText).join(' ');
      const message = [dup ? `Order ${soNumber(dup)} from ${doc.customerName} already has Customer Ref. No. ${doc.customerRef}.` : '', credit, stock].filter(Boolean).join(' ');
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

  // What's still uncovered after incoming POs, one suggested PO per vendor: the item's default, else
  // the first it's bought from ('' = none known, the buyer picks).
  const toBuy = short.filter((s) => s.toOrder > 0);
  const vendorOf = (s: Shortage) => s.item.defaultVendorId || s.item.vendors[0]?.vendorId || '';
  const byVendor = [...new Set(toBuy.map(vendorOf))].map((vendorId) => ({
    vendorId,
    vendor: vendors.find((v) => v.id === vendorId),
    rows: toBuy.filter((s) => vendorOf(s) === vendorId),
  }));
  const suggestPo = (vendorId: string, rows: Shortage[]) => {
    const suggest: PoSuggestion = {
      vendorId,
      lines: rows.map((s) => ({ itemId: s.item.id, warehouse: s.warehouse, qty: s.toOrder })),
      reference: { docType: 'Sales order', docNo: soNumber(saved), docDate: draft.postingDate, remarks: `Stock short for ${draft.customerName}` },
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { suggest } });
  };
  const openLines = draft.lines.filter((l) => openQty(l) > 0);
  const goodsLines = openLines.filter((l) => m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  const svcLines = openLines.filter((l) => l.itemId ? !m.items.find((i) => i.id === l.itemId)?.inventoryItem : !!l.description);
  const isMixed = goodsLines.length > 0 && svcLines.length > 0;

  const recallIt = async () => {
    const r = await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(r)} recalled to draft.` } });
  };
  const rejectIt = async () => {
    await logRejection('SO', saved.id, saved.customerId, rejectionReason);
    await recallSalesOrder(saved);
    navigate(SO_LIST_PATH, { state: { notice: `Sales order ${soNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(draft.status === 'Open' && openLines.length > 0
      ? [{ label: 'Copy to delivery', icon: 'local_shipping', onSelect: () => navigate('/sales/deliveries/new', { state: { fromOrder: draft.id } }) }]
      : []),
    ...(draft.status === 'Open' && openLines.length > 0
      ? isMixed
        ? [
            { label: 'Sales Invoice (goods)', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: 'goods' } }) },
            { label: 'Official Receipt (services)', icon: 'receipt_long', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: 'services' } }) },
          ]
        : [{ label: svcLines.length > 0 ? 'Copy to Official Receipt' : 'Copy to A/R invoice', icon: 'receipt', onSelect: () => navigate('/sales/invoices/new', { state: { fromOrder: draft.id, lineFilter: svcLines.length > 0 ? 'services' : undefined } }) }]
      : []),
    ...(draft.status === 'Open'
      ? byVendor.map(({ vendorId, vendor, rows }) => ({
          label: `Suggested PO${vendor ? ` — ${vendor.name}` : ''}`,
          icon: 'add_shopping_cart',
          onSelect: () => suggestPo(vendorId, rows),
        }))
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !delivered ? [{ label: 'Cancel sales order', icon: 'cancel', onSelect: cancelIt }] : []),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New sales order' : draft.status === 'Draft' ? 'Draft sales order' : soNumber(draft);

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="shopping_bag"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          breadcrumbs={[{ label: 'Sales Orders', href: SO_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(SO_LIST_PATH)}
          trailing={
            isNew ? undefined : <PrevNext path={SO_LIST_PATH} prevId={prevId} nextId={nextId} />
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={isNew ? undefined : <Badge size="small" intent={SO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(SO_LIST_PATH)}>
                {ctx.readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Update' : 'Add'}
              </Button>
            </>
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
        {page === 'details' ? <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
          {rejecting ? (
            <Alert intent="danger" variant="outline" title="Reject sales order">
              <div className="flex flex-col gap-2">
                <TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why this is being rejected…" />
                <div className="flex gap-2">
                  <Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button>
                  <Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button>
                </div>
              </div>
            </Alert>
          ) : null}
          {warning ? (
            <Alert intent="warning" variant="outline" title="Check before saving">
              {warning} Press {ctx.added ? 'Update' : 'Add'} again to save anyway.
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
            <aside className="flex flex-col gap-2 lg:col-span-3">
              <fieldset disabled={ctx.readOnly} className="contents">
                <Section icon="calendar_today" title="Dates">
                  <div className="flex flex-col gap-2">
                    {h.date('postingDate', 'Posting date', {
                      required: true,
                      error: errors.postingDate,
                      disabled: ctx.added,
                      hint: 'Sets the exchange rate, tax rates and which prices apply.',
                    })}
                    {h.date('deliveryDate', 'Delivery date', {
                      error: errors.deliveryDate,
                      hint: 'When the customer expects delivery.',
                    })}
                    {h.date('requiredDate', 'Required date', {
                      error: errors.requiredDate,
                      hint: 'When the customer needs it — for planning.',
                    })}
                    {h.date('cancellationDate', 'Cancellation date', {
                      error: errors.cancellationDate,
                      hint: 'Set when the order is cancelled or lapses.',
                    })}
                  </div>
                </Section>
                <Section icon="settings" title="Settings">
                  <Flags>
                    {h.check('allowPartialDelivery', 'Allow partial delivery')}
                    {h.check('approved', 'Approved')}
                  </Flags>
                  <Text variant="small" tone="muted">
                    {draft.allowPartialDelivery ? 'Lines can be delivered in parts.' : 'Each line must be delivered in full in one go.'} Defaults from the customer.
                  </Text>
                </Section>
                <Section icon="storefront" title="BP channel">
                  <Fields cols={1}>
                    {h.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee, Apple online store', hint: 'The marketplace or channel the order came through.' })}
                    <FormField label="BP channel contact" tooltip="A contact person on the customer for the channel.">
                      {(p) => (
                        <Select
                          {...p}
                          disabled={ctx.readOnly || !customer}
                          options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]}
                          value={draft.bpChannelContact}
                          onValueChange={(bpChannelContact) => update({ bpChannelContact })}
                        />
                      )}
                    </FormField>
                  </Fields>
                </Section>
                <Section icon="person_search" title="Assignment">
                  <Fields cols={1}>
                    {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
                    {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
                  </Fields>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the order is closed.' })}
                </Section>
              </fieldset>
              <input
                ref={attachInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.currentTarget.files?.length) update({ attachments: [...draft.attachments, ...toAttachments(e.currentTarget.files)] });
                  e.currentTarget.value = '';
                }}
              />
              <Section
                icon="attach_file"
                title={`Attachments${draft.attachments.length ? ` (${draft.attachments.length})` : ''}`}
                actions={
                  ctx.readOnly ? undefined : (
                    <Link aria-label="Browse for attachments" leadingIcon={<Icon size={20}>upload</Icon>} onClick={() => attachInput.current?.click()}>
                      Browse
                    </Link>
                  )
                }
              >
                {draft.attachments.length ? (
                  <List.Group>
                    {draft.attachments.map((file) => (
                      <List.Card
                        key={file.id}
                        title={file.fileName}
                        icon={<Icon size={16}>{fileIcon(file.fileName)}</Icon>}
                        fields={[
                          ...(file.description ? [{ label: 'Description', value: file.description }] : []),
                          { label: 'Size', value: formatSize(file.size) },
                          { label: 'Attached on', value: file.attachedOn },
                        ]}
                        actions={
                          ctx.readOnly ? undefined : (
                            <RowMenu
                              label={`Actions for ${file.fileName}`}
                              items={[{ label: 'Remove', icon: 'delete', onSelect: () => update({ attachments: draft.attachments.filter((a) => a.id !== file.id) }) }]}
                            />
                          )
                        }
                      />
                    ))}
                  </List.Group>
                ) : (
                  <Text variant="small" tone="muted">
                    No attachments yet. Add the customer's PO, quotation or approval e-mail.
                  </Text>
                )}
              </Section>
            </aside>

            <div className="flex flex-col gap-2 lg:col-span-9">
              <fieldset disabled={ctx.readOnly} className="contents">
                <Section
                  icon="person"
                  title="Customer"
                  actions={
                    <IconButton type="button" label="Customer details" size="small" shape="pill" intent="white" variant="ghost" disabled={!customer} onClick={() => setCustomerDetailsOpen(true)}>
                      <Icon size={16}>tune</Icon>
                    </IconButton>
                  }
                >
                  <div>
                    <CardField
                      label="Customer"
                      required
                      placeholder="Search customers"
                      options={m.customers
                        .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                        .map((c): CardFieldOption => ({
                          value: c.id,
                          label: c.name,
                          icon: <Icon size={16}>person</Icon>,
                          fields: [
                            { label: 'Code', value: c.code },
                            ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
                          ],
                        }))}
                      value={draft.customerId}
                      onValueChange={(id) => pickCustomer(id || null)}
                      readOnly={!!(customer && ctx.added)}
                    />
                    {errors.customerId && <Text variant="small" tone="danger">{errors.customerId}</Text>}
                    {overCredit ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Icon size={14} style={{ color: 'var(--color-text-danger)' }}>warning</Icon>
                        <Text variant="small" tone="danger">Over credit limit</Text>
                      </div>
                    ) : null}
                  </div>
                </Section>
                <Tabs
                  variant="primary"
                  value={contentTab}
                  onValueChange={(v) => setContentTab(v as 'item' | 'delivery')}
                  items={[
                    { value: 'item', label: 'Item' },
                    { value: 'delivery', label: 'Delivery' },
                  ]}
                />
                {contentTab === 'item' ? (
                  <>
                    <ContentsTab
                      draft={draft}
                      update={update}
                      errors={errors}
                      m={m}
                      ctx={ctx}
                      hideDeliveries
                      cardFooter={
                        <fieldset disabled={ctx.readOnly} className="contents">
                          <div className="flex flex-col gap-1 px-2 py-1">
                            <div className="flex items-center justify-between gap-4">
                              <Text variant="small" tone="muted">Subtotal</Text>
                              <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.beforeDiscount)}</Text>
                            </div>
                            {draft.discountPct > 0 || editDiscount ? (
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <Text variant="small" tone="muted">Discount</Text>
                                  <TextField aria-label="Document discount %" type="number" min={0} className="w-20" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />
                                </div>
                                <Text variant="small" className="tabular-nums">{totals.discount ? `–${draft.currency} ${formatAmount(totals.discount)}` : '—'}</Text>
                              </div>
                            ) : (
                              <Link onClick={() => setEditDiscount(true)}>+ Add discount</Link>
                            )}
                            {SALES_SETTINGS.manageFreightInDocuments ? (
                              draft.freight > 0 || editFreight ? (
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2">
                                    <Text variant="small" tone="muted">Freight</Text>
                                    <TextField aria-label="Freight amount" type="number" min={0} className="w-24" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
                                  </div>
                                  <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.freight)}</Text>
                                </div>
                              ) : (
                                <Link onClick={() => setEditFreight(true)}>+ Add freight</Link>
                              )
                            ) : null}
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1">
                                <Text variant="small" tone="muted">Tax</Text>
                                {taxNotes.length > 0 && (
                                  <Tooltip message={<div className="flex flex-col gap-1">{taxNotes.map((n) => <span key={n}>{n}</span>)}</div>} icon="info" />
                                )}
                              </div>
                              <Text variant="small" className="tabular-nums">{draft.currency} {formatAmount(totals.tax)}</Text>
                            </div>
                            <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
                              <Text variant="small" weight="semibold" tone="heading">Total</Text>
                              <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(totals.total)}</Text>
                            </div>
                            {withholdingLines.map((w) => (
                              <div key={w.atc} className="flex items-center justify-between gap-4">
                                <Text variant="small" tone="muted">{w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — {w.atc} ({w.rate}%)</Text>
                                <Text variant="small" tone="danger" className="tabular-nums">–{draft.currency} {formatAmount(w.amount)}</Text>
                              </div>
                            ))}
                            {withholdingLines.length > 0 && (
                              <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
                                <Text variant="small" weight="semibold" tone="heading">Net to receive</Text>
                                <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{draft.currency} {formatAmount(totals.total - withholdingTotal)}</Text>
                              </div>
                            )}
                            {draft.currency !== 'PHP' ? (
                              <Text variant="small" tone="muted" className="text-right">≈ PHP {formatAmount(totalLc)}</Text>
                            ) : null}
                          </div>
                        </fieldset>
                      }
                    />
                  </>
                ) : (
                  <DataTable
                    variant="plain"
                    noPagination
                    rows={draft.lines.filter((l) => !!l.itemId)}
                    getRowId={(l) => l.id}
                    unsortable={['item', 'ordered', 'delivered']}
                    empty={<Text variant="small" tone="muted">No deliveries yet.</Text>}
                    columns={[
                      {
                        key: 'item',
                        header: 'Item / Description',
                        cell: (l) => (
                          <div className="flex flex-col">
                            <Text variant="caption">{l.itemNo}</Text>
                            <Text variant="small">{l.description}</Text>
                          </div>
                        ),
                      },
                      {
                        key: 'ordered',
                        header: 'Ordered',
                        align: 'end' as const,
                        cell: (l) => (
                          <Text variant="small" className="whitespace-nowrap tabular-nums">
                            {l.quantity.toLocaleString('en-PH')} {l.uomName}
                          </Text>
                        ),
                      },
                      {
                        key: 'delivered',
                        header: 'Delivered',
                        align: 'end' as const,
                        cell: (l) => (
                          <Text variant="small" className="whitespace-nowrap tabular-nums">
                            {l.deliveredQty.toLocaleString('en-PH')} {l.uomName}
                          </Text>
                        ),
                      },
                    ]}
                  />
                )}
              </fieldset>

            </div>
          </div>
        </Panel.Body> : null}
      </Panel>
    </Form>
    {customerDetailsOpen && customer && (

      <SidePanel overlay onOverlayClick={() => setCustomerDetailsOpen(false)}>
        <PanelHeader
          type="details"
          icon="person"
          title={customer.name}
          actions={
            <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => setCustomerDetailsOpen(false)}>
              Done
            </Button>
          }
        />
        <Panel.Body>
          {customer.creditLimit > 0 ? (
            <Card>
              <Card.Header icon={<Icon size={24}>credit_score</Icon>}>Credit</Card.Header>
              <Card.Content>
                <div className="flex items-baseline justify-between gap-2">
                  <Text variant="h3" as="p" tone={overCredit ? 'danger' : undefined}>
                    PHP {formatAmount(openBalance + totalLc)}
                  </Text>
                  <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                    {Math.round(((openBalance + totalLc) / customer.creditLimit) * 100)}% of PHP {formatAmount(customer.creditLimit)}
                  </Text>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-neutral-subtle)' }}>
                  {overCredit ? (
                    <div className="h-full w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-danger)' }} />
                  ) : (
                    <>
                      <div className="h-full" style={{ width: `${Math.min((openBalance / customer.creditLimit) * 100, 100)}%`, backgroundColor: 'var(--color-bg-primary)' }} />
                      <div className="h-full" style={{ width: `${Math.min((totalLc / customer.creditLimit) * 100, Math.max(0, 100 - (openBalance / customer.creditLimit) * 100))}%`, backgroundColor: 'var(--color-bg-primary-muted)' }} />
                    </>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                    {overCredit
                      ? `Over limit by PHP ${formatAmount(openBalance + totalLc - customer.creditLimit)}`
                      : `PHP ${formatAmount(customer.creditLimit - openBalance - totalLc)} available`}
                  </Text>
                  {!overCredit && totalLc > 0 ? (
                    <Text variant="small" tone="muted">this order PHP {formatAmount(totalLc)}</Text>
                  ) : null}
                </div>
              </Card.Content>
            </Card>
          ) : null}
          <fieldset disabled={ctx.readOnly} className="contents">
            <Section icon="person" title="Contact">
              <Fields cols={1}>
                <CardField
                  label="Contact person"
                  options={(customer?.contacts ?? [])
                    .filter((c) => c.active || c.id === draft.contactId)
                    .map((c) => ({
                      value: c.id,
                      label: contactName(c),
                      icon: <Icon size={16}>person</Icon>,
                      fields: [
                        ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                        ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                        ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                      ],
                    }))}
                  value={draft.contactId}
                  onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
                  placeholder="Select a contact person"
                  readOnly={ctx.readOnly}
                />
                {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's own PO or reference number." })}
              </Fields>
            </Section>
            <Section icon="local_shipping" title="Delivery & billing">
              <Fields cols={1}>
                <CardField
                  label="Ship to"
                  options={addrOptions(draft.shipTo, customer?.defaultShipToId, 'default ship-to')}
                  value={addrPicked(draft.shipTo)}
                  onValueChange={(v) => fillAddr('shipTo', v)}
                  placeholder="Select a delivery address"
                  readOnly={ctx.readOnly}
                />
                <CardField
                  label="Bill to"
                  options={addrOptions(draft.billTo, customer?.defaultBillToId, 'default bill-to')}
                  value={addrPicked(draft.billTo)}
                  onValueChange={(v) => fillAddr('billTo', v)}
                  placeholder="Select a billing address"
                  readOnly={ctx.readOnly}
                />
                {customer && !customerAddresses.length ? (
                  <Text variant="small" tone="muted">
                    {customer.name} has no addresses yet — add them on the customer record.
                  </Text>
                ) : null}
              </Fields>
            </Section>
            <Section icon="tune" title="Order details">
              <Fields cols={1}>
                {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...INDICATORS.map((v) => ({ value: v, label: v }))])}
                {h.text('orderNumber', 'Order number', { hint: 'Internal or chain-store order reference.' })}
              </Fields>
            </Section>
          </fieldset>
        </Panel.Body>
      </SidePanel>
    )}
    </>
  );
}

/** "iPad Air: needs 20 pc in WH-MNL, 12 available, 5 on order — 3 to buy." */
function shortageText(s: Shortage) {
  const uom = s.item.inventoryUom;
  const incoming = s.ordered ? `, ${s.ordered} on order` : '';
  const verdict = s.toOrder ? `${s.toOrder} ${uom} to buy` : 'covered by open POs';
  return `${s.item.itemNo} ${s.item.name}: needs ${s.need} ${uom} in ${s.warehouse}, ${Math.max(0, s.available)} available${incoming} — ${verdict}.`;
}

