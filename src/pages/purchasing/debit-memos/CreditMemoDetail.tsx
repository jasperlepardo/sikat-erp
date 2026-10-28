import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Form,
  Panel,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { type Errors } from '../../../components/form/fields';
import { type MoreMenuItem } from '../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../components/form/DetailActions';
import { isApprover, needsApproval } from '../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import { blankCreditMemo, type ApCreditMemo, type MemoLine, type MemoStatus } from '../../../mocks/apCreditMemos';
import type { ApInvoice } from '../../../mocks/apInvoices';
import type { GoodsReturn } from '../../../mocks/goodsReturns';
import { CURRENT_USER_ID } from '../../../mocks/common';
import type { Partner } from '../../../mocks/partners';
import { logRejection } from '../../../services/approvalRules';
import { apNumber, returnableQty } from '../../../services/apInvoices';
import {
  MemoPostError,
  addCreditMemo,
  applyCredit,
  baseInvoiceIds,
  cancelCreditMemo,
  getCreditMemo,
  listCreditMemos,
  memoJournal,
  memoNumber,
  memoTotals,
  netCredit,
  recallCreditMemo,
  saveMemoDraft,
  saveMemoRemarks,
  sendsStock,
  type InvoiceBalances,
} from '../../../services/apCreditMemos';
import { formatDate, todayISO } from '../../../services/dates';
import { recalcLineTaxes } from '../../../services/taxRecalc';
import { proposedTaxCode } from '../purchase-orders/detail/types';
import { defaultJournalRemark } from '../../../services/journalPatterns';
import { formatAmount } from '../../../services/format';
import { creditableReturns, returnNumber, returnOpenQty } from '../../../services/goodsReturns';
import { isValidToday } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { dueDateFor } from '../../../services/purchaseOrders';
import { docWithholding } from '../../../services/withholding';
import { buildGrContext } from '../goods-receipts/detail/types';
import { CopyPanel } from '../shared/CopyPanel';
import { invoiceBalance } from '../payments-made/detail/types';
import { loadRetMasters, vendorAddressOptions, type RetMasters, memoFromInvoice, memoFromReturn } from '../shared/returnsTypes';
import { memoDoc } from './detail/memoDoc';
import { DocLines } from '../../../components/form/docLines/DocLines';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../components/form/DetailNav';
import { DocumentFlow } from '../shared/DocumentFlow';
import { ActivityTab } from '../../../components/activity/ActivityTab';
import { useDocTitle } from '../../../services/useDocTitle';
import { VendorCard } from '../shared/VendorCard';
import { VendorDetailsPanel } from '../shared/VendorDetailsPanel';
import { CmDocumentCard } from './detail/CmDocumentCard';
import { CmTotalsCard } from './detail/CmTotalsCard';
import { CmJournalCard } from './detail/CmJournalCard';
import { ApplyCreditPanel } from './detail/ApplyCreditPanel';
import { CmLogisticsCard } from './detail/CmLogisticsCard';
import { CmAccountingCard } from './detail/CmAccountingCard';
import { ReferencesTable } from '../shared/ReferencesTable';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { MEMO_LIST_PATH, MEMO_NOUN, MEMO_STATUS_INTENT } from '../paths';
import { round2 } from '../../../services/num';

type Draft = Omit<ApCreditMemo, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const ALL_CURRENCIES = 'All currencies';

/** Invoices open to credit or return against: added, not cancelled. */
const creditableInvoices = (m: RetMasters, vendorId: string) => m.invoices.filter((i) => i.vendorId === vendorId && (i.status === 'Open' || i.status === 'Closed'));

