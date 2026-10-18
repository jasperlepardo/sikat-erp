import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Form,
  Panel,
  PanelHeader,
  Tabs,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { CURRENT_USER_ID } from '../../../../mocks/common';
import { blankBlanketAgreement, newBaLine, type BlanketAgreement } from '../../../../mocks/blanketAgreements';
import { blankSalesOrder, newSoLine } from '../../../../mocks/salesOrders';
import { getSalesSettings } from '../../../../services/salesOrders';
import { SO_LIST_PATH } from '../../sales-orders/detail/types';
import { formatDate, todayISO } from '../../../../services/dates';
import { loadInventoryMasters } from '../../../../services/inventoryMasters';
import { listItems } from '../../../../services/items';
import { listPartnersByRole } from '../../../../services/partners';
import { baSeries } from '../../../../services/allSeries';
import { baNumber, baTotals, openQty, getBlanketAgreement, listBlanketAgreements, saveBlanketAgreement, type BaInput } from '../../../../services/blanketAgreements';
import { useDocTitle } from '../../../../services/useDocTitle';
import { CustomerCard } from '../../shared/CustomerCard';
import { SalesDocumentFlow } from '../../shared/SalesDocumentFlow';
import { BaCustomerPanel } from './BaCustomerPanel';
import { BaAgreementCard } from './BaAgreementCard';
import { GeneralTab } from './general';
import { LinesTab } from './lines';
import { BaSummaryCard } from './BaSummaryCard';
import { BA_LIST_PATH, BA_STATUS_INTENT } from '../BlanketAgreementList';
import type { BaDraft, BaMasters } from './types';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

type TabId = 'general' | 'lines';
const TAB_LABEL: Record<string, string> = { general: 'General', lines: 'Lines', header: 'Agreement' };

function validate(d: BaDraft): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.customerId, 'header', 'customerId', 'Pick a customer.');
  need(d.agreementMethod, 'header', 'agreementMethod', 'Select an agreement method.');
  need(d.startDate, 'header', 'startDate', 'Start date is required.');
  need(!d.endDate || d.endDate >= d.startDate, 'header', 'endDate', 'End date must be on or after the start date.');
  need(d.agreementType, 'general', 'agreementType', 'Select an agreement type.');
  if (d.agreementMethod === 'Items') {
    for (const [i, l] of d.lines.entries()) {
      const n = `Line ${i + 1}`;
      need(l.itemId, 'lines', `line:${l.id}:item`, `${n}: pick an item.`);
      need(l.plannedQty > 0, 'lines', `line:${l.id}:plannedQty`, `${n}: planned quantity must be more than 0.`);
      need(l.unitPrice >= 0, 'lines', `line:${l.id}:unitPrice`, `${n}: unit price can't be negative.`);
    }
  }
  return problems;
}

export function BlanketAgreementDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <BaForm key={id === 'new' ? location.key : id} />;
}

function BaForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const copyFrom = (location.state as { copyFrom?: BaDraft } | null)?.copyFrom;

  const [draft, setDraft] = useState<BaDraft | null | undefined>(
    isNew ? { ...(copyFrom ?? { ...blankBlanketAgreement(CURRENT_USER_ID), lines: [] }) } : undefined,
  );
  const [m, setM] = useState<BaMasters>();
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${BA_LIST_PATH}/${id}/${v}`, { replace: true });
  useEffect(() => { if (!tabParam) navigate(`${BA_LIST_PATH}/${id}/details`, { replace: true, state: location.state }); }, []);
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPartnersByRole('customer'),
      listItems(),
      loadInventoryMasters(),
      baSeries.list(),
    ]).then(([customers, items, inv, series]) => {
      if (cancelled) return;
      setM({ customers, items, inv, baSeries: series });
    });
    if (!isNew && id) {
      getBlanketAgreement(id).then((ba) => !cancelled && setDraft(ba ?? null));
      listBlanketAgreements().then((all) => {
        if (cancelled) return;
        const sorted = [...all].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
        setSiblings(sorted.map((b) => (b.docNum ? baNumber(b) : b.id)));
      });
    }
    return () => { cancelled = true; };
  }, [id, isNew]);

  useDocTitle(
    draft == null || !draft.docNum
      ? undefined
      : isNew
        ? 'New blanket agreement'
        : draft.status === 'Draft'
          ? 'Draft blanket agreement'
          : baNumber(draft),
  );

  if (draft === undefined || !m) {
    return <Text tone="muted" className="p-4">Loading…</Text>;
  }
  if (draft === null) return <NotFound icon="description" title="Agreement not found" backTo={BA_LIST_PATH} backLabel="Back to agreements" />;

  const readOnly = draft.status === 'Closed' || draft.status === 'Terminated';
  const added = draft.status !== 'Draft';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? baNumber(draft as BlanketAgreement) : draft.id));

  const totals = baTotals(draft);

  const update = (patch: Partial<BaDraft>) => setDraft({ ...draft, ...patch });

  const customer = m.customers.find((c) => c.id === draft.customerId);

  const pickCustomer = (customerId: string | null) => {
    const c = m.customers.find((x) => x.id === customerId);
    if (!c) {
      update({ customerId: '', customerCode: '', customerName: '', contactId: '', currency: 'PHP', phone: '', email: '' });
      return;
    }
    const phoneChannel = c.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
    const emailChannel = c.contactChannels.find((ch) => ch.type === 'Email');
    update({
      customerId: c.id,
      customerCode: c.code,
      customerName: c.name,
      contactId: c.defaultContactId,
      currency: c.currency === 'All currencies' ? 'PHP' : c.currency,
      phone: phoneChannel?.value ?? '',
      email: emailChannel?.value ?? '',
      paymentTermId: c.customerPaymentTermId,
    });
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const doc: BaDraft = { ...draft };
    const found = validate(doc);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const ba = await saveBlanketAgreement(doc as BaInput, { asDraft });
      navigate(BA_LIST_PATH, {
        state: {
          notice: asDraft
            ? `Draft saved — ${ba.customerName}.`
            : `Blanket agreement ${baNumber(ba)} ${isNew || draft.status === 'Draft' ? 'added' : 'updated'} — ${ba.customerName}.`,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    const copy: BaDraft = {
      ...structuredClone(draft),
      id: undefined,
      status: 'Draft',
      docNum: 0,
      startDate: today,
      signingDate: today,
      endDate: '',
      terminationDate: '',
      attachments: [],
      lines: draft.lines.map((l) => ({ ...l, id: newBaLine().id, cumulativeQty: 0, cumulativeAmountLC: 0, cumulativeAmountFC: 0, cumulativeCommittedQty: 0, cumulativeCommittedAmountLC: 0, cumulativeCommittedAmountFC: 0, rowStatus: 'Open' as const })),
    };
    navigate(`${BA_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const copyToSo = () => {
    const ba = draft as BlanketAgreement;
    const openLines = draft.lines.filter((l) => openQty(l) > 0);
    const so = {
      ...blankSalesOrder(CURRENT_USER_ID),
      approved: !getSalesSettings().requireSoApproval,
      customerId: draft.customerId,
      customerCode: draft.customerCode,
      customerName: draft.customerName,
      contactId: draft.contactId,
      currency: draft.currency,
      paymentTermId: draft.paymentTermId,
      paymentMethod: draft.paymentMethod,
      shippingType: draft.shippingType,
      projectId: draft.projectId,
      lines: openLines.map((l) =>
        newSoLine({
          itemId: l.itemId,
          itemNo: l.itemNo,
          description: l.description,
          quantity: openQty(l),
          uomCode: l.uomCode,
          uomName: l.uomName,
          itemsPerUnit: l.itemsPerUnit,
          unitPrice: l.unitPrice,
          agreementId: ba.id,
          agreementLineId: l.id,
        }),
      ),
    };
    navigate(`${SO_LIST_PATH}/new`, { state: { copyFrom: so } });
  };

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Approved' && draft.lines.some((l) => openQty(l) > 0)
      ? [{ label: 'Copy to Sales Order', icon: 'shopping_bag', onSelect: copyToSo }]
      : []),
    ...(!isNew ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
  ];

  const title = isNew
    ? 'New blanket agreement'
    : draft.status === 'Draft'
      ? 'Draft blanket agreement'
      : baNumber(draft as BlanketAgreement);

  return (
    <>
      <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
        <Panel className="flex-1">
          <PanelHeader
            type="details"
            icon="description"
            iconIntent="primary"
            iconShape="rounded"
            iconSize={32}
            iconVariant="outline"
            breadcrumbs={[{ label: 'Agreements', href: BA_LIST_PATH }, { label: title }]}
            onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
            onBack={() => navigate(BA_LIST_PATH)}
            trailing={isNew ? undefined : <PrevNext path={BA_LIST_PATH} prevId={prevId} nextId={nextId} />}
            tabs={isNew ? undefined : <Tabs variant="outline" value={page} onValueChange={(v) => setPage(v as PageId)} items={[...PAGES]} />}
            status={isNew ? undefined : <Badge size="small" intent={BA_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
            actions={
              <>
                {readOnly ? null : <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(BA_LIST_PATH)}>Cancel</Button>}
                {menu.length ? <MoreMenu items={menu} /> : null}
                {!readOnly && (
                  <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                    {saving ? 'Saving…' : added ? 'Update' : 'Add'}
                  </Button>
                )}
              </>
            }
          />

          {page === 'transactions' ? (
            <Panel.Body>
              {added && draft.id ? (
                <SalesDocumentFlow
                  kind="BA"
                  id={draft.id}
                  notes="Sales orders and their downstream documents drawn from this agreement."
                />
              ) : (
                <Text variant="small" tone="muted" className="p-4">Transactions will show here once the agreement is added.</Text>
              )}
            </Panel.Body>
          ) : page === 'activity' ? (
            <Panel.Body>
              <ActivityTab target={{ kind: 'BA', id: draft.id ?? '' }} partnerId={draft.customerId} />
            </Panel.Body>
          ) : (
            <Panel.Body className="flex flex-col gap-2">
              <ProblemsAlert problems={problems} tabLabel={(t) => TAB_LABEL[t as TabId] ?? t} />

              {readOnly ? (
                <Alert intent="default" variant="outline" title={`This agreement is ${draft.status.toLowerCase()}`}>
                  {draft.status === 'Terminated' && draft.terminationDate
                    ? `Terminated on ${formatDate(draft.terminationDate)}. `
                    : ''}
                  Only remarks and attachments can be changed.
                </Alert>
              ) : null}

              <fieldset disabled={readOnly} className="contents">
                {draft.lines.length > 0 && (
                  <BaSummaryCard currency={draft.currency} totals={totals} settlementProbability={draft.settlementProbability} />
                )}
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                  <div className="flex flex-col gap-2 lg:col-span-8">
                    <CustomerCard
                      customers={m.customers}
                      customerId={draft.customerId}
                      customer={customer}
                      onPickCustomer={pickCustomer}
                      onOpenDetails={() => setCustomerDetailsOpen(true)}
                      locked={!!(customer && added)}
                      error={errors.customerId}
                    />
                    <LinesTab draft={draft} update={update} m={m} readOnly={readOnly} />
                    <AttachmentsCard
                      attachments={draft.attachments}
                      onChange={(attachments) => update({ attachments })}
                      emptyHint="Signed agreement, customer's approval, or supporting documents."
                      withDescription
                    />
                  </div>

                  <aside className="flex flex-col gap-2 lg:col-span-4">
                    <BaAgreementCard draft={draft} update={update} m={m} added={added} />
                    <GeneralTab draft={draft} update={update} errors={errors} m={m} readOnly={readOnly} />
                  </aside>
                </div>
              </fieldset>
            </Panel.Body>
          )}
        </Panel>
      </Form>
      {customer && (
        <BaCustomerPanel
          customer={customer}
          draft={draft}
          update={update}
          readOnly={readOnly}
          open={customerDetailsOpen}
          onClose={() => setCustomerDetailsOpen(false)}
        />
      )}
    </>
  );
}
