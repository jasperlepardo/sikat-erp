import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, Panel, PanelHeader, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../../mocks/address';
import { CURRENT_USER_ID } from '../../../../../mocks/common';
import type { Delivery } from '../../../../../mocks/deliveries';
import type { Partner } from '../../../../../mocks/partners';
import { blankSalesReturn, newSrLine, type SalesReturn } from '../../../../../mocks/salesReturns';
import { rateAt } from '../../../../../mocks/taxes';
import { loadCurrentCompany } from '../../../../../services/companies';
import { todayISO } from '../../../../../services/dates';
import { defaultJournalRemark } from '../../../../../services/journalPatterns';
import { dnNumber, dnOpenQty, listDeliveries } from '../../../../../services/deliveries';
import { loadInventoryMasters } from '../../../../../services/inventoryMasters';
import { listItems } from '../../../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes, rateOn } from '../../../../../services/masterData';
import { listPartnersByRole } from '../../../../../services/partners';
import { logRejection } from '../../../../../services/approvalRules';
import { getSalesSettings } from '../../../../../services/salesOrders';
import { dueDateFor } from '../../../../../services/purchaseOrders';
import {
  SrPostError,
  addSalesReturn,
  recallSalesReturn,
  cancelSalesReturn,
  getSalesReturn,
  listSalesReturns,
  saveReturnDraft,
  saveReturnRemarks,
  srJournal,
  srNumber,
  srOpenQty,
} from '../../../../../services/salesReturns';
import { SalesDocumentFlow } from '../../../shared/SalesDocumentFlow';
import { CustomerCard } from '../../../shared/CustomerCard';
import { buildDnContext, type DnDraft, type DnMasters } from '../../../deliveries/detail/types';
import { useDocTitle } from '../../../../../services/useDocTitle';
import { AR_CM_LIST_PATH, SR_LIST_PATH, SR_STATUS_INTENT, type SrContext, type SrDraft, type SrMasters } from '../../types';
import { SrLinesCard } from './SrLinesCard';
import { ReturnDatesCard } from '../../ReturnDatesCard';
import { ReturnShipmentCard } from '../../ReturnShipmentCard';
import { ReturnAssignmentCard } from '../../ReturnAssignmentCard';
import { SrCustomerDetailsPanel } from './SrCustomerDetailsPanel';
import { ActivityTab } from '../../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../../components/form/DetailNav';

type Draft = SrDraft;
type TabId = 'contents' | 'accounting';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', accounting: 'Dates' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

