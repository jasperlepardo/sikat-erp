import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../services/journalEntries';
import {
  Alert,
  Badge,
  Button,
  Form,
  Panel,
  PanelHeader,
  Tabs,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
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
  returnableQty,
  recallApInvoice,
  saveApDraft,
  saveApRemarks,
} from '../../../../services/apInvoices';
import { logRejection } from '../../../../services/approvalRules';
import { transferBlock } from '../../../../services/binLocations';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { grOpenQty, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, getPurchasingSettings, listPurchaseOrders, openQty, poWithholding } from '../../../../services/purchaseOrders';
import { proposedTaxCode } from '../../orders/detail/types';
import { GrLogistics } from '../../receipts/detail/GrSections';
import { buildGrContext, defaultPayTo, defaultShipTo, linesFromPo } from '../../receipts/detail/types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { listDownPayments } from '../../../../services/apDownPayments';
import { ApAccounting } from './ApAccounting';
import { ApContents } from './ApContents';
import { linesFromReceipt, orderNumbersOf, toApLine, type ApContext, type ApDraft, type ApMasters } from './types';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { ApVendorCard } from './ApVendorCard';
import { ApDocumentCard } from './ApDocumentCard';
import { ApTotalsCard } from './ApTotalsCard';
import { ApJournalCard } from './ApJournalCard';
import { AP_STATUS_INTENT } from './types';
export { AP_STATUS_INTENT };

