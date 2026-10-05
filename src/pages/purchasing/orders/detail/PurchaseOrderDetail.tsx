import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Combobox,
  Form,
  FormField,
  IconButton,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  List,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER } from '../../../../mocks/common';
import { contactName, type Partner } from '../../../../mocks/partners';
import {
  blankPurchaseOrder,
  newPoLine,
  type PoStatus,
  type PurchaseOrder,
} from '../../../../mocks/purchaseOrders';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { loadCurrentCompany } from '../../../../services/companies';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import {
  PoSaveError,
  cancelPurchaseOrder,
  closePurchaseOrder,
  dueDateFor,
  findDuplicateVendorRef,
  getPurchaseOrder,
  getPurchasingSettings,
  listPurchaseOrders,
  poNumber,
  poSeries,
  poTotals,
  poWithholding,
  savePurchaseOrder,
  seriesOf,
} from '../../../../services/purchaseOrders';
import { AccountingTab } from './AccountingTab';
import { ContentsTab } from './ContentsTab';
import { LogisticsTab } from './LogisticsTab';
import { VendorQuickCreate } from './VendorQuickCreate';
import { DocumentFlow } from '../../shared/DocumentFlow';
import {
  ALL_CURRENCIES,
  buildContext,
  defaultShipTo,
  formatAddress,
  proposedTaxCode,
  viewCurrency,
  type PoContext,
  type PoDraft,
  type PoMasters,
} from './types';
import { formatDate, todayISO } from '../../../../services/dates';

export const PO_LIST_PATH = '/purchasing/purchase-orders';

type TabId = 'contents' | 'logistics' | 'accounting';

/** Top-level views in the panel header. Transactions and Activity are placeholders for now. */
const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const STATUS_INTENT: Record<PoStatus, 'default' | 'primary' | 'warning' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  'Not Confirmed': 'warning',
  Closed: 'success',
  Cancelled: 'danger',
};

const TODAY = () => todayISO();

/** How each kind of withholding tax reads in the footer. */
const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Required and conditional fields from the PO field map, checked on Add / Save. Drafts only need a vendor. */
function validate(d: PoDraft, ctx: PoContext, m: PoMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  const series = seriesOf(d.seriesId);
  need(!series.manual || d.docNum > 0, 'header', 'docNum', `The ${series.name} series is manual — enter the PO number.`);
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.deliveryDate, 'header', 'deliveryDate', 'Delivery date is required.');
  need(!d.deliveryDate || d.deliveryDate >= d.postingDate, 'header', 'deliveryDate', 'Delivery date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);

  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(!item?.inventoryItem || l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    need(!l.deliveryDate || l.deliveryDate >= d.postingDate, 'contents', `line:${l.id}:deliveryDate`, `${n}: delivery date is before the posting date.`);
    need(!item || d.status !== 'Draft' || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item?.itemNo} isn't valid on ${d.postingDate}.`);
  }

  need(!d.requiredDate || !d.deliveryDate || d.requiredDate <= d.deliveryDate, 'accounting', 'requiredDate', 'Required date is after the delivery date.');
  need(!d.cancellationDate || d.cancellationDate >= d.postingDate, 'accounting', 'cancellationDate', 'Cancellation date is before the posting date.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'accounting', 'dueDate', 'Due date is before the posting date.');
  return problems;
}

/** Keyed by record so moving between POs (or duplicating into /new) starts a fresh form. */
export function PurchaseOrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PurchaseOrderForm key={id === 'new' ? location.key : id} />;
}

function PurchaseOrderForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: PoDraft } | null)?.copyFrom;

  const blank = blankPurchaseOrder(CURRENT_USER);
  const [draft, setDraft] = useState<PoDraft | null | undefined>(isNew ? (copyFrom ?? { ...blank, lines: [newPoLine()] }) : undefined);
  const [m, setM] = useState<PoMasters>();
  const [page, setPage] = useState<PageId>('details');
  // POs in the list's default order (newest posting date first), for previous/next.
  const [siblings, setSiblings] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew)
      listPurchaseOrders().then((all) => setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((po) => po.id)));
  }, [isNew]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [dupWarning, setDupWarning] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [vendorQuery, setVendorQuery] = useState('');

  useEffect(() => {
    Promise.all([
      listPartnersByRole('vendor'),
      listItems(),
      loadInventoryMasters(),
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
      withholdingGroups.list(),
      currencies.list(),
      exchangeRates.list(),
      loadCurrentCompany(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours]) => {
      const masters = { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours };
      setM(masters);
      if (isNew) setDraft((d) => {
        if (!d) return d;
        const companyAddress = formatAddress(masters.company.address, masters.company.name);
        return { ...d, shipTo: d.shipTo || defaultShipTo(d.lines, masters), billTo: d.billTo || companyAddress };
      });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPurchaseOrder(id).then((po) => !cancelled && setDraft(po ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading purchase order…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="receipt_long" title="Purchase order not found" />
        <Panel.Body>
          <Button onClick={() => navigate(PO_LIST_PATH)}>Back to purchase orders</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildContext(draft, m);
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const { vendor } = ctx;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const series = seriesOf(draft.seriesId);
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = poTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholdingLines = poWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const withholdingTotal = withholdingLines.filter((w) => w.deducted).reduce((s, w) => s + w.amount, 0);
  const view = viewCurrency(draft, ctx, m);
  const received = draft.lines.some((l) => l.receivedQty > 0);

  // Ship To follows the lines while it still holds the default.
  const update = (patch: Partial<PoDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    setDraft(next);
  };
  const h = bind(draft, update);

  /** Picking the vendor fills everything that defaults from it. */
  const pickVendor = (vendorId: string | null, override?: Partner) => {
    const v = override ?? m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
    const next = { ...draft, vendorId: v.id };
    update({
      vendorId: v.id,
      vendorCode: v.code,
      vendorName: v.name,
      contactId: v.defaultContactId,
      currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
      currencyView: 'BP',
      paymentTerms: v.vendorPaymentTerms,
      paymentMethod: v.defaultPaymentMethod,
      dueDate: dueDateFor(draft.postingDate, v.vendorPaymentTerms),
      project: v.project,
      shippingType: v.shippingType,
      journalRemark: `Purchase Orders – ${v.code}`,
      // Tax codes depend on the vendor's VAT status, so lines re-propose theirs.
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, taxCode: proposedTaxCode(item, v, m, next.postingDate) } : l;
      }),
    });
  };

  const handleVendorCreated = (vendor: Partner) => {
    setM((prev) => prev && { ...prev, vendors: [...prev.vendors, vendor] });
    setShowVendorCreate(false);
    pickVendor(vendor.id, vendor);
  };

  /** Add / Save (or save as draft). `patch` applies last-moment changes, e.g. Approve. */
  const submit = async (e: FormEvent | null, asDraft = false, patch: Partial<PoDraft> = {}) => {
    e?.preventDefault();
    const doc = { ...draft, ...patch };
    const found = validate(doc, buildContext(doc, m), m, asDraft);
    setProblems(found);
    if (found.length) return;

    // "When duplicate Vendor Ref. No. occurs": Warn asks once, then lets it through.
    if (!asDraft && getPurchasingSettings().duplicateVendorRef === 'Warn' && !dupWarning) {
      const dup = await findDuplicateVendorRef(doc);
      if (dup) {
        setDupWarning(`PO ${poNumber(dup)} from ${doc.vendorName} already has Vendor Ref. No. ${doc.vendorRef}.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (Object.keys(patch).length) setDraft(doc);
      const saved = await savePurchaseOrder(doc, { asDraft });
      navigate(PO_LIST_PATH, {
        state: {
          notice:
            saved.length > 1
              ? `Split into ${saved.length} purchase orders: ${saved.map(poNumber).join(', ')}.`
              : `${asDraft ? 'Draft saved' : `Purchase order ${poNumber(saved[0])} saved`} — ${saved[0].vendorName}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof PoSaveError)) throw err;
      setProblems([{ tab: 'header', key: err.field, message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<PurchaseOrder>, notice: string) => {
    try {
      const po = await run();
      navigate(PO_LIST_PATH, { state: { notice: `Purchase order ${poNumber(po)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const duplicate = () => {
    const today = TODAY();
    const copy: PoDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      vendorRef: '',
      postingDate: today,
      documentDate: today,
      deliveryDate: '',
      closeDate: '',
      dueDate: dueDateFor(today, draft.paymentTerms),
      splitFrom: undefined,
      lines: draft.lines.map((l) => ({ ...l, id: `ln-${crypto.randomUUID().slice(0, 8)}`, receivedQty: 0, status: 'Open' as const, deliveryDate: '' })),
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as PurchaseOrder;
  const open = draft.status === 'Open' || draft.status === 'Not Confirmed';
  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Not Confirmed'
      ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }]
      : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open' && l.receivedQty < l.quantity)
      ? [
          { label: 'Copy to goods receipt', icon: 'inventory', onSelect: () => navigate('/purchasing/goods-receipts/new', { state: { fromPo: saved.id } }) },
          { label: 'Copy to A/P invoice', icon: 'request_quote', onSelect: () => navigate('/purchasing/bills/new', { state: { fromPo: saved.id } }) },
          { label: 'Copy to A/P down payment request', icon: 'savings', onSelect: () => navigate('/purchasing/bills/down-payment-requests/new', { state: { fromPo: saved.id } }) },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(open ? [{ label: 'Close', icon: 'task_alt', onSelect: () => act(() => closePurchaseOrder(saved), 'closed') }] : []),
    ...(open && !received ? [{ label: 'Cancel purchase order', icon: 'cancel', onSelect: () => act(() => cancelPurchaseOrder(saved), 'cancelled') }] : []),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const currencyEditable = !ctx.readOnly && !received;
  const title = isNew ? 'New purchase order' : draft.status === 'Draft' ? `Draft purchase order` : `Purchase order ${poNumber(draft)}`;
  const postingMoved = draft.postingDate && draft.postingDate !== TODAY() && !ctx.added;

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="receipt_long"
          title={title}
          subcopy={draft.vendorName ? `${draft.vendorCode} · ${draft.vendorName}` : 'Order goods or services from a vendor.'}
          // A saved PO leads with previous/next (through the list, newest first); a new one with the icon.
          leading={
            isNew ? undefined : (
              <>
                <IconButton
                  type="button"
                  label="Next"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  disabled={!nextId}
                  onClick={() => navigate(`${PO_LIST_PATH}/${nextId}`)}
                >
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton
                  type="button"
                  label="Previous"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  disabled={!prevId}
                  onClick={() => navigate(`${PO_LIST_PATH}/${prevId}`)}
                >
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={
            <Tabs
              variant="outline"
              value={page}
              onValueChange={(v) => setPage(v as PageId)}
              // A PO has no transactions or activity until it's added.
              items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))}
            />
          }
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge intent={STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.splitFrom ? <Badge variant="outline">Split</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(PO_LIST_PATH)}>
                {ctx.readOnly ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : ctx.added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow
              kind="PO"
              id={draft.id}
              notes="Everything linked to this PO, however far back or forward: the purchase requests and quotations it came from (once built), and the goods receipts and invoices that followed. Cancelled receipts no longer count as received."
            />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">
              Activity will show here.
            </Text>
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' }[t])} />
            {dupWarning ? (
              <Alert intent="warning" variant="outline" title="Duplicate vendor reference">
                {dupWarning} Press {ctx.added ? 'Save' : 'Add'} again to keep it, or change the Vendor Ref. No.
              </Alert>
            ) : null}
            {ctx.readOnly ? (
              <Alert intent="default" variant="outline" title={`This purchase order is ${draft.status.toLowerCase()}`}>
                Only remarks can change{draft.closeDate ? ` (closed ${draft.closeDate})` : ''}.
              </Alert>
            ) : null}

            <fieldset disabled={ctx.readOnly} className="contents">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon="storefront" title="Vendor">
                  <Fields>
                    <div className="md:col-span-2">
                    {vendor && ctx.added ? (
                      <div className="md:col-span-2">
                        <ReadOnly
                          label="Vendor"
                          value={draft.vendorName}
                          description={`${draft.vendorCode} · ${draft.currency}`}
                        />
                      </div>
                    ) : (
                      <FormField
                        label="Vendor"
                        required
                        error={errors.vendorId}
                        tooltip="Only vendors are listed."
                        className="md:col-span-2"
                      >
                        {(p) => (
                          <Combobox
                            {...p}
                            placeholder="Search vendors"
                            options={m.vendors
                              .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                              .map((v) => ({
                                value: v.id,
                                label: v.name,
                                subLabel: v.code,
                                subLabelPlacement: 'top' as const,
                                description: v.currency,
                                text: `${v.code} ${v.name}`,
                              }))}
                            value={draft.vendorId || null}
                            onValueChange={pickVendor}
                            onQueryChange={setVendorQuery}
                            emptyContent={(close) => (
                              <button
                                type="button"
                                className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-[var(--color-bg-primary-subtle)]"
                                style={{ color: 'var(--color-text-primary)' }}
                                onClick={() => { close(); setShowVendorCreate(true); }}
                              >
                                {vendorQuery.trim() ? `+ Create "${vendorQuery.trim()}"` : '+ Create new vendor'}
                              </button>
                            )}
                          />
                        )}
                      </FormField>
                    )}
                    </div>
                    {h.lookup(
                      'contactId',
                      'Contact person',
                      [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
                      { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
                    )}
                    {h.text('vendorRef', 'Vendor ref. no.', {
                      error: errors.vendorRef,
                      hint: "The vendor's own reference, e.g. their sales order no.",
                    })}
                    <FormField
                      label="Currency"
                      required
                      error={errors.currency}
                      tooltip={
                        received
                          ? 'Locked: goods were already received on this PO.'
                          : vendor && vendor.currency !== ALL_CURRENCIES
                          ? `Defaults to the vendor's currency. You can override it before receiving goods.`
                          : 'Pick the document currency for this order.'
                      }
                    >
                      {(p) => (
                        <Select
                          {...p}
                          disabled={!currencyEditable}
                          options={m.currencies
                            .filter((c) => c.active || c.code === draft.currency)
                            .map((c) => ({ value: c.code, label: c.code }))}
                          value={draft.currency}
                          onValueChange={(currency) => currency && update({ currency, currencyView: 'BP' })}
                        />
                      )}
                    </FormField>
                  </Fields>
                </Section>

                <Section icon="tag" title="Document">
                  <Fields>
                    <FormField label="No." required error={errors.docNum} tooltip={ctx.added ? undefined : series.manual ? 'Manual series: type the number.' : 'Assigned from the series when the PO is added.'}>
                      {(p) => (
                        <div className="flex gap-1">
                          <Select
                            aria-label="Series"
                            className="w-40"
                            disabled={ctx.added}
                            options={poSeries.snapshot().filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))}
                            value={draft.seriesId}
                            onValueChange={(seriesId) => update({ seriesId, docNum: 0 })}
                          />
                          <TextField
                            {...p}
                            className="flex-1"
                            type={series.manual ? 'number' : 'text'}
                            readOnly={!series.manual || ctx.added}
                            placeholder={series.manual ? 'PO number' : 'Next number'}
                            value={draft.docNum ? String(draft.docNum) : ''}
                            onChange={(e) => update({ docNum: Number(e.currentTarget.value) })}
                          />
                        </div>
                      )}
                    </FormField>
                    <ReadOnly
                      label="Status"
                      value={<Badge intent={STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>}
                      hint="Set by the system: Open, Not Confirmed, Closed, Cancelled or Draft."
                      error={errors.status}
                    />
                    {h.date('postingDate', 'Posting date', {
                      required: true,
                      error: errors.postingDate,
                      disabled: ctx.added,
                      hint: postingMoved
                        ? '⚠ Not today: this breaks the continuity of document numbers and dates.'
                        : 'Defaults to today. Sets the exchange rate and tax rates used.',
                    })}
                    <DeliveryDate draft={draft} update={update} error={errors.deliveryDate} />
                    {h.date('documentDate', 'Document date', {
                      required: true,
                      error: errors.documentDate,
                      hint: 'The date for tax purposes. Defaults to today.',
                    })}
                    <ReadOnly label="Close date" value={draft.closeDate || '—'} hint="Set when the PO is closed or cancelled." />
                  </Fields>
                </Section>
              </div>

              <ContentsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
              <LogisticsTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
              <AccountingTab draft={draft} update={update} errors={errors} m={m} ctx={ctx} onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })} />
            </fieldset>

            <Section icon="functions" title="Totals">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Fields cols={1}>
                  <fieldset disabled={ctx.readOnly} className="contents">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {h.master('buyer', 'Buyer', salesEmployeeDef, { extra: [CURRENT_USER], hint: 'Who placed the order.' })}
                      {h.master('owner', 'Owner', salesEmployeeDef, { extra: [CURRENT_USER], hint: 'Owns the document (data access).' })}
                    </div>
                  </fieldset>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the PO is added.' })}
                </Fields>
                <fieldset disabled={ctx.readOnly} className="contents">
                  <List.Group divider>
                    <TotalRow label="Total before discount" value={view.convert(totals.beforeDiscount)} code={view.code} />
                    <TotalRow
                      label="Discount"
                      value={totals.discount ? -view.convert(totals.discount) : 0}
                      code={view.code}
                      input={
                        <TextField
                          aria-label="Document discount %"
                          type="number"
                          min={0}
                          className="w-24"
                          suffix="%"
                          value={String(draft.discountPct)}
                          onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })}
                        />
                      }
                    />
                    {getPurchasingSettings().manageFreightInDocuments ? (
                      <TotalRow
                        label="Freight"
                        value={view.convert(totals.freight)}
                        code={view.code}
                        input={
                          <div className="flex gap-1">
                            <TextField
                              aria-label={`Freight (${draft.currency}, net)`}
                              type="number"
                              min={0}
                              className="w-32"
                              prefix={draft.currency}
                              value={String(draft.freight)}
                              onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                            />
                            <Combobox
                              aria-label="Freight tax code"
                              className="w-28"
                              options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                              value={draft.freightTaxCode}
                              onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                            />
                          </div>
                        }
                      />
                    ) : null}
                    {getPurchasingSettings().roundingMethod === 'By Currency' ? (
                      <TotalRow label={`Rounding (${docCurrency?.rounding ?? 'No rounding'})`} value={view.convert(totals.rounding)} code={view.code} />
                    ) : null}
                    <TotalRow label="Tax" value={view.convert(totals.tax)} code={view.code} />
                    {totals.reverseCharge ? (
                      <TotalNote>
                        VAT of {view.code} {formatAmount(view.convert(totals.reverseCharge))} isn't paid to the vendor: reverse-charge VAT
                        you withhold and remit (BIR 1600-VT), and import VAT is paid to the Bureau of Customs. Both are claimed as input VAT.
                      </TotalNote>
                    ) : null}
                    {withholdingLines.filter((w) => w.deducted).map((w) => (
                      <TotalRow
                        key={w.atc}
                        label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`}
                        value={-view.convert(w.amount)}
                        code={view.code}
                      />
                    ))}
                    {withholdingLines.filter((w) => !w.deducted).map((w) => (
                      <TotalNote key={w.atc}>
                        VAT withheld — {w.atc} ({w.rate}%): {view.code} {formatAmount(view.convert(w.amount))} remitted by you on BIR 1600-VT, not
                        deducted from the vendor.
                      </TotalNote>
                    ))}
                    <TotalRow
                      label="Net payment due"
                      value={view.convert(totals.total - withholdingTotal)}
                      code={view.code}
                      strong
                    />
                    {draft.currency !== 'PHP' && draft.currencyView === 'BP' ? (
                      <Text variant="small" tone="muted">
                        ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${formatDate(ctx.fxDate)} rate)` : '—'}.
                      </Text>
                    ) : null}
                  </List.Group>
                </fieldset>
              </div>
            </Section>
          </Panel.Body>
        )}
      </Panel>
    </Form>
    {showVendorCreate && (
      <VendorQuickCreate
        initialName={vendorQuery.trim()}
        onClose={() => setShowVendorCreate(false)}
        onCreated={handleVendorCreated}
      />
    )}
    </>
  );
}

/** Header delivery date; changing it also moves line dates that matched the old one. */
function DeliveryDate({ draft, update, error }: { draft: PoDraft; update: (p: Partial<PoDraft>) => void; error?: string }) {
  const h = bind(draft, (p) =>
    update({
      ...p,
      lines: draft.lines.map((l) => (!l.deliveryDate || l.deliveryDate === draft.deliveryDate ? { ...l, deliveryDate: p.deliveryDate ?? '' } : l)),
    }),
  );
  return h.date('deliveryDate', 'Delivery date', {
    required: true,
    error,
    hint: 'When the items should arrive. Lines take it unless they have their own.',
  });
}

export function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={
        <span className="flex items-center gap-2">
          <span className="whitespace-nowrap">{emphasis(label)}</span>
          {/* Design system fields are width: 100% (unlayered, so it beats w-* utilities): give the input room here or it collapses to its suffix. */}
          {input ? <span className="min-w-24 flex-none">{input}</span> : null}
        </span>
      }
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

/** An explanatory line between the totals. */
export function TotalNote({ children }: { children: ReactNode }) {
  return (
    <List.Item
      variant="value-only"
      content={
        <Text variant="small" tone="muted">
          {children}
        </Text>
      }
    />
  );
}
