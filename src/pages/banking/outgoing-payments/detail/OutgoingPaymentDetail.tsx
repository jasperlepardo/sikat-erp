import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Panel, PanelHeader, Tabs, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import type { Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER } from '../../../../mocks/common';
import { blankPayment, type OutgoingPayment } from '../../../../mocks/outgoingPayments';
import type { Partner } from '../../../../mocks/partners';
import { listApInvoices } from '../../../../services/apInvoices';
import { formatDate, todayISO } from '../../../../services/dates';
import { formatAmount } from '../../../../services/format';
import { postDocumentEntry, postingPeriodProblem, reverseDocumentEntry } from '../../../../services/journalEntries';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { rateOn } from '../../../../services/masterData';
import {
  PaymentPostError,
  addPayment,
  cancelPayment,
  getPayment,
  listPayments,
  overallAmount,
  paymentJournal,
  paymentNumber,
  savePaymentDraft,
  savePaymentRemarks,
} from '../../../../services/outgoingPayments';
import { useDocTitle } from '../../../../services/useDocTitle';
import { invoiceBalance, openRows } from '../../../purchasing/payments-made/detail/types';
import { InvoicePanel } from '../InvoicePanel';
import { BANK_PAYMENTS_PATH, OP_STATUS_INTENT, billsOf, loadPayablesMasters, vendorBankAccount, vendorBankText, type PayablesMasters } from '../payables';
import { OpBillsCard } from './OpBillsCard';
import { OpDetailsCard } from './OpDetailsCard';
import { OpMethodCard } from './OpMethodCard';
import { OpRemarksCard } from './OpRemarksCard';
import { OpSummaryCard } from './OpSummaryCard';
import { OpVendorList } from './OpVendorList';
import { applyMeans, meansTabOf, type MeansTab, type OpArea, type OpDraft } from './types';

const ALL_CURRENCIES = 'All currencies';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

/** What picking a vendor fills: its currency, its open bills (with `tick` ticked), account and remarks. */
function vendorDefaults(v: Partner, d: OpDraft, m: PayablesMasters, tick: string[]): Partial<OpDraft> {
  const currency = v.currency === ALL_CURRENCIES ? 'PHP' : v.currency;
  return {
    vendorId: v.id,
    vendorCode: v.code,
    payeeName: v.name,
    contactId: '',
    payTo: '',
    projectId: v.projectId,
    currency,
    // Bills only: credit memos and down payment requests come back with document types.
    rows: openRows(m, v.id, currency, tick).filter((r) => r.docType !== 'DPR'),
    controlAccount: v.payableAccount || '2010',
    journalRemark: defaultJournalRemark('outgoing-payments', { entityCode: v.code, entityName: v.name }),
    onAccount: 0,
    means: { ...d.means, transfer: { ...d.means.transfer, account: currency === 'USD' ? '1018' : '1015' } },
  };
}

function validate(d: OpDraft, tab: MeansTab, onAccountOn: boolean, vendor: Partner | undefined, fx: number, asDraft: boolean): Problem<OpArea>[] {
  const { problems, need } = problemCollector<OpArea>();
  need(d.vendorId, 'header', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;

  const period = postingPeriodProblem(d.postingDate);
  need(!period, 'header', 'postingDate', period ?? '');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'postingDate', `No ${d.currency} exchange rate on or before ${formatDate(d.postingDate)}.`);

  const ticked = d.rows.filter((r) => r.selected);
  need(ticked.length || d.onAccount > 0, 'bills', 'rows', 'Tick at least one bill, or enter a payment on account.');
  for (const r of ticked) {
    need(r.amount > 0, 'bills', `row:${r.id}`, `${r.docNo}: the amount to pay must be more than 0.`);
    need(r.amount <= r.balanceDue + 0.005, 'bills', `row:${r.id}`, `${r.docNo}: no more than the balance due (${formatAmount(r.balanceDue)}).`);
  }
  if (onAccountOn) need(d.onAccount > 0, 'bills', 'onAccount', 'Enter the amount paid on account.');

  if (tab === 'transfer') {
    need(d.means.transfer.account, 'method', 'paidFrom', 'Pick the bank account it’s paid from.');
    need(vendorBankAccount(vendor), 'method', 'payTo', `${vendor?.name ?? 'The vendor'} has no bank account on file — add one on the vendor, or pay another way.`);
  } else if (tab === 'cash') {
    need(d.means.cash.account, 'method', 'paidFrom', 'Pick the cash fund it’s paid from.');
  } else if (tab === 'check') {
    need(d.means.checks[0]?.account, 'method', 'paidFrom', 'Pick the bank the check is drawn on.');
  } else {
    need(d.means.cards[0]?.cardBrandId, 'method', 'cardBrand', 'Pick the card brand.');
  }
  return problems;
}

