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
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../mocks/common';
import { blankGoodsReturn, needsCredit, newReturnLine, type GoodsReturn, type ReturnLine, type ReturnStatus } from '../../../mocks/goodsReturns';
import type { Partner } from '../../../mocks/partners';
import { logRejection } from '../../../services/approvalRules';
import { apNumber, returnableQty } from '../../../services/apInvoices';
import { transferBlock } from '../../../services/binLocations';
import { formatDate, todayISO } from '../../../services/dates';
import { defaultJournalRemark } from '../../../services/journalPatterns';
import { formatAddress } from '../../../mocks/address';
import { grNumber, grOpenQty } from '../../../services/goodsReceipts';
import {
  ReturnPostError,
  addGoodsReturn,
  cancelGoodsReturn,
  getGoodsReturn,
  listGoodsReturns,
  returnJournal,
  returnNumber,
  returnOpenQty,
  recallGoodsReturn,
  saveReturnDraft,
  saveReturnRemarks,
} from '../../../services/goodsReturns';
import { isValidToday } from '../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../services/journalEntries';
import { dueDateFor, getPurchasingSettings } from '../../../services/purchaseOrders';
import { buildGrContext } from '../goods-receipts/detail/types';
import { CopyPanel } from '../shared/CopyPanel';
import { DocumentFlow } from '../shared/DocumentFlow';
import { loadRetMasters, vendorAddressOptions, RETURN_STATUS_INTENT, returnFromInvoice, returnFromReceipt, MEMO_LIST_PATH, RETURN_LIST_PATH, type RetMasters, type RetContext } from '../shared/returnsTypes';
import { ReturnLines } from '../shared/ReturnLines';
import { ActivityTab } from '../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../components/form/DetailNav';
import { useDocTitle } from '../../../services/useDocTitle';
import { GrVendorCard } from './detail/GrVendorCard';
import { GrDocumentCard } from './detail/GrDocumentCard';
import { GrTotalsCard } from './detail/GrTotalsCard';
import { GrJournalCard } from './detail/GrJournalCard';
import { GrLogisticsCard } from './detail/GrLogisticsCard';
import { GrAccountingCard } from './detail/GrAccountingCard';
import { ReferencesTable } from '../shared/ReferencesTable';

type Draft = Omit<GoodsReturn, 'id'> & { id?: string };
type TabId = 'contents' | 'logistics' | 'accounting';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