export const AP_LIST_PATH = '/purchasing/bills';

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
  const state = useLocation().state as { copyFrom?: ApDraft; fromReceipt?: string; fromPo?: string } | null;

  const apApproved = !getPurchasingSettings().requireApInvoiceApproval;
  const [draft, setDraft] = useState<ApDraft | null | undefined>(isNew ? { ...(state?.copyFrom ?? { ...blankApInvoice(todayISO(), CURRENT_USER_ID), lines: [] }), approved: apApproved } : undefined);
  const [m, setM] = useState<ApMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${AP_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${AP_LIST_PATH}/${id}/details`, { replace: true }); }, []);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [dupWarning, setDupWarning] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

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
      // Copy to › A/P Invoice from a receipt or PO: every open line at its open quantity.
      // Rebuilt from scratch each time, so running the effect twice doesn't copy the lines twice.
      const gr = state?.fromReceipt ? receipts.find((r) => r.id === state.fromReceipt) : undefined;
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && (gr || po)) {
        const vendor = vendors.find((v) => v.id === (gr ?? po)!.vendorId);
        const lines = gr
          ? linesFromReceipt(gr, gr.lines.map((l) => ({ lineId: l.id, qty: grOpenQty(l, gr) })).filter((p) => p.qty > 0), items)
          : linesFromPo(po!, po!.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) })), masters).map((l) => toApLine(l, { baseType: 'PO' }, items, po!.vendorId));
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, gr ?? po!, lines, masters));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getApInvoice(id).then((inv) => !cancelled && setDraft(inv ?? null));
    listApInvoices().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((inv) => inv.docNum ? apNumber(inv) : inv.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New A/P invoice' : draft.docNum ? apNumber(draft) : 'Draft A/P invoice') : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P invoice…</Text>;
  if (draft === null) return <NotFound icon="request_quote" title="A/P invoice not found" backTo={AP_LIST_PATH} backLabel="Back to bills" />;

  const ctx = buildGrContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? apNumber(draft as ApInvoice) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = apTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = poWithholding(draft, vendor, m.items, m.tax, draft.postingDate);
  const due = netDue(totals.total, withholding, draft.downPayment);
  const balance = Math.round((due - draft.appliedAmount) * 100) / 100;
  const journal = ctx.fx ? apJournal(draft, ctx.fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];

  // Ship To follows the lines, and the due date the terms, while each still holds its default.
  const update = (patch: Partial<ApDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.lines && patch.shipTo === undefined && draft.shipTo === defaultShipTo(draft.lines, m)) next.shipTo = defaultShipTo(patch.lines, m);
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    if (patch.lines) next.orderNumber = orderNumbersOf(next.lines, m);
    setDraft(next);
  };

  /** Picking the vendor fills everything that defaults from it. Lines copied from another vendor's documents go. */
  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) return update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', payTo: '' });
    update({
      ...vendorDefaults(v, draft),
      lines: draft.lines.filter((l) => !l.baseType).map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, taxCode: proposedTaxCode(item, v, m, draft.postingDate) } : l;
      }),
    });
  };

  const copyLines = (lines: ApLine[]) => {
    const first = lines[0];
    const base = first?.baseType === 'GRPO' ? m.receipts.find((r) => r.id === first.baseId) : m.orders.find((o) => o.id === first?.baseId);
    if (base) setDraft(withBase(draft, base, lines, m));
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<ApDraft> = {}) => {
    e?.preventDefault();
    if (added) {
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
      lines: draft.lines.map((l) => ({ ...l, id: newApLine().id, baseType: '', baseId: '', baseLineId: '', baseDocNo: '', receiptCostLc: 0, unitCostLc: 0 })),
    };
    navigate(`${AP_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const saved = draft as ApInvoice;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const cancelIt = () => act(async () => { const inv = await cancelApInvoice(saved); await reverseDocumentEntry(saved.id); return inv; }, 'cancelled — the receipts and POs it billed are open again');
  const recallIt = () => act(() => recallApInvoice(saved), 'recalled to draft');
  const rejectIt = async () => {
    await logRejection('APINV', saved.id, saved.vendorId, rejectionReason);
    await recallApInvoice(saved);
    navigate(AP_LIST_PATH, { state: { notice: `A/P invoice ${apNumber(saved)} rejected and returned to draft.` } });
  };
  const statusMoves: Partial<Record<ApStatus, () => void>> = draft.status === 'Draft' ? (draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) }) : draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) } : draft.status === 'Open' && !draft.appliedAmount ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Pay', icon: 'payments', onSelect: () => navigate('/purchasing/payments-made/new', { state: { vendorId: draft.vendorId, invoiceIds: [saved.id] } }) }]
      : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [
          ...(draft.lines.some((l) => returnableQty(l) > 0 && m.items.find((i) => i.id === l.itemId)?.inventoryItem)
            ? [{ label: 'Copy to goods return', icon: 'assignment_return', onSelect: () => navigate('/purchasing/returns-and-debits/returns/new', { state: { fromInvoice: saved.id } }) }]
            : []),
          { label: 'Copy to A/P credit memo', icon: 'receipt', onSelect: () => navigate('/purchasing/returns-and-debits/credit-memos/new', { state: { fromInvoice: saved.id } }) },
        ]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount
      ? [{ label: 'Cancel A/P invoice', icon: 'cancel', onSelect: cancelIt }]
      : []),
    ...bases.map((l) => ({
      label: `Open ${l.baseType === 'GRPO' ? 'receipt' : 'PO'} ${l.baseDocNo}`,
      icon: l.baseType === 'GRPO' ? 'inventory' : 'receipt_long',
      onSelect: () => navigate(l.baseType === 'GRPO' ? `/purchasing/goods-receipts/${l.baseId}` : `/purchasing/purchase-orders/${l.baseId}`),
    })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New A/P invoice' : added ? apNumber(draft) : 'Draft A/P invoice';
  const sectionProps = { draft, update, errors, m, ctx };

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="request_quote"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          breadcrumbs={[{ label: 'Bills', href: AP_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(AP_LIST_PATH)}
          trailing={
            isNew ? undefined : <PrevNext path={AP_LIST_PATH} prevId={prevId} nextId={nextId} />
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={AP_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {draft.paymentBlock ? <Badge size="small" intent="warning" variant="outline">Payment block</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              {added ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(AP_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add'}
              </Button>
            </>
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
            {rejecting ? (<Alert intent="danger" variant="outline" title="Reject A/P invoice"><div className="flex flex-col gap-2"><TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why…" /><div className="flex gap-2"><Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button><Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button></div></div></Alert>) : null}
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

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <ApVendorCard {...sectionProps} pickVendor={pickVendor} />
              <ApDocumentCard {...sectionProps} statusMoves={statusMoves} />
            </div>

            <ApContents {...sectionProps} onCopy={copyLines} />
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <GrLogistics draft={draft} update={update} m={m} ctx={ctx} />
              <ApAccounting {...sectionProps} />
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <ApTotalsCard {...sectionProps} />
              <ApJournalCard {...sectionProps} />
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
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