/** Keyed by record so moving between payments starts a fresh form. */
export function OutgoingPaymentDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <OpForm key={id === 'new' ? location.key : id} />;
}

function OpForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { vendorId?: string; invoiceIds?: string[]; notice?: string } | null;

  const [draft, setDraft] = useState<OpDraft | null | undefined>(isNew ? { ...blankPayment(todayISO()), approved: true } : undefined);
  const [m, setM] = useState<PayablesMasters>();
  const [payments, setPayments] = useState<OutgoingPayment[]>([]);
  const [meansTab, setMeansTab] = useState<MeansTab>('transfer');
  const [onAccountOn, setOnAccountOn] = useState(false);
  // Nothing is saved until Save as Draft or Post: an accidental click leaves nothing behind.
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<Problem<OpArea>[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(state?.notice);
  const [pendingVendor, setPendingVendor] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [panelId, setPanelId] = useState<string | null>(null);
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPayablesMasters(), listPayments()]).then(([masters, all]) => {
      if (cancelled) return;
      setM(masters);
      setPayments(all);
      // Paying from Payables or the vendor list: the vendor, with the ticked bills ticked.
      const vendor = isNew && state?.vendorId ? masters.vendors.find((v) => v.id === state.vendorId) : undefined;
      if (vendor) setDraft((d) => d && { ...d, ...vendorDefaults(vendor, d, masters, state?.invoiceIds ?? []) });
    });
    if (!isNew && id)
      getPayment(id).then((p) => {
        if (cancelled) return;
        setDraft(p ?? null);
        if (p) {
          setMeansTab(meansTabOf(p.means));
          setOnAccountOn(p.onAccount > 0);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const title = !draft || isNew ? 'New payment' : draft.status === 'Draft' ? 'Draft payment' : paymentNumber(draft);
  useDocTitle(draft ? title : undefined);
  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading payment…</Text>;
  if (draft === null) return <NotFound icon="payments" title="Payment not found" backTo={BANK_PAYMENTS_PATH} backLabel="Back to payables" />;

  const readOnly = draft.status !== 'Draft';
  const code = draft.currency;
  const fx = code === 'PHP' ? 1 : readOnly ? draft.fxRate : (rateOn(m.rates, code, draft.postingDate)?.rate ?? 0);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);
  const bills = billsOf(m, todayISO());
  const ctx = { vendor, fx, readOnly, vendorLocked: Boolean(draft.vendorId) && (!isNew || Boolean(state?.vendorId)) };
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const siblings = payments
    .filter((p) => p.type === 'Vendor')
    .sort((a, b) => b.postingDate.localeCompare(a.postingDate))
    .map((p) => (p.docNum ? paymentNumber(p) : p.id));
  const { prevId, nextId } = neighbours(siblings, isNew ? undefined : id);
  const canPost = draft.rows.some((r) => r.selected && r.amount > 0) || draft.onAccount > 0;

  // The due date follows the posting date until it's changed.
  const update = (patch: Partial<OpDraft>) => {
    const next = { ...draft, ...patch };
    if (patch.postingDate && draft.dueDate === draft.postingDate) next.dueDate = patch.postingDate;
    setDraft(next);
    setDirty(true);
  };
  const pickVendor = (vendorId: string) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    update(v ? vendorDefaults(v, draft, m, []) : { vendorId: '', vendorCode: '', payeeName: '', rows: [], onAccount: 0 });
  };
  const goToVendor = (vendorId: string) => navigate(`${BANK_PAYMENTS_PATH}/new`, { state: { vendorId } });
  const onPickFromList = (vendorId: string) => {
    if (vendorId === draft.vendorId) return;
    if (dirty && !readOnly) setPendingVendor(vendorId);
    else goToVendor(vendorId);
  };
  const changeTab = (tab: MeansTab) => {
    setMeansTab(tab);
    update({ means: applyMeans(draft, tab) });
  };

  const submit = async (asDraft: boolean): Promise<boolean> => {
    const doc: OpDraft = { ...draft, onAccount: onAccountOn ? draft.onAccount : 0, approved: true };
    doc.means = applyMeans(doc, meansTab);
    const found = validate(doc, meansTab, onAccountOn, vendor, fx, asDraft);
    setProblems(found);
    if (found.length) return false;
    setSaving(true);
    try {
      if (asDraft) {
        const saved = await savePaymentDraft(doc);
        setDirty(false);
        if (saved.id !== draft.id) navigate(`${BANK_PAYMENTS_PATH}/${saved.id}`, { replace: true, state: { notice: 'Draft saved. It has no effect on bill balances until it’s posted.' } });
        else {
          setDraft(saved);
          setNotice('Draft saved.');
        }
        return true;
      }
      // Balances as they are now, so a payment posted elsewhere since this form opened counts.
      const fresh = await listApInvoices();
      const balances = new Map(fresh.map((inv) => [inv.id, invoiceBalance(inv, m).balanceDue] as const));
      const bank = vendorBankAccount(vendor);
      // Posted payments keep the vendor's bank account as it was.
      const toPost: OpDraft = { ...doc, payTo: meansTab === 'transfer' && bank ? vendorBankText(bank, m) : '' };
      const saved = await addPayment(toPost, fx, balances);
      const vendorAccountOf = (invoiceId: string) => m.invoices.find((i) => i.id === invoiceId)?.controlAccount ?? '';
      await postDocumentEntry({
        origin: 'PS',
        originNo: saved.docNum,
        originId: saved.id,
        postingDate: saved.postingDate,
        remarks: saved.journalRemark,
        partnerId: saved.vendorId,
        controlAccount: saved.controlAccount,
        lines: paymentJournal(toPost, fx, vendorAccountOf),
      });
      setDirty(false);
      navigate(`${BANK_PAYMENTS_PATH}/${paymentNumber(saved)}`, {
        replace: true,
        state: { notice: `Payment ${paymentNumber(saved)} posted — ${code} ${formatAmount(overallAmount(saved))} to ${saved.payeeName}.` },
      });
      return true;
    } catch (err) {
      if (!(err instanceof PaymentPostError)) throw err;
      setProblems([{ tab: 'bills', key: 'rows', message: err.message }]);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saved = draft as OutgoingPayment;
  const confirmCancel = async () => {
    if (!reason.trim()) return setReasonError('Say why it’s being cancelled.');
    const p = await cancelPayment({ ...saved, cancelReason: reason.trim(), cancelledBy: CURRENT_USER });
    await reverseDocumentEntry(saved.id);
    setDraft(p);
    setCancelling(false);
    setNotice('Payment cancelled — the bills it settled are open again.');
  };
  // Proof of payment can still be attached after posting; nothing else changes.
  const saveAttachments = async (attachments: OutgoingPayment['attachments']) => {
    if (!readOnly) return update({ attachments });
    setDraft(await savePaymentRemarks(saved, { remarks: saved.remarks, attachments }));
  };

  const menu: MoreMenuItem[] =
    draft.status === 'Posted'
      ? [
          { label: 'Cancel payment', icon: 'cancel', onSelect: () => setCancelling(true) },
          { label: 'Print voucher', icon: 'print', onSelect: () => window.print() },
        ]
      : [];

  const panelBill = panelId ? bills.find((b) => b.id === panelId) : undefined;

  return (
    <Panel className="flex-1">
      <PanelHeader
        type="details"
        icon="payments"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        breadcrumbs={[{ label: 'Outgoing Payments', href: BANK_PAYMENTS_PATH }, { label: title }]}
        onBreadcrumbNavigate={(item, e) => {
          e.preventDefault();
          navigate(item.href!);
        }}
        onBack={() => navigate(BANK_PAYMENTS_PATH)}
        trailing={isNew ? undefined : <PrevNext path={BANK_PAYMENTS_PATH} prevId={prevId} nextId={nextId} />}
        tabs={
          <Tabs
            variant="outline"
            value={page}
            onValueChange={(v) => navigate(`${BANK_PAYMENTS_PATH}/${id}/${v}`, { replace: true })}
            items={PAGES.map((p) => ({ ...p, disabled: isNew && p.value !== 'details' }))}
          />
        }
        status={isNew ? undefined : <Badge size="small" intent={OP_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
        actions={
          readOnly ? (
            menu.length ? <MoreMenu label="Actions" items={menu} /> : null
          ) : (
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" disabled={saving} onClick={() => void submit(true)}>
                Save as Draft
              </Button>
              <Button
                type="button"
                intent="primary"
                variant="solid"
                size="medium"
                shape="pill"
                disabled={saving || !canPost}
                title={canPost ? undefined : 'Tick at least one bill'}
                onClick={() => void submit(false)}
              >
                {saving ? 'Posting…' : 'Post Payment'}
              </Button>
            </>
          )
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {page === 'activity' ? (
          <ActivityTab target={{ kind: 'PAY', id: draft.id ?? '' }} partnerId={draft.vendorId} />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
            <aside className="lg:col-span-3">
              <OpVendorList bills={bills} selectedId={draft.vendorId} onPick={onPickFromList} />
            </aside>
            <div className="flex flex-col gap-2 lg:col-span-9">
              {notice ? (
                <Alert intent="success" variant="outline" title={notice} />
              ) : null}
              {pendingVendor ? (
                <Alert intent="warning" variant="outline" title="Save as draft or discard?">
                  <div className="flex flex-col gap-2">
                    <Text>This payment has unsaved changes. Switching vendor starts a new payment.</Text>
                    <div className="flex gap-2">
                      <Button type="button" intent="primary" variant="solid" size="small" onClick={async () => (await submit(true)) && goToVendor(pendingVendor)}>
                        Save as draft
                      </Button>
                      <Button type="button" intent="danger" variant="ghost" size="small" onClick={() => goToVendor(pendingVendor)}>
                        Discard
                      </Button>
                      <Button type="button" intent="white" variant="solid" size="small" onClick={() => setPendingVendor(null)}>
                        Keep editing
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : null}
              {cancelling ? (
                <Alert intent="danger" variant="outline" title="Cancel this payment?">
                  <div className="flex flex-col gap-2">
                    <Text>The bills it settled open again for what it paid, and its journal entry is reversed.</Text>
                    <TextField
                      aria-label="Reason"
                      placeholder="Reason (required)"
                      value={reason}
                      invalid={Boolean(reasonError)}
                      onChange={(e) => {
                        setReason(e.currentTarget.value);
                        setReasonError('');
                      }}
                    />
                    {reasonError ? <Text variant="small" tone="danger">{reasonError}</Text> : null}
                    <div className="flex gap-2">
                      <Button type="button" intent="danger" variant="solid" size="small" onClick={() => void confirmCancel()}>
                        Cancel payment
                      </Button>
                      <Button type="button" intent="white" variant="solid" size="small" onClick={() => setCancelling(false)}>
                        Keep it
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : null}
              {draft.status === 'Cancelled' ? (
                <Alert intent="danger" variant="outline" title={`Cancelled ${formatDate(draft.cancelDate)}${draft.cancelledBy ? ` by ${draft.cancelledBy}` : ''}`}>
                  Reason: {draft.cancelReason || '—'}
                </Alert>
              ) : null}
              <ProblemsAlert
                problems={problems}
                title={(n) => `${n} thing${n === 1 ? '' : 's'} to fix`}
                tabLabel={(t) => ({ bills: 'Bills to Pay', method: 'Payment Method' })[t]}
              />

              <OpDetailsCard draft={draft} update={update} errors={errors} m={m} ctx={ctx} onPickVendor={pickVendor} />
              <OpBillsCard
                draft={draft}
                update={update}
                errors={errors}
                m={m}
                ctx={ctx}
                onAccountOn={onAccountOn}
                setOnAccountOn={setOnAccountOn}
                onOpenBill={setPanelId}
              />
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <OpMethodCard draft={draft} update={update} errors={errors} m={m} ctx={ctx} tab={meansTab} onTabChange={changeTab} />
                <OpSummaryCard draft={draft} ctx={ctx} hint={!readOnly && !canPost ? 'Tick at least one bill.' : undefined} />
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <OpRemarksCard draft={draft} update={update} ctx={ctx} />
                <AttachmentsCard attachments={draft.attachments} onChange={(a) => void saveAttachments(a)} emptyHint="Proof of payment, transfer slip" />
              </div>
            </div>
          </div>
        )}
      </Panel.Body>
      {panelBill ? <InvoicePanel bill={panelBill} m={m} payments={payments} onClose={() => setPanelId(null)} /> : null}
    </Panel>
  );
}
