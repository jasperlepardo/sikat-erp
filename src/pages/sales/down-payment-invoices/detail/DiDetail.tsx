import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { DocumentDetailSkeleton } from '../../../../components/form/skeletons/DocumentDetailSkeleton';
import { PageHeader } from '../../../../components/form/PageHeader';
import { DetailColumns } from '../../../../components/form/DetailColumns';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { formatAddress } from '../../../../mocks/address';
import { blankArDownPaymentInvoice, CUSTOMER_DOWN_PAYMENTS, type ArDownPaymentInvoice } from '../../../../mocks/arDownPaymentInvoices';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { NO_SALES_EMPLOYEE } from '../../../../mocks/salesOrders';
import { type Partner } from '../../../../mocks/partners';
import {
  addArDownPaymentInvoice,
  cancelArDownPaymentInvoice,
  closeArDownPaymentInvoice,
  diDrawable,
  diJournal,
  diNumber,
  diTotals,
  getArDownPaymentInvoice,
  listArDownPaymentInvoices,
  recallArDownPaymentInvoice,
  saveDiDraft,
  saveDiRemarks,
} from '../../../../services/arDownPaymentInvoices';
import { customerWithholding } from '../../../../services/withholding';
import { postDocumentEntry, postingPeriodProblem, controlAccountOf, reverseDocumentEntry } from '../../../../services/journalEntries';
import { logRejection } from '../../../../services/approvalRules';
import { loadCurrentCompany } from '../../../../services/companies';
import { formatDate, todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import { proposedTaxCode, ALL_CURRENCIES } from '../../sales-orders/detail/types';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { round2 } from '../../../../services/num';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { isValidToday, listItems } from '../../../../services/items';
import { accounts, companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { listSalesOrders, openQty, soDueDate, soNumber } from '../../../../services/salesOrders';
import { termDays } from '../../../../services/purchaseOrders';
import { soSeries } from '../../../../services/allSeries';
import { CustomerCard } from '../../shared/CustomerCard';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import { ReferencesCard } from '../../shared/ReferencesCard';
import { salesView } from '../../shared/salesView';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { useDocTitle } from '../../../../services/useDocTitle';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { cap } from '../../../../components/form/noun';
import { DocumentDates } from '../../../../components/form/DatesCard';
import { arDownPaymentInvoiceDates } from '../../../documentDateDefs';
import { DocumentJournalEntry, DocumentPayment } from '../../../../components/form/PaymentCard';
import { arDownPaymentInvoicePayment } from '../../../documentPaymentDefs';
import { JournalPreview } from '../../../../components/form/JournalPreview';
import { AssignmentCard } from '../../../../components/form/AssignmentCard';
import { DI_LIST_PATH, DI_NOUN, DI_STATUS_INTENT, RC_LIST_PATH } from '../../paths';
import { diDoc } from './diDoc';
import { DiDocumentCard } from './DiDocumentCard';
import { buildDiContext, diLineFromOrder, type DiDraft as Draft, type DiMasters as Masters } from './types';

type TabId = 'contents' | 'accounting';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', accounting: 'Customer details' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: Draft, fx: number, m: Masters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  const postingPeriod = postingPeriodProblem(d.postingDate);
  need(!postingPeriod, 'header', 'postingDate', postingPeriod ?? '');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(!d.dueDate || d.dueDate >= d.postingDate, 'header', 'dueDate', 'Due date is before the posting date.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.dpmPct > 0 && d.dpmPct <= 100, 'contents', 'dpmPct', 'DPM % must be more than 0 and at most 100.');
  need(d.controlAccount, 'accounting', 'controlAccount', 'Pick the control account.');
  need(d.downPaymentAccount, 'accounting', 'downPaymentAccount', 'Pick the down payment account.');
  need(d.lines.length, 'contents', 'lines', 'Add at least one line, or copy from a sales order.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.salesItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't a sales item.`);
    need(l.baseType || isValidToday(item, d.postingDate), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't valid on ${formatDate(d.postingDate)}.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'contents', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
  }
  return problems;
}

export function DiDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <DiForm key={id === 'new' ? location.key : id} />;
}

function DiForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fromSo?: string } | null;

  const diApproved = !needsApproval('ARINV');
  const [draft, setDraft] = useState<Draft | null | undefined>(
    isNew ? { ...blankArDownPaymentInvoice(todayISO(), CURRENT_USER_ID), approved: diApproved } : undefined,
  );
  const [m, setM] = useState<Masters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${DI_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [currencyView, setCurrencyView] = useState('');
  const reject = useReject();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'), listItems(), loadInventoryMasters(), companyTax.list(), taxCodes.list(), taxGroups.list(),
      withholdingTaxes.list(), withholdingGroups.list(), currencies.list(), exchangeRates.list(), accounts.list(), loadCurrentCompany(), listSalesOrders(), soSeries.list(),
    ]).then(([customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, accts, ours, orders, series]) => {
      if (cancelled) return;
      const masters: Masters = { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, accounts: accts, company: ours, orders, soSeries: series };
      setM(masters);
      if (!isNew) return;
      const so = state?.fromSo && orders.find((o) => o.id === state.fromSo);
      if (so) {
        const picks = so.lines.filter((l) => openQty(l) > 0).map((l) => ({ lineId: l.id, qty: openQty(l) }));
        setDraft((d) => d && copyLines(d, so, picks, masters));
      }
    });
    if (!isNew && id) {
      getArDownPaymentInvoice(id).then((d) => !cancelled && setDraft(d ?? null));
      listArDownPaymentInvoices().then((all) => !cancelled && setSiblings(siblingKeys(all, diNumber)));
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${DI_NOUN.one}` : draft.status === 'Draft' ? `Draft ${DI_NOUN.one}` : diNumber(draft)) : undefined);
  if (draft === undefined || !m) return <DocumentDetailSkeleton />;
  if (draft === null) return <NotFound icon="receipt_long" title={`${cap(DI_NOUN.one)} not found`} backTo={DI_LIST_PATH} backLabel={`Back to ${DI_NOUN.many}`} />;

  const ctx = buildDiContext(draft, m);
  const { customer, fx } = ctx;
  const added = draft.status !== 'Draft';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = diTotals(draft, ctx.rateOf);
  // Customer withholding on the billed share: resolved on the full lines, then scaled by the DPM %.
  const withholding = customerWithholding(draft, customer, m.items, ctx.rateOf, m.tax)
    .map((w) => ({ ...w, base: round2(w.base * (draft.dpmPct / 100)), amount: round2(w.amount * (draft.dpmPct / 100)) }))
    .filter((w) => w.amount > 0);
  const wtaxTotal = round2(withholding.reduce((n, w) => n + w.amount, 0));
  const balance = round2(totals.total - wtaxTotal - draft.appliedAmount);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? diNumber(draft as ArDownPaymentInvoice) : draft.id));
  const journal = fx ? diJournal(draft, fx, { codes: m.tax.codes, rateOf: ctx.rateOf, withholding: withholding.map((w) => ({ account: w.account, amount: w.amount })) }) : [];
  const journalEntry = <JournalPreview journal={journal} accounts={m.accounts} />;

  const retax = (lines: Draft['lines'], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    if (!added && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === soDueDate(draft.postingDate, termDays(draft.paymentTermId)))) {
      next.dueDate = soDueDate(next.postingDate, termDays(next.paymentTermId));
    }
    if (patch.lines) next.orderNumber = [...new Set(next.lines.filter((l) => l.baseType).map((l) => l.baseDocNo))].join(', ');
    setDraft(next);
  };

  function copyLines(d: Draft, so: Masters['orders'][number], picks: { lineId: string; qty: number }[], masters: Masters): Draft {
    const c = masters.customers.find((x) => x.id === so.customerId);
    const added = picks.map((p) => diLineFromOrder(so, so.lines.find((l) => l.id === p.lineId)!, p.qty));
    const first = !d.lines.some((l) => l.baseType);
    const header: Partial<Draft> = first
      ? {
          customerId: so.customerId,
          customerCode: so.customerCode,
          customerName: so.customerName,
          contactId: so.contactId,
          customerRef: so.customerRef,
          currency: so.currency,
          shipTo: so.shipTo,
          billTo: so.billTo,
          shippingType: so.shippingType,
          projectId: so.projectId,
          paymentTermId: so.paymentTermId,
          paymentMethod: so.paymentMethod,
          salesEmployeeId: so.salesEmployeeId,
          discountPct: so.discountPct,
          dueDate: soDueDate(d.postingDate, termDays(so.paymentTermId)),
          controlAccount: c ? controlAccountOf(c) : '1120',
          journalRemark: defaultJournalRemark('reserve-invoices', { entityCode: so.customerCode, entityName: so.customerName }),
          baseSoId: so.id,
        }
      : {};
    const numbers = [...new Set([...d.orderNumber.split(', ').filter(Boolean), ...soNumber(so).split(', ').filter(Boolean)])].join(', ');
    return { ...d, ...header, orderNumber: numbers, lines: [...d.lines.filter((l) => l.itemId), ...added] };
  }

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '' });
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
    update({
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      contactId: c.defaultContactId,
      currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
      paymentTermId: c.customerPaymentTermId,
      paymentMethod: c.defaultPaymentMethod || draft.paymentMethod,
      dueDate: soDueDate(draft.postingDate, termDays(c.customerPaymentTermId)),
      projectId: c.projectId,
      shippingType: c.shippingType,
      federalTaxId: c.tin,
      salesEmployeeId: c.salesEmployeeId,
      discountPct: c.totalDiscount || 0,
      controlAccount: controlAccountOf(c),
      downPaymentAccount: CUSTOMER_DOWN_PAYMENTS,
      billTo: bill ? formatAddress(bill, c.name) : '',
      shipTo: ship ? formatAddress(ship, c.name) : '',
      journalRemark: defaultJournalRemark('reserve-invoices', { entityCode: c.code, entityName: c.name }),
      lines: retax(draft.lines.filter((l) => !l.baseType), c, draft.postingDate),
    });
  };

  const sectionProps = { draft, update, errors, m, ctx };
  const view = salesView(draft.currency, ctx.fx, draft.postingDate, currencyView, setCurrencyView);

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveDiRemarks(draft as ArDownPaymentInvoice, { remarks: draft.remarks });
        navigate(DI_LIST_PATH, { state: { notice: `${cap(DI_NOUN.one)} ${diNumber(saved)} saved.` } });
      } finally { setSaving(false); }
      return;
    }
    const doc: Draft = { ...draft, ...overrides, lines: draft.lines.filter((l) => l.itemId) };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, fx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const saved = effectiveDraft ? await saveDiDraft(doc) : await addArDownPaymentInvoice(doc, fx);
      // GL posting: Dr A/R / Cr Customer Down Payments (2150) / Cr Output VAT, less creditable withholding.
      if (!effectiveDraft && saved.status === 'Open') {
        await postDocumentEntry({
          origin: 'IN',
          originNo: saved.docNum,
          originId: saved.id,
          postingDate: saved.postingDate,
          dueDate: saved.dueDate,
          remarks: saved.journalRemark,
          partnerId: saved.customerId,
          controlAccount: saved.controlAccount,
          lines: journal,
        });
      }
      navigate(DI_LIST_PATH, {
        state: { notice: effectiveDraft ? `Draft saved — ${saved.customerName}.` : saved.status === 'Not Confirmed' ? `${cap(DI_NOUN.one)} ${diNumber(saved)} submitted for approval.` : `${cap(DI_NOUN.one)} ${diNumber(saved)} added — ${saved.customerName} owes ${saved.currency} ${formatAmount(balance)}.` },
      });
    } finally { setSaving(false); }
  };

  const saved = draft as ArDownPaymentInvoice;
  const act = async (run: () => Promise<ArDownPaymentInvoice>, notice: string) => {
    try {
      const d = await run();
      navigate(DI_LIST_PATH, { state: { notice: `${cap(DI_NOUN.one)} ${diNumber(d)} ${notice}.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };
  const cancelIt = () => act(async () => { const d = await cancelArDownPaymentInvoice(saved); await reverseDocumentEntry(saved.id); return d; }, 'cancelled — the entry is reversed');
  const closeIt = () => act(() => closeArDownPaymentInvoice(saved), 'closed');
  const recallIt = () => act(() => recallArDownPaymentInvoice(saved), 'recalled to draft');
  const rejectIt = async (rejectionReason: string) => { await logRejection('ARINV', saved.id, saved.customerId, rejectionReason); await recallArDownPaymentInvoice(saved); navigate(DI_LIST_PATH, { state: { notice: `${cap(DI_NOUN.one)} ${diNumber(saved)} rejected and returned to draft.` } }); };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' && balance > 0
      ? [{ label: 'Receive payment', icon: 'savings', onSelect: () => navigate(`${RC_LIST_PATH}/new`, { state: { fromDi: saved.id } }) }]
      : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: closeIt }] : []),
    ...(draft.status === 'Open' && !draft.appliedAmount ? [{ label: `Cancel ${DI_NOUN.one}`, icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  // Copy-from sources: this customer's open orders with something left to invoice.
  const mineCopy = (o: { customerId: string; currency: string }) => (!draft.customerId || o.customerId === draft.customerId) && (!ctx.based || o.currency === draft.currency);
  const copySos = m.orders.filter((o) => o.status === 'Open' && o.docType === 'Item' && mineCopy(o) && o.lines.some((l) => openQty(l) > 0));

  const title = isNew ? `New ${DI_NOUN.one}` : draft.status === 'Draft' ? `Draft ${DI_NOUN.one}` : diNumber(draft);

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => e.preventDefault()} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="receipt_long"
            parent={{ noun: DI_NOUN, to: DI_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : (
              <div className="flex gap-1">
                <Badge size="small" intent={DI_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                {added && draft.appliedAmount ? <Badge size="small" intent={balance > 0 ? 'warning' : 'success'} variant="outline">{balance > 0 ? 'Partly paid' : 'Paid'}</Badge> : null}
              </div>
            )}
            actions={
              <DetailActions
                noun={DI_NOUN}
                listPath={DI_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('ARINV') })}
                draft={draft}
                onRevert={setDraft}
                needsApproval={!draft.approved}
                remarksOnly={added}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: DI_LIST_PATH, prevId, nextId }}
              />
            }
          />
          {page === 'activity' ? (
            <Panel.Body><ActivityTab target={{ kind: 'ARDI', id: draft.id ?? '' }} partnerId={draft.customerId} /></Panel.Body>
          ) : page === 'transactions' && draft.id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow kind="ARDI" id={draft.id} notes="The sales order it's for, the payments that paid it, and the A/R invoices that drew it." />
            </Panel.Body>
          ) : page === 'transactions' ? (
            <Panel.Body><Text variant="small" tone="muted" className="p-4">Save the document first to see related documents.</Text></Panel.Body>
          ) : (
            <DetailColumns
              header={
                <>
                  <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
                  {reject.alert(`Reject ${DI_NOUN.one}`, rejectIt)}
                  {added ? (
                    <Alert intent="default" variant="outline" title={draft.status === 'Open' ? (balance > 0 ? `${draft.currency} ${formatAmount(balance)} still to collect` : `Paid — ${draft.currency} ${formatAmount(diDrawable(saved, [...m.tax.codes]))} left to draw`) : `This ${DI_NOUN.one} is ${draft.status.toLowerCase()}`}>
                      {draft.status === 'Open'
                        ? balance > 0
                          ? 'Receive it from Incoming Payments. The GL entry was posted when this invoice was added.'
                          : "Draw it on the A/R invoice that bills the goods: the invoice's Total down payment."
                        : draft.status === 'Cancelled'
                          ? 'Its journal entry was reversed.'
                          : 'Only remarks can change.'}
                    </Alert>
                  ) : null}
                </>
              }
              main={
                <>
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={ctx.readOnly || ctx.based}
                    error={errors.customerId}
                    hint={ctx.based && !ctx.readOnly ? 'Set by the sales order the lines come from.' : undefined}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <DocLines {...diDoc({ ...sectionProps, onCopyClick: () => setCopying(true), canCopy: copySos.length > 0, withholding: withholding.map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount })) }, view)} />
                  <DocumentJournalEntry def={arDownPaymentInvoicePayment} posting={journalEntry} {...sectionProps} />
                  <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={ctx.readOnly} description="Other documents this invoice refers to, e.g. the customer's PO." />
                  <AttachmentsCard attachments={draft.attachments ?? []} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the customer's PO or billing documents." />
                </>
              }
              aside={
                <>
                  <DiDocumentCard {...sectionProps} />
                  <DocumentDates def={arDownPaymentInvoiceDates} {...sectionProps} />
                  <DocumentPayment def={arDownPaymentInvoicePayment} posting={journalEntry} {...sectionProps} />
                  <ReferencesCard {...sectionProps} orderNumberHint="Set by Copy from." />
                  <AssignmentCard
                    draft={draft}
                    update={update}
                    readOnly={ctx.readOnly}
                    person={{ key: 'salesEmployeeId', label: 'Sales employee', clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' }}
                    ownerHint="Owns the document (data access)."
                    remarksHint="Can be changed after the invoice is added."
                  />
                </>
              }
            />
          )}
        </Panel>
      </Form>
      <CustomerDetailsPanel
        customerRefLabel="Customer PO no."
        customer={ctx.customer}
        draft={draft}
        update={update}
        readOnly={ctx.readOnly}
        noun={DI_NOUN.one}
        open={customerDetailsOpen}
        onClose={() => setCustomerDetailsOpen(false)}
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'SO' as const,
                label: 'Sales orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Invoice on',
                hint: "The advance is figured on these lines. The order's quantities don't change.",
                docs: copySos.map((o) => ({
                  id: o.id,
                  label: `${soNumber(o)} · ${o.customerName}`,
                  description: o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date',
                  lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo || l.description, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }] satisfies CopySourceType<'SO'>[]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const so = copySos.find((o) => o.id === docId);
                setCopying(false);
                if (so) setDraft(copyLines(draft, so, picks, m));
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
