import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Combobox, Form, Icon, IconButton, Panel, PanelHeader, panelHeaderIcons, Select, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { useCollection } from '../../../components/form/MasterLookup';
import { CURRENT_USER } from '../../../mocks/common';
import { COUNTING_TYPES, COUNT_SERIES, blankCounting, newCountLine, type CounterType, type CountStatus } from '../../../mocks/inventoryCountings';
import { formatDate, todayISO } from '../../../services/dates';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { closeCounting, countNumber, countSummary, countWarehouses, getCounting, listCountings, postingNumber, getPosting, saveCounting, saveCountingRemarks } from '../../../services/inventoryCountings';
import { salesEmployees } from '../../../services/partnerMasters';
import { CountLines, type CountingDraft } from './CountLines';
import { COUNT_LIST_PATH, POSTING_LIST_PATH, nowHHMM, type CountMasters } from './shared';

export const COUNT_STATUS_INTENT: Record<CountStatus, 'primary' | 'default'> = { Open: 'primary', Closed: 'default' };

type TabId = 'contents' | 'attachments';
type Action = 'save' | 'copy' | 'close';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Saving needs a header and valid lines; copying to a posting also needs counted lines the counters agree on. */
function validate(d: CountingDraft, m: CountMasters, action: Action): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.countDate, 'header', 'countDate', 'Count date is required.');
  need(TIME.test(d.countTime), 'header', 'countTime', 'Time is required, as HH:MM (24-hour).');
  const names = d.counters.map((c) => c.name.trim());
  need(names.every(Boolean), 'header', 'counters', 'Every inventory counter needs a name.');
  need(d.countingType === 'single' || names.length >= 2, 'header', 'counters', 'Multiple counters needs at least two counters.');
  need(new Set(names).size === names.length, 'header', 'counters', 'The same counter is listed twice.');
  const seen = new Set<string>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.inventoryItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't an inventory item, so it has no stock to count.`);
    need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse counted.`);
    const key = `${l.itemId}@${l.warehouse}`;
    need(!seen.has(key), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} in ${l.warehouse} is already on the count — one line per item and warehouse.`);
    seen.add(key);
    need(!l.counted || l.uomCountedQty >= 0, 'contents', `line:${l.id}:countedQty`, `${n}: counted quantity can't be negative.`);
    need(
      !l.counted || item.manageBy !== 'Serial Numbers' || Number.isInteger(l.uomCountedQty * l.itemsPerUnit),
      'contents',
      `line:${l.id}:countedQty`,
      `${n}: serial-managed items are counted in whole units.`,
    );
  }
  if (action === 'copy') {
    need(d.lines.some((l) => l.counted), 'contents', 'lines', 'Nothing is counted yet — tick Counted on the lines you’ve counted.');
    const s = countSummary(d);
    need(!s.disagreements, 'contents', 'lines', `Counters differ on ${s.disagreements} line${s.disagreements === 1 ? '' : 's'}. Recount and agree a quantity first.`);
  }
  return problems;
}

/** Keyed by record so moving between counts (or duplicating into /new) starts a fresh form. */
export function StockCountDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <CountForm key={id === 'new' ? location.key : id} />;
}

function CountForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: CountingDraft } | null)?.copyFrom;
  const employees = useCollection(salesEmployees) ?? [];

  const [draft, setDraft] = useState<CountingDraft | null | undefined>(isNew ? (copyFrom ?? blankCounting(todayISO(), nowHHMM(), CURRENT_USER)) : undefined);
  const [m, setM] = useState<CountMasters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [postingNo, setPostingNo] = useState('');
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('contents');

  useEffect(() => {
    Promise.all([listItems(), loadInventoryMasters()]).then(([items, inv]) => setM({ items, warehouses: inv.warehouses, groups: inv.groups }));
    if (isNew || !id) return;
    let cancelled = false;
    getCounting(id).then((c) => {
      if (cancelled) return;
      setDraft(c ?? null);
      if (c?.postingId) getPosting(c.postingId).then((p) => !cancelled && p && setPostingNo(postingNumber(p)));
    });
    listCountings().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.countDate.localeCompare(a.countDate)).map((c) => c.id)));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading count…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="inventory" title="Count not found" />
        <Panel.Body>
          <Button onClick={() => navigate(COUNT_LIST_PATH)}>Back to stock counts</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const open = draft.status === 'Open';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const summary = countSummary(draft);
  const whs = countWarehouses(draft);
  const counterNames = [...new Set([CURRENT_USER, ...employees.filter((e) => e.active).map((e) => e.name)])];

  const update = (patch: Partial<CountingDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);
  const setCounter = (i: number, patch: Partial<{ type: CounterType; name: string }>) =>
    update({ counters: draft.counters.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const submit = async (e: FormEvent | null, action: Action = 'save') => {
    e?.preventDefault();
    if (!open) {
      setSaving(true);
      const c = await saveCountingRemarks(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(COUNT_LIST_PATH, { state: { notice: `Remarks saved on count ${countNumber(c)}.` } });
    }
    // Lines never given an item are dropped rather than flagged.
    const doc: CountingDraft = { ...draft, counters: draft.countingType === 'single' ? draft.counters.slice(0, 1) : draft.counters, lines: draft.lines.filter((l) => l.itemId) };
    const found = validate(doc, m, action);
    setProblems(found);
    if (found.length) return setTab(found[0].tab === 'attachments' ? 'attachments' : 'contents');
    setSaving(true);
    try {
      if (action === 'close') {
        const c = await closeCounting(doc);
        navigate(COUNT_LIST_PATH, { state: { notice: `Count ${countNumber(c)} closed without a posting. Stock is unchanged and its items are unfrozen.` } });
      } else {
        const c = await saveCounting(doc);
        if (action === 'copy') navigate(`${POSTING_LIST_PATH}/new`, { state: { fromCountId: c.id } });
        else navigate(COUNT_LIST_PATH, { state: { notice: isNew ? `Count ${countNumber(c)} added. No stock has changed.` : `Count ${countNumber(c)} updated.` } });
      }
    } finally {
      setSaving(false);
    }
  };

  /** A recount of the same items and warehouses, with fresh book quantities and nothing counted. */
  const recount = (only?: 'variances') => {
    const lines = draft.lines.filter((l) => !only || (l.counted && l.uomCountedQty * l.itemsPerUnit !== l.inWhseQty));
    const copy: CountingDraft = {
      ...blankCounting(todayISO(), nowHHMM(), CURRENT_USER),
      countingType: draft.countingType,
      counters: draft.counters,
      remarks: `Recount of ${only ? 'the variances on ' : ''}count ${countNumber(draft)}.`,
      referencedDocument: `Inventory Counting ${countNumber(draft)}`,
      lines: lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        const inWhseQty = item ? (item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0) : 0;
        return newCountLine({ ...l, id: undefined, inWhseQty, counterQtys: {}, counted: false, uomCountedQty: 0 });
      }),
    };
    navigate(`${COUNT_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const menu: MoreMenuItem[] = [
    ...(open && !isNew ? [{ label: 'Close without posting', icon: 'block', onSelect: () => submit(null, 'close') }] : []),
    ...(!isNew ? [{ label: 'Duplicate as a recount', icon: 'content_copy', onSelect: () => recount() }] : []),
    ...(!isNew && summary.withVariance ? [{ label: 'Recount variances only', icon: 'replay', onSelect: () => recount('variances') }] : []),
  ];

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="inventory"
          title={isNew ? 'New inventory counting' : `Inventory counting ${countNumber(draft)}`}
          subcopy={whs.length ? `${whs.join(', ')} · ${formatDate(draft.countDate)} ${draft.countTime}` : 'Record what’s on the shelf against the books. Stock changes only through an Inventory Posting.'}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="extra-large" disabled={!nextId} onClick={() => navigate(`${COUNT_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="extra-large" disabled={!prevId} onClick={() => navigate(`${COUNT_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
              </>
            )
          }
          tabs={
            <Tabs
              variant="outline"
              value={tab}
              onValueChange={(v) => setTab(v as TabId)}
              items={[
                { value: 'contents', label: 'Contents' },
                { value: 'attachments', label: 'Attachments', badge: draft.attachments.length ? String(draft.attachments.length) : undefined },
              ]}
            />
          }
          status={isNew ? undefined : <Badge intent={COUNT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(COUNT_LIST_PATH)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              {open ? (
                <Button
                  type="button"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  leadingIcon={<Icon size={20}>arrow_forward</Icon>}
                  disabled={saving || !summary.counted}
                  onClick={() => submit(null, 'copy')}
                >
                  Copy to inventory posting
                </Button>
              ) : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add' : open ? 'Update' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => (t === 'attachments' ? 'Attachments' : t === 'contents' ? 'Contents' : undefined)} />
          {!open ? (
            <Alert intent="default" variant="outline" title="This count is closed">
              {draft.postingId ? (
                <>
                  Its variances were posted by{' '}
                  <button type="button" className="underline" onClick={() => navigate(`${POSTING_LIST_PATH}/${draft.postingId}`)}>
                    Inventory Posting {postingNo || '…'}
                  </button>
                  . Only remarks and attachments can change.
                </>
              ) : (
                'It was closed without a posting, so stock wasn’t changed. Only remarks and attachments can change.'
              )}
            </Alert>
          ) : summary.disagreements ? (
            <Alert intent="warning" variant="outline" title={`Counters differ on ${summary.disagreements} line${summary.disagreements === 1 ? '' : 's'}`}>
              Recount those lines and enter the agreed quantity before copying to an inventory posting.
            </Alert>
          ) : null}

          <fieldset disabled={!open} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <Section icon="tag" title="Document">
                <Fields>
                  <ReadOnly
                    label="No."
                    value={draft.docNum ? countNumber(draft) : `${COUNT_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'} · next number`}
                    hint={draft.docNum ? `Series ${COUNT_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'}` : 'Assigned when the count is added.'}
                  />
                  <ReadOnly label="Status" value={<Badge intent={COUNT_STATUS_INTENT[draft.status]}>{isNew ? 'New' : draft.status}</Badge>} hint="Closes once an Inventory Posting is made from it." />
                  {h.date('countDate', 'Count date', { required: true, error: errors.countDate })}
                  {h.text('countTime', 'Time', { required: true, error: errors.countTime, placeholder: 'HH:MM', hint: 'For movements on the count day.' })}
                  {h.text('reference', 'Ref. 2', { placeholder: 'e.g. CS-MNL-2026-10', hint: 'Count sheet no.' })}
                  {h.date('endOfFiscalYear', 'End of fiscal year', { hint: 'For a year-end count.' })}
                </Fields>
              </Section>

              <Section icon="groups" title="Counting">
                <Fields cols={1}>
                  {h.choose('countingType', 'Counting type', COUNTING_TYPES, {
                    hint: draft.countingType === 'multiple' ? 'Each counter counts on their own; the figures are compared side by side.' : 'One person counts.',
                  })}
                  <div className="flex flex-col gap-1">
                    <Text variant="small" tone={errors.counters ? 'danger' : 'muted'}>
                      {errors.counters ?? 'Inventory counter'}
                    </Text>
                    {(draft.countingType === 'single' ? draft.counters.slice(0, 1) : draft.counters).map((c, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Select
                          aria-label="Counter type"
                          className="w-32"
                          options={[
                            { value: 'User', label: 'User' },
                            { value: 'Employee', label: 'Employee' },
                          ]}
                          value={c.type}
                          onValueChange={(type) => setCounter(i, { type: type as CounterType })}
                        />
                        <div className="flex-1">
                          <Combobox
                            aria-label="Counter"
                            options={[...new Set([...counterNames, c.name].filter(Boolean))].map((n) => ({ value: n, label: n }))}
                            value={c.name || null}
                            onValueChange={(v) => setCounter(i, { name: v ?? '' })}
                          />
                        </div>
                        {draft.countingType === 'multiple' && draft.counters.length > 2 && open ? (
                          <IconButton type="button" label={`Remove ${c.name || 'counter'}`} size="small" variant="ghost" onClick={() => update({ counters: draft.counters.filter((_, j) => j !== i) })}>
                            <Icon size={16}>close</Icon>
                          </IconButton>
                        ) : null}
                      </div>
                    ))}
                    {draft.countingType === 'multiple' && open ? (
                      <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ counters: [...draft.counters, { type: 'Employee', name: '' }] })}>
                        Add counter
                      </Button>
                    ) : null}
                  </div>
                  {h.text('referencedDocument', 'Referenced document', { placeholder: 'e.g. Inventory Counting Primary 310001' })}
                </Fields>
              </Section>

              <Section icon="summarize" title="Summary">
                <Fields>
                  <ReadOnly label="Counted" value={`${summary.counted} of ${summary.lines} line${summary.lines === 1 ? '' : 's'}`} />
                  <ReadOnly label="With variance" value={String(summary.withVariance)} />
                  {draft.countingType === 'multiple' ? <ReadOnly label="Counters differ" value={String(summary.disagreements)} /> : null}
                  <ReadOnly label="Frozen lines" value={String(draft.lines.filter((l) => l.freeze).length)} hint="Can’t be transferred while the count is open." />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? <CountLines draft={draft} update={update} errors={errors} m={m} readOnly={!open} /> : null}
          </fieldset>

          {tab === 'attachments' ? (
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Scanned count sheets, photos of damaged stock, the approval e-mail." withDescription />
          ) : null}

          <Section icon="notes" title="Remarks">
            <Fields cols={1}>
              {h.area('remarks', 'Remarks', {
                rows: 3,
                hint: 'Scope of the count, and who reviewed and approved the results (name and date) before posting. Can be changed after the count closes.',
              })}
            </Fields>
          </Section>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
