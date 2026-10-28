import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Form, Panel, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { DetailActions, docMode } from '../../../../components/form/DetailActions';
import { PageHeader } from '../../../../components/form/PageHeader';
import { isApprover, needsApproval } from '../../../../services/approval';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { blankQuotation, type Quotation } from '../../../../mocks/quotations';
import { rateAt } from '../../../../mocks/taxes';
import { loadCurrentCompany } from '../../../../services/companies';
import { todayISO } from '../../../../services/dates';
import { recalcLineTaxes } from '../../../../services/taxRecalc';
import type { Partner } from '../../../../mocks/partners';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { companyTax, currencies, exchangeRates, rateOn, taxCodes } from '../../../../services/masterData';
import { listPartnersByRole } from '../../../../services/partners';
import {
  addQuotation, cancelQuotation, closeQuotation, getQuotation, listQuotations,
  qtNumber, qtTotals, recallQuotation, saveQuotationDraft, saveQuotationRemarks,
} from '../../../../services/quotations';
import { openOrdersTotal } from '../../../../services/salesOrders';
import { SALES_SETTINGS, blankSalesOrder, newSoLine } from '../../../../mocks/salesOrders';
import { logRejection } from '../../../../services/approvalRules';
import { useDocTitle } from '../../../../services/useDocTitle';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { neighbours, NotFound, siblingKeys, useDocTab, useReject } from '../../../../components/form/DetailNav';
import { customerDefaults, linePricing, proposedTaxCode, type Draft, type QtContext, type QtMasters } from './types';
import { BASE_PRICE_LIST_ID } from '../../../../services/priceLists';
import { QtDetailsCard } from './QtDetailsCard';
import { CustomerCard } from '../../shared/CustomerCard';
import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { qtDoc } from './qtDoc';
import { SalesTotalsFooter } from '../../shared/TotalsFooter';
import { ReferencesTable } from '../../../purchasing/shared/ReferencesTable';
import { QT_LIST_PATH, QT_NOUN, QT_STATUS_INTENT, SO_LIST_PATH } from '../../paths';

type TabId = 'contents';
const TAB_LABEL: Record<TabId, string> = { contents: 'Contents' };

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

async function loadQtMasters(): Promise<QtMasters> {
  const [customers, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours] = await Promise.all([
    listPartnersByRole('customer'),
    listItems(),
    loadInventoryMasters(),
    companyTax.list(),
    taxCodes.list(),
    (await import('../../../../services/masterData')).taxGroups.list(),
    (await import('../../../../services/masterData')).withholdingTaxes.list(),
    (await import('../../../../services/masterData')).withholdingGroups.list(),
    currencies.list(),
    exchangeRates.list(),
    loadCurrentCompany(),
  ]);
  return { customers, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours };
}

function validate(d: Draft, fx: number, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  if (asDraft) return problems;
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.documentDate, 'header', 'documentDate', 'Document date is required.');
  need(fx > 0, 'header', 'currency', `No ${d.currency} exchange rate on or before ${d.postingDate}.`);
  need(d.lines.length, 'contents', 'lines', 'Add at least one line.');
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    need(l.itemId, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    need(l.quantity > 0, 'contents', `line:${l.id}:quantity`, `${n}: quantity must be more than 0.`);
    need(l.taxCode, 'contents', `line:${l.id}:taxCode`, `${n}: pick a tax code.`);
  }
  return problems;
}

/** Keyed by record so moving between quotations starts a fresh form. */
export function QuotationDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <QuotationForm key={id === 'new' ? location.key : id} />;
}

function QuotationForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const qtApproved = !needsApproval('QT');
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? { ...blankQuotation(CURRENT_USER_ID), approved: qtApproved } : undefined);
  const [m, setM] = useState<QtMasters>();
  const page = (PAGES.some(p => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = useDocTab<PageId>(`${QT_LIST_PATH}/${id}`, tabParam);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const reject = useReject();
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [openBalance, setOpenBalance] = useState(0);

  useEffect(() => {
    loadQtMasters().then(setM);
    if (isNew || !id) return;
    let cancelled = false;
    getQuotation(id).then((q) => !cancelled && setDraft(q ?? null));
    listQuotations().then((all) => !cancelled && setSiblings(siblingKeys(all, qtNumber)));
    return () => { cancelled = true; };
  }, [id, isNew]);

  // The customer's open sales orders, for the credit bar in the customer panel.
  const customerId = draft?.customerId;
  useEffect(() => {
    if (!customerId || !m) return;
    openOrdersTotal(customerId, undefined, m.tax.codes).then(setOpenBalance);
  }, [customerId, m]);

  useDocTitle(draft?.docNum ? (isNew ? `New ${QT_NOUN.one}` : draft.status === 'Draft' ? `Draft ${QT_NOUN.one}` : qtNumber(draft)) : undefined);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading quotation…</Text>;
  if (draft === null) return <NotFound icon="request_quote" title="Quotation not found" backTo={QT_LIST_PATH} backLabel="Back to quotations" />;

  const added = draft.status !== 'Draft';
  const readOnly = draft.status === 'Closed' || draft.status === 'Cancelled';
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  const fx = draft.currency === 'PHP' ? 1 : added ? 1 : (fxRate?.rate ?? 0);
  const vatRegistered = m.tax.company.vatRegistered;
  const rateOf = (taxCode: string) => {
    const c = m.tax.codes.find((x) => x.code === taxCode);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const customer = m.customers.find((c) => c.id === draft.customerId);
  const ctx: QtContext = { customer, fx, rateOf, vatRegistered, readOnly, added };
  const { prevId, nextId } = neighbours(siblings, (draft as Quotation).id && (draft.docNum ? qtNumber(draft as Quotation) : (draft as Quotation).id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const totalLc = qtTotals(draft, rateOf).total * fx;
  // Only a heads-up here: the limit is enforced when the quotation is copied to an order.
  const overCredit = SALES_SETTINGS.creditLimitCheck && !!customer && customer.creditLimit > 0 && openBalance + totalLc > customer.creditLimit && !readOnly;
  const isExpired = draft.status === 'Open' && !!draft.validUntil && draft.validUntil < todayISO();

  /** Tax codes re-proposed for the customer and date, except ones set by hand. */
  const retax = (lines: Draft['lines'], c: Partner | undefined, date: string) =>
    recalcLineTaxes(lines, (itemId) => {
      const item = m.items.find((i) => i.id === itemId);
      return item ? proposedTaxCode(item, c, m, date) : '';
    });
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      if (!readOnly && patch.postingDate !== undefined && patch.postingDate !== d.postingDate) next.lines = retax(next.lines, customer, next.postingDate);
      return next;
    });

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) return update({ customerId: '', customerCode: '', customerName: '', contactId: '', shipTo: '', billTo: '' });
    // Lines can be added before the customer: reprice them on the customer's price list, tax code and currency.
    const next = { ...draft, ...customerDefaults(c, draft) };
    const nextFx = next.currency === 'PHP' ? 1 : (rateOn(m.rates, next.currency, date)?.rate ?? 0);
    const lines = retax(draft.lines, c, next.postingDate).map((l) => {
      const item = m.items.find((i) => i.id === l.itemId);
      if (!item) return l;
      const repriced = { ...l, priceListId: c.priceListId || BASE_PRICE_LIST_ID };
      return l.priceSource === 'Manual' || !nextFx ? repriced : { ...repriced, ...linePricing(item, repriced, next, m.customers, vatRegistered, rateOf, nextFx) };
    });
    update({ ...customerDefaults(c, draft), lines });
  };

  const submit = async (e: FormEvent | null, asDraft = false, overrides: Partial<Draft> = {}) => {
    e?.preventDefault();
    // Added: only remarks and attachments save, unless this is approving it.
    if (added && !overrides.approved) {
      setSaving(true);
      try {
        const saved = await saveQuotationRemarks(draft as Quotation, { remarks: draft.remarks, attachments: draft.attachments });
        navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(saved)} saved.` } });
      } finally { setSaving(false); }
      return;
    }
    const doc: Draft = { ...draft, ...overrides };
    const found = validate(doc, fx, asDraft);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (asDraft) {
        const saved = await saveQuotationDraft(doc);
        navigate(QT_LIST_PATH, { state: { notice: `Draft saved — ${saved.customerName}.` } });
        return;
      }
      const saved = await addQuotation(doc);
      navigate(QT_LIST_PATH, { state: { notice: saved.status === 'Not Confirmed' ? `Quotation ${qtNumber(saved)} submitted for approval.` : `Quotation ${qtNumber(saved)} added.` } });
    } finally { setSaving(false); }
  };

  const saved = draft as Quotation;
  const recallIt = async () => { const q = await recallQuotation(saved); navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(q)} recalled to draft.` } }); };
  const rejectIt = async (rejectionReason: string) => { await logRejection('QT', saved.id, saved.customerId, rejectionReason); await recallQuotation(saved); navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(saved)} rejected and returned to draft.` } }); };

  const convertToOrder = () => {
    const copyFrom = {
      ...blankSalesOrder(CURRENT_USER_ID),
      approved: !needsApproval('SO'),
      customerId: draft.customerId,
      customerCode: draft.customerCode,
      customerName: draft.customerName,
      contactId: draft.contactId,
      customerRef: draft.customerRef,
      currency: draft.currency,
      paymentTermId: draft.paymentTermId,
      paymentMethod: draft.paymentMethod,
      projectId: draft.projectId,
      shippingType: draft.shippingType,
      federalTaxId: draft.federalTaxId,
      salesEmployeeId: draft.salesEmployeeId,
      shipTo: draft.shipTo,
      billTo: draft.billTo,
      discountPct: draft.discountPct,
      freight: draft.freight,
      freightTaxCode: draft.freightTaxCode,
      remarks: `Based on quotation ${qtNumber(saved)}${draft.remarks ? `\n${draft.remarks}` : ''}`,
      lines: draft.lines.map((l) => newSoLine({
        itemId: l.itemId,
        itemNo: l.itemNo,
        description: l.description,
        quantity: l.quantity,
        uomCode: l.uomCode,
        uomName: l.uomName,
        itemsPerUnit: l.itemsPerUnit,
        warehouse: l.warehouse,
        priceListId: l.priceListId,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        priceSource: l.priceSource,
        taxCode: l.taxCode,
        glAccount: l.glAccount,
      })),
    };
    navigate(`${SO_LIST_PATH}/new`, { state: { copyFrom } });
  };

  const menu: MoreMenuItem[] = [
    ...(draft.status === 'Open' ? [{ label: 'Create sales order', icon: 'shopping_bag', onSelect: convertToOrder }] : []),
    ...(draft.status === 'Not Confirmed' ? [{ label: 'Recall', icon: 'undo', onSelect: recallIt }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Close', icon: 'task_alt', onSelect: () => closeQuotation(saved).then((r) => navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} closed.` } })) }] : []),
    ...(draft.status === 'Open' ? [{ label: `Cancel ${QT_NOUN.one}`, icon: 'cancel', onSelect: () => cancelQuotation(saved).then((r) => navigate(QT_LIST_PATH, { state: { notice: `Quotation ${qtNumber(r)} cancelled.` } })) }] : []),
  ];

  const title = isNew ? `New ${QT_NOUN.one}` : added ? qtNumber(draft) : `Draft ${QT_NOUN.one}`;
  const tabProps = { draft, update, errors, m, ctx };

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e, !added)} noValidate>
        <Panel className="flex-1">
          <PageHeader
            variant="plain"
            icon="request_quote"
            parent={{ noun: QT_NOUN, to: QT_LIST_PATH }}
            title={title}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={
              isNew ? undefined : (
                <div className="flex gap-1">
                  <Badge size="small" intent={QT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>
                  {isExpired ? <Badge size="small" intent="danger">Expired</Badge> : null}
                  {draft.convertedToOrderId ? <Badge size="small" variant="outline">Converted</Badge> : null}
                </div>
              )
            }
            actions={
              <DetailActions
                noun={QT_NOUN}
                listPath={QT_LIST_PATH}
                mode={docMode(draft.status, { canApprove: isApprover('QT') })}
                needsApproval={!draft.approved}
                remarksOnly={readOnly}
                busy={saving}
                onDraft={() => submit(null, true)}
                onSubmit={() => submit(null, false)}
                onApprove={() => submit(null, false, { approved: true })}
                onReject={reject.start}
                menu={menu}
                prevNext={isNew ? undefined : { path: QT_LIST_PATH, prevId, nextId }}
              />
            }
          />

          {page === 'transactions' ? (
            <Panel.Body>
              {added ? (
                <SalesDocumentFlow kind="QT" id={saved.id} notes="Sales orders and downstream documents created from this quotation." />
              ) : (
                <Text variant="small" tone="muted" className="p-4">Transactions will show here once the quotation is added.</Text>
              )}
            </Panel.Body>
          ) : page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'QT', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId]} />
              {reject.alert('Reject quotation', rejectIt)}
              {added ? (
                <Alert
                  intent="default"
                  variant="outline"
                  title={draft.status === 'Open' ? (isExpired ? 'This quotation has expired' : 'Quotation is open') : `This quotation is ${draft.status.toLowerCase()}`}
                >
                  {draft.status === 'Open'
                    ? (isExpired
                      ? 'The valid until date has passed. Create a sales order or close it.'
                      : 'Create a sales order when the customer confirms. Only remarks and attachments can change.')
                    : 'Only remarks and attachments can change.'}
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                <div className="flex flex-col gap-2 lg:col-span-8">
                  <CustomerCard
                    customers={m.customers}
                    customerId={draft.customerId}
                    customer={customer}
                    locked={added}
                    error={errors.customerId}
                    overCredit={overCredit}
                    onPickCustomer={pickCustomer}
                    onOpenDetails={() => setCustomerDetailsOpen(true)}
                  />
                  <DocLines
                    {...qtDoc(tabProps)}
                    footer={<SalesTotalsFooter {...tabProps} ctx={{ ...ctx, readOnly: readOnly || added }} withholding={[]} />}
                  />
                  <ReferencesTable
                    refs={draft.references}
                    onChange={(references) => update({ references })}
                    readOnly={readOnly}
                    description="Link the customer's RFQ, a contract, or other source documents."
                  />
                  <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} withDescription emptyHint="Attach the RFQ, specs sheet, or supporting documents." />
                </div>

                <aside className="flex flex-col gap-2 lg:col-span-4">
                  <QtDetailsCard {...tabProps} />
                </aside>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      <CustomerDetailsPanel
        customer={customer}
        draft={draft}
        update={update}
        // Once added only remarks and attachments save, so the panel is read-only too.
        readOnly={readOnly || added}
        noun="quotation"
        credit={{ overCredit: overCredit, openBalance, totalLc }}
        open={customerDetailsOpen}
        onClose={() => setCustomerDetailsOpen(false)}
      />
    </>
  );
}
