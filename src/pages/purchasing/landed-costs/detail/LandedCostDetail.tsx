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
import { type Errors } from '../../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../../components/form/ProblemsAlert';
import { AttachmentsCard } from '../../../../components/form/AttachmentsCard';
import { ActivityTab } from '../../../../components/activity/ActivityTab';
import { NotFound, PrevNext, neighbours } from '../../../../components/form/DetailNav';
import { blankLandedCost, type LandedCost, type LcStatus } from '../../../../mocks/landedCosts';
import {
  addLandedCost,
  cancelLandedCost,
  getLandedCost,
  landedCostTypes,
  lcNumber,
  listLandedCosts,
  saveLcDraft,
} from '../../../../services/landedCosts';
import { listGoodsReceipts } from '../../../../services/goodsReceipts';
import { todayISO } from '../../../../services/dates';
import { defaultJournalRemark } from '../../../../services/journalPatterns';
import { listPartnersByRole } from '../../../../services/partners';
import { useDocTitle } from '../../../../services/useDocTitle';
import {
  LC_LIST_PATH,
  LC_STATUS_INTENT,
  type LcDraft,
  type LcMasters,
  type LcSectionProps,
} from './types';
import { DocumentFlow } from '../../shared/DocumentFlow';
import { LcVendorCard } from './LcVendorCard';
import { LcDocumentCard } from './LcDocumentCard';
import { LcItemsCard } from './LcItemsCard';
import { LcCostsCard } from './LcCostsCard';
import { LcVendorsCard } from './LcVendorsCard';
import { LcGeneralCard } from './LcGeneralCard';
import { LcRemarksCard } from './LcRemarksCard';

type TabId = 'items' | 'costs' | 'vendors' | 'general';

const TABS = [
  { value: 'items', label: 'Items' },
  { value: 'costs', label: 'Costs' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'general', label: 'General' },
] as const;

const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

function validate(d: LcDraft, asDraft: boolean): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.vendorId, 'general', 'vendorId', 'Pick a vendor.');
  if (asDraft) return problems;
  need(d.postingDate, 'general', 'postingDate', 'Posting date is required.');
  need(d.lines.length > 0, 'items', 'lines', 'Add at least one item line (copy from a goods receipt).');
  need(
    d.costs.some((c) => c.amount > 0),
    'costs',
    'costs',
    'Add at least one cost entry with an amount.',
  );
  return problems;
}

export function LandedCostDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <LandedCostForm key={id === 'new' ? location.key : id} />;
}