async function loadSrMasters(): Promise<SrMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, deliveriesAll, returnsAll] = await Promise.all([
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
    loadCurrentCompany(),
    listDeliveries(),
    listSalesReturns(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, deliveries: deliveriesAll, returns: returnsAll, accounts: inv.accounts };
}

function customerDefaults(c: Partner | undefined, d: Draft): Partial<Draft> {
  if (!c) return {};
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? c.addresses[0];
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  return {
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
    paymentTermId: c.customerPaymentTermId,
    paymentMethod: c.defaultPaymentMethod || d.paymentMethod,
    dueDate: dueDateFor(d.postingDate, c.customerPaymentTermId),
    projectId: c.projectId,
    shippingType: c.shippingType,
    federalTaxId: c.tin,
    salesEmployeeId: c.salesEmployeeId,
    journalRemark: defaultJournalRemark('sales-returns', { entityCode: c.code, entityName: c.name }),
    shipTo: ship ? formatAddress(ship, c.name) : '',
    billTo: bill ? formatAddress(bill, c.name) : '',
  };
}

function validate(d: Draft, fx: number, m: SrMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'contents', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'accounting', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'accounting', 'documentDate', 'Document date is required.');
  need(fx > 0, 'accounting', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a delivery.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    if (item.inventoryItem) {
      need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods return to.`);
    }
  }
  return problems;
}

export function SalesReturnDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <SalesReturnForm key={id === 'new' ? location.key : id} />;
}

function SalesReturnForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { fromDelivery?: string } | null;

  const srApproved = !getSalesSettings().requireSalesReturnApproval;
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? { ...blankSalesReturn(todayISO(), CURRENT_USER_ID), approved: srApproved } : undefined);
  const [m, setM] = useState<SrMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${SR_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${SR_LIST_PATH}/${id}/details`, { replace: true }); }, []);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);

  useEffect(() => {
    loadSrMasters().then((masters) => {
      setM(masters);
      if (isNew && state?.fromDelivery) {
        const dn = masters.deliveries.find((d) => d.id === state.fromDelivery);
        if (dn) {
          const customer = masters.customers.find((c) => c.id === dn.customerId);
          const lines = dn.lines
            .filter((l) => dnOpenQty(l, dn) > 0)
            .map((l) => {
              const { invoicedQty: _i, ...base } = l;
              return newSrLine({
                ...base,
                id: `srl-${crypto.randomUUID().slice(0, 8)}`,
                quantity: dnOpenQty(l, dn),
                baseType: 'DN' as const,
                baseId: dn.id,
                baseLineId: l.id,
                baseDocNo: dnNumber(dn),
                creditedQty: 0,
                returnReason: '',
              });
            });
          setDraft((d) => d && {
            ...d,
            ...customerDefaults(customer, d),
            currency: dn.currency,
            contactId: dn.contactId || (d.contactId ?? ''),
            paymentTermId: dn.paymentTermId || d.paymentTermId,
            discountPct: dn.discountPct,
            salesEmployeeId: dn.salesEmployeeId || d.salesEmployeeId,
            shipTo: dn.shipTo,
            billTo: dn.billTo,
            lines,
            orderNumber: dn.orderNumber || '',
          });
        }
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getSalesReturn(id).then((r) => !cancelled && setDraft(r ?? null));
    listSalesReturns().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((r) => r.docNum ? srNumber(r) : r.id)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New sales return' : srNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading sales return…</Text>;
  if (draft === null) return <NotFound icon="assignment_return" title="Sales return not found" backTo={SR_LIST_PATH} backLabel="Back to sales returns" />;

  const added = draft.status !== 'Draft';
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (fxRate?.rate ?? 0);
  const code = draft.currency;
  const rateOf = (taxCode: string) => {
    const c = m.tax.codes.find((x) => x.code === taxCode);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const ctx: SrContext = { ...buildDnContext(draft as unknown as DnDraft, m as unknown as DnMasters), fx, rateOf };
  const { prevId, nextId } = neighbours(siblings, (draft as SalesReturn).id && (draft.docNum ? srNumber(draft as SalesReturn) : (draft as SalesReturn).id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    setDraft(next);
  };

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    update(c ? { ...customerDefaults(c, draft), lines: draft.lines.filter((l) => !l.baseType) } : { customerId: '', customerCode: '', customerName: '', contactId: '', shipTo: '', billTo: '' });
  };

  const availableDeliveries = draft.customerId
    ? m.deliveries.filter(
        (dn) => dn.customerId === draft.customerId && dn.status === 'Open' && dn.currency === code && dn.lines.some((l) => dnOpenQty(l, dn) > 0),
      )
    : [];

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveReturnRemarks(draft as SalesReturn, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(saved)} saved.` } });
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
        const saved = await saveReturnDraft(doc);
        navigate(SR_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const saved = await addSalesReturn(doc, fx);
      if (saved.status !== 'Not Confirmed') {
        await postDocumentEntry({
          origin: 'SR',
          originNo: saved.docNum,
          originId: saved.id,
          postingDate: saved.postingDate,
          dueDate: saved.dueDate,
          remarks: saved.journalRemark,
          lines: srJournal(saved, m.items, m.inv.groups, true),
        });
      }
      navigate(SR_LIST_PATH, {
        state: {
          notice: saved.status === 'Not Confirmed' ? `Sales return ${srNumber(saved)} submitted for approval.` : `Sales return ${srNumber(saved)} added — the stock is back in.`,
        },
      });
    } catch (err) {
      if (!(err instanceof SrPostError)) throw err;
      setProblems([{ tab: 'contents', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as SalesReturn;
  const bases = [...new Map(draft.lines.filter((l) => l.baseType).map((l) => [l.baseId, l])).values()];
  const creditable = draft.status === 'Open' && draft.lines.some((l) => srOpenQty(l, draft) > 0);

  const cancelIt = async () => {
    try {
      const r = await cancelSalesReturn(saved);
      await reverseDocumentEntry(saved.id);
      navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(r)} cancelled — the stock is back out.` } });
    } catch (err) {
      setProblems([{ tab: 'contents', key: 'status', message: (err as Error).message }]);
    }
  };

  const recallIt = async () => { const r = await recallSalesReturn(saved); navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(r)} recalled to draft.` } }); };
  const rejectIt = async () => { await logRejection('SRT', saved.id, saved.customerId, rejectionReason); await recallSalesReturn(saved); navigate(SR_LIST_PATH, { state: { notice: `Sales return ${srNumber(saved)} rejected and returned to draft.` } }); };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }, { label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(creditable ? [{ label: 'Copy to A/R credit memo', icon: 'undo', onSelect: () => navigate(`${AR_CM_LIST_PATH}/new`, { state: { fromReturn: saved.id } }) }] : []),
    ...(draft.status === 'Open' && !draft.lines.some((l) => l.creditedQty > 0)
      ? [{ label: 'Cancel sales return', icon: 'cancel', onSelect: cancelIt }]
      : []),
    ...bases.map((l) => ({
      label: `Open delivery ${l.baseDocNo}`,
      icon: 'local_shipping',
      onSelect: () => navigate(`/sales/deliveries/${l.baseId}`),
    })),
  ];

  const title = isNew ? 'New sales return' : added ? srNumber(draft) : 'Draft sales return';
  const sectionProps = { draft, update, errors, m, ctx };

  const copyFromDelivery = (dn: Delivery, picks: { lineId: string; qty: number }[]) => {
    const lines = picks.map(({ lineId, qty }) => {
      const dl = dn.lines.find((l) => l.id === lineId)!;
      const { invoicedQty: _i, ...base } = dl;
      return newSrLine({
        ...base,
        id: `srl-${crypto.randomUUID().slice(0, 8)}`,
        quantity: qty,
        baseType: 'DN' as const,
        baseId: dn.id,
        baseLineId: dl.id,
        baseDocNo: dnNumber(dn),
        baseRow: dn.lines.indexOf(dl) + 1,
        creditedQty: 0,
        returnReason: '',
      });
    });
    const first = !draft.lines.some((l) => l.baseType);
    setDraft((d) => d && {
      ...d,
      ...(first ? {
        currency: dn.currency,
        contactId: dn.contactId || d.contactId,
        paymentTermId: dn.paymentTermId || d.paymentTermId,
        discountPct: dn.discountPct,
        salesEmployeeId: dn.salesEmployeeId || d.salesEmployeeId,
        shipTo: dn.shipTo,
        billTo: dn.billTo,
      } : {}),
      orderNumber: [...new Set([...(d.orderNumber ?? '').split(', ').filter(Boolean), dn.orderNumber].filter(Boolean))].join(', '),
      lines: [...d.lines.filter((l) => l.itemId), ...lines],
    });
  };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="assignment_return"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32}
            iconVariant="outline"
            breadcrumbs={[{ label: 'Sales Returns', href: SR_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(SR_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={SR_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={SR_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {added ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(SR_LIST_PATH)}>Cancel</Button>}
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && (draft as SalesReturn).id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow kind="SRT" id={(draft as SalesReturn).id} notes="Everything linked to this sales return: the deliveries it sent goods back from, and the credit memos that credited it." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'SRT', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {rejecting ? (<Alert intent="danger" variant="outline" title="Reject sales return"><div className="flex flex-col gap-2"><TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why…" /><div className="flex gap-2"><Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button><Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button></div></div></Alert>) : null}
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? 'Waiting for the customer credit' : `This sales return is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'The stock is back in. Copy the return to an A/R credit memo to give the customer their credit. Only remarks and attachments can change.'
                    : 'Only remarks and attachments can change.'}
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={added || ctx.based}
                    error={errors.customerId}
                    hint={ctx.based && !added ? 'Set by the delivery the lines come from.' : undefined}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <SrLinesCard {...sectionProps} deliveries={availableDeliveries} onCopy={copyFromDelivery} />
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RMA, photos of damage, or the courier return waybill." />
                </div>

                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <ReturnDatesCard {...sectionProps} readOnly={added} postingHint="When the stock comes back in." dueHint="When the customer credit is due." />
                  <ReturnShipmentCard draft={draft} update={update} readOnly={added} inv={m.inv} />
                  <ReturnAssignmentCard draft={draft} update={update} readOnly={added} noun="return" />
                </aside>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      <SrCustomerDetailsPanel {...sectionProps} open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} />
    </>
  );
}
