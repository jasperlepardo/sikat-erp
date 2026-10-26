import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, Panel, PanelHeader, Tabs, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../../components/form/DataTable';
import { Section, type Errors } from '../../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../../components/form/ProblemsAlert';
import { AttachmentsCard } from '../../../../../components/form/AttachmentsCard';
import { formatAddress } from '../../../../../mocks/address';
import { blankArCreditMemo, type ArCreditMemo } from '../../../../../mocks/arCreditMemos';
import type { ArInvoice } from '../../../../../mocks/arInvoices';
import { CURRENT_USER_ID } from '../../../../../mocks/common';
import type { Partner } from '../../../../../mocks/partners';
import { rateAt } from '../../../../../mocks/taxes';
import { arWithholding } from '../../../../../services/arInvoices';
import {
  ArCmPostError,
  addArCreditMemo,
  recallArCreditMemo,
  applyArCredit,
  arCmJournal,
  arCmNumber,
  arCmTotals,
  arCreditMemoFromInvoice,
  arCreditMemoFromReturn,
  baseArInvoiceIds,
  cancelArCreditMemo,
  getArCreditMemo,
  listArCreditMemos,
  receivesStock,
  saveArCmDraft,
  saveArCmRemarks,
  type ArCmInput,
  type ArInvoiceBalances,
} from '../../../../../services/arCreditMemos';
import { listSalesReturns, srNumber, srOpenQty } from '../../../../../services/salesReturns';
import { arAmounts, arNumber, listArInvoices } from '../../../../../services/arInvoices';
import { loadCurrentCompany } from '../../../../../services/companies';
import { formatDate, todayISO } from '../../../../../services/dates';
import { recalcLineTaxes } from '../../../../../services/taxRecalc';
import { proposedTaxCode } from '../../../sales-orders/detail/types';
import { defaultJournalRemark } from '../../../../../services/journalPatterns';
import { formatAmount } from '../../../../../services/format';
import { loadInventoryMasters } from '../../../../../services/inventoryMasters';
import { listItems } from '../../../../../services/items';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../../services/journalEntries';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes, rateOn } from '../../../../../services/masterData';
import { listPartnersByRole } from '../../../../../services/partners';
import { logRejection } from '../../../../../services/approvalRules';
import { getSalesSettings } from '../../../../../services/salesOrders';
import { dueDateFor } from '../../../../../services/purchaseOrders';
import { EditPanel } from '../../../../partners/detail/EditPanel';
import { SalesDocumentFlow } from '../../../shared/SalesDocumentFlow';
import { CustomerCard } from '../../../shared/CustomerCard';
import { SalesTotalsFooter } from '../../../shared/TotalsFooter';
import { buildDnContext, type DnDraft, type DnMasters } from '../../../deliveries/detail/types';
import { useDocTitle } from '../../../../../services/useDocTitle';
import { type ArCmMasters, type SrContext } from '../../types';
import { DocLines } from '../../../../../components/form/docLines/DocLines';
import { CopyPanel, type CopySourceType } from '../../../../purchasing/shared/CopyPanel';
import { arCmDoc } from './arCmDoc';
import { ArCmCustomerDetailsPanel } from './ArCmCustomerDetailsPanel';
import { ReturnDatesCard } from '../../ReturnDatesCard';
import { ReturnShipmentCard } from '../../ReturnShipmentCard';
import { ReturnAssignmentCard } from '../../ReturnAssignmentCard';
import { ActivityTab } from '../../../../../components/activity/ActivityTab';
import { neighbours, NotFound, PrevNext, siblingKeys, useDocTab, useReject } from '../../../../../components/form/DetailNav';
import { ARCM_STATUS_INTENT, AR_CM_LIST_PATH } from '../../../paths';
import { round2 } from '../../../../../services/num';

type TabId = 'header';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

