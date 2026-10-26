import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
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
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { blankApReserveInvoice, type ApReserveInvoice, type ApRiLine, type ApRiStatus } from '../../../../mocks/apReserveInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { type Partner } from '../../../../mocks/partners';
import {
  addApReserveInvoice,
  apRiNumber,
  apRiTotals,
  cancelApReserveInvoice,
  getApReserveInvoice,
  listApReserveInvoices,
  recallApReserveInvoice,
  saveApRiDraft,
  saveApRiRemarks,
} from '../../../../services/apReserveInvoices';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, getPurchasingSettings, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { proposedTaxCode } from '../../purchase-orders/detail/types';
import { GrLogistics } from '../../goods-receipts/detail/GrLogisticsCard';
import { defaultPayTo } from '../../goods-receipts/detail/types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { ReferencesTable } from '../../shared/ReferencesTable';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { useDocTitle } from '../../../../services/useDocTitle';
import { neighbours, NotFound, PrevNext, siblingKeys, useDocTab } from '../../../../components/form/DetailNav';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { buildApriContext, orderNumbersOf, riLinesFromPo, type ApriDraft, type ApriMasters } from './types';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { receivingVendorAddressFields } from '../../shared/vendorAddresses';
import { ApriDocumentCard } from './ApriDocumentCard';
import { apriDoc } from './apriDoc';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { CopyPanel } from '../../shared/CopyPanel';
import { ApriAccountingCard } from './ApriAccountingCard';
import { ApriTotalsCard } from './ApriTotalsCard';
import { ApriJournalCard } from './ApriJournalCard';
import { APRI_LIST_PATH, AP_RI_STATUS_INTENT } from '../../paths';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

function validate(d: ApriDraft, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required — pick payment terms or enter it.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line or copy from a purchase order.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
  }
  return problems;
}

export function ApReserveInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ApReserveInvoiceForm key={id === 'new' ? location.key : id} />;
}

function ApReserveInvoiceForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { copyFrom?: ApriDraft; fromPo?: string } | null;

  const apriApproved = !getPurchasingSettings().requireApInvoiceApproval;
  const [draft, setDraft] = useState<ApriDraft | null | undefined>(
    isNew ? { ...(state?.copyFrom ?? { ...blankApReserveInvoice(todayISO(), CURRENT_USER_ID), lines: [] }), approved: apriApproved } : undefined,
  );
  const [m, setM] = useState<ApriMasters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${APRI_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);

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
      listPurchaseOrders(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders]) => {
      const masters: ApriMasters = {
        vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, accounts: inv.accounts,
      };
      setM(masters);
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && po) {
        const vendor = vendors.find((v) => v.id === po.vendorId);
        const lines = riLinesFromPo(po, po.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) })), masters);
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d) }, po, lines));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getApReserveInvoice(id).then((inv) => !cancelled && setDraft(inv ?? null));
    listApReserveInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, apRiNumber)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New A/P reserve invoice' : draft.docNum ? apRiNumber(draft) : 'Draft A/P reserve invoice') : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P reserve invoice…</Text>;
  if (draft === null) return <NotFound icon="request_quote" title="A/P reserve invoice not found" backTo={APRI_LIST_PATH} backLabel="Back to reserve invoices" />;

  const ctx = buildApriContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? apRiNumber(draft as ApReserveInvoice) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = apRiTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const balance = Math.round((totals.total - draft.appliedAmount) * 100) / 100;

  const update = (patch: Partial<ApriDraft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    if (patch.lines) next.orderNumber = orderNumbersOf(next.lines);
    if (!added && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, vendor, next.postingDate);
    setDraft(next);
  };

  /** Tax codes re-proposed for the vendor and date, except ones set by hand or copied from a base document. */
  const retax = (lines: ApriDraft['lines'], v: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, v, m, date) : '';
    });

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', payTo: '' });
    update({
      ...vendorDefaults(v, draft),
      lines: retax(draft.lines.filter((l) => !l.baseType), v, draft.postingDate),
    });
  };

  const copyLines = (lines: ApRiLine[]) => {
    const first = lines[0];
    const po = first?.baseType === 'PO' ? m.orders.find((o) => o.id === first.baseId) : undefined;
    if (po) setDraft(withBase(draft, po, lines));
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<ApriDraft> = {}) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveApRiRemarks(draft as ApReserveInvoice, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(APRI_LIST_PATH, { state: { notice: `A/P reserve invoice ${apRiNumber(saved)} saved.` } });
      } finally { setSaving(false); }
      return;
    }
    const doc: ApriDraft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = effectiveDraft ? await saveApRiDraft(doc) : await addApReserveInvoice(doc);
      navigate(APRI_LIST_PATH, {
        state: {
          notice: effectiveDraft
            ? `Draft saved — ${saved.vendorName}.`
            : saved.status === 'Not Confirmed'
              ? `A/P reserve invoice ${apRiNumber(saved)} submitted for approval.`
              : `A/P reserve invoice ${apRiNumber(saved)} added — ${saved.vendorName} is owed ${saved.currency} ${formatAmount(totals.total)}.`,
        },
      });
    } finally { setSaving(false); }
  };

  const act = async (run: () => Promise<ApReserveInvoice>, notice: string) => {
    try {
      const inv = await run();
      navigate(APRI_LIST_PATH, { state: { notice: `A/P reserve invoice ${apRiNumber(inv)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: ApriDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      vendorRef: '',
      postingDate: today,
      documentDate: today,
      dueDate: dueDateFor(today, draft.paymentTermId),
      closeDate: '',
      orderNumber: '',
      fxRate: 1,
      appliedAmount: 0,
      // Withholding and filing were fixed for the original's date: the copy works them out again.
      withholdingSummary: undefined,
      lines: retax(draft.lines.map((l) => ({ ...l, lineWithholding: undefined, taxAtc: undefined, taxReturn: undefined })), vendor, today),
    };
    navigate(`${APRI_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as ApReserveInvoice;
  const cancelIt = () => act(() => cancelApReserveInvoice(saved), 'cancelled');
  const recallIt = () => act(() => recallApReserveInvoice(saved), 'recalled to draft');

  const statusMoves: Partial<Record<ApRiStatus, () => void>> =
    draft.status === 'Draft'
      ? draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) }
      : draft.status === 'Not Confirmed'
        ? { Open: () => submit(null, false, { approved: true }) }
        : draft.status === 'Open' && !draft.appliedAmount
          ? { Cancelled: cancelIt }
          : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: 'Cancel reserve invoice', icon: 'cancel', onSelect: cancelIt }] : []),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New A/P reserve invoice' : added ? apRiNumber(draft) : 'Draft A/P reserve invoice';
  const sectionProps = { draft, update, errors, m, ctx };

  // Open POs from the vendor that this invoice can bill (Copy from).
  const orders = draft.vendorId
    ? m.orders.filter((po) => po.vendorId === draft.vendorId && po.status === 'Open' && (!ctx.based || po.currency === draft.currency))
    : [];

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="receipt_long"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          breadcrumbs={[{ label: 'A/P Reserve Invoices', href: APRI_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(APRI_LIST_PATH)}
          trailing={isNew ? undefined : <PrevNext path={APRI_LIST_PATH} prevId={prevId} nextId={nextId} />}
          tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={AP_RI_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.paymentBlock ? <Badge size="small" intent="warning" variant="outline">Payment block</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              {added ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(APRI_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow kind="APRI" id={draft.id} notes="Everything linked to this reserve invoice: the POs it billed and the Goods Receipts created against it." />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'APRI', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'This A/P reserve invoice is open' : `This A/P reserve invoice is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Open'
                  ? `The vendor is owed ${draft.currency} ${formatAmount(balance)}. Goods are received by creating a Goods Receipt PO against this invoice. Only remarks, the payment block and the payment run flag can change.`
                  : `Only remarks can change${draft.closeDate ? ` (${draft.status.toLowerCase()} ${formatDate(draft.closeDate)})` : ''}.`}
              </Alert>
            ) : null}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <VendorCard
                  vendors={m.vendors}
                  vendorId={draft.vendorId}
                  vendor={ctx.vendor}
                  readOnly={ctx.readOnly}
                  locked={!!ctx.vendor && (ctx.readOnly || ctx.based)}
                  error={errors.vendorId}
                  tooltip="Only vendors are listed. Picking one fills the name, contact, currency, terms and control account."
                  hint={!!ctx.vendor && !ctx.readOnly && ctx.based ? 'Locked while lines copied from its POs are on the invoice.' : undefined}
                  pickVendor={pickVendor}
                  onOpenDetails={() => setVendorDetailsOpen(true)}
                />
                <DocLines {...apriDoc({ ...sectionProps, onCopyClick: () => setCopying(true), copyableCount: orders.length })} />
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this invoice refers to." />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's invoice or supporting documents." />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4">
                <ApriDocumentCard {...sectionProps} statusMoves={statusMoves} />
                <GrLogistics draft={draft as Parameters<typeof GrLogistics>[0]['draft']} update={update as Parameters<typeof GrLogistics>[0]['update']} m={m} />
                <ApriAccountingCard {...sectionProps} />
                <ApriTotalsCard {...sectionProps} />
                <ApriJournalCard {...sectionProps} />
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
      vendorRefHint="The vendor's invoice no."
      vendorRefError={errors.vendorRef}
      currency={{
        disabled: ctx.readOnly || ctx.based,
        tooltip: ctx.based
          ? 'Locked to the currency of the POs the lines came from.'
          : ctx.vendor?.currency === ALL_CURRENCIES
          ? 'This vendor takes all currencies — pick the document currency.'
          : `Defaults to the vendor's currency (${ctx.vendor?.currency ?? '—'}).`,
        error: errors.currency,
      }}
      addresses={ctx.vendor ? receivingVendorAddressFields(m, ctx.vendor, { includeWarehouses: false, shipPlaceholder: 'Delivery address when goods arrive' }) : []}
    />
    {copying
      ? createPortal(
          <CopyPanel
            sources={[
              {
                key: 'PO' as const,
                label: 'Purchase orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Invoice',
                hint: 'Bill from an open PO. Goods are received later when you create a Goods Receipt referencing this invoice.',
                docs: orders.map((po) => ({
                  id: po.id,
                  label: `PO ${poNumber(po)}`,
                  description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency}`,
                  lines: po.lines
                    .filter((l) => l.status === 'Open')
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              },
            ]}
            taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
            onCancel={() => setCopying(false)}
            onCopy={(_type, docId, picks) => {
              const po = orders.find((p) => p.id === docId)!;
              copyLines(riLinesFromPo(po, picks, m));
              setCopying(false);
            }}
          />,
          document.body,
        )
      : null}
    </>
  );
}

function vendorDefaults(v: Partner | undefined, d: ApriDraft): Partial<ApriDraft> {
  if (!v) return {};
  return {
    vendorId: v.id,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    paymentTermId: v.vendorPaymentTermId,
    paymentMethod: v.defaultPaymentMethod,
    dueDate: dueDateFor(d.postingDate, v.vendorPaymentTermId),
    projectId: v.projectId,
    shippingType: v.shippingType,
    journalRemark: defaultJournalRemark('ap-reserve-invoices', { entityCode: v.code, entityName: v.name }),
    payTo: defaultPayTo(v),
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

function withBase(d: ApriDraft, po: { currency: string; contactId: string; paymentTermId: string; paymentMethod: string; projectId: string; shippingType: string; discountPct: number; buyerId: string; freightTaxCode?: string }, lines: ApRiLine[]): ApriDraft {
  const first = !d.lines.some((l) => l.baseType);
  const allLines = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first ? {
      currency: po.currency,
      contactId: po.contactId || d.contactId,
      paymentTermId: po.paymentTermId || d.paymentTermId,
      paymentMethod: po.paymentMethod || d.paymentMethod,
      dueDate: dueDateFor(d.postingDate, po.paymentTermId || d.paymentTermId),
      projectId: po.projectId || d.projectId,
      shippingType: po.shippingType || d.shippingType,
      discountPct: po.discountPct,
      buyerId: po.buyerId || d.buyerId,
      ...(po.freightTaxCode ? { freightTaxCode: po.freightTaxCode } : {}),
    } : {}),
    orderNumber: orderNumbersOf(allLines),
    lines: allLines,
  };
}
