import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, FormField, List, Panel, PanelHeader, Select, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Section, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import type { ArInvoice } from '../../../../mocks/arInvoices';
import { accountText, type Account } from '../../../../mocks/chartOfAccounts';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { blankIncomingPayment, type IncomingPayment, type IncomingStatus, type IncomingType } from '../../../../mocks/incomingPayments';
import type { Item } from '../../../../mocks/items';
import { type Partner } from '../../../../mocks/partners';
import type { TaxCode } from '../../../../mocks/taxes';
import { listArInvoices } from '../../../../services/arInvoices';
import { formatDate, todayISO } from '../../../../services/dates';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import {
  IncomingPostError,
  addIncomingPayment,
  recallIncomingPayment,
  amountDue,
  cancelIncomingPayment,
  getIncomingPayment,
  incomingJournal,
  incomingNumber,
  incomingSeriesOf,
  listIncomingPayments,
  openRows,
  paidRows,
  paymentDifference,
  saveIncomingDraft,
  saveIncomingNotes,
  weightedDueDate,
  type IncomingInput,
} from '../../../../services/incomingPayments';
import { listItems } from '../../../../services/items';
import { controlAccountOf, listJournalEntries } from '../../../../services/journalEntries';
import { accounts as accountsCollection, currencies as currenciesCollection, exchangeRates, rateOn, taxCodes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import { logRejection } from '../../../../services/approvalRules';
import { getSalesSettings } from '../../../../services/salesOrders';
import { IncomingAccounts, IncomingDocuments } from './IncomingContents';
import { IncomingMeansSection } from './IncomingMeansSection';
import { IncomingDocumentCard, IncomingRemarksCard, IncomingSettingsCard } from './IncomingSideCards';
import { IncomingCustomerPanel } from './IncomingCustomerPanel';
import { CustomerCard } from '../../shared/CustomerCard';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';

export const RC_LIST_PATH = '/sales/payments-received';
export const RC_STATUS_INTENT: Record<IncomingStatus, 'default' | 'success' | 'danger' | 'warning'> = { Draft: 'default', 'Not Confirmed': 'warning', Posted: 'success', Cancelled: 'danger' };

type TabId = 'contents' | 'means';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', means: 'Payment means' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

interface Masters {
  customers: Partner[];
  items: Item[];
  codes: TaxCode[];
  invoices: ArInvoice[];
  accounts: Account[];
  currencies: Currency[];
  rates: ExchangeRate[];
}

function validate(d: IncomingInput, fx: number, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  if (d.type === 'Customer') need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(!incomingSeriesOf(d.seriesId).manual || d.docNum > 0, 'header', 'docNum', 'The Manual series needs the receipt number.');
  if (d.type === 'Customer') {
    need(d.controlAccount, 'header', 'controlAccount', 'Pick the control account.');
    need(paidRows(d).length || d.onAccount > 0, 'contents', 'rows', 'Tick the invoices being paid, or record a payment on account.');
    for (const r of d.rows.filter((x) => x.selected)) need(r.amount > 0 && r.amount + (r.amount * r.cashDiscountPct) / 100 <= r.balanceDue + 0.005, 'contents', `row:${r.id}`, `${r.docNo}: Total Payment must be more than 0 and no more than the balance due (${formatAmount(r.balanceDue)}).`);
  } else {
    need(d.accountRows.length, 'contents', 'rows', 'Add the accounts the money goes to.');
    for (const r of d.accountRows) {
      need(r.account, 'contents', `acct:${r.id}`, 'Every line needs a G/L account.');
      need(r.amount > 0, 'contents', `acct:${r.id}`, 'Every line needs an amount.');
    }
  }
  need(amountDue(d) > 0, 'contents', 'rows', 'There’s nothing to receive.');
  const { diff, withinAllowance } = paymentDifference(d, fx);
  need(!diff || withinAllowance, 'means', 'means', `Open balance of ${d.currency} ${formatAmount(Math.abs(diff))}: the payment means ${diff > 0 ? 'exceed' : 'don’t cover'} the amount due.`);
  for (const c of d.means.checks) need(c.amount > 0 && c.dueDate && c.bank && c.checkNo, 'means', 'means', 'Every check needs a due date, amount, bank and check no.');
  for (const c of d.means.cards) need(c.amount > 0 && c.cardBrandId, 'means', 'means', 'Every card payment needs a card brand and amount.');
  return problems;
}

export function IncomingPaymentDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <IncomingForm key={id === 'new' ? location.key : id} />;
}

function IncomingForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const fromInvoice = (useLocation().state as { fromInvoice?: string } | null)?.fromInvoice;

  const rcApproved = !getSalesSettings().requireIncomingPaymentApproval;
  const [draft, setDraft] = useState<IncomingInput | null | undefined>(isNew ? { ...blankIncomingPayment(todayISO()), approved: rcApproved } : undefined);
  const [m, setM] = useState<Masters>();
  const [page, setPage] = useState<PageId>('details');
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [entryId, setEntryId] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPartnersByRole('customer'), listItems(), taxCodes.list(), listArInvoices(), accountsCollection.list(), currenciesCollection.list(), exchangeRates.list()]).then(([customers, items, codes, invoices, accounts, currencies, rates]) => {
      if (cancelled) return;
      const masters = { customers, items, codes, invoices, accounts, currencies, rates };
      setM(masters);
      // From an invoice's "Copy to incoming payment": its customer, with that invoice ticked.
      const inv = isNew && fromInvoice ? invoices.find((i) => i.id === fromInvoice) : undefined;
      if (inv) setDraft((d) => d && withCustomer(d, inv.customerId, masters, inv.id));
    });
    if (!isNew && id) {
      getIncomingPayment(id).then((p) => !cancelled && setDraft(p ?? null));
      listIncomingPayments().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((p) => p.docNum ? incomingNumber(p) : p.id)));
      listJournalEntries().then((es) => !cancelled && setEntryId(es.find((e) => e.originId === id && !e.reverses)?.id));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New incoming payment' : incomingNumber(draft)) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading payment…</Text>;
  if (draft === null) return <NotFound icon="savings" title="Incoming payment not found" backTo={RC_LIST_PATH} backLabel="Back to payments received" />;

  const added = draft.status !== 'Draft';
  const ro = added;
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (rateOn(m.rates, draft.currency, draft.postingDate)?.rate ?? 0);
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const journal = fx ? incomingJournal(draft, fx) : [];
  const due = amountDue(draft);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? incomingNumber(draft as IncomingPayment) : draft.id));

  // The BP row's due date follows the payment means until it's typed over.
  const update = (patch: Partial<IncomingInput>) => {
    const next = { ...draft, ...patch };
    if (patch.means && draft.dueDate === weightedDueDate(draft.means, draft.postingDate)) next.dueDate = weightedDueDate(patch.means, draft.postingDate);
    setDraft(next);
  };

  /** Picking the customer lists its open invoices in its currency (optionally with one ticked). */
  function withCustomer(d: IncomingInput, customerId: string | null, masters: Masters, tick?: string): IncomingInput {
    const c = masters.customers.find((x) => x.id === customerId);
    if (!c) return { ...d, customerId: '', customerCode: '', customerName: '', rows: [] };
    const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
    const currency = c.currency === 'All currencies' ? d.currency : c.currency;
    const rows = openRows(c.id, currency, masters.invoices, masters).map((r) => (r.invoiceId === tick ? { ...r, selected: true } : r));
    return {
      ...d,
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      billTo: bill ? formatAddress(bill, c.name) : '',
      contactId: c.defaultContactId,
      projectId: c.projectId,
      currency,
      controlAccount: rows.find((r) => r.selected)?.controlAccount ?? controlAccountOf(c),
      journalRemark: defaultJournalRemark('incoming-payments', { entityCode: c.code, entityName: c.name }),
      rows,
      onAccount: 0,
      addInSequence: false,
    };
  }

  const setType = (type: IncomingType) =>
    update({ type, ...(type === 'Account' ? { customerId: '', customerCode: '', customerName: '', billTo: '', rows: [], onAccount: 0, journalRemark: 'Incoming –' } : { accountRows: [] }) });

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<IncomingInput> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (ro && !overrides.approved) {
      setSaving(true);
      const p = await saveIncomingNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(RC_LIST_PATH, { state: { notice: `Remarks saved on payment ${incomingNumber(p)}.` } });
    }
    // Account payments' journal remark names the (last) account, as SAP does.
    const lastAccount = draft.accountRows[draft.accountRows.length - 1]?.account;
    const base: IncomingInput = draft.type === 'Account' && lastAccount && /^Incoming\s*[–-]\s*\d*$/.test(draft.journalRemark) ? { ...draft, journalRemark: `Incoming – ${lastAccount}` } : draft;
    const doc: IncomingInput = { ...base, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, fx, effectiveDraft);
    setProblems(found);
    if (found.length) {
      // The control account lives in the customer panel.
      if (found.some((p) => p.key === 'controlAccount') && customer) setCustomerDetailsOpen(true);
      return;
    }
    setSaving(true);
    try {
      const p = effectiveDraft ? await saveIncomingDraft(doc) : await addIncomingPayment(doc, fx, m);
      navigate(RC_LIST_PATH, { state: { notice: effectiveDraft ? 'Draft saved.' : p.status === 'Not Confirmed' ? `Payment ${incomingNumber(p)} submitted for approval.` : `Payment ${incomingNumber(p)} added — ${p.currency} ${formatAmount(due)} from ${p.customerName || 'the account'}; journal entry ${p.transNo}.` } });
    } catch (err) {
      if (!(err instanceof IncomingPostError)) throw err;
      setProblems([{ tab: 'contents', key: 'rows', message: err.message }]);
      listArInvoices().then((invoices) => setM((prev) => prev && { ...prev, invoices }));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (on: 'current' | 'original') => {
    try {
      const p = await cancelIncomingPayment(draft as IncomingPayment, on, m);
      navigate(RC_LIST_PATH, { state: { notice: `Payment ${incomingNumber(p)} cancelled — reversing entry dated ${formatDate(p.cancelDate)}, and the invoices it paid are open again.` } });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const paidInvoices = [...new Map(paidRows(draft).map((r) => [r.invoiceId, r])).values()];
  const saved = draft as IncomingPayment;
  const recallIt = async () => { const p = await recallIncomingPayment(saved); navigate(RC_LIST_PATH, { state: { notice: `Payment ${incomingNumber(p)} recalled to draft.` } }); };
  const rejectIt = async () => { await logRejection('RCV', saved.id, saved.customerId, rejectionReason); await recallIncomingPayment(saved); navigate(RC_LIST_PATH, { state: { notice: `Payment ${incomingNumber(saved)} rejected and returned to draft.` } }); };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Draft' && !draft.approved ? [{ label: 'Submit for approval', icon: 'upload', onSelect: () => submit(null, false) }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Approve', icon: 'verified', onSelect: () => submit(null, false, { approved: true }) }, { label: 'Recall', icon: 'undo', onSelect: recallIt }, { label: 'Reject', icon: 'cancel', onSelect: () => setRejecting(true) }] : []),
    ...(draft.status === 'Posted'
      ? [
          { label: 'Cancel — date it today', icon: 'cancel', onSelect: () => cancel('current') },
          ...(draft.postingDate !== todayISO() ? [{ label: `Cancel — date it ${formatDate(draft.postingDate)}`, icon: 'event_busy', onSelect: () => cancel('original') }] : []),
        ]
      : []),
    ...(entryId ? [{ label: `Open journal entry ${draft.transNo}`, icon: 'menu_book', onSelect: () => navigate(`/accounting/journal-entries/${entryId}`) }] : []),
    ...paidInvoices.map((r) => ({ label: `Open A/R invoice ${r.docNo}`, icon: 'receipt', onSelect: () => navigate(`/sales/invoices/${r.invoiceId}`) })),
    ...(customer ? [{ label: `Open customer ${customer.code}`, icon: 'person', onSelect: () => navigate(`/sales/customers/${customer.id}`) }] : []),
  ];

  const title = isNew ? 'New incoming payment' : added ? incomingNumber(draft) : 'Draft incoming payment';

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="savings"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          breadcrumbs={[{ label: 'Payments Received', href: RC_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(RC_LIST_PATH)}
          trailing={
            isNew ? undefined : <PrevNext path={RC_LIST_PATH} prevId={prevId} nextId={nextId} />
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={isNew ? undefined : <Badge size="small" intent={RC_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              {ro ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(RC_LIST_PATH)}>Cancel</Button>}
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : ro ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {page === 'activity' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'RCV', id: draft.id ?? '' }} partnerId={draft.customerId} />
          </Panel.Body>
        ) : page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <SalesDocumentFlow
              kind="RCV"
              id={draft.id}
              notes="Everything linked to this payment: the invoices it settled."
            />
          </Panel.Body>
        ) : page === 'transactions' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">Save the document first to see related documents.</Text>
          </Panel.Body>
        ) : null}
        {page === 'details' ? (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
            {rejecting ? (<Alert intent="danger" variant="outline" title="Reject incoming payment"><div className="flex flex-col gap-2"><TextField aria-label="Rejection reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.currentTarget.value)} placeholder="Explain why…" /><div className="flex gap-2"><Button type="button" intent="danger" variant="solid" size="small" onClick={rejectIt}>Confirm reject</Button><Button type="button" intent="white" variant="solid" size="small" onClick={() => { setRejecting(false); setRejectionReason(''); }}>Cancel</Button></div></div></Alert>) : null}
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Cancelled' ? 'This payment is cancelled' : draft.status === 'Not Confirmed' ? 'This payment is waiting for approval' : 'This payment is posted'}>
                {draft.status === 'Cancelled'
                  ? `A reversing entry was posted on ${formatDate(draft.cancelDate)}, and the invoices it paid reopened.`
                  : draft.status === 'Not Confirmed'
                    ? 'Approve it from You can also to post it. Only remarks and attachments can change.'
                    : `Journal entry ${draft.transNo}. Only remarks and attachments can change; to undo it, cancel it.`}
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <aside className="flex flex-col gap-2 lg:col-span-3">
                <IncomingDocumentCard draft={draft} update={update} errors={errors} readOnly={ro} />
                <IncomingSettingsCard draft={draft} update={update} readOnly={ro} onType={setType} />
                <IncomingRemarksCard draft={draft} update={update} readOnly={ro} />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Deposit slip, bank advice, scanned check, the customer's BIR Form 2307." withDescription />
              </aside>

              <div className="flex flex-col gap-2 lg:col-span-9">
                {draft.type === 'Customer' ? (
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={added}
                    error={errors.customerId}
                    onPickCustomer={(v) => setDraft(withCustomer(draft, v, m))}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                ) : (
                  <fieldset disabled={ro} className="contents">
                    <Section icon="account_balance" title="Account payment">
                      <FormField label="Doc. currency" error={errors.currency}>
                        {(p) => <Select {...p} disabled={ro} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
                      </FormField>
                    </Section>
                  </fieldset>
                )}
                {draft.type === 'Customer' ? (
                  <IncomingDocuments draft={draft} update={update} errors={errors} accounts={m.accounts} fx={fx} readOnly={ro} />
                ) : (
                  <IncomingAccounts draft={draft} update={update} errors={errors} accounts={m.accounts} fx={fx} readOnly={ro} />
                )}
                <IncomingMeansSection draft={draft} update={update} accounts={m.accounts} fx={fx} readOnly={ro} />
                {errors.means ? <Text variant="small" tone="danger">{errors.means}</Text> : null}
                <Section icon="account_balance" title="Journal entry">
                  {journal.length ? (
                    <List.Group divider>
                      {journal.map((j) => (
                        <List.Item key={j.account} title={accountText(j.account, m.accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
                      ))}
                    </List.Group>
                  ) : (
                    <Text variant="small" tone="muted">Dr the payment means' accounts / Cr the customer (or the G/L lines), in PHP.</Text>
                  )}
                </Section>
              </div>
            </div>
          </Panel.Body>
        ) : null}
      </Panel>
    </Form>
    <IncomingCustomerPanel customer={customer} draft={draft} update={update} errors={errors} accounts={m.accounts} readOnly={ro} open={customerDetailsOpen} onClose={() => setCustomerDetailsOpen(false)} />
    </>
  );
}