function validate(d: Draft, ctx: RetContext, m: RetMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(ctx.fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.shipTo, 'logistics', 'shipTo', "Ship to is required — the vendor's return address.");
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a goods receipt or A/P invoice.');
  const byBase = new Map<string, number>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (item.inventoryItem) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods leave from.`);
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      if (wh?.binEnabled && l.binId) {
        const block = transferBlock(m.inv.bins.find((b) => b.warehouse === l.warehouse && b.id === l.binId), item, l.uomCode, 'out');
        need(!block, 'contents', `line:${l.id}:bin`, `${n}: ${block}`);
      }
      const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      need(have >= l.quantity * l.itemsPerUnit, 'contents', `line:${l.id}:quantity`, `${n}: ${l.warehouse} has ${have} ${item.inventoryUom} of ${item.itemNo}.`);
    }
    if (l.baseLineId) byBase.set(l.baseLineId, (byBase.get(l.baseLineId) ?? 0) + l.quantity);
  }
  for (const [baseLineId, qty] of byBase) {
    const l = d.lines.find((x) => x.baseLineId === baseLineId)!;
    let open = 0;
    if (l.baseType === 'GRPO') {
      const gr = m.receipts.find((r) => r.id === l.baseId);
      const gl = gr?.lines.find((x) => x.id === baseLineId);
      open = gr && gl ? grOpenQty(gl, gr) : 0;
    } else {
      const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === baseLineId);
      open = il ? returnableQty(il) : 0;
    }
    need(qty <= open, 'contents', `line:${l.id}:quantity`, `${l.itemNo}: returning ${qty} ${l.uomCode}, but ${l.baseDocNo} has only ${open} left to return.`);
  }
  return problems;
}

export function GoodsReturnDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <GoodsReturnForm key={id === 'new' ? location.key : id} />;
}

function GoodsReturnForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fromReceipt?: string; fromInvoice?: string } | null;

  const rtnApproved = !getPurchasingSettings().requireGoodsReturnApproval;
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? { ...blankGoodsReturn(todayISO(), CURRENT_USER_ID), approved: rtnApproved } : undefined);
  const [m, setM] = useState<RetMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${RETURN_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${RETURN_LIST_PATH}/${id}/details`, { replace: true, state: location.state }); }, []);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadRetMasters().then((masters) => {
      setM(masters);
      const gr = state?.fromReceipt ? masters.receipts.find((r) => r.id === state.fromReceipt) : undefined;
      const inv = state?.fromInvoice ? masters.invoices.find((i) => i.id === state.fromInvoice) : undefined;
      if (isNew && (gr || inv)) {
        const vendor = masters.vendors.find((v) => v.id === (gr ?? inv)!.vendorId);
        const lines = gr
          ? returnFromReceipt(gr, gr.lines.map((l) => ({ lineId: l.id, qty: grOpenQty(l, gr) })).filter((p) => p.qty > 0), masters.items)
          : returnFromInvoice(inv!, inv!.lines.map((l) => ({ lineId: l.id, qty: returnableQty(l) })).filter((p) => p.qty > 0 && masters.items.find((i) => i.id === inv!.lines.find((x) => x.id === p.lineId)?.itemId)?.inventoryItem));
        setDraft((d) => d && withBase({ ...d, ...vendorDefaults(vendor, d), lines: [] }, gr ?? inv!, lines));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getGoodsReturn(id).then((r) => !cancelled && setDraft(r ?? null));
    listGoodsReturns().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.docNum ? returnNumber(r) : r.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New goods return' : returnNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading goods return…</Text>;
  if (draft === null) return <NotFound icon="assignment_return" title="Goods return not found" backTo={RETURN_LIST_PATH} backLabel="Back to returns" />;

  const ctx = buildGrContext(draft, m);
  const { vendor } = ctx;
  const added = draft.status !== 'Draft';
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? returnNumber(draft as GoodsReturn) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const costed = { ...draft, lines: draft.lines.map((l) => (l.unitCostLc ? l : { ...l, unitCostLc: m.items.find((i) => i.id === l.itemId)?.itemCost ?? 0 })) };
  const journal = returnJournal(costed, m.items, m.inv.groups);
  const code = draft.currency;

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    setDraft(next);
  };

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? { ...vendorDefaults(v, draft), lines: draft.lines.filter((l) => !l.baseType) } : { vendorId: '', vendorCode: '', vendorName: '', contactId: '', shipTo: '', payTo: '' });
  };

  const receipts = draft.vendorId ? m.receipts.filter((gr) => gr.vendorId === draft.vendorId && gr.status === 'Open' && gr.lines.some((l) => grOpenQty(l, gr) > 0)) : [];
  const invoices = draft.vendorId ? m.invoices.filter((inv) => inv.vendorId === draft.vendorId && inv.status !== 'Draft' && inv.status !== 'Cancelled' && inv.lines.some((l) => returnableQty(l) > 0)) : [];
  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === code) : docs);

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveReturnRemarks(draft as GoodsReturn, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: Draft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, ctx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (effectiveDraft) {
        const saved = await saveReturnDraft(doc);
        navigate(RETURN_LIST_PATH, { state: { notice: `Draft saved — ${saved.vendorName}.` } });
        return;
      }
      const saved = await addGoodsReturn(doc);
      if (saved.status !== 'Not Confirmed') {
        await postDocumentEntry({ origin: 'RD', originNo: saved.docNum, originId: saved.id, postingDate: saved.postingDate, remarks: saved.journalRemark, lines: returnJournal(saved, m.items, m.inv.groups) });
      }
      navigate(RETURN_LIST_PATH, {
        state: {
          notice: saved.status === 'Not Confirmed' ? `Goods return ${returnNumber(saved)} submitted for approval.` : `Goods return ${returnNumber(saved)} added — the stock is out${saved.status === 'Open' ? ', and the vendor owes a credit memo for it' : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof ReturnPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as GoodsReturn;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const creditable = draft.status === 'Open' && draft.lines.some((l) => returnOpenQty(l, draft) > 0);
  const cancelIt = async () => {
    try {
      const r = await cancelGoodsReturn(saved);
      await reverseDocumentEntry(saved.id);
      navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(r)} cancelled — the stock is back in.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  const recallIt = async () => { const r = await recallGoodsReturn(saved); navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(r)} recalled to draft.` } }); };
  const rejectIt = async () => {
    await logRejection('GRET', saved.id, saved.vendorId, rejectionReason);
    await recallGoodsReturn(saved);
    navigate(RETURN_LIST_PATH, { state: { notice: `Goods return ${returnNumber(saved)} rejected and returned to draft.` } });
  };
  const statusMoves: Partial<Record<ReturnStatus, () => void>> = draft.status === 'Draft' ? (draft.approved ? { Open: () => submit(null) } : { 'Not Confirmed': () => submit(null) }) : draft.status === 'Not Confirmed' ? { Open: () => submit(null, false, { approved: true }) } : draft.status === 'Open' || draft.status === 'Closed' ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(creditable ? [{ label: 'Copy to A/P credit memo', icon: 'receipt', onSelect: () => navigate(`${MEMO_LIST_PATH}/new`, { state: { fromReturn: saved.id } }) }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed'
      ? [{ label: 'Cancel goods return', icon: 'cancel', onSelect: cancelIt }]
      : []),
    ...bases.map((l) => ({
      label: `Open ${l.baseType === 'GRPO' ? 'receipt' : 'A/P invoice'} ${l.baseDocNo}`,
      icon: l.baseType === 'GRPO' ? 'inventory' : 'request_quote',
      onSelect: () => navigate(l.baseType === 'GRPO' ? `/purchasing/goods-receipts/${l.baseId}` : `/purchasing/vendor-invoices/${l.baseId}`),
    })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New goods return' : added ? returnNumber(draft) : 'Draft goods return';
  const addressOptions = vendorAddressOptions(vendor);
  const sectionProps = { draft, update, errors, m, ctx };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="assignment_return"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32} iconVariant="outline"
            breadcrumbs={[{ label: 'Goods Returns', href: RETURN_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(RETURN_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={RETURN_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={isNew ? undefined : <Badge size="small" intent={RETURN_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {added ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(RETURN_LIST_PATH)}>Cancel</Button>}
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="GRET" id={draft.id} notes="Everything linked to this return: the receipts and invoices it sent goods back from (and their own bases), and the credit memos that credited it." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'GRET', id: draft.id ?? '' }} partnerId={draft.vendorId} />
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {rejecting ? (
                <Alert intent="danger" variant="outline" title="Reject goods return">
                  <div className="flex flex-col gap-2">
                    <TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why…" />
                    <div className="flex gap-2">
                      <Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button>
                      <Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                </Alert>
              ) : null}
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? "Waiting for the vendor's credit" : `This goods return is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'The stock is out. These goods were already billed, so the vendor owes a credit: copy the return to an A/P credit memo. Only remarks and attachments can change.'
                    : 'Only remarks and attachments can change.'}
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <fieldset disabled={added} className="contents">
                    <GrVendorCard {...sectionProps} pickVendor={pickVendor} locked={added} />
                    <ReturnLines<ReturnLine>
                      lines={draft.lines}
                      onChange={(lines) => update({ lines })}
                      errors={errors}
                      m={m}
                      ctx={ctx}
                      currency={code}
                      postingDate={draft.postingDate}
                      vendorId={draft.vendorId}
                      title="Contents"
                      description={`What goes back, in the line's unit. Stock leaves at the cost it came in at; prices are in ${code} for the vendor's credit.`}
                      empty={draft.vendorId ? 'Copy from a goods receipt (goods not yet billed) or an A/P invoice (goods already billed), or add lines.' : 'Pick a vendor first.'}
                      newLine={() => newReturnLine()}
                      sendsStock={(l) => Boolean(m.items.find((i) => i.id === l.itemId)?.inventoryItem)}
                      openHint={(l) => {
                        if (l.baseType === 'GRPO') {
                          const gr = m.receipts.find((r) => r.id === l.baseId);
                          const gl = gr?.lines.find((x) => x.id === l.baseLineId);
                          return gr && gl ? `${grOpenQty(gl, gr)} of ${gl.quantity} left on the receipt` : undefined;
                        }
                        if (l.baseType === 'APINV') {
                          const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
                          return il ? `${returnableQty(il)} of ${il.quantity} billed left to return` : undefined;
                        }
                        return needsCredit(l) && added ? `${l.creditedQty} credited` : undefined;
                      }}
                      onCopy={() => setCopying(true)}
                      canCopy={sameCurrency(receipts).length + sameCurrency(invoices).length > 0}
                    />
                    <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this return refers to, e.g. the vendor's RMA or the original receipt." />
                  </fieldset>
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RMA, photos of the damage, or the courier waybill." />
                </div>
                <div className="flex flex-col gap-2 lg:col-span-4">
                  <fieldset disabled={added} className="contents">
                    <GrDocumentCard {...sectionProps} statusMoves={statusMoves} locked={added} />
                    <GrLogisticsCard {...sectionProps} addressOptions={addressOptions} />
                    <GrAccountingCard {...sectionProps} readOnly={added} />
                  </fieldset>
                  <GrTotalsCard {...sectionProps} locked={added} />
                  <GrJournalCard journal={journal} accounts={m.accounts} />
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
                  key: 'GRPO' as const,
                  label: 'Goods receipts',
                  totalHeader: 'Received',
                  qtyHeader: 'Return',
                  hint: 'Goods not yet billed: returning them lowers what the vendor can bill. Nothing to credit.',
                  docs: sameCurrency(receipts).map((gr) => ({
                    id: gr.id,
                    label: `Receipt ${grNumber(gr)}`,
                    description: `Received ${formatDate(gr.postingDate)} · ${gr.currency}`,
                    lines: gr.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: grOpenQty(l, gr) })),
                  })),
                },
                {
                  key: 'APINV' as const,
                  label: 'A/P invoices',
                  totalHeader: 'Billed',
                  qtyHeader: 'Return',
                  hint: "Goods already billed: the return waits for the vendor's credit memo.",
                  docs: sameCurrency(invoices).map((inv) => ({
                    id: inv.id,
                    label: `A/P invoice ${apNumber(inv)}`,
                    description: `Billed ${formatDate(inv.postingDate)} · ${inv.currency}${inv.vendorRef ? ` · ${inv.vendorRef}` : ''}`,
                    lines: inv.lines.filter((l) => m.items.find((i) => i.id === l.itemId)?.inventoryItem).map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: returnableQty(l) })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'GRPO') {
                  const gr = receipts.find((r) => r.id === docId)!;
                  setDraft(withBase(draft, gr, returnFromReceipt(gr, picks, m.items)));
                } else {
                  const inv = invoices.find((i) => i.id === docId)!;
                  setDraft(withBase(draft, inv, returnFromInvoice(inv, picks)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
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
    journalRemark: defaultJournalRemark('goods-returns', { entityCode: v.code, entityName: v.name }),
    shipTo: ship ? formatAddress(ship, v.name) : '',
    payTo: bill ? formatAddress(bill, v.name) : '',
  };
}

function withBase(d: Draft, base: Parameters<typeof returnFromReceipt>[0] | Parameters<typeof returnFromInvoice>[0], lines: ReturnLine[]): Draft {
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
        }
      : {}),
    orderNumber: [...new Set([...d.orderNumber.split(', ').filter(Boolean), base.orderNumber].filter(Boolean))].join(', '),
    lines: allLines,
  };
}
