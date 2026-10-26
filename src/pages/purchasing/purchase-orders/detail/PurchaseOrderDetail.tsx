import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Form,
  Panel,
  PanelHeader,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { type Partner } from '../../../../mocks/partners';
import {
  blankPurchaseOrder,
  newPoLine,
  type PoStatus,
  type PurchaseOrder,
} from '../../../../mocks/purchaseOrders';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { loadCurrentCompany } from '../../../../services/companies';
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
  recallPurchaseOrder,
  savePurchaseOrder,
  seriesOf,
} from '../../../../services/purchaseOrders';
import { logRejection } from '../../../../services/approvalRules';
import { PurchDoc } from '../../shared/PurchDoc';
import { poDoc } from './poDoc';
import { PoDeliveryCard } from './PoDeliveryCard';
import { PoReceiptsTab } from './PoReceiptsTab';
import { PoJournalPaymentCard } from './PoJournalPaymentCard';
import { PoDatesCard } from './PoDatesCard';
import { ReferencesTable } from '../../shared/ReferencesTable';
import { PoVendorQuickCreate } from './PoVendorQuickCreate';
import { DocumentFlow } from '../../shared/DocumentFlow';
import {
  ALL_CURRENCIES,
  buildContext,
  defaultShipTo,
  formatAddress,
  lineFromItem,
  proposedTaxCode,
  vendorAddressFields,
  type PoContext,
  type PoDraft,
  type PoMasters,
  type PoSuggestion,
} from './types';
import { todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { listGoodsReceipts } from '../../../../services/goodsReceipts';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, PrevNext, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { PoDocumentCard } from './PoDocumentCard';
import { PoAssignmentCard } from './PoTotalsCard';
import { AP_LIST_PATH, DPR_LIST_PATH, PO_LIST_PATH, PO_STATUS_INTENT } from '../../paths';

/** Everything that defaults from the vendor. Tax codes depend on the vendor's VAT status, so lines re-propose theirs. */
function vendorPatch(v: Partner, draft: PoDraft, m: PoMasters): Partial<PoDraft> {
  return {
    vendorId: v.id,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    currencyView: 'BP',
    paymentTermId: v.vendorPaymentTermId,
    paymentMethod: v.defaultPaymentMethod,
    dueDate: dueDateFor(draft.postingDate, v.vendorPaymentTermId),
    projectId: v.projectId,
    shippingType: v.shippingType,
    journalRemark: defaultJournalRemark('purchase-orders', { entityCode: v.code, entityName: v.name }),
    lines: recalcLineTaxes(draft.lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, v, m, draft.postingDate) : '';
    }),
  };
}

