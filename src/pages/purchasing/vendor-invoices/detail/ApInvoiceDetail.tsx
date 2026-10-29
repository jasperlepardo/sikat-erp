import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../services/journalEntries';
import {
  Alert,
  Badge,
  Form,
  Panel,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { blankApInvoice, newApLine, type ApInvoice, type ApLine, type ApStatus } from '../../../../mocks/apInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import type { GoodsReceipt } from '../../../../mocks/goodsReceipts';
import { type Partner } from '../../../../mocks/partners';
import { type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import {
  ApPostError,
  addApInvoice,
  apJournal,
  apNumber,
  apTotals,
  cancelApInvoice,
  findDuplicateInvoice,
  getApInvoice,
  listApInvoices,
  movesStock,
  netDue,
  recallApInvoice,
  saveApDraft,
  saveApRemarks,
} from '../../../../services/apInvoices';
import { logRejection } from '../../../../services/approvalRules';
import { transferBlock } from '../../../../services/binLocations';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { grNumber, grOpenQty, invoiceableReceipts, listGoodsReceipts, receivablePos } from '../../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, getPurchasingSettings, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { docWithholding } from '../../../../services/withholding';
import { proposedTaxCode } from '../../purchase-orders/detail/types';
import { GrLogistics } from '../../goods-receipts/detail/GrLogisticsCard';
import { buildGrContext, defaultPayTo, defaultShipTo, linesFromPo } from '../../goods-receipts/detail/types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { drawableAmount, listDownPayments } from '../../../../services/apDownPayments';
import { ApAccountingCard as ApAccounting } from './ApAccountingCard';
import { ReferencesTable } from '../../shared/ReferencesTable';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { apDoc } from './apDoc';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { CopyPanel } from '../../shared/CopyPanel';
import { CreateFromPanel, createHopMenuItems } from '../../shared/CreateFromPanel';
import { AP_TO_RETURN, AP_TO_APCM, type CopyHop, type LinePick } from '../../shared/copyHops';
import { DrawPanel } from './DrawPanel';
import { linesFromReceipt, orderNumbersOf, toApLine, type ApContext, type ApDraft, type ApMasters } from './types';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { receivingVendorAddressFields } from '../../shared/vendorAddresses';
import { ApDocumentCard } from './ApDocumentCard';
import { ApTotalsCard } from './ApTotalsCard';
import { ApJournalCard } from './ApJournalCard';
import { AP_LIST_PATH, AP_NOUN, AP_STATUS_INTENT, PAYMENT_LIST_PATH } from '../../paths';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

/** Required and conditional fields from the A/P invoice field map, checked on Add. Drafts only need a vendor. */
function validate(d: ApDraft, ctx: ApContext, m: ApMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(d.dueDate, 'header', 'dueDate', 'Due date is required — pick payment terms or enter it.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(d.currency !== ALL_CURRENCIES, 'header', 'currency', 'Pick the document currency.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');

  const binOf = (warehouse: string, id: string) => m.inv.bins.find((b) => b.warehouse === warehouse && b.id === id);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a goods receipt or purchase order.');
  const billing = new Map<string, number>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (movesStock(l, m.items)) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the stock goes into.`);
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      if (wh?.binEnabled) {
        need(l.binId, 'contents', `line:${l.id}:bin`, `${n}: pick the bin it's put away in, in ${l.warehouse}.`);
        const block = l.binId ? transferBlock(binOf(l.warehouse, l.binId), item, l.uomCode, 'in') : null;
        need(!block, 'contents', `line:${l.id}:bin`, `${n}: ${block}`);
      }
    }
    if (l.baseLineId) billing.set(l.baseLineId, (billing.get(l.baseLineId) ?? 0) + l.quantity);
  }
  // Over-billing: a receipt line can't be billed past what was received, a PO line past what's open.
  for (const [baseLineId, qty] of billing) {
    const l = d.lines.find((x) => x.baseLineId === baseLineId)!;
    let open = Infinity;
    if (l.baseType === 'GRPO') {
      const gr = m.receipts.find((r) => r.id === l.baseId);
      const gl = gr?.lines.find((x) => x.id === baseLineId);
      open = gr && gl ? grOpenQty(gl, gr) : 0;
    } else if (l.baseType === 'PO') {
      const pl = m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === baseLineId);
      open = pl ? openQty(pl) : 0;
    }
    need(qty <= open, 'contents', `line:${l.id}:quantity`, `${l.itemNo}: billing ${qty} ${l.uomCode}, but ${l.baseType === 'GRPO' ? 'receipt' : 'PO'} ${l.baseDocNo} has only ${open} left.`);
  }
  return problems;
}