function LandedCostForm() {
  const { id, tab: tabParam } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();

  const [draft, setDraft] = useState<LcDraft | null | undefined>(
    isNew ? blankLandedCost(todayISO()) : undefined,
  );
  const [m, setM] = useState<LcMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('items');
  const page = (PAGES.some((p) => p.value === tabParam) ? tabParam : 'details') as PageId;
  const setPage = (v: PageId) => navigate(`${LC_LIST_PATH}/${id}/${v}`, { replace: true });

  useEffect(() => {
    if (!tabParam) navigate(`${LC_LIST_PATH}/${id}/details`, { replace: true, state: location.state });
  }, []);

  useEffect(() => {
    Promise.all([listPartnersByRole('vendor'), landedCostTypes.list(), listGoodsReceipts()]).then(
      ([vendors, lcTypes, receipts]) => setM({ vendors, lcTypes, receipts }),
    );
    if (isNew || !id) return;
    let cancelled = false;
    getLandedCost(id).then((doc) => !cancelled && setDraft(doc ?? null));
    listLandedCosts().then(
      (all) =>
        !cancelled &&
        setSiblings(
          [...all]
            .sort((a, b) => b.postingDate.localeCompare(a.postingDate))
            .map((r) => (r.docNum ? lcNumber(r) : r.id)),
        ),
    );
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useDocTitle(draft?.docNum ? (isNew ? 'New landed cost' : lcNumber(draft)) : undefined);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading…</Text>;
  if (draft === null)
    return <NotFound icon="calculate" title="Landed cost not found" backTo={LC_LIST_PATH} backLabel="Back to landed costs" />;

  const added = draft.status !== 'Draft';
  const readOnly = added;
  const { prevId, nextId } = neighbours(siblings, draft.id && (draft.docNum ? lcNumber(draft as LandedCost) : draft.id));
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));

  const update = (patch: Partial<LcDraft>) => setDraft((d) => d && { ...d, ...patch });

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (v) {
      update({
        vendorId: v.id,
        vendorCode: v.code,
        vendorName: v.name,
        journalRemark: defaultJournalRemark('landed-costs', { entityCode: v.code, entityName: v.name }),
      });
    } else {
      update({ vendorId: '', vendorCode: '', vendorName: '', journalRemark: '' });
    }
  };

  const submit = async (e: FormEvent | null, asDraft = false) => {
    e?.preventDefault();
    const found = validate(draft, asDraft || !added);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (asDraft || !added) {
        if (asDraft) {
          const saved = await saveLcDraft(draft);
          navigate(LC_LIST_PATH, { state: { notice: `Draft saved — ${saved.vendorName || 'Landed cost'}.` } });
          return;
        }
        const saved = await addLandedCost(draft);
        navigate(LC_LIST_PATH, { state: { notice: `Landed cost ${lcNumber(saved)} added.` } });
      }
    } finally {
      setSaving(false);
    }
  };

  const cancelIt = async () => {
    const c = await cancelLandedCost(draft as LandedCost);
    navigate(LC_LIST_PATH, { state: { notice: `Landed cost ${lcNumber(c)} cancelled.` } });
  };

  const statusMoves: Partial<Record<LcStatus, () => void>> =
    draft.status === 'Draft'
      ? { Open: () => submit(null) }
      : draft.status === 'Open'
        ? { Cancelled: cancelIt }
        : {};

  const menu: MoreMenuItem[] = [
    ...(!added ? [{ label: 'Save as draft', icon: 'draft', onSelect: () => submit(null, true) }] : []),
    ...(draft.status === 'Open' ? [{ label: 'Cancel landed cost', icon: 'cancel', onSelect: cancelIt }] : []),
  ];

  const title = isNew ? 'New landed cost' : added ? lcNumber(draft) : 'Draft landed cost';

  const sectionProps: LcSectionProps = { draft, update, errors, m, readOnly };

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="calculate"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          breadcrumbs={[{ label: 'Landed Costs', href: LC_LIST_PATH }, { label: title }]}
          onBreadcrumbNavigate={(item, e) => { e.preventDefault(); navigate(item.href!); }}
          onBack={() => navigate(LC_LIST_PATH)}
          trailing={isNew ? undefined : <PrevNext path={LC_LIST_PATH} prevId={prevId} nextId={nextId} />}
          tabs={
            isNew ? undefined : (
              <Tabs
                variant="outline"
                value={page}
                onValueChange={(v) => setPage(v as PageId)}
                items={PAGES.map((p) => ({ ...p }))}
              />
            )
          }
          status={isNew ? undefined : <Badge size="small" intent={LC_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add Landed Cost'}
              </Button>
            </>
          }
        />

        {page === 'transactions' && draft.id ? (
          <Panel.Body className="flex flex-col gap-2">
            <DocumentFlow kind="LC" id={draft.id} notes="The goods receipts whose lines are included in this landed cost." />
          </Panel.Body>
        ) : page !== 'details' ? (
          <Panel.Body>
            <ActivityTab target={{ kind: 'LC', id: draft.id ?? '' }} partnerId={draft.vendorId} />
          </Panel.Body>
        ) : (
          <Panel.Body className="flex flex-col gap-2">
            <ProblemsAlert
              problems={problems}
              tabLabel={(t) =>
                ({ items: 'Items', costs: 'Costs', vendors: 'Vendors', general: 'General' })[t]
              }
            />
            {added ? (
              <Alert intent="default" variant="outline" title={`This landed cost is ${draft.status.toLowerCase()}`}>
                Only attachments can change.
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <div className="flex flex-col gap-2 lg:col-span-8">
                <fieldset disabled={readOnly} className="contents">
                  <LcVendorCard {...sectionProps} pickVendor={pickVendor} />
                </fieldset>

                <Tabs
                  variant="outline"
                  value={tab}
                  onValueChange={(v) => setTab(v as TabId)}
                  items={TABS.map((t) => ({ value: t.value, label: t.label }))}
                />
                <fieldset disabled={readOnly} className="contents">
                  {tab === 'items' && (
                    <LcItemsCard
                      {...sectionProps}
                      onLinesChange={(lines) => update({ lines })}
                    />
                  )}
                  {tab === 'costs' && <LcCostsCard {...sectionProps} />}
                  {tab === 'vendors' && <LcVendorsCard {...sectionProps} />}
                  {tab === 'general' && <LcGeneralCard {...sectionProps} />}
                </fieldset>

                <AttachmentsCard
                  attachments={draft.attachments}
                  onChange={(attachments) => update({ attachments })}
                  emptyHint="Attach shipping documents, customs declarations or insurance certificates."
                />
              </div>

              <aside className="flex flex-col gap-2 lg:col-span-4">
                <fieldset disabled={readOnly} className="contents">
                  <LcDocumentCard {...sectionProps} statusMoves={statusMoves} />
                  <LcRemarksCard {...sectionProps} />
                </fieldset>
              </aside>
            </div>
          </Panel.Body>
        )}
      </Panel>
    </Form>
  );
}
