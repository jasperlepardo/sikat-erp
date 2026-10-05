import { useEffect, useState, type FormEvent } from 'react';
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
  Radio,
  Select,
  Tabs,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { formatAddress } from '../../../../mocks/address';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { FX_GAIN_ACCOUNT, FX_LOSS_ACCOUNT, PAYMENT_SERIES, blankPayment, type OutgoingPayment, type PaymentStatus, type PaymentType } from '../../../../mocks/outgoingPayments';
import { contactName, type Partner } from '../../../../mocks/partners';
import { listApInvoices } from '../../../../services/apInvoices';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { cardBrands } from '../../../../services/partnerMasters';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
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
  paymentSeriesOf,
  rowFxDifference,
  rowSettled,
  savePaymentDraft,
  savePaymentRemarks,
  weightedDueDate,
} from '../../../../services/outgoingPayments';
import { listPartnersByRole } from '../../../../services/partners';
import { projectDef } from '../../../settings/masterDefs';
import { ReferencesTable } from '../../orders/detail/AccountingTab';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { AccountRows, VendorRows } from './PaymentContents';
import { PaymentMeansSection } from './PaymentMeansSection';
import { invoiceBalance, openRows, type PayMasters, type PaymentDraft } from './types';

export const PAYMENT_LIST_PATH = '/purchasing/payments-made';

type TabId = 'contents' | 'means';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

export const PAYMENT_STATUS_INTENT: Record<PaymentStatus, 'default' | 'success' | 'danger'> = {
  Draft: 'default',
  Posted: 'success',
  Cancelled: 'danger',
};

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
  for (const c of d.means.cards) need(c.card && c.account && c.amount > 0, 'means', `card:${c.id}`, 'Every card line needs the card, its account and an amount.');
  return problems;
}

/** Keyed by record so moving between payments starts a fresh form. */
export function PaymentDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PaymentForm key={id === 'new' ? location.key : id} />;
}

function PaymentForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const state = useLocation().state as { vendorId?: string; invoiceIds?: string[] } | null;

  const [draft, setDraft] = useState<PaymentDraft | null | undefined>(isNew ? blankPayment(todayISO()) : undefined);
  const [m, setM] = useState<PayMasters>();
  const [page, setPage] = useState<PageId>('details');
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

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
    ]).then(([vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, invoices, cards]) => {
      const masters: PayMasters = { vendors, items, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, invoices, accounts: inv.accounts, cardBrands: cards };
      setM(masters);
      // Pay from a vendor's page or an invoice: the vendor, with those invoices ticked.
      const vendor = state?.vendorId ? vendors.find((v) => v.id === state.vendorId) : undefined;
      if (isNew && vendor) setDraft((d) => d && { ...d, ...vendorDefaults(vendor, d, masters, state?.invoiceIds ?? []) });
    });
    if (isNew || !id) return;
    let cancelled = false;
    getPayment(id).then((p) => !cancelled && setDraft(p ?? null));
    listPayments().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((p) => p.id)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading payment…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="payments" title="Payment not found" />
        <Panel.Body>
          <Button onClick={() => navigate(PAYMENT_LIST_PATH)}>Back to payments</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const added = draft.status !== 'Draft';
  const fx = draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (rateOn(m.rates, draft.currency, draft.postingDate)?.rate ?? 0);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
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

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    if (added) {
      setSaving(true);
      try {
        const saved = await savePaymentRemarks(draft as OutgoingPayment, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(saved)} saved.` } });
      } finally {
        setSaving(false);
      }
      return;
    }
    const found = validate(draft, m, fx, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      // Balances as they are now, so a payment added elsewhere since this form opened counts.
      const fresh = await listApInvoices();
      const balances = new Map(fresh.map((inv) => [inv.id, invoiceBalance(inv, m).balanceDue]));
      const saved = asDraft ? await savePaymentDraft(draft) : await addPayment(draft, fx, balances);
      navigate(PAYMENT_LIST_PATH, {
        state: {
          notice: asDraft
            ? `Draft saved — ${saved.payeeName || 'payment'}.`
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
  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Posted'
      ? [
          {
            label: 'Cancel payment',
            icon: 'cancel',
            onSelect: async () => {
              const p = await cancelPayment(saved);
              navigate(PAYMENT_LIST_PATH, { state: { notice: `Payment ${paymentNumber(p)} cancelled — the invoices it paid are open again${p.means.checks.length ? ' and its checks are void' : ''}.` } });
            },
          },
        ]
      : []),
    ...paidInvoices.map((r) => ({ label: `Open A/P invoice ${r.docNo}`, icon: 'request_quote', onSelect: () => navigate(`/purchasing/bills/${r.invoiceId}`) })),
    ...(vendor ? [{ label: `Open vendor ${vendor.code}`, icon: 'local_shipping', onSelect: () => navigate(`/purchasing/vendors/${vendor.id}`) }] : []),
  ];

  const title = isNew ? 'New outgoing payment' : added ? `Outgoing payment ${paymentNumber(draft)}` : 'Draft outgoing payment';
  const sectionProps = { draft, update, errors, m, fx, readOnly: added };
  const payToOptions = (vendor?.addresses ?? []).map((a) => ({ value: formatAddress(a, vendor!.name), label: `${a.label || 'Address'} · ${a.city || a.country}` }));

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="payments"
          title={title}
          subcopy={draft.payeeName ? `${draft.vendorCode ? `${draft.vendorCode} · ` : ''}${draft.payeeName}` : 'Pay a vendor, or pay straight to G/L accounts.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${PAYMENT_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${PAYMENT_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={<Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))} />}
          status={isNew ? undefined : <Badge intent={PAYMENT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(PAYMENT_LIST_PATH)}>
                {added ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow kind="PAY" id={draft.id} notes="Everything linked to this payment: the A/P invoices it paid, and back through them to their receipts and purchase orders." />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert problems={problems} tabLabel={(t) => ({ contents: 'Contents', means: 'Payment means' })[t]} />
            {added ? (
              <Alert intent="default" variant="outline" title={draft.status === 'Posted' ? 'This payment is added' : `This payment was cancelled ${formatDate(draft.cancelDate)}`}>
                {draft.status === 'Posted'
                  ? 'The invoices it paid show it as applied. Only remarks and attachments can change; to undo it, cancel the payment.'
                  : 'The invoices it paid are open again. Only remarks and attachments can change.'}
              </Alert>
            ) : null}

            <fieldset disabled={added} className="contents">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Section icon={draft.type === 'Vendor' ? 'storefront' : 'account_tree'} title="Payee">
                  <div className="flex gap-6" role="radiogroup" aria-label="Payment type">
                    {(['Vendor', 'Account'] as PaymentType[]).map((t) => (
                      <Radio key={t} name="payment-type" checked={draft.type === t} onChange={() => switchType(t)}>
                        {t}
                      </Radio>
                    ))}
                  </div>
                  <Fields>
                    {draft.type === 'Vendor' ? (
                      <>
                        <div className="md:col-span-2">
                          {added ? (
                            <ReadOnly label="Vendor" value={draft.payeeName} description={`${draft.vendorCode} · ${code}`} />
                          ) : (
                            <FormField label="Vendor" required error={errors.vendorId} tooltip="Picking one lists its open A/P invoices in its currency.">
                              {(p) => (
                                <Combobox
                                  {...p}
                                  placeholder="Search vendors"
                                  options={m.vendors
                                    .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                                    .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))}
                                  value={draft.vendorId || null}
                                  onValueChange={pickVendor}
                                />
                              )}
                            </FormField>
                          )}
                        </div>
                        {h.lookup('payTo', 'Pay to', payToOptions.length ? payToOptions : [{ value: draft.payTo, label: draft.payTo || '—' }], { hint: "The vendor's address the payment goes to." })}
                        {h.lookup(
                          'contactId',
                          'Contact person',
                          [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
                          { disabled: !vendor },
                        )}
                        {vendor?.currency === ALL_CURRENCIES ? (
                          <FormField label="Currency" tooltip="This vendor takes all currencies — open invoices in the currency picked are listed.">
                            {(p) => (
                              <Select
                                {...p}
                                options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                                value={draft.currency}
                                onValueChange={(currency) => update({ currency, rows: openRows(m, draft.vendorId, currency) })}
                              />
                            )}
                          </FormField>
                        ) : (
                          <ReadOnly label="Currency" value={code} hint="The vendor's currency." />
                        )}
                      </>
                    ) : (
                      <>
                        {h.text('payeeName', 'To order of', { required: true, error: errors.payeeName, hint: 'Who the payment is to, e.g. Meralco.' })}
                        {h.text('payTo', 'Pay to', { hint: 'Their address, for the check or transfer.' })}
                        <FormField label="Doc. currency">
                          {(p) => <Select {...p} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
                        </FormField>
                      </>
                    )}
                    {h.master('project', 'Project', projectDef, { clearable: true })}
                  </Fields>
                </Section>

                <Section icon="tag" title="Document">
                  <Fields>
                    <FormField label="No." tooltip={added ? undefined : 'Assigned from the series when the payment is added.'}>
                      {(p) => (
                        <div className="flex gap-1">
                          <Select aria-label="Series" className="w-40" disabled={added} options={PAYMENT_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                          <TextField {...p} className="flex-1" readOnly placeholder={`Next ${paymentSeriesOf(draft.seriesId).name} number`} value={draft.docNum ? String(draft.docNum) : ''} />
                        </div>
                      )}
                    </FormField>
                    <ReadOnly label="Status" value={<Badge intent={PAYMENT_STATUS_INTENT[isNew ? 'Draft' : draft.status]}>{isNew ? 'New' : draft.status}</Badge>} />
                    {h.date('postingDate', 'Posting date', {
                      required: true,
                      error: errors.postingDate,
                      hint: code === 'PHP' ? 'The day the payment is booked.' : `Sets the rate the ${code} is paid at: ${fx || '—'}. Invoices are cleared at the rate they were booked at.`,
                    })}
                    {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
                    {h.date('dueDate', 'Due date', { hint: "The vendor row's due date: the payment means' dates, weighted by amount." })}
                    {h.text('reference', 'Reference', { hint: 'Any extra reference, e.g. the vendor’s statement no.' })}
                  </Fields>
                  {errors.currency ? <Text variant="small" tone="danger">{errors.currency}</Text> : null}
                </Section>
              </div>

              {draft.type === 'Vendor' ? <VendorRows {...sectionProps} /> : <AccountRows {...sectionProps} />}
              <PaymentMeansSection {...sectionProps} />
            </fieldset>

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="notes" title="Remarks">
                <Fields cols={1}>
                  <fieldset disabled={added} className="contents">
                    {h.text('journalRemark', 'Journal remarks', { hint: 'Shown on the journal entry. Defaults to “Outgoing – vendor code”.' })}
                  </fieldset>
                  {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the payment is added.' })}
                </Fields>
              </Section>

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
            </div>

            <ReferencesTable refs={draft.references} onChange={(references) => update({ references })} readOnly={added} description="Other documents this payment refers to." />
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Attach the deposit slip, transfer confirmation or the vendor's official receipt." />
          </Panel.Body>
        )}
      </Panel>
    </Form>
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
    project: v.project,
    currency,
    rows: openRows(m, v.id, currency, tick),
    controlAccount: v.payableAccount || '2010',
    journalRemark: `Outgoing – ${v.code}`,
    onAccount: 0,
    means: { ...d.means, transfer: { ...d.means.transfer, account: currency === 'USD' ? '1018' : '1015' } },
  };
}