function validate(d: Draft, fx: number, m: RetMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from an A/P invoice or goods return.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (sendsStock(l, m.items)) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods leave from.`);
      const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      need(have >= l.quantity * l.itemsPerUnit, 'contents', `line:${l.id}:quantity`, `${n}: ${l.warehouse} has ${have} ${item.inventoryUom} of ${item.itemNo}.`);
    }
    if (l.baseType === 'APINV') {
      const il = m.invoices.find((x) => x.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
      const open = il ? (l.returnGoods ? returnableQty(il) : il.quantity) : 0;
      need(l.quantity <= open, 'contents', `line:${l.id}:quantity`, `${n}: ${l.returnGoods ? 'returning' : 'crediting'} ${l.quantity}, but invoice ${l.baseDocNo} has ${open} ${l.returnGoods ? 'left to return' : 'billed'}.`);
    }
    if (l.baseType === 'GRET') {
      const r = m.returns.find((x) => x.id === l.baseId);
      const rl = r?.lines.find((x) => x.id === l.baseLineId);
      const open = r && rl ? returnOpenQty(rl, r) : 0;
      need(l.quantity <= open, 'contents', `line:${l.id}:quantity`, `${n}: crediting ${l.quantity}, but return ${l.baseDocNo} has ${open} left to credit.`);
    }
  }
  return problems;
}

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export function CreditMemoDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <CreditMemoForm key={id === 'new' ? location.key : id} />;
}

function CreditMemoForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fromInvoice?: string; fromReturn?: string } | null;

  const cmApproved = !needsApproval('CM');
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? { ...blankCreditMemo(todayISO(), CURRENT_USER_ID), approved: cmApproved } : undefined);
  const [m, setM] = useState<RetMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [copying, setCopying] = useState(false);
  const [applying, setApplying] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  // Tab state (hook) must stay above the loading/not-found early returns — rules of hooks.
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${MEMO_LIST_PATH}/${id}`, tabParam);

  useEffect(() => {
    loadRetMasters().then((masters) => {
      setM(masters);
      const inv = state?.fromInvoice ? masters.invoices.find((i) => i.id === state.fromInvoice) : undefined;
      const ret = state?.fromReturn ? masters.returns.find((r) => r.id === state.fromReturn) : undefined;
      if (isNew && (inv || ret)) {
        const vendor = masters.vendors.find((v) => v.id === (inv ?? ret)!.vendorId);
        const lines = inv
          ? memoFromInvoice(inv, inv.lines.map((l) => ({ lineId: l.id, qty: l.quantity })), masters.items)
          : memoFromReturn(ret!, ret!.lines.map((l) => ({ lineId: l.id, qty: returnOpenQty(l, ret!) })).filter((p) => p.qty > 0), masters.items);
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, inv ?? ret!, lines));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getCreditMemo(id).then((c) => !cancelled && setDraft(c ?? null));
    listCreditMemos().then((all) => !cancelled && setSiblings(siblingKeys(all, memoNumber)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${MEMO_NOUN.one}` : draft.status !== 'Draft' ? memoNumber(draft) : `Draft ${MEMO_NOUN.one}`) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/P credit memo…</Text>;
  if (draft === null) return <NotFound icon="receipt" title="A/P credit memo not found" backTo={MEMO_LIST_PATH} backLabel="Back to credit memos" />;

  const base = buildGrContext(draft, m);
  const added = draft.status !== 'Draft';
  const baseInvoice = m.invoices.find((i) => baseInvoiceIds(draft).includes(i.id));
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : baseInvoice ? baseInvoice.fxRate : base.fx;
  const ctx = { ...base, fx, fxSource: baseInvoice && !added ? `invoice ${apNumber(baseInvoice)}'s rate` : base.fxSource };
  const { vendor } = ctx;
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? memoNumber(draft as ApCreditMemo) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = memoTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const withholding = docWithholding(draft, vendor, m.items, m.tax, draft.postingDate);
  const credit = netCredit(totals.total, withholding, draft.downPayment);
  const openBalance = round2(credit - draft.appliedAmount);
  const journal = fx ? memoJournal(draft, fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf: ctx.rateOf, withholding }) : [];
  const code = draft.currency;
  const balanceOf = (inv: ApInvoice) => invoiceBalance(inv, m);

  /** Tax codes re-proposed for the vendor and date, except ones set by hand or copied from a base document. */
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
    setDraft(next);
  };

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? { ...vendorDefaults(v, draft), lines: retax(draft.lines.filter((l) => !l.baseType), v, draft.postingDate) } : { vendorId: '', vendorCode: '', vendorName: '', contactId: '', shipTo: '', payTo: '' });
  };

  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === code) : docs);
  const invoices = draft.vendorId ? sameCurrency(creditableInvoices(m, draft.vendorId)) : [];
  const returns = draft.vendorId ? sameCurrency(creditableReturns(m.returns, draft.vendorId)) : [];

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveMemoRemarks(draft as ApCreditMemo, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: Draft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, fx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (effectiveDraft) {
        const saved = await saveMemoDraft(doc);
        navigate(MEMO_LIST_PATH, { state: { notice: `Draft saved — ${saved.vendorName}.` } });
        return;
      }
      const balances: InvoiceBalances = new Map(
        baseInvoiceIds(doc).flatMap((invoiceId) => {
          const inv = m.invoices.find((i) => i.id === invoiceId);
          if (!inv || inv.status !== 'Open') return [];
          const b = balanceOf(inv);
          return [[invoiceId, { docNo: apNumber(inv), balance: b.balanceDue, total: b.total }]];
        }),
      );
      const saved = await addCreditMemo(doc, fx, credit, balances);
      if (saved.status !== 'Not Confirmed') {
        await postDocumentEntry({ origin: 'PC', originNo: saved.docNum, originId: saved.id, postingDate: saved.postingDate, dueDate: saved.dueDate, remarks: saved.journalRemark, partnerId: saved.vendorId, controlAccount: saved.controlAccount, lines: journal });
      }
      const applied = saved.applications.map((a) => `${a.docNo} (${code} ${formatAmount(a.amount)})`).join(', ');
      navigate(MEMO_LIST_PATH, {
        state: {
          notice: saved.status === 'Not Confirmed' ? `A/P credit memo ${memoNumber(saved)} submitted for approval.` : `A/P credit memo ${memoNumber(saved)} added — ${code} ${formatAmount(credit)} credit${applied ? `, applied to ${applied}` : ''}${saved.status === 'Open' ? `; ${code} ${formatAmount(credit - saved.appliedAmount)} left to apply` : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof MemoPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as ApCreditMemo;
  const openInvoices = draft.vendorId ? m.invoices.filter((i) => i.vendorId === draft.vendorId && i.status === 'Open' && i.currency === code).map((inv) => ({ inv, ...balanceOf(inv) })).filter((x) => x.balanceDue > 0) : [];
  const cancelIt = async () => {
    try {
      const totalsByInvoice = new Map(saved.applications.map((a) => [a.invoiceId, balanceOf(m.invoices.find((i) => i.id === a.invoiceId)!).total]));
      const c = await cancelCreditMemo(saved, totalsByInvoice);
      await reverseDocumentEntry(saved.id);
      navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(c)} cancelled — the credit is off the invoices it was applied to.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  const recallIt = async () => { const m2 = await recallCreditMemo(saved); navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(m2)} recalled to draft.` } }); };
  const rejectIt = async (rejectionReason: string) => { await logRejection('APCM', saved.id, saved.vendorId, rejectionReason); await recallCreditMemo(saved); navigate(MEMO_LIST_PATH, { state: { notice: `A/P credit memo ${memoNumber(saved)} rejected and returned to draft.` } }); };
  const statusMoves: Partial<Record<MemoStatus, () => void>> = draft.status === 'Draft' ? (draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) }) : draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) } : draft.status === 'Open' || draft.status === 'Closed' ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && openBalance > 0 && openInvoices.length ? [{ label: 'Apply credit to an invoice', icon: 'request_quote', onSelect: () => setApplying(true) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [{ label: `Cancel ${MEMO_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }]
      : []),
  ];

  const title = isNew ? `New ${MEMO_NOUN.one}` : added ? memoNumber(draft) : `Draft ${MEMO_NOUN.one}`;
  const addressOptions = vendorAddressOptions(vendor);
  const currencyTooltip = ctx.based ? `Locked to the base documents' currency; credited at ${baseInvoice ? `invoice ${apNumber(baseInvoice)}'s rate (${baseInvoice.fxRate})` : 'the posting date rate'}.` : undefined;
  const sectionProps = { draft, update, errors, m, ctx };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="receipt"
            parent={{ noun: MEMO_NOUN, to: MEMO_LIST_PATH }}
            title={title}
            status={isNew ? undefined : <Badge size="small" intent={MEMO_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />}
            actions={
              <DetailActions
                noun={MEMO_NOUN}
                listPath={MEMO_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('CM') })}
                needsApproval={!draft.approved}
                remarksOnly={added}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: MEMO_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="APCM" id={draft.id} notes="Everything linked to this credit memo: the invoices and goods returns it credits, and back through them to receipts and purchase orders." />
            </Panel.Body>
          ) : page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'APCM', id: draft.id ?? '' }} partnerId={draft.vendorId} />
            </Panel.Body>
          ) : (
          <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {reject.alert('Reject A/P credit memo', rejectIt)}
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? `${code} ${formatAmount(openBalance)} of credit left to apply` : `This credit memo is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'Apply it to another open invoice of this vendor with More actions › Apply credit to an invoice. Only remarks, the payment block and the payment run flag can change.'
                    : 'Only remarks can change.'}
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <fieldset disabled={added} className="contents">
                    <VendorCard
                      vendors={m.vendors}
                      vendorId={draft.vendorId}
                      vendor={ctx.vendor}
                      readOnly={ctx.readOnly}
                      locked={!!ctx.vendor && (added || ctx.based)}
                      error={errors.vendorId}
                      pickVendor={pickVendor}
                      onOpenDetails={() => setVendorDetailsOpen(true)}
                    />
                  </fieldset>
                  {/* Outside the fieldset: the lines lock themselves via ctx.readOnly, and the Columns menu stays usable once added. */}
                  <DocLines {...memoDoc({ ...sectionProps, onCopyClick: () => setCopying(true), canCopy: invoices.length + returns.length > 0, totals, withholding, credit, openBalance })} />
                  <fieldset disabled={added} className="contents">
                    <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this credit memo refers to, e.g. the vendor's credit note." />
                  </fieldset>
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's credit note or debit memo." />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-4">
                  <fieldset disabled={added} className="contents">
                    <CmDocumentCard {...sectionProps} statusMoves={statusMoves} locked={added} />
                    <CmLogisticsCard {...sectionProps} addressOptions={addressOptions} />
                    <CmAccountingCard {...sectionProps} readOnly={added} />
                  </fieldset>
                  <CmTotalsCard {...sectionProps} locked={added} />
                  <CmJournalCard journal={journal} accounts={m.accounts} code={code} fx={fx} />
                </div>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'APINV' as const,
                  label: 'A/P invoices',
                  totalHeader: 'Billed',
                  qtyHeader: 'Credit',
                  hint: 'Credit billed lines: tick Return goods on a line to send the goods back, or leave it as a price adjustment.',
                  docs: invoices.map((inv: ApInvoice) => ({
                    id: inv.id,
                    label: `A/P invoice ${apNumber(inv)}`,
                    description: `Billed ${formatDate(inv.postingDate)} · ${inv.currency}${inv.vendorRef ? ` · ${inv.vendorRef}` : ''} · ${inv.status}`,
                    lines: inv.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity })),
                  })),
                },
                {
                  key: 'GRET' as const,
                  label: 'Goods returns',
                  totalHeader: 'Returned',
                  qtyHeader: 'Credit',
                  hint: 'Credit goods already sent back on a return. No stock moves — the return took it out.',
                  docs: returns.map((r: GoodsReturn) => ({
                    id: r.id,
                    label: `Return ${returnNumber(r)}`,
                    description: `Returned ${formatDate(r.postingDate)} · ${r.currency}${r.vendorRef ? ` · RMA ${r.vendorRef}` : ''}`,
                    lines: r.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: returnOpenQty(l, r) })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'APINV') {
                  const inv = invoices.find((i) => i.id === docId)!;
                  setDraft(withBase(draft, inv, memoFromInvoice(inv, picks, m.items)));
                } else {
                  const r = returns.find((x) => x.id === docId)!;
                  setDraft(withBase(draft, r, memoFromReturn(r, picks, m.items)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
      {applying
        ? createPortal(
            <ApplyCreditPanel
              code={code}
              open={openBalance}
              invoices={openInvoices.map((x) => ({ id: x.inv.id, docNo: apNumber(x.inv), dueDate: x.inv.dueDate, balance: x.balanceDue, total: x.total }))}
              onCancel={() => setApplying(false)}
              onDone={async (picks) => {
                const c = await applyCredit(saved, credit, picks);
                setApplying(false);
                navigate(MEMO_LIST_PATH, { state: { notice: `Applied ${code} ${formatAmount(picks.reduce((n, p) => n + p.amount, 0))} of credit memo ${memoNumber(c)}.` } });
              }}
            />,
            document.body,
          )
        : null}
      <VendorDetailsPanel
        draft={draft}
        update={update}
        vendor={ctx.vendor}
        currencies={m.currencies}
        readOnly={ctx.readOnly}
        open={vendorDetailsOpen}
        onClose={() => setVendorDetailsOpen(false)}
        vendorRefHint="The vendor's credit note no."
        vendorRefError={errors.vendorRef}
        currency={{ disabled: added || ctx.based, tooltip: currencyTooltip, error: errors.currency }}
        addresses={[]}
      />
    </>
  );
}

function vendorDefaults(v: Partner | undefined, d: Draft): Partial<Draft> {
  if (!v) return {};
  const ship = v.addresses.find((a) => a.id === v.defaultShipToId) ?? v.addresses[0];
  const bill = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
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
    journalRemark: defaultJournalRemark('ap-credit-memos', { entityCode: v.code, entityName: v.name }),
    shipTo: ship ? formatAddress(ship, v.name) : '',
    payTo: bill ? formatAddress(bill, v.name) : '',
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

function withBase(d: Draft, base: ApInvoice | GoodsReturn, lines: MemoLine[]): Draft {
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
          discountPct: base.discountPct,
          buyerId: base.buyerId || d.buyerId,
          controlAccount: 'controlAccount' in base && base.controlAccount ? base.controlAccount : d.controlAccount,
        }
      : {}),
    orderNumber: [...new Set([...d.orderNumber.split(', ').filter(Boolean), base.orderNumber].filter(Boolean))].join(', '),
    lines: allLines,
  };
}
