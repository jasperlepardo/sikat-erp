import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { postDocumentEntry, reverseDocumentEntry } from '../../../../services/journalEntries';
import {
  Alert,
  Badge,
  Form,
  FormField,
  List,
  Panel,
  Radio,
  Select,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, FieldStack, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { FX_GAIN_ACCOUNT, FX_LOSS_ACCOUNT, PAYMENT_SERIES, PAYMENT_STATUSES, blankPayment, type OutgoingPayment, type PaymentStatus, type PaymentType } from '../../../../mocks/outgoingPayments';
import { type Partner } from '../../../../mocks/partners';
import { listApInvoices } from '../../../../services/apInvoices';
import { formatDate, todayISO } from '../../../../services/dates';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { formatAmount } from '../../../../services/format';
import { cardBrands } from '../../../../services/partnerMasters';
import { activeOptions, loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, rateOn, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../../services/masterData';
import {
  PaymentPostError,
  addPayment,
  cancelPayment,
  getPayment,
  listPayments,
  meansBalance,
  overallAmount,
  paymentJournal,
  paymentNumber,

  rowFxDifference,
  rowSettled,
  recallPayment,
  savePaymentDraft,
  savePaymentRemarks,
  weightedDueDate,
} from '../../../../services/outgoingPayments';
import { listPartnersByRole } from '../../../../services/partners';
import { projectDef } from '../../../settings/masterDefs';
import { ReferencesTable } from '../../shared/ReferencesTable';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { VendorCard } from '../../shared/VendorCard';
import { PayPayeeDetailsPanel } from './PayPayeeDetailsPanel';
import { PayVendorRows, PayAccountRows } from './PayVendorRowsCard';
import { PayMeansCard } from './PayMeansCard';
import { invoiceAdvanceBalance, invoiceBalance, openRows, requestBalance, type PayMasters, type PaymentDraft } from './types';
import { listDownPayments } from '../../../../services/apDownPayments';
import { listDownPaymentInvoices } from '../../../../services/apDownPaymentInvoices';
import { logRejection } from '../../../../services/approvalRules';
import { isApprover, needsApproval } from '../../../../services/approval';
import { useDocTitle } from '../../../../services/useDocTitle';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { PAYMENT_LIST_PATH, PAYMENT_NOUN, PAYMENT_STATUS_INTENT } from '../../paths';

type TabId = 'contents' | 'means';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

const ALL_CURRENCIES = 'All currencies';

function validate(d: PaymentDraft, m: PayMasters, fx: number, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  if (d.type === 'Vendor') need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate} — add it in Settings › Accounting & Tax › Exchange rates.`);
  if (d.type === 'Vendor') {
    const paid = d.rows.filter((r) => r.selected && r.amount > 0);
    need(paid.length || d.onAccount > 0, 'contents', 'rows', 'Tick at least one invoice, or enter an amount on account.');
    for (const r of paid) {
      need(rowSettled(r) <= r.balanceDue + 0.005, 'contents', `row:${r.id}`, `${r.docNo}: paying ${formatAmount(rowSettled(r))} but only ${formatAmount(r.balanceDue)} is due.`);
      need(!m.invoices.find((i) => i.id === r.invoiceId)?.paymentBlock, 'contents', `row:${r.id}`, `${r.docNo} has a payment block — lift it on the invoice first.`);
    }
    need(!d.onAccount || d.controlAccount, 'contents', 'controlAccount', 'Pick the control account for the amount on account.');
  } else {
    need(d.payeeName.trim(), 'header', 'payeeName', 'Enter who the payment is to (To order of).');
    need(d.accountRows.length, 'contents', 'accountRows', 'Add at least one G/L account.');
    for (const r of d.accountRows) need(r.account && r.amount > 0, 'contents', `acct:${r.id}`, 'Every account line needs an account and an amount.');
  }
  need(overallAmount(d) > 0, 'means', 'overall', 'Nothing to pay yet.');
  const balance = meansBalance(d);
  need(!balance, 'means', 'means', balance > 0 ? `The payment means are ${d.currency} ${formatAmount(balance)} short of the amount due.` : `The payment means are ${d.currency} ${formatAmount(-balance)} more than the amount due.`);
  for (const c of d.means.checks) need(c.account && c.amount > 0 && (!c.manual || c.checkNo > 0), 'means', `check:${c.id}`, 'Every check needs a bank account, an amount, and — for a manual check — its number.');
  for (const c of d.means.cards) need(c.cardBrandId && c.account && c.amount > 0, 'means', `card:${c.id}`, 'Every card line needs the card, its account and an amount.');
  return problems;
}

/** Keyed by record so moving between payments starts a fresh form. */
export function PaymentDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PaymentForm key={id === 'new' ? location.key : id} />;
}

function PaymentForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { vendorId?: string; invoiceIds?: string[] } | null;

  const payApproved = !needsApproval('PMT');
  const [draft, setDraft] = useState<PaymentDraft | null | undefined>(isNew ? { ...blankPayment(todayISO()), approved: payApproved } : undefined);
  const [m, setM] = useState<PayMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${PAYMENT_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [vendorDetailsOpen, setVendorDetailsOpen] = useState(false);
  const reject = useReject();

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
      listApInvoices(),
      cardBrands.list(),
      listDownPayments(),
      listDownPaymentInvoices(),
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, invoices, cards, downPayments, downPaymentInvoices]) => {
      const masters: PayMasters = { vendors, items, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, invoices, accounts: inv.accounts, cardBrands: cards, downPayments, downPaymentInvoices };
      setM(masters);
      // Pay from a vendor's page or an invoice: the vendor, with those invoices ticked.
      const vendor = state?.vendorId ? vendors.find((v) => v.id === state.vendorId) : undefined;
      if (isNew && vendor) setDraft((d) => d && { ...d, ...vendorDefaults(vendor, d, masters, state?.invoiceIds ?? []) });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPayment(id).then((p) => !cancelled && setDraft(p ?? null));
    listPayments().then((all) => !cancelled && setSiblings(siblingKeys(all, paymentNumber)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${PAYMENT_NOUN.one}` : draft.status !== 'Draft' ? paymentNumber(draft) : `Draft ${PAYMENT_NOUN.one}`) : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading payment…</Text>;
  if (draft === null) return <NotFound icon="payments" title="Payment not found" backTo={PAYMENT_LIST_PATH} backLabel="Back to payments" />;

  const added = draft.status !== 'Draft';
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (rateOn(m.rates, draft.currency, draft.postingDate)?.rate ?? 0);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? paymentNumber(draft as OutgoingPayment) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const vendorAccountOf = (invoiceId: string) => m.invoices.find((i) => i.id === invoiceId)?.controlAccount ?? '';
  const journal = fx ? paymentJournal(draft, fx, vendorAccountOf) : [];
  const fxLine = journal.find((j) => j.account === FX_GAIN_ACCOUNT || j.account === FX_LOSS_ACCOUNT);
  const code = draft.currency;

  // The due date follows the payment means' dates while it still holds the computed one.
  const update = (patch: Partial<PaymentDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.means && draft.dueDate === weightedDueDate(draft.means, draft.postingDate)) next.dueDate = weightedDueDate(next.means, next.postingDate);
    setDraft(next);
  };
  const h = bind(draft, update);

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? vendorDefaults(v, draft, m, []) : { vendorId: '', vendorCode: '', payeeName: '', rows: [], payTo: '', contactId: '' });
  };
  const switchType = (type: PaymentType) =>
    update({ ...blankPayment(draft.postingDate), type, postingDate: draft.postingDate, documentDate: draft.documentDate, journalRemark: type === 'Account' ? 'Outgoing –' : '' });

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<PaymentDraft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it (which posts it).
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await savePaymentRemarks(draft as OutgoingPayment, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const doc: PaymentDraft = { ...draft, ...overrides };
    const effectiveDraft = asDraft || (e !== null && draft.status === 'Draft' && !doc.approved);
    const found = validate(doc, m, fx, effectiveDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      // Balances as they are now, so a payment added elsewhere since this form opened counts.
      const [fresh, requests, dpiInvs] = await Promise.all([listApInvoices(), listDownPayments(), listDownPaymentInvoices()]);
      const balances = new Map([
        ...fresh.map((inv) => [inv.id, invoiceBalance(inv, m).balanceDue] as const),
        ...requests.map((d) => [d.id, requestBalance(d, m).balanceDue] as const),
        ...dpiInvs.map((d) => [d.id, invoiceAdvanceBalance(d, m).balanceDue] as const),
      ]);
      const saved = effectiveDraft ? await savePaymentDraft(doc) : await addPayment(doc, fx, balances);
      if (!effectiveDraft && saved.status === 'Posted') {
        await postDocumentEntry({
          origin: 'PS',
          originNo: saved.docNum,
          originId: saved.id,
          postingDate: saved.postingDate,
          remarks: saved.journalRemark,
          partnerId: saved.vendorId,
          controlAccount: saved.controlAccount,
          lines: journal,
        });
      }
      navigate(PAYMENT_LIST_PATH, {
        state: {
          notice: effectiveDraft
            ? `Draft saved — ${saved.payeeName || 'payment'}.`
            : saved.status === 'Not Confirmed'
            ? `Payment ${paymentNumber(saved)} submitted for approval.`
            : `Payment ${paymentNumber(saved)} added — ${code} ${formatAmount(overallAmount(saved))} to ${saved.payeeName}${fxLine ? `, with a realized exchange ${fxLine.debit ? 'loss' : 'gain'} of PHP ${formatAmount(fxLine.debit || fxLine.credit)}` : ''}.`,
        },
      });
    } catch (err) {
      if (!(err instanceof PaymentPostError)) throw err;
      setProblems([{ tab: 'contents', key: 'rows', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as OutgoingPayment;
  const paidInvoices = draft.rows.filter((r) => r.selected && r.amount > 0);
  const cancelIt = async () => {
    const p = await cancelPayment(saved);
    await reverseDocumentEntry(saved.id);
    navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(p)} cancelled — the invoices it paid are open again${p.means.checks.length ? ' and its checks are void' : ''}.` } });
  };
  const recallIt = async () => { const p = await recallPayment(saved); navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(p)} recalled to draft.` } }); };
  const rejectIt = async (rejectionReason: string) => { await logRejection('PAY', saved.id, saved.vendorId, rejectionReason); await recallPayment(saved); navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(saved)} rejected and returned to draft.` } }); };
  const statusMoves: Partial<Record<PaymentStatus, () => void>> = draft.status === 'Draft' ? (draft.approved ? { Posted: () => submit(null) } : { 'Not Confirmed': () => submit(null) }) : draft.status === 'Not Confirmed' ? { Posted: () => submit(null, false, { approved: true }) } : draft.status === 'Posted' ? { Cancelled: cancelIt } : {};

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Posted'
      ? [
          {
            label: `Cancel ${PAYMENT_NOUN.one}`,
            icon: 'cancel',
            onSelect: cancelIt,
          },
        ]
      : []),
  ];

  const title = isNew ? `New ${PAYMENT_NOUN.one}` : added ? paymentNumber(draft) : `Draft ${PAYMENT_NOUN.one}`;
  const sectionProps = { draft, update, errors, m, fx, readOnly: added };

  return (
    <>
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PageHeader
          variant="plain"
          icon="payments"
          parent={{ noun: PAYMENT_NOUN, to: PAYMENT_LIST_PATH }}
          title={title}
          tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p }))} />}
          status={isNew ? undefined : <Badge size="small" intent={PAYMENT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <DetailActions
              noun={PAYMENT_NOUN}
              listPath={PAYMENT_LIST_PATH}
              mode={docMode(draft.status, { canApprove: isApprover('PMT') })}
              needsApproval={!draft.approved}
              remarksOnly={added}
              busy={saving}
              onDraft={() => submit(null, true)}
              onSubmit={() => submit(null)}
              onApprove={() => submit(null, false, { approved: true })}
              onReject={reject.start}
              menu={menu}
              prevNext={isNew ? undefined : { path: PAYMENT_LIST_PATH, prevId, nextId }}
            />
          }
        />
        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow kind="PAY" id={draft.id} notes="Everything linked to this payment: the A/P invoices it paid, and back through them to their receipts and purchase orders." />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'PAY', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', means: 'Payment means' })[t]} />
            {reject.alert('Reject outgoing payment', rejectIt)}
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Posted' ? 'This payment is added' : `This payment was cancelled ${formatDate(draft.cancelDate)}`}>
                {draft.status === 'Posted'
                  ? 'The invoices it paid show it as applied. Only remarks and attachments can change; to undo it, cancel the payment.'
                  : 'The invoices it paid are open again. Only remarks and attachments can change.'}
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <fieldset disabled={added} className="contents">
                  {draft.type === 'Vendor' ? (
                    <VendorCard
                      vendors={m.vendors}
                      vendorId={draft.vendorId}
                      vendor={vendor}
                      readOnly={added}
                      added={added}
                      error={errors.vendorId}
                      tooltip="Picking one lists its open A/P invoices in its currency."
                      pickVendor={pickVendor}
                      onOpenDetails={() => setVendorDetailsOpen(true)}
                    />
                  ) : (
                    <Section icon="account_tree" title="Payee">
                      <Fields>
                        {h.text('payeeName', 'To order of', { required: true, error: errors.payeeName, hint: 'Who the payment is to, e.g. Meralco.' })}
                        {h.text('payTo', 'Pay to', { hint: 'Their address, for the check or transfer.' })}
                        <FormField label="Doc. currency">
                          {(p) => <Select {...p} options={activeOptions(m.currencies, (c) => c.code, (c) => `${c.code} — ${c.name}`, draft.currency)} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
                        </FormField>
                      </Fields>
                      {errors.currency ? <Text variant="small" tone="danger">{errors.currency}</Text> : null}
                    </Section>
                  )}
                </fieldset>

                {draft.type === 'Vendor' ? <PayVendorRows {...sectionProps} /> : <PayAccountRows {...sectionProps} />}
                <PayMeansCard {...sectionProps} />

                <Section icon="account_balance" title="Journal entry">
                  {journal.length ? (
                    <List.Group divider>
                      {journal.map((j) => (
                        <List.Item
                          key={j.account}
                          title={accountText(j.account, m.accounts)}
                          content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
                        />
                      ))}
                    </List.Group>
                  ) : null}
                  {fxLine ? (
                    <Alert intent={fxLine.debit ? 'warning' : 'success'} variant="outline" title={`Realized exchange ${fxLine.debit ? 'loss' : 'gain'}: PHP ${formatAmount(fxLine.debit || fxLine.credit)}`}>
                      {paidInvoices.filter((r) => rowFxDifference(r, fx)).map((r) => (
                        <div key={r.id}>
                          {r.docNo}: {code} {formatAmount(rowSettled(r))} booked at {r.invoiceFx}, paid at {fx} — PHP {formatAmount(Math.abs(rowFxDifference(r, fx)))} {rowFxDifference(r, fx) > 0 ? 'more' : 'less'}.
                        </div>
                      ))}
                    </Alert>
                  ) : null}
                  <Text variant="small" tone="muted">
                    {journal.length
                      ? `In PHP${code === 'PHP' ? '' : ` at ${fx}`}. Each invoice clears the vendor at the rate it was booked at; the payment means are credited at today's rate, and the difference is the realized exchange gain or loss.`
                      : 'Made when the payment is added: Dr the vendor (or the G/L accounts) / Cr the payment means. Tick invoices and fill in the payment means to see it.'}
                  </Text>
                </Section>

                <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this payment refers to." />
                <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Attach the deposit slip, transfer confirmation or the vendor's official receipt." />
              </div>

              <aside className="flex flex-col gap-2 lg:col-span-4">
                <fieldset disabled={added} className="contents">
                  <Section icon="tag" title="Document">
                    <FieldStack>
                      {/* Narrow aside: once added the series is fixed, so show just the number. */}
                      {added ? (
                        <ReadOnly label="No." value={paymentNumber(draft)} />
                      ) : (
                        <FormField label="No." tooltip="Assigned from the series when the payment is added.">
                          {() => (
                            <div className="flex gap-1">
                              <Select aria-label="Series" className="min-w-0 flex-1" options={PAYMENT_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                              <span className="shrink-0 self-center whitespace-nowrap text-sm">{draft.docNum ? paymentNumber(draft) : <span className="text-placeholder">Next number</span>}</span>
                            </div>
                          )}
                        </FormField>
                      )}
                      <StatusField statuses={PAYMENT_STATUSES} intents={PAYMENT_STATUS_INTENT} value={draft.status} moves={statusMoves} />
                      {h.date('postingDate', 'Posting date', {
                        required: true,
                        error: errors.postingDate,
                        hint: code === 'PHP' ? 'The day the payment is booked.' : `Sets the rate the ${code} is paid at: ${fx || '—'}. Invoices are cleared at the rate they were booked at.`,
                      })}
                      {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                      {h.date('dueDate', 'Due date', { hint: "The vendor row's due date: the payment means' dates, weighted by amount." })}
                    </FieldStack>
                  </Section>
                </fieldset>

                <fieldset disabled={added} className="contents">
                  <Section icon="settings" title="Settings">
                    <div className="flex flex-col gap-1" role="radiogroup" aria-label="Payment type">
                      <Text variant="small" tone="muted">Pay to</Text>
                      {(['Vendor', 'Account'] as PaymentType[]).map((t) => (
                        <Radio key={t} name="payment-type" checked={draft.type === t} disabled={added} onChange={() => switchType(t)}>
                          {t === 'Vendor' ? 'A vendor' : 'An account (no business partner)'}
                        </Radio>
                      ))}
                    </div>
                    <FieldStack>
                      {h.master('projectId', 'Project', projectDef, { clearable: true })}
                      {h.text('reference', 'Reference', { hint: 'Any extra reference, e.g. the vendor’s statement no.' })}
                    </FieldStack>
                  </Section>
                </fieldset>

                <Section icon="notes" title="Remarks">
                  <FieldStack>
                    {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the payment is added.' })}
                    <fieldset disabled={added} className="contents">
                      {h.text('journalRemark', 'Journal remarks', { hint: 'Shown on the journal entry. Defaults to “Outgoing – vendor code”.' })}
                    </fieldset>
                  </FieldStack>
                </Section>
              </aside>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
    <PayPayeeDetailsPanel draft={draft} update={update} vendor={vendor} m={m} readOnly={added} open={vendorDetailsOpen} onClose={() => setVendorDetailsOpen(false)} />
    </>
  );
}

/** What picking a vendor fills: its currency, open invoices (with `tick` ticked), account and defaults. */
function vendorDefaults(v: Partner, d: PaymentDraft, m: PayMasters, tick: string[]): Partial<PaymentDraft> {
  const currency = v.currency === ALL_CURRENCIES ? 'PHP' : v.currency;
  const payTo = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
  return {
    vendorId: v.id,
    vendorCode: v.code,
    payeeName: v.name,
    contactId: v.defaultContactId,
    payTo: payTo ? formatAddress(payTo, v.name) : '',
    projectId: v.projectId,
    currency,
    rows: openRows(m, v.id, currency, tick),
    controlAccount: v.payableAccount || '2010',
    journalRemark: defaultJournalRemark('outgoing-payments', { entityCode: v.code, entityName: v.name }),
    onAccount: 0,
    means: { ...d.means, transfer: { ...d.means.transfer, account: currency === 'USD' ? '1018' : '1015' } },
  };
}