/** Keyed by record so moving between invoices (or duplicating into /new) starts a fresh form. */
export function ApInvoiceDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ApInvoiceForm key={id === 'new' ? location.key : id} />;
}

function ApInvoiceForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { copyFrom?: ApDraft; fromReceipt?: string; fromPo?: string; picks?: LinePick[] } | null;

  const apApproved = !needsApproval('APINV');
  const [draft, setDraft] = useState<ApDraft | null | undefined>(isNew ? { ...(state?.copyFrom ?? { ...blankApInvoice(todayISO(), CURRENT_USER_ID), lines: [] }), approved: apApproved } : undefined);
  const [m, setM] = useState<ApMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${AP_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [dupWarning, setDupWarning] = useState<string>();
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [createHop, setCreateHop] = useState<CopyHop<ApInvoice> | null>(null);

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
      listGoodsReceipts(),
      listDownPayments(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders, receipts, downPayments]) => {
      const masters: ApMasters = {
        vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, receipts, accounts: inv.accounts, downPayments,
      };
      setM(masters);
      // Create A/P invoice from a receipt or PO: the lines the user picked, or — when navigated
      // without picks — every open line at its open quantity. Rebuilt from scratch each time, so
      // running the effect twice doesn't copy the lines twice.
      const gr = state?.fromReceipt ? receipts.find((r) => r.id === state.fromReceipt) : undefined;
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && (gr || po)) {
        const vendor = vendors.find((v) => v.id === (gr ?? po)!.vendorId);
        const lines = gr
          ? linesFromReceipt(gr, state?.picks ?? gr.lines.map((l) => ({ lineId: l.id, qty: grOpenQty(l, gr) })).filter((p) => p.qty > 0), items)
          : linesFromPo(po!, state?.picks ?? po!.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) })), masters).map((l) => toApLine(l, { baseType: 'PO' }, items, po!.vendorId));
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, gr ?? po!, lines, masters));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getApInvoice(id).then((inv) => !cancelled && setDraft(inv ?? null));
    listApInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, apNumber)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${AP_NOUN.one}` : draft.status !== 'Draft' ? apNumber(draft) : `Draft ${AP_NOUN.one}`) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P invoice…</Text>;
  if (draft === null) return <NotFound icon="request_quote" title="A/P invoice not found" backTo={AP_LIST_PATH} backLabel="Back to bills" />;

  const ctx = buildGrContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? apNumber(draft as ApInvoice) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = apTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = docWithholding(draft, vendor, m.items, m.tax, draft.postingDate);
  const due = netDue(totals.total, withholding, draft.downPayment);
  const balance = Math.round((due - draft.appliedAmount) * 100) / 100;
  const journal = ctx.fx ? apJournal(draft, ctx.fx, { itemsById: new Map(m.items.map((i) => [i.id, i])), groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];

  // Ship To follows the lines, and the due date the terms, while each still holds its default.
  const update = (patch: Partial<ApDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    if (patch.lines) next.orderNumber = orderNumbersOf(next.lines, m);
    if (!added && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, vendor, next.postingDate);
    setDraft(next);
  };

  /** Tax codes re-proposed for the vendor and date, except ones set by hand or copied from a base document. */
  const retax = (lines: ApLine[], v: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, v, m, date) : '';
    });

  /** Picking the vendor fills everything that defaults from it. Lines copied from another vendor's documents go. */
  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', payTo: '' });
    update({
      ...vendorDefaults(v, draft),
      lines: retax(draft.lines.filter((l) => !l.baseType), v, draft.postingDate),
    });
  };

  const copyLines = (lines: ApLine[]) => {
    const first = lines[0];
    const base = first?.baseType === 'GRPO' ? m.receipts.find((r) => r.id === first.baseId) : m.orders.find((o) => o.id === first?.baseId);
    if (base) setDraft(withBase(draft, base, lines, m));
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<ApDraft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveApRemarks(draft as ApInvoice, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: ApDraft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    // The same vendor invoice number twice is usually the same bill entered twice: ask once.
    if (!effectiveDraft && doc.approved && getPurchasingSettings().duplicateVendorRef !== 'Allow' && !dupWarning) {
      const dup = await findDuplicateInvoice(doc);
      if (dup) {
        const message = `A/P invoice ${apNumber(dup)} from ${doc.vendorName} already has Vendor Ref. No. ${doc.vendorRef}.`;
        if (getPurchasingSettings().duplicateVendorRef === 'Block') return setProblems([{ tab: 'header', key: 'vendorRef', message }]);
        return setDupWarning(message);
      }
    }
    setSaving(true);
    try {
      const saved = effectiveDraft ? await saveApDraft(doc) : await addApInvoice(doc, ctx.fx, due);
      if (!effectiveDraft && saved.status === 'Open') {
        await postDocumentEntry({
          origin: 'PU',
          originNo: saved.docNum,
          originId: saved.id,
          postingDate: saved.postingDate,
          dueDate: saved.dueDate,
          remarks: saved.journalRemark,
          partnerId: saved.vendorId,
          controlAccount: saved.controlAccount,
          lines: journal,
        });
      }
      navigate(AP_LIST_PATH, { state: { notice: effectiveDraft ? `Draft saved — ${saved.vendorName}.` : saved.status === 'Not Confirmed' ? `A/P invoice ${apNumber(saved)} submitted for approval.` : `A/P invoice ${apNumber(saved)} added — ${saved.vendorName} is owed ${saved.currency} ${formatAmount(due)}.` } });
    } catch (err) {
      if (!(err instanceof ApPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const act = async (run: () => Promise<ApInvoice>, notice: string) => {
    try {
      const inv = await run();
      navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(inv)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  /** A new draft with the same vendor and lines, unlinked from their base documents. */
  const duplicate = () => {
    const today = todayISO();
    const copy: ApDraft = {
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
      downPayment: 0,
      drawnDownPayments: [],
      // Withholding and filing were fixed for the original's date: the copy works them out again.
      withholdingSummary: undefined,
      lines: retax(
        draft.lines.map((l) => ({ ...l, id: newApLine().id, baseType: '', baseId: '', baseLineId: '', baseDocNo: '', receiptCostLc: 0, unitCostLc: 0, lineWithholding: undefined, taxAtc: undefined, taxReturn: undefined })),
        vendor,
        today,
      ),
    };
    navigate(`${AP_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as ApInvoice;
  const cancelIt = () => act(async () => { const inv = await cancelApInvoice(saved); await reverseDocumentEntry(saved.id); return inv; }, 'cancelled — the receipts and POs it billed are open again');
  const recallIt = () => act(() => recallApInvoice(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => {
    await logRejection('APINV', saved.id, saved.vendorId, rejectionReason);
    await recallApInvoice(saved);
    navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(saved)} rejected and returned to draft.` } });
  };
  const statusMoves: Partial<Record<ApStatus, () => void>> = draft.status === 'Draft' ? (draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) }) : draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) } : draft.status === 'Open' && !draft.appliedAmount ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? createHopMenuItems(saved, m.items, [AP_TO_RETURN, AP_TO_APCM], setCreateHop)
      : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Pay', icon: 'payments', onSelect: () => navigate(`${PAYMENT_LIST_PATH}/new`, { state: { vendorId: draft.vendorId, invoiceIds: [saved.id] } }) }]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount
      ? [{ label: `Cancel ${AP_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }]
      : []),
  ];

  const title = isNew ? `New ${AP_NOUN.one}` : added ? apNumber(draft) : `Draft ${AP_NOUN.one}`;
  const sectionProps = { draft, update, errors, m, ctx };

  // Documents this invoice can bill (Copy from) and down payments it can draw.
  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === draft.currency) : docs);
  const receipts = draft.vendorId ? sameCurrency(invoiceableReceipts(m.receipts, draft.vendorId)) : [];
  const orders = draft.vendorId ? sameCurrency(receivablePos(m.orders, draft.vendorId)) : [];
  const drawable = m.downPayments
    .filter((d) => d.vendorId === draft.vendorId && d.currency === draft.currency && (d.status === 'Open' || (draft.drawnDownPayments ?? []).some((x) => x.requestId === d.id)))
    .filter((d) => drawableAmount(d) > 0 || (draft.drawnDownPayments ?? []).some((x) => x.requestId === d.id));

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PageHeader
          variant="plain"
          icon="request_quote"
          parent={{ noun: AP_NOUN, to: AP_LIST_PATH }}
          title={title}
          tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={AP_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.paymentBlock ? <Badge size="small" intent="warning" variant="outline">Payment block</Badge> : null}
              </div>
            )
          }
          actions={
            <DetailActions
              noun={AP_NOUN}
              listPath={AP_LIST_PATH}
              mode={docMode(draft.status, { canApprove: isApprover('APINV') })}
              needsApproval={!draft.approved}
              remarksOnly={added}
              busy={saving}
              onDraft={() => submit(null, true)}
              onSubmit={() => submit(null)}
              onApprove={() => submit(null, false, { approved: true })}
              onReject={reject.start}
              menu={menu}
              prevNext={isNew ? undefined : { path: AP_LIST_PATH, prevId, nextId }}
            />
          }
        />
        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow
              kind="APINV"
              id={draft.id}
              notes="Everything linked to this invoice, however far back or forward: the receipts and POs it billed and their own bases, and the payments and credit memos that follow (once built)."
            />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'APINV', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
            {reject.alert('Reject A/P invoice', rejectIt)}
            {dupWarning ? (
              <Alert intent="warning" variant="outline" title="Possible duplicate bill">
                {dupWarning} Press Add again if it's a different bill, or change the Vendor Ref. No.
              </Alert>
            ) : null}
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'This A/P invoice is added' : `This A/P invoice is ${draft.status.toLowerCase()}`}>
                {draft.status === 'Open'
                  ? `The vendor is owed ${draft.currency} ${formatAmount(balance)}. Only remarks, the payment block and the payment run flag can change; to undo it, cancel the invoice.`
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
                  hint={!!ctx.vendor && !ctx.readOnly && ctx.based ? 'Locked while lines copied from its documents are on the invoice.' : undefined}
                  pickVendor={pickVendor}
                  onOpenDetails={() => setVendorDetailsOpen(true)}
                />
                <DocLines {...apDoc({ ...sectionProps, onCopyClick: () => setCopying(true), copyableCount: receipts.length + orders.length, onDrawClick: () => setDrawing(true), drawableCount: drawable.length })} />
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this invoice refers to, e.g. the vendor's official receipt or statement of account." />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's invoice, delivery receipt or statement of account." />
              </div>
              <div className="flex flex-col gap-2 lg:col-span-4">
                <ApDocumentCard {...sectionProps} statusMoves={statusMoves} />
                <GrLogistics draft={draft} update={update} m={m} />
                <ApAccounting {...sectionProps} />
                <ApTotalsCard {...sectionProps} />
                <ApJournalCard {...sectionProps} />
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
      vendorRefHint="The vendor's invoice no. — checked against their other bills so it isn't entered twice."
      vendorRefError={errors.vendorRef}
      currency={{
        disabled: ctx.readOnly || ctx.based,
        tooltip: ctx.based
          ? 'Locked to the currency of the documents the lines came from.'
          : ctx.vendor?.currency === ALL_CURRENCIES
          ? 'This vendor takes all currencies — pick the document currency.'
          : `Defaults to the vendor's currency (${ctx.vendor?.currency ?? '—'}).`,
        error: errors.currency,
      }}
      addresses={ctx.vendor ? receivingVendorAddressFields(m, ctx.vendor) : []}
    />
    {drawing
      ? createPortal(
          <DrawPanel
            code={draft.currency}
            requests={drawable}
            current={draft.drawnDownPayments ?? []}
            max={Math.max(0, Math.round((totals.total - withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0)) * 100) / 100)}
            onCancel={() => setDrawing(false)}
            onDone={(draws) => {
              update({ drawnDownPayments: draws, downPayment: Math.round(draws.reduce((n, d) => n + d.amount, 0) * 100) / 100 });
              setDrawing(false);
            }}
          />,
          document.body,
        )
      : null}
    {copying
      ? createPortal(
          <CopyPanel
            sources={[
              {
                key: 'GRPO' as const,
                label: 'Goods receipts',
                totalHeader: 'Received',
                qtyHeader: 'Bill',
                hint: 'Bill what was received: the usual three-way match. Only receipts with quantity still to bill are listed.',
                docs: receipts.map((gr) => ({
                  id: gr.id,
                  label: `Receipt ${grNumber(gr)}`,
                  description: `Received ${formatDate(gr.postingDate)} · ${gr.currency}${gr.orderNumber ? ` · PO ${gr.orderNumber}` : ''}`,
                  lines: gr.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: grOpenQty(l, gr) })),
                })),
              },
              {
                key: 'PO' as const,
                label: 'Purchase orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Bill',
                hint: 'Bill straight from a PO when nothing was received on a receipt — the invoice receives the stock too.',
                docs: orders.map((po) => ({
                  id: po.id,
                  label: `PO ${poNumber(po)}`,
                  description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency} · not yet received — billing it receives the stock`,
                  lines: po.lines.filter((l) => l.status === 'Open').map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              },
            ]}
            taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
            onCancel={() => setCopying(false)}
            onCopy={(type, docId, picks) => {
              if (type === 'GRPO') {
                const gr = receipts.find((r) => r.id === docId)!;
                copyLines(linesFromReceipt(gr, picks, m.items));
              } else {
                const po = orders.find((p) => p.id === docId)!;
                copyLines(linesFromPo(po, picks, m).map((l) => toApLine(l, { baseType: 'PO' }, m.items, po.vendorId)));
              }
              setCopying(false);
            }}
          />,
          document.body,
        )
      : null}
    {createHop ? <CreateFromPanel source={saved} hop={createHop} items={m.items} partyCard={<VendorCard vendors={m.vendors} vendorId={saved.vendorId} vendor={ctx.vendor} readOnly={false} locked pickVendor={() => {}} />} onClose={() => setCreateHop(null)} /> : null}
    </>
  );
}

/** What picking a vendor fills on the invoice. */
function vendorDefaults(v: Partner | undefined, d: ApDraft): Partial<ApDraft> {
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
    journalRemark: defaultJournalRemark('ap-invoices', { entityCode: v.code, entityName: v.name }),
    payTo: defaultPayTo(v),
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

/**
 * Add lines copied from a receipt or PO. The first base document also sets the header terms it
 * carried: currency, contact, payment terms, project, shipping type, document discount.
 */
function withBase(d: ApDraft, base: GoodsReceipt | PurchaseOrder, lines: ApLine[], m: ApMasters): ApDraft {
  const first = !d.lines.some((l) => l.baseType);
  const allLines = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first
      ? {
          currency: base.currency,
          contactId: base.contactId || d.contactId,
          paymentTermId: base.paymentTermId || d.paymentTermId,
          paymentMethod: base.paymentMethod || d.paymentMethod,
          dueDate: dueDateFor(d.postingDate, base.paymentTermId || d.paymentTermId),
          projectId: base.projectId || d.projectId,
          shippingType: base.shippingType || d.shippingType,
          discountPct: base.discountPct,
          buyerId: base.buyerId || d.buyerId,
          freightTaxCode: base.freightTaxCode || d.freightTaxCode,
        }
      : {}),
    shipTo: !d.shipTo || d.shipTo === defaultShipTo(d.lines, m) ? defaultShipTo(allLines, m) : d.shipTo,
    orderNumber: orderNumbersOf(allLines, m),
    lines: allLines,
  };
}