async function loadArCmMasters(): Promise<ArCmMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, invoices, returns] = await Promise.all([
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
    listArInvoices(),
    listSalesReturns(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, invoices, returns, accounts: inv.accounts };
}

const creditableInvoices = (m: ArCmMasters, customerId: string) =>
  m.invoices.filter((i) => i.customerId === customerId && (i.status === 'Open' || i.status === 'Closed'));

function validate(d: ArCmInput, fx: number, m: ArCmMasters, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.controlAccount, 'header', 'controlAccount', 'Pick the control account.');
  need(d.lines.length, 'header', 'lines', 'Add at least one line, or copy from an A/R invoice.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'header', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(l.quantity > 0, 'header', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'header', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
    need(l.unitPrice >= 0, 'header', `line:${l.id}:unitPrice`, `${n}: price can't be negative.`);
    if (receivesStock(l, m.items)) {
      need(l.warehouse, 'header', `line:${l.id}:warehouse`, `${n}: pick the warehouse the goods return to.`);
    }
  }
  return problems;
}

export function ArCreditMemoDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <ArCreditMemoForm key={id === 'new' ? location.key : id} />;
}

function ArCreditMemoForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fromInvoice?: string; fromReturn?: string } | null;

  const arcmApproved = !getSalesSettings().requireArCreditMemoApproval;
  const [draft, setDraft] = useState<ArCmInput | null | undefined>(isNew ? { ...blankArCreditMemo(todayISO(), CURRENT_USER_ID), approved: arcmApproved } : undefined);
  const [m, setM] = useState<ArCmMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${AR_CM_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [applying, setApplying] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    loadArCmMasters().then((masters) => {
      setM(masters);
      if (isNew && state?.fromInvoice) {
        const inv = masters.invoices.find((i) => i.id === state.fromInvoice);
        if (inv) {
          const lines = arCreditMemoFromInvoice(inv, inv.lines.map((l) => ({ lineId: l.id, qty: l.quantity })), masters.items);
          const customer = masters.customers.find((c) => c.id === inv.customerId);
          setDraft((d) => d && {
            ...d, ...customerDefaults(customer, d), currency: inv.currency, contactId: inv.contactId || d.contactId,
            paymentTermId: inv.paymentTermId || d.paymentTermId, discountPct: inv.discountPct,
            salesEmployeeId: inv.salesEmployeeId || d.salesEmployeeId, controlAccount: inv.controlAccount || '1120',
            shipTo: inv.shipTo, billTo: inv.billTo, lines, orderNumber: inv.orderNumber || '',
          });
        }
      }
      if (isNew && state?.fromReturn) {
        const sr = masters.returns.find((r) => r.id === state.fromReturn);
        if (sr) {
          const lines = arCreditMemoFromReturn(sr, sr.lines.map((l) => ({ lineId: l.id, qty: srOpenQty(l, sr) })).filter((p) => p.qty > 0), masters.items, srNumber, srOpenQty);
          const customer = masters.customers.find((c) => c.id === sr.customerId);
          setDraft((d) => d && {
            ...d, ...customerDefaults(customer, d), currency: sr.currency, contactId: sr.contactId || d.contactId,
            paymentTermId: sr.paymentTermId || d.paymentTermId, discountPct: sr.discountPct,
            salesEmployeeId: sr.salesEmployeeId || d.salesEmployeeId, controlAccount: '1120',
            shipTo: sr.shipTo, billTo: sr.billTo, lines,
          });
        }
      }
    });
    if (isNew || !id) return;
    let cancelled = false;
    getArCreditMemo(id).then((c) => !cancelled && setDraft(c ?? null));
    listArCreditMemos().then((all) => !cancelled && setSiblings(siblingKeys(all, arCmNumber)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New A/R credit memo' : arCmNumber(draft as ArCreditMemo)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading A/R credit memo…</Text>;
  if (draft === null) return <NotFound icon="undo" title="A/R credit memo not found" backTo={AR_CM_LIST_PATH} backLabel="Back to credit memos" />;

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
  const { prevId, nextId } = neighbours(siblings, (draft as ArCreditMemo).id && (draft.docNum ? arCmNumber(draft as ArCreditMemo) : (draft as ArCreditMemo).id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totals = arCmTotals(draft, rateOf);
  const withholding = arWithholding(draft as never, customer, m.items, rateOf);
  const openBalance = round2(totals.total - draft.appliedAmount);
  const journal = fx ? arCmJournal(draft, fx, { items: m.items, groups: m.inv.groups, codes: m.tax.codes, rateOf }) : [];

  /** Tax codes re-proposed for the customer and date, except ones set by hand or copied from a base document. */
  const retax = (lines: ArCmInput['lines'], c: Partner | undefined, postingDate: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, postingDate) : '';
    });
  const update = (patch: Partial<ArCmInput>) => {
    const next = { ...draft, ...patch };
    if (!added && patch.postingDate !== undefined && patch.postingDate !== draft.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
    if ((patch.paymentTermId !== undefined || patch.postingDate !== undefined) && patch.dueDate === undefined && (!draft.dueDate || draft.dueDate === dueDateFor(draft.postingDate, draft.paymentTermId))) {
      next.dueDate = dueDateFor(next.postingDate, next.paymentTermId);
    }
    setDraft(next);
  };

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    update(c ? { ...customerDefaults(c, draft), lines: retax(draft.lines.filter((l) => !l.baseType), c, draft.postingDate) } : { customerId: '', customerCode: '', customerName: '', contactId: '', shipTo: '', billTo: '' });
  };

  const sameCurrency = <T extends { currency: string }>(docs: T[]) => docs.filter((d) => !draft.lines.some((l) => l.baseType) || d.currency === code);
  const invoices = draft.customerId ? sameCurrency(creditableInvoices(m, draft.customerId)) : [];

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<ArCmInput> = {}) => {
    e?.preventDefault();
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveArCmRemarks(draft as ArCreditMemo, { remarks: draft.remarks });
        navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: ArCmInput = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, fx, m, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (effectiveDraft) {
        const saved = await saveArCmDraft(doc);
        navigate(AR_CM_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const balances: ArInvoiceBalances = new Map(
        baseArInvoiceIds(doc).flatMap((invoiceId) => {
          const inv = m.invoices.find((i) => i.id === invoiceId);
          if (!inv || inv.status !== 'Open') return [];
          const amounts = arAmounts(inv, customer, m.items, m.tax.codes);
          return [[invoiceId, { docNo: arNumber(inv), balance: amounts.balanceDue, total: amounts.due }]];
        }),
      );
      const saved = await addArCreditMemo(doc, fx, totals.total, balances);
      if (saved.status !== 'Not Confirmed') {
        await postDocumentEntry({
          origin: 'AC', originNo: saved.docNum, originId: saved.id,
          postingDate: saved.postingDate, dueDate: saved.dueDate, remarks: saved.journalRemark,
          partnerId: saved.customerId, controlAccount: saved.controlAccount, lines: journal,
        });
      }
      const applied = saved.applications.map((a) => `${a.docNo} (${code} ${formatAmount(a.amount)})`).join(', ');
      navigate(AR_CM_LIST_PATH, {
        state: {
          notice: saved.status === 'Not Confirmed' ? `A/R credit memo ${arCmNumber(saved)} submitted for approval.` : `A/R credit memo ${arCmNumber(saved)} added — ${code} ${formatAmount(totals.total)} credit${applied ? `, applied to ${applied}` : ''}${saved.status === 'Open' ? `; ${code} ${formatAmount(totals.total - saved.appliedAmount)} left to apply` : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof ArCmPostError)) throw err;
      setProblems([{ tab: 'header', key: err.lineIds[0] ? `line:${err.lineIds[0]}:quantity` : 'status', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as ArCreditMemo;
  const openInvoices = draft.customerId ? m.invoices.filter((i) => i.customerId === draft.customerId && i.status === 'Open' && i.currency === code).map((inv) => {
    const amounts = arAmounts(inv, customer, m.items, m.tax.codes);
    return { inv, balanceDue: amounts.balanceDue, total: amounts.due };
  }).filter((x) => x.balanceDue > 0) : [];

  const cancelIt = async () => {
    try {
      const totalsByInvoice = new Map(saved.applications.map((a) => {
        const inv = m.invoices.find((i) => i.id === a.invoiceId);
        const amounts = inv ? arAmounts(inv, customer, m.items, m.tax.codes) : undefined;
        return [a.invoiceId, amounts?.due ?? Infinity];
      }));
      const c = await cancelArCreditMemo(saved, totalsByInvoice);
      await reverseDocumentEntry(saved.id);
      navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(c)} cancelled.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const recallIt = async () => { const m2 = await recallArCreditMemo(saved); navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(m2)} recalled to draft.` } }); };
  const rejectIt = async (rejectionReason: string) => { await logRejection('ARCM', saved.id, saved.customerId, rejectionReason); await recallArCreditMemo(saved); navigate(AR_CM_LIST_PATH, { state: { notice: `A/R credit memo ${arCmNumber(saved)} rejected and returned to draft.` } }); };

  const baseInvIds = baseArInvoiceIds(draft);
  const baseInvoiceDocs = baseInvIds.flatMap((invoiceId) => {
    const inv = m.invoices.find((i) => i.id === invoiceId);
    return inv ? [{ id: inv.id, docNo: arNumber(inv) }] : [];
  });

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }, { label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => reject.start() }] : []),
    ...(draft.status === 'Open' && openBalance > 0 && openInvoices.length ? [{ label: 'Apply credit to an invoice', icon: 'request_quote', onSelect: () => setApplying(true) }] : []),
    ...(draft.status === 'Open' || draft.status === 'Closed' ? [{ label: 'Cancel credit memo', icon: 'cancel', onSelect: cancelIt }] : []),
    ...baseInvoiceDocs.map((inv) => ({ label: `Open A/R invoice ${inv.docNo}`, icon: 'receipt' as const, onSelect: () => navigate(`/sales/invoices/${inv.id}`) })),
  ];

  const title = isNew ? 'New A/R credit memo' : added ? arCmNumber(draft as ArCreditMemo) : 'Draft A/R credit memo';
  const sectionProps = { draft, update, errors, m, ctx };

  const copyFromInvoice = (inv: ArInvoice, picks: { lineId: string; qty: number }[]) => {
    const newLines = arCreditMemoFromInvoice(inv, picks, m.items);
    const first = !draft.lines.some((l) => l.baseType);
    setDraft((d) => d && {
      ...d,
      ...(first ? {
        currency: inv.currency, contactId: inv.contactId || d.contactId,
        paymentTermId: inv.paymentTermId || d.paymentTermId, discountPct: inv.discountPct,
        salesEmployeeId: inv.salesEmployeeId || d.salesEmployeeId, controlAccount: inv.controlAccount || '1120',
        shipTo: inv.shipTo, billTo: inv.billTo,
      } : {}),
      lines: [...d.lines.filter((l) => l.itemId), ...newLines],
    });
  };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="undo"
            iconIntent="default"
            iconShape="rounded"
            iconSize={32} iconVariant="outline"
            breadcrumbs={[{ label: 'A/R Credit Memos', href: AR_CM_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(AR_CM_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={AR_CM_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={ARCM_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {added ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(AR_CM_LIST_PATH)}>Cancel</Button>}
                {menu.length ? <MoreMenu items={menu} /> : null}
                <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                  {saving ? 'Saving…' : added ? 'Save' : 'Add'}
                </Button>
              </>
            }
          />
          {page === 'transactions' && (draft as ArCreditMemo).id ? (
            <Panel.Body className="flex flex-col gap-2">
              <SalesDocumentFlow kind="ARCM" id={(draft as ArCreditMemo).id} notes="Everything linked to this credit memo: the A/R invoices it credits." />
            </Panel.Body>
          ) : page !== 'details' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'ARCM', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={() => 'Details'} />
              {reject.alert('Reject A/R credit memo', rejectIt)}
              {added ? (
                <Alert intent="default" variant="outline" title={draft.status === 'Open' ? `${code} ${formatAmount(openBalance)} of credit left to apply` : `This credit memo is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Open'
                    ? 'Apply it to another open invoice of this customer with You can also › Apply credit to an invoice. Only remarks can change.'
                    : 'Only remarks can change.'}
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
                    hint={ctx.based && !added ? 'Set by the document the lines come from.' : undefined}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <DocLines
                    {...arCmDoc({ ...sectionProps, onCopyClick: () => setCopying(true), canCopy: invoices.length > 0 })}
                    footer={
                      <SalesTotalsFooter
                        {...sectionProps}
                        withholding={withholding.map((w) => ({ label: `${w.kind === 'Withholding VAT' ? 'VAT' : 'EWT'} withheld — ${w.atc} (${w.rate}%)`, amount: w.amount }))}
                        extraRows={
                          added ? (
                            <>
                              <div className="flex items-center justify-between gap-4">
                                <Text variant="small" tone="muted">Applied amount</Text>
                                <Text variant="small" className="tabular-nums">{draft.appliedAmount ? `–${code} ${formatAmount(draft.appliedAmount)}` : '—'}</Text>
                              </div>
                              {draft.applications.length ? (
                                <Text variant="small" tone="muted">
                                  Applied to {draft.applications.map((a) => `A/R invoice ${a.docNo} (${code} ${formatAmount(a.amount)}, ${formatDate(a.date)})`).join('; ')}.
                                </Text>
                              ) : null}
                              <div className="flex items-baseline justify-between gap-4 border-t pt-1" style={{ borderColor: 'var(--color-border-neutral-subtle)' }}>
                                <Text variant="small" weight="semibold" tone="heading">Open balance</Text>
                                <Text variant="small" weight="semibold" tone="heading" className="tabular-nums">{code} {formatAmount(openBalance)}</Text>
                              </div>
                            </>
                          ) : null
                        }
                      />
                    }
                  />
                  <fieldset disabled={added} className="contents">
                    <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Customer's return authorization, photos of defective goods." withDescription />
                  </fieldset>
                </div>

                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <ReturnDatesCard {...sectionProps} readOnly={added} postingHint="When revenue and VAT reverse, and any goods come back in." />
                  <ReturnShipmentCard draft={draft} update={update} readOnly={added} inv={m.inv} />
                  <ReturnAssignmentCard draft={draft} update={update} readOnly={added} noun="credit memo" />
                </aside>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      <ArCmCustomerDetailsPanel {...sectionProps} open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'AR' as const,
                label: 'A/R invoices',
                totalHeader: 'Billed',
                qtyHeader: 'Credit',
                hint: 'Credit quantities can be at most the billed quantity.',
                docs: invoices.map((inv) => ({
                  id: inv.id,
                  label: `${arNumber(inv)} · ${inv.customerName}`,
                  description: `Invoiced ${inv.postingDate}`,
                  lines: inv.lines
                    .filter((l) => l.quantity > 0)
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity })),
                })),
              }] satisfies CopySourceType<'AR'>[]}
              taken={new Set(draft.lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const inv = invoices.find((i) => i.id === docId);
                setCopying(false);
                if (inv) copyFromInvoice(inv, picks);
              }}
            />,
            document.body,
          )
        : null}
      {applying && (draft as ArCreditMemo).id
        ? createPortal(
            <ApplyCreditPanel
              code={code} open={openBalance}
              invoices={openInvoices.map((x) => ({ id: x.inv.id, docNo: arNumber(x.inv), dueDate: x.inv.dueDate, balance: x.balanceDue, total: x.total }))}
              onCancel={() => setApplying(false)}
              onDone={async (picks) => {
                const c = await applyArCredit(saved, totals.total, picks);
                setApplying(false);
                navigate(AR_CM_LIST_PATH, { state: { notice: `Applied ${code} ${formatAmount(picks.reduce((n, p) => n + p.amount, 0))} of credit memo ${arCmNumber(c)}.` } });
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ApplyCreditPanel({ code, open, invoices, onCancel, onDone }: {
  code: string; open: number;
  invoices: { id: string; docNo: string; dueDate: string; balance: number; total: number }[];
  onCancel: () => void;
  onDone: (picks: { invoiceId: string; docNo: string; amount: number; total: number }[]) => void;
}) {
  const sorted = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    let left = open;
    return Object.fromEntries(sorted.map((i) => { const a = round2(Math.min(left, i.balance)); left = round2(left - a); return [i.id, a]; }));
  });
  const total = round2(Object.values(amounts).reduce((n, a) => n + a, 0));

  const columns: TableColumn<(typeof sorted)[number]>[] = [
    { key: 'docNo', header: 'A/R invoice', cell: (i) => i.docNo },
    { key: 'dueDate', header: 'Due', cell: (i) => formatDate(i.dueDate) },
    { key: 'balance', header: 'Balance due', cell: (i) => formatAmount(i.balance) },
    {
      key: 'amount', header: `Apply (${code})`,
      cell: (i) => (
        <TextField aria-label={`Apply to ${i.docNo}`} type="number" min={0} className="w-36"
          value={String(amounts[i.id] ?? 0)}
          onChange={(e) => setAmounts({ ...amounts, [i.id]: Math.min(i.balance, Number(e.currentTarget.value) || 0) })}
        />
      ),
    },
  ];

  return (
    <EditPanel icon="request_quote" title="Apply credit to invoices" onCancel={onCancel}
      onDone={() => total > 0 && total <= open + 0.005 ? onDone(sorted.filter((i) => amounts[i.id] > 0).map((i) => ({ invoiceId: i.id, docNo: i.docNo, amount: amounts[i.id], total: i.total }))) : onCancel()}
    >
      <Section icon="savings" title={`${code} ${formatAmount(open)} of credit to apply`}>
        <Text variant="small" tone={total > open + 0.005 ? 'danger' : 'muted'}>
          Applying {code} {formatAmount(total)}{total > open + 0.005 ? ' — more than the credit left.' : '. Each invoice balance drops by what is applied.'}
        </Text>
      </Section>
      <DataTable icon="receipt_long" title="Open A/R invoices" rows={sorted} getRowId={(i) => i.id} columns={columns} unsortable={columns.map((c) => c.key)} noPagination empty={<Text variant="small" tone="muted">No open invoices in {code}.</Text>} />
    </EditPanel>
  );
}

function customerDefaults(c: Partner | undefined, d: ArCmInput): Partial<ArCmInput> {
  if (!c) return {};
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? c.addresses[0];
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  return {
    customerId: c.id, customerCode: c.code, customerName: c.name, contactId: c.defaultContactId,
    currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
    paymentTermId: c.customerPaymentTermId, paymentMethod: c.defaultPaymentMethod || d.paymentMethod,
    dueDate: dueDateFor(d.postingDate, c.customerPaymentTermId), projectId: c.projectId,
    shippingType: c.shippingType, federalTaxId: c.tin, salesEmployeeId: c.salesEmployeeId,
    controlAccount: '1120',
    journalRemark: defaultJournalRemark('ar-credit-memos', { entityCode: c.code, entityName: c.name }),
    shipTo: ship ? formatAddress(ship, c.name) : '',
    billTo: bill ? formatAddress(bill, c.name) : '',
  };
}
