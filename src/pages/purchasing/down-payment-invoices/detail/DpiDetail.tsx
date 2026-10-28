import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { formatAddress } from '../../../../mocks/address';
import { ADVANCES_TO_SUPPLIERS, blankDownPaymentInvoice, newDpiLine, type DownPaymentInvoice, type DpiLine, type DpiStatus } from '../../../../mocks/apDownPaymentInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { type Partner } from '../../../../mocks/partners';
import { type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import {
  addDownPaymentInvoice,
  cancelDownPaymentInvoice,
  closeDownPaymentInvoice,
  dpiJournal,
  dpiNumber,
  dpiTotals,
  drawableAmount,
  getDownPaymentInvoice,
  listDownPaymentInvoices,
  recallDownPaymentInvoice,
  saveDpiDraft,
  saveDpiRemarks,
} from '../../../../services/apDownPaymentInvoices';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../services/journalEntries';
import { logRejection } from '../../../../services/approvalRules';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { proposedTaxCode } from '../../purchase-orders/detail/types';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { receivablePos } from '../../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { dueDateFor, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { buildGrContext, linesFromPo } from '../../goods-receipts/detail/types';
import { CopyPanel } from '../../shared/CopyPanel';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { dpiDoc } from './dpiDoc';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { VendorCard } from '../../shared/VendorCard';
import { VendorDetailsPanel } from '../../shared/VendorDetailsPanel';
import { receivingVendorAddressFields } from '../../shared/vendorAddresses';
import { ReferencesTable } from '../../shared/ReferencesTable';
import { DPI_LIST_PATH, DPI_NOUN, DPI_STATUS_INTENT, PAYMENT_LIST_PATH } from '../../paths';
import { type DpiDraft as Draft, type DpiMasters as Masters } from './types';
import { DpiDocumentCard } from './DpiDocumentCard';
import { DpiAccountingCard } from './DpiAccountingCard';
import { DpiTotalsCard } from './DpiTotalsCard';

type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];
const ALL_CURRENCIES = 'All currencies';

function validate(d: Draft, fx: number, m: Masters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.shipTo, 'logistics', 'shipTo', 'Ship to is required.');
  need(d.dpmPct > 0 && d.dpmPct <= 100, 'header', 'dpmPct', 'DPM % must be more than 0 and at most 100.');
  need(d.downPaymentAccount, 'accounting', 'downPaymentAccount', 'Pick the down payment account.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a purchase order.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
  }
  return problems;
}

export function DpiDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <DpiForm key={id === 'new' ? location.key : id} />;
}

function DpiForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fromPo?: string } | null;

  const dpiApproved = !needsApproval('DPI');
  const [draft, setDraft] = useState<Draft | null | undefined>(
    isNew ? { ...blankDownPaymentInvoice(todayISO(), CURRENT_USER_ID), approved: dpiApproved } : undefined,
  );
  const [m, setM] = useState<Masters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${DPI_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [copying, setCopying] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      listPartnersByRole('vendor'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(),
      withholdingTaxes.list(), withholdingGroups.list(), currencies.list(), exchangeRates.list(), loadCurrentCompany(), listPurchaseOrders(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders]) => {
      const masters: Masters = { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, accounts: inv.accounts };
      setM(masters);
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && po) {
        const vendor = vendors.find((v) => v.id === po.vendorId);
        setDraft((d) => d && withPo({ ...d, ...vendorDefaults(vendor, d, masters), lines: [] }, po, toDpiLines(po, po.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) || l.quantity })), masters)));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getDownPaymentInvoice(id).then((d) => !cancelled && setDraft(d ?? null));
    listDownPaymentInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, dpiNumber)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${DPI_NOUN.one}` : draft.status !== 'Draft' ? dpiNumber(draft) : `Draft ${DPI_NOUN.one}`) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading down payment invoice…</Text>;
  if (draft === null) return <NotFound icon="receipt_long" title="Down payment invoice not found" backTo={DPI_LIST_PATH} backLabel="Back to down payment invoices" />;

  const ctx = buildGrContext(draft, m);
  const { vendor, fx } = ctx;
  const added = draft.status !== 'Draft';
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? dpiNumber(draft as DownPaymentInvoice) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = dpiTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const balance = Math.round((totals.total - draft.appliedAmount) * 100) / 100;
  const code = draft.currency;
  const orders = draft.vendorId ? receivablePos(m.orders, draft.vendorId).filter((po) => !ctx.based || po.currency === code) : [];
  const journal = fx ? dpiJournal(draft, fx, ctx.rateOf) : [];

  const retax = (lines: Draft['lines'], v: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, v, m, date) : '';
    });

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if (!added && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, vendor, next.postingDate);
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    if (patch.lines) next.orderNumber = [...new Set(next.lines.filter((l) => l.baseType).map((l) => l.baseDocNo))].join(', ');
    setDraft(next);
  };

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? { ...vendorDefaults(v, draft, m), lines: retax(draft.lines.filter((l) => !l.baseType), v, draft.postingDate) } : { vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
  };

  const sectionProps = { draft, update, errors, m, ctx };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveDpiRemarks(draft as DownPaymentInvoice, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(DPI_LIST_PATH, { state: { notice: `Down payment invoice ${dpiNumber(saved)} saved.` } });
      } finally { setSaving(false); }
      return;
    }
    const doc: Draft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, fx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = effectiveDraft ? await saveDpiDraft(doc) : await addDownPaymentInvoice(doc, fx);
      // GL posting: Dr Advances to Suppliers / Cr A/P Control.
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
      navigate(DPI_LIST_PATH, {
        state: { notice: effectiveDraft ? `Draft saved — ${saved.vendorName}.` : saved.status === 'Not Confirmed' ? `Down payment invoice ${dpiNumber(saved)} submitted for approval.` : `Down payment invoice ${dpiNumber(saved)} added — ${code} ${formatAmount(totals.total)} to pay ${saved.vendorName}.` },
      });
    } finally { setSaving(false); }
  };

  const saved = draft as DownPaymentInvoice;
  const act = async (run: () => Promise<DownPaymentInvoice>, notice: string) => {
    try {
      const d = await run();
      navigate(DPI_LIST_PATH, { state: { notice: `Down payment invoice ${dpiNumber(d)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  const cancelIt = () => act(async () => { const d = await cancelDownPaymentInvoice(saved); await reverseDocumentEntry(saved.id); return d; }, 'cancelled');
  const closeIt = () => act(() => closeDownPaymentInvoice(saved), 'closed');
  const recallIt = () => act(() => recallDownPaymentInvoice(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => { await logRejection('APDPI', saved.id, saved.vendorId, rejectionReason); await recallDownPaymentInvoice(saved); navigate(DPI_LIST_PATH, { state: { notice: `Down payment invoice ${dpiNumber(saved)} rejected.` } }); };
  const statusMoves: Partial<Record<DpiStatus, () => void>> =
    draft.status === 'Draft' ? (draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) })
    : draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) }
    : draft.status === 'Open' ? { Closed: closeIt, ...(!draft.appliedAmount ? { Cancelled: cancelIt } : {}) }
    : {};

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Pay', icon: 'payments', onSelect: () => navigate(`${PAYMENT_LIST_PATH}/new`, { state: { vendorId: draft.vendorId, invoiceIds: [saved.id] } }) }]
      : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: `Cancel ${DPI_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const title = isNew ? `New ${DPI_NOUN.one}` : added ? dpiNumber(draft) : `Draft ${DPI_NOUN.one}`;

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="receipt_long"
            parent={{ noun: DPI_NOUN, to: DPI_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />}
            status={isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={DPI_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {added && draft.appliedAmount ? <Badge size="small" intent={balance > 0 ? 'warning' : 'success'} variant="outline">{balance > 0 ? 'Partly paid' : 'Paid'}</Badge> : null}
              </div>
            )}
            actions={
              <DetailActions
                noun={DPI_NOUN}
                listPath={DPI_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('DPI') })}
                needsApproval={!draft.approved}
                remarksOnly={added}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: DPI_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="APDPI" id={draft.id} notes="The PO it's for, the payments that paid it, and the A/P invoices that drew it." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body><ActivityTab target={{ kind: 'APDPI', id: draft.id ?? '' }} partnerId={draft.vendorId} /></Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {reject.alert('Reject down payment invoice', rejectIt)}
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? (balance > 0 ? `${code} ${formatAmount(balance)} still to pay` : `Paid — ${code} ${formatAmount(drawableAmount(saved))} left to draw`) : `This invoice is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? balance > 0
                      ? 'Pay it from Outgoing Payments. The GL entry was posted when this invoice was added.'
                      : 'Draw it on the A/P invoice that bills the goods: the invoice\'s Total down payment.'
                    : 'Only remarks, the payment block and the payment run flag can change.'}
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
                    pickVendor={pickVendor}
                    onOpenDetails={() => setVendorDetailsOpen(true)}
                  />
                  <DocLines {...dpiDoc({ ...sectionProps, onCopyClick: () => setCopying(true), canCopy: orders.length > 0 })} />
                  <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this invoice refers to, e.g. the vendor's proforma invoice." />
                  <AttachmentsCard attachments={draft.attachments ?? []} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's proforma or billing documents." />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-4">
                  <DpiDocumentCard {...sectionProps} statusMoves={statusMoves} />
                  <DpiAccountingCard {...sectionProps} ctx={ctx} m={m} />
                  <DpiTotalsCard {...sectionProps} />
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
        vendorRefHint="The vendor's proforma or billing no."
        currency={{ disabled: ctx.readOnly || ctx.based, tooltip: undefined, error: errors.currency }}
        addresses={ctx.vendor ? receivingVendorAddressFields(m, ctx.vendor, { shipPlaceholder: 'Where the goods will be received', payPlaceholder: 'Vendor address for payment' }) : []}
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'PO' as const,
                  label: 'Purchase orders',
                  totalHeader: 'Ordered',
                  qtyHeader: 'Invoice on',
                  hint: "The advance is figured on these lines. The PO's quantities don't change.",
                  docs: orders.map((po) => ({
                    id: po.id,
                    label: `PO ${poNumber(po)}`,
                    description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency}`,
                    lines: po.lines.filter((l) => l.status === 'Open').map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) || l.quantity })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const po = orders.find((p) => p.id === docId)!;
                setDraft(withPo(draft, po, toDpiLines(po, picks, m)));
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function toDpiLines(po: PurchaseOrder, picks: { lineId: string; qty: number }[], m: Masters): DpiLine[] {
  return linesFromPo(po, picks, m).map((l) => {
    const { invoicedQty: _i, returnedQty: _r, unitCostLc: _c, id: _id, ...line } = l;
    const pl = po.lines.find((x) => x.id === l.baseLineId);
    const qty = picks.find((p) => p.lineId === l.baseLineId)?.qty ?? l.quantity;
    return newDpiLine({ ...line, quantity: qty, baseType: 'PO', warehouse: '', binId: '', unitCostLc: 0, bpCatalogNo: pl?.bpCatalogNo ?? '', countryOfOriginCode: l.countryOfOriginCode ?? m.items.find((x) => x.id === l.itemId)?.countryOfOriginCode ?? '', warrantyTemplateId: l.warrantyTemplateId ?? m.items.find((x) => x.id === l.itemId)?.warrantyTemplate ?? '' });
  });
}

function vendorDefaults(v: Partner | undefined, d: Draft, m: Masters): Partial<Draft> {
  if (!v) return {};
  const bill = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
  return {
    vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId,
    currency: v.currency === ALL_CURRENCIES ? 'PHP' : v.currency,
    paymentTermId: v.vendorPaymentTermId, paymentMethod: v.defaultPaymentMethod,
    dueDate: dueDateFor(d.postingDate, v.vendorPaymentTermId),
    projectId: v.projectId, shippingType: v.shippingType,
    journalRemark: defaultJournalRemark('down-payment-invoices', { entityCode: v.code, entityName: v.name }),
    payTo: bill ? formatAddress(bill, v.name) : '',
    shipTo: d.shipTo || formatAddress(m.company.address, m.company.name),
    downPaymentAccount: v.downPaymentClearingAccount || ADVANCES_TO_SUPPLIERS,
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

function withPo(d: Draft, po: PurchaseOrder, lines: DpiLine[]): Draft {
  const first = !d.lines.some((l) => l.baseType);
  const all = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first ? { currency: po.currency, contactId: po.contactId || d.contactId, paymentTermId: po.paymentTermId || d.paymentTermId, projectId: po.projectId || d.projectId, discountPct: po.discountPct, buyerId: po.buyerId || d.buyerId, shipTo: po.shipTo || d.shipTo } : {}),
    orderNumber: [...new Set(all.filter((l) => l.baseType).map((l) => l.baseDocNo))].join(', '),
    lines: all,
  };
}
