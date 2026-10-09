import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Combobox,
  Form,
  FormField,
  IconButton,
  List,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../components/form/AccountField';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, Flags, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { StatusField } from '../../../components/form/StatusField';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../mocks/address';
import { ADVANCES_TO_SUPPLIERS, DPR_SERIES, DPR_STATUSES, blankDownPaymentRequest, newDprLine, type DownPaymentRequest, type DprLine, type DprStatus } from '../../../mocks/apDownPayments';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { Attachment } from '../../../mocks/common';
import { CURRENT_USER_ID } from '../../../mocks/common';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS, type PurchaseOrder } from '../../../mocks/purchaseOrders';
import {
  addDownPayment,
  cancelDownPayment,
  closeDownPayment,
  dprNumber,
  dprTotals,
  drawableAmount,
  getDownPayment,
  listDownPayments,
  saveDprDraft,
  saveDprRemarks,
} from '../../../services/apDownPayments';
import { loadCurrentCompany } from '../../../services/companies';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { receivablePos } from '../../../services/goodsReceipts';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import { dueDateFor, listPurchaseOrders, openQty, poNumber } from '../../../services/purchaseOrders';
import { paymentTermDef, projectDef, salesEmployeeDef } from '../../settings/masterDefs';
import { ReferencesTable } from '../orders/detail/AccountingTab';
import { TotalNote, TotalRow } from '../orders/detail/PurchaseOrderDetail';
import type { PoMasters } from '../orders/detail/types';
import { GrLogistics } from '../receipts/detail/GrSections';
import { buildGrContext, linesFromPo } from '../receipts/detail/types';
import { CopyPanel } from '../shared/CopyPanel';
import { DocumentFlow } from '../shared/DocumentFlow';
import { DprLines } from './DprLines';

export const DPR_LIST_PATH = '/purchasing/bills/down-payment-requests';

export const DPR_STATUS_INTENT: Record<DprStatus, 'default' | 'primary' | 'success' | 'danger'> = { Draft: 'default', Open: 'primary', Closed: 'success', Cancelled: 'danger' };

/** The request's attachments: kept on the remarks side, since attachments aren't on the shared base type. */
type Draft = Omit<DownPaymentRequest, 'id'> & { id?: string; attachments?: Attachment[] };
type TabId = 'contents' | 'logistics' | 'accounting';
interface Masters extends PoMasters {
  orders: PurchaseOrder[];
  accounts: Account[];
}

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];
const ALL_CURRENCIES = 'All currencies';
const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

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

export function DprDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <DprForm key={id === 'new' ? location.key : id} />;
}

function DprForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromPo?: string } | null;

  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? blankDownPaymentRequest(todayISO(), CURRENT_USER_ID) : undefined);
  const [m, setM] = useState<Masters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    Promise.all([
      listPartnersByRole('vendor'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(),
      withholdingTaxes.list(), withholdingGroups.list(), currencies.list(), exchangeRates.list(), loadCurrentCompany(), listPurchaseOrders(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders]) => {
      const masters: Masters = { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, accounts: inv.accounts };
      setM(masters);
      // Copy to › A/P Down Payment Request from a PO: every open line.
      const po = state?.fromPo ? orders.find((o) => o.id === state.fromPo) : undefined;
      if (isNew && po) {
        const vendor = vendors.find((v) => v.id === po.vendorId);
        setDraft((d) => d && withPo({ ...d, ...vendorDefaults(vendor, d, masters), lines: [] }, po, toDprLines(po, po.lines.filter((l) => l.status === 'Open').map((l) => ({ lineId: l.id, qty: openQty(l) || l.quantity })), masters)));
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getDownPayment(id).then((d) => !cancelled && setDraft(d ?? null));
    listDownPayments().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((d) => d.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading down payment request…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="savings" title="Down payment request not found" />
        <Panel.Body>
          <Button onClick={() => navigate(DPR_LIST_PATH)}>Back to down payment requests</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const ctx = buildGrContext(draft, m);
  const { vendor, fx } = ctx;
  const added = draft.status !== 'Draft';
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = dprTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const balance = Math.round((totals.total - draft.appliedAmount) * 100) / 100;
  const code = draft.currency;
  const orders = draft.vendorId ? receivablePos(m.orders, draft.vendorId).filter((po) => !ctx.based || po.currency === code) : [];

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    if (patch.lines) next.orderNumber = [...new Set(next.lines.filter((l) => l.baseType).map((l) => l.baseDocNo))].join(', ');
    setDraft(next);
  };
  const h = bind(draft, update);

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? { ...vendorDefaults(v, draft, m), lines: draft.lines.filter((l) => !l.baseType) } : { vendorId: '', vendorCode: '', vendorName: '', contactId: '' });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await saveDprRemarks(draft as DownPaymentRequest, { remarks: draft.remarks, paymentBlock: draft.paymentBlock, paymentOrderRun: draft.paymentOrderRun });
        navigate(DPR_LIST_PATH, { state: { notice: `Down payment request ${dprNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const found = validate(draft, fx, m, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = asDraft ? await saveDprDraft(draft) : await addDownPayment(draft, fx);
      navigate(DPR_LIST_PATH, {
        state: { notice: asDraft ? `Draft saved — ${saved.vendorName}.` : `Down payment request ${dprNumber(saved)} added — ${code} ${formatAmount(totals.total)} to pay ${saved.vendorName}. Pay it from Payments Made.` },
      });
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as DownPaymentRequest;
  const act = async (run: () => Promise<DownPaymentRequest>, notice: string) => {
    try {
      const d = await run();
      navigate(DPR_LIST_PATH, { state: { notice: `Down payment request ${dprNumber(d)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const cancelIt = () => act(() => cancelDownPayment(saved), 'cancelled');
  const closeIt = () => act(() => closeDownPayment(saved), 'closed');
  // What picking each status in the Status dropdown does; the others can't be reached from here.
  const statusMoves: Partial<Record<DprStatus, () => void>> = draft.status === 'Draft' ? { Open: () => submit(null) } : draft.status === 'Open' ? { Closed: closeIt, ...(!draft.appliedAmount ? { Cancelled: cancelIt } : {}) } : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' && balance > 0 && !draft.paymentBlock
      ? [{ label: 'Pay', icon: 'payments', onSelect: () => navigate('/purchasing/payments-made/new', { state: { vendorId: draft.vendorId, invoiceIds: [saved.id] } }) }]
      : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: 'Cancel request', icon: 'cancel', onSelect: cancelIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...bases.map((l) => ({ label: `Open PO ${l.baseDocNo}`, icon: 'receipt_long', onSelect: () => navigate(`/purchasing/purchase-orders/${l.baseId}`) })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New A/P down payment request' : added ? dprNumber(draft) : 'Draft down payment request';

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="savings"
            title={title}
            subcopy={draft.vendorName ? `${draft.vendorCode} · ${draft.vendorName}${draft.vendorRef ? ` · ${draft.vendorRef}` : ''}` : 'Request an advance a vendor asks for before delivering.'}
            leading={
              isNew ? undefined : (
                <>
                  <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${DPR_LIST_PATH}/${nextId}`)}>{panelHeaderIcons.arrowDownward}</IconButton>
                  <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${DPR_LIST_PATH}/${prevId}`)}>{panelHeaderIcons.arrowUpward}</IconButton>
                </>
              )
            }
            tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
            status={
              isNew ? undefined : (
                <div className="flex gap-1">
                  <Badge size="small" intent={DPR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                  {added && draft.appliedAmount ? <Badge size="small" intent={balance > 0 ? 'warning' : 'success'} variant="outline">{balance > 0 ? 'Partly paid' : 'Paid'}</Badge> : null}
                </div>
              )
            }
            actions={
              <>
                <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(DPR_LIST_PATH)}>{added ? 'Back' : 'Cancel'}</Button>
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>{saving ? 'Saving…' : added ? 'Save' : 'Add'}</Button>
              </>
            }
          />
          {page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <DocumentFlow kind="DPR" id={draft.id} notes="Everything linked to this request: the PO it's for, the payments that paid it, and the A/P invoices that drew it." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body><Text variant="small" tone="muted" className="p-4">Activity will show here.</Text></Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', logistics: 'Logistics', accounting: 'Accounting' })[t]} />
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? (balance > 0 ? `${code} ${formatAmount(balance)} still to pay` : `Paid — ${code} ${formatAmount(drawableAmount(saved))} left to draw`) : `This request is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? balance > 0
                      ? 'Pay it from Payments Made (or You can also › Pay). Nothing posts until it’s paid.'
                      : 'Draw it on the A/P invoice that bills the goods: the invoice’s Total down payment.'
                    : 'Only remarks, the payment block and the payment run flag can change.'}
                </Alert>
              ) : null}

              <fieldset disabled={added} className="contents">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <Section icon="storefront" title="Vendor">
                    <Fields>
                      <div className="md:col-span-2">
                        {vendor && (added || ctx.based) ? (
                          <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${code}`} />
                        ) : (
                          <FormField label="Vendor" required error={errors.vendorId}>
                            {(p) => (
                              <Combobox {...p} placeholder="Search vendors" options={m.vendors.filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))} value={draft.vendorId || null} onValueChange={pickVendor} />
                            )}
                          </FormField>
                        )}
                      </div>
                      {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !vendor })}
                      {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's proforma or billing no." })}
                      <FormField label="Currency" required error={errors.currency} className="md:col-span-2">
                        {(p) => <Select {...p} disabled={added || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={code} onValueChange={(currency) => update({ currency })} />}
                      </FormField>
                    </Fields>
                  </Section>
                  <Section icon="tag" title="Document">
                    <Fields>
                      <FormField label="No.">
                        {(p) => (
                          <div className="flex gap-1">
                            <Select aria-label="Series" className="w-40" disabled={added} options={DPR_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                            <TextField {...p} className="flex-1" readOnly placeholder="Next number" value={draft.docNum ? String(draft.docNum) : ''} />
                          </div>
                        )}
                      </FormField>
                      <StatusField statuses={DPR_STATUSES} intents={DPR_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open until drawn in full on A/P invoices, or closed by hand." error={errors.status} />
                      {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                      {h.date('dueDate', 'Due date', { hint: 'When the vendor wants the advance, from the payment terms.' })}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                      <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
                    </Fields>
                  </Section>
                </div>

                <DprLines lines={draft.lines} onChange={(lines) => update({ lines })} errors={errors} m={m} ctx={ctx} currency={code} postingDate={draft.postingDate} vendorId={draft.vendorId} onCopy={() => setCopying(true)} canCopy={orders.length > 0} />

                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  <GrLogistics draft={draft} update={update} m={m} ctx={ctx} />
                  <Section icon="account_balance" title="Accounting">
                    <Fields>
                      {h.text('journalRemark', 'Journal remark', { hint: 'Used on the payment that pays it.' })}
                      <AccountField label="Down payment account" role="downPaymentClearing" value={draft.downPaymentAccount} onChange={(downPaymentAccount) => update({ downPaymentAccount })} accounts={m.accounts} required error={errors.downPaymentAccount} disabled={added} hint="Where the advance sits once paid: the vendor's down payment account, else Advances to Suppliers." />
                      {h.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Sets the due date.' })}
                      {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
                      <ReadOnly label="Installments" value={String(draft.installments)} />
                      {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
                      {h.master('projectId', 'BP project', projectDef, { clearable: true })}
                      {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
                      <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
                      <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO the lines were copied from." />
                    </Fields>
                    <Flags>{h.check('paymentBlock', 'Payment block')}</Flags>
                  </Section>
                </div>
                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this request refers to, e.g. the vendor's proforma invoice." />
              </fieldset>

              <Section icon="functions" title="Totals">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Fields cols={1}>
                    <fieldset disabled={added} className="contents">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {h.master('buyerId', 'Buyer', salesEmployeeDef)}
                        {h.master('ownerId', 'Owner', salesEmployeeDef)}
                        {h.num('dpmPct', 'DPM %', { required: true, suffix: '%', error: errors.dpmPct, hint: 'The share of the order requested up front.' })}
                      </div>
                    </fieldset>
                    <Flags>{h.check('paymentOrderRun', 'Include in payment runs (Payment Order Run)')}</Flags>
                    {h.area('remarks', 'Remarks', { rows: 3 })}
                  </Fields>
                  <fieldset disabled={added} className="contents">
                    <List.Group divider>
                      <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
                      <TotalRow label="Discount" value={totals.discount ? -totals.discount : 0} code={code} input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />} />
                      <TotalRow label={`Down payment (${draft.dpmPct}%)`} value={totals.dpm} code={code} />
                      <TotalRow label="Tax" value={totals.tax} code={code} />
                      {totals.reverseCharge ? <TotalNote>VAT of {code} {formatAmount(totals.reverseCharge)} isn't paid to the vendor (reverse charge or import VAT).</TotalNote> : null}
                      <TotalRow label="Total payment due" value={totals.total} code={code} strong />
                      <TotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
                      <TotalRow label="Balance due" value={balance} code={code} strong />
                      {added && draft.appliedAmount ? <TotalNote>Drawn on A/P invoices: {code} {formatAmount(draft.drawnAmount)} of {formatAmount(draft.appliedAmount)} paid.</TotalNote> : null}
                    </List.Group>
                  </fieldset>
                </div>
              </Section>
              <AttachmentsCard attachments={draft.attachments ?? []} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the vendor's proforma invoice or quotation." />
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'PO' as const,
                  label: 'Purchase orders',
                  totalHeader: 'Ordered',
                  qtyHeader: 'Request on',
                  hint: "The advance is figured on these lines. The PO's quantities don't change.",
                  docs: orders.map((po) => ({
                    id: po.id,
                    label: `PO ${poNumber(po)}`,
                    description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency}`,
                    lines: po.lines.filter((l) => l.status === 'Open').map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) || l.quantity })),
                  })),
                },
              ]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const po = orders.find((p) => p.id === docId)!;
                setDraft(withPo(draft, po, toDprLines(po, picks, m)));
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** PO lines as request lines (the copy doesn't consume the PO's quantities). */
function toDprLines(po: PurchaseOrder, picks: { lineId: string; qty: number }[], m: Masters): DprLine[] {
  // linesFromPo caps at the open quantity; a request may cover the whole order, so take the picked quantity.
  return linesFromPo(po, picks, m).map((l) => {
    const { invoicedQty: _i, returnedQty: _r, unitCostLc: _c, id: _id, ...line } = l;
    const pl = po.lines.find((x) => x.id === l.baseLineId);
    const qty = picks.find((p) => p.lineId === l.baseLineId)?.qty ?? l.quantity;
    return newDprLine({ ...line, quantity: qty, baseType: 'PO', warehouse: '', binId: '', unitCostLc: 0, bpCatalogNo: pl?.bpCatalogNo ?? '', countryOfOriginCode: m.items.find((x) => x.id === l.itemId)?.countryOfOriginCode ?? '' });
  });
}

function vendorDefaults(v: Partner | undefined, d: Draft, m: Masters): Partial<Draft> {
  if (!v) return {};
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
    journalRemark: `A/P Down Payment – ${v.code}`,
    payTo: bill ? formatAddress(bill, v.name) : '',
    shipTo: d.shipTo || formatAddress(m.company.address, m.company.name),
    downPaymentAccount: v.downPaymentClearingAccount || ADVANCES_TO_SUPPLIERS,
    controlAccount: v.payableAccount || '2010',
    paymentBlock: v.paymentBlock,
  };
}

function withPo(d: Draft, po: PurchaseOrder, lines: DprLine[]): Draft {
  const first = !d.lines.some((l) => l.baseType);
  const all = [...d.lines.filter((l) => l.itemId), ...lines];
  return {
    ...d,
    ...(first
      ? { currency: po.currency, contactId: po.contactId || d.contactId, paymentTermId: po.paymentTermId || d.paymentTermId, projectId: po.projectId || d.projectId, discountPct: po.discountPct, buyerId: po.buyerId || d.buyerId, shipTo: po.shipTo || d.shipTo }
      : {}),
    orderNumber: [...new Set(all.filter((l) => l.baseType).map((l) => l.baseDocNo))].join(', '),
    lines: all,
  };
}