/** A new PO from a suggestion: the vendor's defaults, then each item priced as if picked, rounded up to whole purchasing units. */
function fromSuggestion(s: PoSuggestion, blank: PoDraft, m: PoMasters): PoDraft {
  const v = m.vendors.find((x) => x.id === s.vendorId);
  const base: PoDraft = { ...blank, lines: [], ...(v ? vendorPatch(v, blank, m) : {}) };
  const ctx = buildContext(base, m);
  const lines = s.lines.flatMap(({ itemId, warehouse, qty }) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return [];
    const line = lineFromItem(item, base, ctx, m, { warehouse });
    return [lineFromItem(item, base, ctx, m, { warehouse, quantity: Math.ceil(qty / (line.itemsPerUnit || 1)) })];
  });
  const references = s.reference ? [{ id: `ref-${crypto.randomUUID().slice(0, 8)}`, ...s.reference }] : [];
  return { ...base, lines: lines.length ? lines : [newPoLine()], references };
}

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

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
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const { copyFrom, suggest } = (location.state as { copyFrom?: PoDraft; suggest?: PoSuggestion } | null) ?? {};

  const blank = blankPurchaseOrder(CURRENT_USER_ID);
  const approved = !getPurchasingSettings().requirePoApproval;
  const [draft, setDraft] = useState<PoDraft | null | undefined>(isNew ? { ...(copyFrom ?? blank), approved } : undefined);
  const [m, setM] = useState<PoMasters>();
  const [contentTab, setContentTab] = useState<'item' | 'receipts'>('item');
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${PO_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew)
      listPurchaseOrders().then((all) => setSiblings(siblingKeys(all, poNumber)));
  }, [isNew]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [dupWarning, setDupWarning] = useState<string>();
  const [closeWarning, setCloseWarning] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const reject = useReject();

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
      if (isNew) setDraft((prev) => {
        const d = prev && suggest ? fromSuggestion(suggest, prev, masters) : prev;
        if (!d) return d;
        const companyAddress = formatAddress(masters.company.address, masters.company.name);
        return { ...d, shipTo: d.shipTo || defaultShipTo(d.lines, masters), billTo: d.billTo || companyAddress };
      });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPurchaseOrder(id).then((po) => !cancelled && setDraft(po ?? null));
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New purchase order' : draft.status === 'Draft' ? 'Draft purchase order' : poNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading purchase order…</Text>;
  if (draft === null) return <NotFound icon="receipt_long" title="Purchase order not found" backTo={PO_LIST_PATH} backLabel="Back to purchase orders" />;

  const ctx = buildContext(draft, m);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? poNumber(draft as PurchaseOrder) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const received = draft.lines.some((l) => l.receivedQty > 0);

  const update = (patch: Partial<PoDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    if (!ctx.readOnly && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, ctx.vendor, next.postingDate);
    setDraft(next);
  };

  /** Tax codes re-proposed for the vendor and date, except ones set by hand or copied from a base document. */
  const retax = (lines: PoDraft['lines'], v: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, v, m, date) : '';
    });

  const pickVendor = (vendorId: string | null, override?: Partner) => {
    const v = override ?? m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
    update(vendorPatch(v, draft, m));
  };

  const handleVendorCreated = (vendor: Partner) => {
    setM((prev) => prev && { ...prev, vendors: [...prev.vendors, vendor] });
    setShowVendorCreate(false);
    pickVendor(vendor.id, vendor);
  };

  const submit = async (e: FormEvent | null, asDraft = false, patch: Partial<PoDraft> = {}) => {
    e?.preventDefault();
    const doc = { ...draft, ...patch };
    const found = validate(doc, buildContext(doc, m), m, asDraft);
    setProblems(found);
    if (found.length) return;

    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    if (!effectiveDraft && getPurchasingSettings().duplicateVendorRef === 'Warn' && !dupWarning) {
      const dup = await findDuplicateVendorRef(doc);
      if (dup) {
        setDupWarning(`PO ${poNumber(dup)} from ${doc.vendorName} already has Vendor Ref. No. ${doc.vendorRef}.`);
        return;
      }
    }
    setSaving(true);
    try {
      if (Object.keys(patch).length) setDraft(doc);
      const saved = await savePurchaseOrder(doc, { asDraft: effectiveDraft });
      navigate(PO_LIST_PATH, {
        state: {
          notice:
            saved.length > 1
              ? `Split into ${saved.length} purchase orders: ${saved.map(poNumber).join(', ')}.`
              : effectiveDraft
              ? `Draft saved — ${saved[0].vendorName}.`
              : saved[0].status === 'Not Confirmed'
              ? `Purchase order ${poNumber(saved[0])} submitted for approval — ${saved[0].vendorName}.`
              : `Purchase order ${poNumber(saved[0])} saved — ${saved[0].vendorName}.`,
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
    const today = todayISO();
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
      dueDate: dueDateFor(today, draft.paymentTermId),
      splitFrom: undefined,
      lines: draft.lines.map((l) => ({ ...l, id: `ln-${crypto.randomUUID().slice(0, 8)}`, receivedQty: 0, status: 'Open' as const, deliveryDate: '' })),
    };
    navigate(`${PO_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as PurchaseOrder;
  const open = draft.status === 'Open' || draft.status === 'Not Confirmed';
  const closeIt = async () => {
    if (!closeWarning) {
      const grs = await listGoodsReceipts();
      const openGrs = grs.filter((gr) => gr.status === 'Open' && gr.lines.some((l) => l.baseId === saved.id));
      if (openGrs.length) {
        setCloseWarning(`This PO has ${openGrs.length} open goods receipt${openGrs.length === 1 ? '' : 's'} — closing it will stop further invoicing. Click Close again to proceed.`);
        return;
      }
    }
    setCloseWarning(undefined);
    return act(() => closePurchaseOrder(saved), 'closed');
  };
  const recallIt = () => act(() => recallPurchaseOrder(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => {
    await logRejection('PO', saved.id, saved.vendorId, rejectionReason);
    await recallPurchaseOrder(saved);
    navigate(PO_LIST_PATH, { state: { notice: `Purchase order ${poNumber(saved)} rejected and returned to draft.` } });
  };

  const menu: MoreMenuItem[] = [
    ...(!ctx.added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Reject', icon: 'cancel', onSelect: () => reject.start() }] : []),
    ...(draft.status === 'Open' && draft.lines.some((l) => l.status === 'Open' && l.receivedQty < l.quantity)
      ? [
          { label: 'Copy to goods receipt', icon: 'inventory', onSelect: () => navigate('/purchasing/goods-receipts/new', { state: { fromPo: saved.id } }) },
          { label: 'Copy to A/P invoice', icon: 'request_quote', onSelect: () => navigate(`${AP_LIST_PATH}/new`, { state: { fromPo: saved.id } }) },
          { label: 'Copy to A/P down payment request', icon: 'savings', onSelect: () => navigate(`${DPR_LIST_PATH}/new`, { state: { fromPo: saved.id } }) },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(open ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(open && !received ? [{ label: 'Cancel purchase order', icon: 'cancel', onSelect: () => act(() => cancelPurchaseOrder(saved), 'cancelled') }] : []),
    ...(ctx.vendor ? [{ label: `Open vendor ${ctx.vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${ctx.vendor!.id}`) }] : []),
  ];

  const transitions: Partial<Record<PoStatus, () => void>> =
    draft.status === 'Draft'
      ? draft.approved ? { Open: () => submit(null, false) } : { 'Not Confirmed': () => submit(null, false) }
      : open
        ? {
            ...(draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) } : {}),
            Closed: closeIt,
            ...(!received ? { Cancelled: () => act(() => cancelPurchaseOrder(saved), 'cancelled') } : {}),
          }
        : {};

  const title = isNew ? 'New purchase order' : draft.status === 'Draft' ? 'Draft purchase order' : poNumber(draft);
  const sectionProps = { draft, update, errors, m, ctx };

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="receipt_long"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          breadcrumbs={[{ label: 'Purchase Orders', href: PO_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(PO_LIST_PATH)}
          trailing={isNew ? undefined : <PrevNext path={PO_LIST_PATH} prevId={prevId} nextId={nextId} />}
          tabs={
            isNew ? undefined : (
              <Tabs
                variant="outline"
                value={page}
                onValueChange={(v) => setPage(v as PageId)}
                items={PAGES.map((p) => ({ ...p }))}
              />
            )
          }
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={PO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.splitFrom ? <Badge size="small" variant="outline">Split</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              {ctx.readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(PO_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
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
            <ActivityTab target={{ kind: 'PO', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' }[t])} />
            {reject.alert('Reject purchase order', rejectIt)}
            {dupWarning ? (
              <Alert intent="warning" variant="outline" title="Duplicate vendor reference">
                {dupWarning} Press {ctx.added ? 'Save' : 'Add'} again to keep it, or change the Vendor Ref. No.
              </Alert>
            ) : null}
            {closeWarning ? (
              <Alert intent="warning" variant="outline" title="Check before closing">
                {closeWarning}
              </Alert>
            ) : null}
            {ctx.readOnly ? (
              <Alert intent="default" variant="outline" title={`This purchase order is ${draft.status.toLowerCase()}`}>
                Only remarks can change{draft.closeDate ? ` (closed ${draft.closeDate})` : ''}.
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <VendorCard vendors={m.vendors} vendorId={draft.vendorId} vendor={ctx.vendor} readOnly={ctx.readOnly} added={ctx.added} error={errors.vendorId} pickVendor={pickVendor} onNewVendor={() => setShowVendorCreate(true)} onOpenDetails={() => setVendorDetailsOpen(true)} />
                <Tabs
                  variant="primary"
                  value={contentTab}
                  onValueChange={(v) => setContentTab(v as 'item' | 'receipts')}
                  items={[
                    { value: 'item', label: 'Item' },
                    { value: 'receipts', label: 'Receipts' },
                  ]}
                />
                {contentTab === 'item' ? <PurchDoc {...poDoc(sectionProps)} /> : <PoReceiptsTab draft={draft} />}
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this PO refers to, or that refer to it." />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's quotation, signed PO acknowledgement or order confirmation." />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4">
                <PoDocumentCard {...sectionProps} transitions={transitions} />
                <PoDeliveryCard {...sectionProps} />
                <PoJournalPaymentCard {...sectionProps} />
                <PoDatesCard {...sectionProps} />
                <PoAssignmentCard {...sectionProps} />
              </div>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
    <VendorDetailsPanel
      draft={draft}
      update={update}
      vendor={ctx.vendor}
      currencies={m.currencies}
      readOnly={ctx.readOnly}
      open={vendorDetailsOpen}
      onClose={() => setVendorDetailsOpen(false)}
      onVendorSaved={(v) => setM((prev) => prev && { ...prev, vendors: prev.vendors.map((x) => (x.id === v.id ? v : x)) })}
      vendorRefHint="The vendor's own reference, e.g. their sales order no."
      vendorRefError={errors.vendorRef}
      currency={{
        disabled: ctx.readOnly || draft.lines.some((l) => l.receivedQty > 0),
        tooltip: draft.lines.some((l) => l.receivedQty > 0)
          ? 'Locked: goods were already received on this PO.'
          : ctx.vendor && ctx.vendor.currency !== ALL_CURRENCIES
          ? "Defaults to the vendor's currency. You can override it before receiving goods."
          : 'Pick the document currency for this order.',
        error: errors.currency,
        onChange: (currency) => ({ currency, currencyView: 'BP' as const }),
      }}
      addresses={ctx.vendor ? vendorAddressFields(draft, m, ctx.vendor) : []}
    />
    {showVendorCreate && (
      <PoVendorQuickCreate
        initialName=""
        onClose={() => setShowVendorCreate(false)}
        onCreated={handleVendorCreated}
      />
    )}
    </>
  );
}
