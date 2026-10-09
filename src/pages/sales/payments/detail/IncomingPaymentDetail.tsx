import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Combobox, Form, FormField, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Radio, Select, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import type { ArInvoice } from '../../../../mocks/arInvoices';
import { accountText, type Account } from '../../../../mocks/chartOfAccounts';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { INCOMING_SERIES, blankIncomingPayment, type IncomingPayment, type IncomingStatus, type IncomingType } from '../../../../mocks/incomingPayments';
import type { Item } from '../../../../mocks/items';
import { contactName, type Partner } from '../../../../mocks/partners';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import type { TaxCode } from '../../../../mocks/taxes';
import { listArInvoices } from '../../../../services/arInvoices';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import {
  IncomingPostError,
  addIncomingPayment,
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
import { projectDef } from '../../../settings/masterDefs';
import { IncomingAccounts, IncomingDocuments } from './IncomingContents';
import { IncomingMeansSection } from './IncomingMeansSection';

export const RC_LIST_PATH = '/sales/payments-received';
export const RC_STATUS_INTENT: Record<IncomingStatus, 'default' | 'success' | 'danger'> = { Draft: 'default', Posted: 'success', Cancelled: 'danger' };

type TabId = 'contents' | 'means' | 'attachments';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents', means: 'Payment means', attachments: 'Attachments' };

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

  const [draft, setDraft] = useState<IncomingInput | null | undefined>(isNew ? blankIncomingPayment(todayISO()) : undefined);
  const [m, setM] = useState<Masters>();
  const [tab, setTab] = useState<TabId>('contents');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
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
      listIncomingPayments().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((p) => p.id)));
      listJournalEntries().then((es) => !cancelled && setEntryId(es.find((e) => e.originId === id && !e.reverses)?.id));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading payment…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="savings" title="Incoming payment not found" />
        <Panel.Body>
          <Button onClick={() => navigate(RC_LIST_PATH)}>Back to payments received</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const added = draft.status !== 'Draft';
  const ro = added;
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (rateOn(m.rates, draft.currency, draft.postingDate)?.rate ?? 0);
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const journal = fx ? incomingJournal(draft, fx) : [];
  const due = amountDue(draft);
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const series = incomingSeriesOf(draft.seriesId);

  // The BP row's due date follows the payment means until it's typed over.
  const update = (patch: Partial<IncomingInput>) => {
    const next = { ...draft, ...patch };
    if (patch.means && draft.dueDate === weightedDueDate(draft.means, draft.postingDate)) next.dueDate = weightedDueDate(patch.means, draft.postingDate);
    setDraft(next);
  };
  const h = bind(draft, update);

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
      journalRemark: `Incoming - ${c.code}`,
      rows,
      onAccount: 0,
      addInSequence: false,
    };
  }

  const setType = (type: IncomingType) =>
    update({ type, ...(type === 'Account' ? { customerId: '', customerCode: '', customerName: '', billTo: '', rows: [], onAccount: 0, journalRemark: 'Incoming –' } : { accountRows: [] }) });

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (ro) {
      setSaving(true);
      const p = await saveIncomingNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(RC_LIST_PATH, { state: { notice: `Remarks saved on payment ${incomingNumber(p)}.` } });
    }
    // Account payments' journal remark names the (last) account, as SAP does.
    const lastAccount = draft.accountRows[draft.accountRows.length - 1]?.account;
    const doc: IncomingInput = draft.type === 'Account' && lastAccount && /^Incoming\s*[–-]\s*\d*$/.test(draft.journalRemark) ? { ...draft, journalRemark: `Incoming – ${lastAccount}` } : draft;
    const found = validate(doc, fx, asDraft);
    setProblems(found);
    if (found.length) {
      const first = found.find((p) => p.tab !== 'header');
      if (first) setTab(first.tab as TabId);
      return;
    }
    setSaving(true);
    try {
      const p = asDraft ? await saveIncomingDraft(doc) : await addIncomingPayment(doc, fx, m);
      navigate(RC_LIST_PATH, { state: { notice: asDraft ? 'Draft saved.' : `Payment ${incomingNumber(p)} added — ${p.currency} ${formatAmount(due)} from ${p.customerName || 'the account'}; journal entry ${p.transNo}.` } });
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
  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
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
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="savings"
          title={title}
          subcopy={draft.type === 'Account' ? 'Received to G/L accounts.' : draft.customerName ? `${draft.customerCode} · ${draft.customerName}` : 'Record money received from a customer.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${RC_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${RC_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={tab} onValueChange={(v) => setTab(v as TabId)} items={(Object.keys(TAB_LABEL) as TabId[]).map((t) => ({ value: t, label: TAB_LABEL[t], badge: problems.some((p) => p.tab === t) ? '!' : t === 'attachments' && draft.attachments.length ? String(draft.attachments.length) : undefined }))} />}
          status={isNew ? undefined : <Badge size="small" intent={RC_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(RC_LIST_PATH)}>
                {ro ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : ro ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
          {added ? (
            <Alert intent="default" variant="outline" title={draft.status === 'Cancelled' ? 'This payment is cancelled' : 'This payment is posted'}>
              {draft.status === 'Cancelled'
                ? `A reversing entry was posted on ${formatDate(draft.cancelDate)}, and the invoices it paid reopened.`
                : `Journal entry ${draft.transNo}. Only remarks and attachments can change; to undo it, cancel it.`}
            </Alert>
          ) : null}

          <fieldset disabled={ro} className="contents">
            <div className="flex flex-wrap items-center gap-6" role="radiogroup" aria-label="Payment type">
              {(['Customer', 'Account'] as IncomingType[]).map((t) => (
                <Radio key={t} name="incoming-type" checked={draft.type === t} disabled={ro} onChange={() => setType(t)}>
                  {t}
                </Radio>
              ))}
              <Text variant="small" tone="muted">Vendor refunds (against A/P credit memos) aren't built yet.</Text>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon={draft.type === 'Account' ? 'account_balance' : 'person'} title={draft.type === 'Account' ? 'Account payment' : 'Customer'}>
                <Fields>
                  {draft.type === 'Customer' ? (
                    <>
                      <div className="md:col-span-2">
                        {added ? (
                          <ReadOnly label="Code" value={draft.customerCode} />
                        ) : (
                          <FormField label="Code" required error={errors.customerId}>
                            {(p) => (
                              <Combobox
                                {...p}
                                placeholder="Search customers"
                                options={m.customers.filter((c) => c.status !== 'Inactive' || c.id === draft.customerId).map((c) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, text: `${c.code} ${c.name}` }))}
                                value={draft.customerId || null}
                                onValueChange={(v) => setDraft(withCustomer(draft, v, m))}
                              />
                            )}
                          </FormField>
                        )}
                      </div>
                      {h.text('customerName', 'Name')}
                      {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !customer })}
                      <div className="md:col-span-2">{h.area('billTo', 'Bill to', { rows: 3 })}</div>
                      {h.choose('controlAccount', 'Control account', m.accounts.filter((a) => a.control && a.active && a.drawer === 'Assets').map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })), { required: true, error: errors.controlAccount, hint: 'For the part not tied to an invoice (on account).' })}
                    </>
                  ) : (
                    <FormField label="Doc. currency" error={errors.currency}>
                      {(p) => <Select {...p} disabled={ro} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
                    </FormField>
                  )}
                  {h.master('projectId', 'Project', projectDef, { clearable: true })}
                  {h.choose('blanketAgreement', 'Blanket agreement', [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))])}
                  {h.text('reference', 'Reference', { hint: draft.type === 'Customer' ? "The customer's reference for this payment." : undefined })}
                  <ReadOnly label="Created by Payment Wizard" value="No" />
                </Fields>
              </Section>
              <Section icon="tag" title="Document">
                <Fields>
                  <FormField label="No." required error={errors.docNum}>
                    {(p) => (
                      <div className="flex gap-1">
                        <Select aria-label="Series" className="w-32" disabled={added} options={INCOMING_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId, docNum: 0 })} />
                        <TextField {...p} className="flex-1" type={series.manual && !added ? 'number' : 'text'} readOnly={!series.manual || added} placeholder={series.manual ? 'Receipt no. from the notebook' : 'Next number'} value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) || 0 })} />
                      </div>
                    )}
                  </FormField>
                  <ReadOnly label="Transaction No." value={draft.transNo ? String(draft.transNo) : '—'} hint="The journal entry's number, once added." />
                  {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
                  {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                  {h.date('dueDate', 'Due date', { hint: 'The BP row’s due date; follows the payment means (weighted average).' })}
                  <ReadOnly label="Status" value={<Badge intent={RC_STATUS_INTENT[draft.status]}>{isNew ? 'New' : draft.status}</Badge>} error={errors.status} />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? (
              draft.type === 'Customer' ? (
                <IncomingDocuments draft={draft} update={update} errors={errors} accounts={m.accounts} fx={fx} readOnly={ro} />
              ) : (
                <IncomingAccounts draft={draft} update={update} errors={errors} accounts={m.accounts} fx={fx} readOnly={ro} />
              )
            ) : null}
            {tab === 'means' ? <IncomingMeansSection draft={draft} update={update} accounts={m.accounts} fx={fx} readOnly={ro} /> : null}
          </fieldset>
          {tab === 'means' && errors.means ? <Text variant="small" tone="danger">{errors.means}</Text> : null}
          {tab === 'attachments' ? <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Deposit slip, bank advice, scanned check, the customer's BIR Form 2307." withDescription /> : null}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="notes" title="Remarks">
              <Fields cols={1}>
                {h.area('remarks', 'Remarks', { rows: 3 })}
                <fieldset disabled={ro} className="contents">
                  {h.text('journalRemark', 'Journal remarks', { hint: draft.type === 'Customer' ? 'Default: Incoming - customer code.' : 'Default: Incoming – the (last) account code.' })}
                </fieldset>
              </Fields>
            </Section>
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
        </Panel.Body>
      </Panel>
    </Form>
  );
}
