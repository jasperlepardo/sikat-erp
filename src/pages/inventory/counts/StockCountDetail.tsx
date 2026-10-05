import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Form, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { CURRENT_USER } from '../../../mocks/common';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import { COUNT_SERIES, COUNT_VARIANCE_ACCOUNT, DEFAULT_COUNT_JOURNAL_REMARK, blankCounting, newCountLine, type CountStatus, type InventoryCounting } from '../../../mocks/inventoryCountings';
import { formatAmount } from '../../../services/format';
import { formatDate, todayISO } from '../../../services/dates';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import {
  closeCounting,
  countJournal,
  countNumber,
  countSummary,
  countWarehouses,
  getCounting,
  listCountings,
  postCounting,
  saveCounting,
  saveCountingRemarks,
} from '../../../services/inventoryCountings';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { CountLines, type CountMasters, type CountingDraft } from './CountLines';

export const COUNT_LIST_PATH = '/inventory/stock-counts';

export const COUNT_STATUS_INTENT: Record<CountStatus, 'primary' | 'success' | 'default'> = {
  Open: 'primary',
  Posted: 'success',
  Closed: 'default',
};

type TabId = 'contents';
type Action = 'save' | 'post' | 'close';

interface Masters extends CountMasters {
  accounts: Account[];
}

/** Save needs valid lines; posting also needs at least one counted line. */
function validate(d: CountingDraft, m: Masters, action: Action): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.countDate, 'header', 'countDate', 'Count date is required.');
  need(d.counter, 'header', 'counter', 'Who counted is required.');
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
    need(!l.counted || l.countedQty >= 0, 'contents', `line:${l.id}:countedQty`, `${n}: counted quantity can't be negative.`);
    need(
      !l.counted || Number.isInteger(l.countedQty) || item.manageBy !== 'Serial Numbers',
      'contents',
      `line:${l.id}:countedQty`,
      `${n}: serial-managed items are counted in whole units.`,
    );
  }
  if (action === 'post') {
    need(d.lines.length, 'contents', 'lines', 'Add the items counted.');
    need(d.lines.some((l) => l.counted), 'contents', 'lines', 'Nothing is counted yet — tick Counted on the lines you’ve counted.');
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

  const [draft, setDraft] = useState<CountingDraft | null | undefined>(isNew ? (copyFrom ?? blankCounting(todayISO(), CURRENT_USER)) : undefined);
  const [m, setM] = useState<Masters>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listItems(), loadInventoryMasters()]).then(([items, inv]) =>
      setM({ items, warehouses: inv.warehouses, groups: inv.groups, accounts: inv.accounts }),
    );
    if (isNew || !id) return;
    let cancelled = false;
    getCounting(id).then((c) => !cancelled && setDraft(c ?? null));
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
  const posted = draft.status === 'Posted';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const summary = countSummary(draft, m.items);
  const journal = countJournal(draft, m.items, m.groups);
  const whs = countWarehouses(draft);

  const update = (patch: Partial<CountingDraft>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);

  const submit = async (e: FormEvent | null, action: Action = 'save') => {
    e?.preventDefault();
    if (!open) {
      setSaving(true);
      const c = await saveCountingRemarks(draft as InventoryCounting, { remarks: draft.remarks, journalRemark: draft.journalRemark });
      setSaving(false);
      return navigate(COUNT_LIST_PATH, { state: { notice: `Remarks saved on count ${countNumber(c)}.` } });
    }
    // Lines never given an item are dropped rather than flagged.
    const doc: CountingDraft = { ...draft, lines: draft.lines.filter((l) => l.itemId) };
    const found = validate(doc, m, action);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      if (action === 'post') {
        const journalRemark =
          doc.journalRemark === DEFAULT_COUNT_JOURNAL_REMARK ? `${DEFAULT_COUNT_JOURNAL_REMARK} ${whs.join(', ')} count` : doc.journalRemark;
        const c = await postCounting({ ...doc, journalRemark }, doc.countDate);
        const s = countSummary(c, await listItems());
        navigate(COUNT_LIST_PATH, {
          state: {
            notice: `Count ${countNumber(c)} posted — ${s.withVariance} line${s.withVariance === 1 ? '' : 's'} adjusted, net PHP ${formatAmount(s.value)} at cost.`,
          },
        });
      } else if (action === 'close') {
        const c = await closeCounting(doc);
        navigate(COUNT_LIST_PATH, { state: { notice: `Count ${countNumber(c)} closed without posting. Stock is unchanged.` } });
      } else {
        const c = await saveCounting(doc);
        navigate(COUNT_LIST_PATH, { state: { notice: isNew ? `Count ${countNumber(c)} added.` : `Count ${countNumber(c)} updated.` } });
      }
    } finally {
      setSaving(false);
    }
  };

  const duplicate = () => {
    const copy: CountingDraft = {
      ...structuredClone(draft),
      id: undefined,
      docNum: 0,
      status: 'Open',
      countDate: todayISO(),
      postingDate: '',
      journalRemark: DEFAULT_COUNT_JOURNAL_REMARK,
      reference: '',
      // A recount: same items and warehouses, nothing counted yet.
      lines: draft.lines.map((l) => newCountLine({ ...l, id: undefined, counted: false, countedQty: 0, inWhseQty: 0, unitCost: 0, remarks: '' })),
    };
    navigate(`${COUNT_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  /** Recount just the lines that came out different. */
  const recountVariances = () => {
    const off = draft.lines.filter((l) => l.counted && l.countedQty !== l.inWhseQty);
    const copy: CountingDraft = {
      ...blankCounting(todayISO(), CURRENT_USER),
      remarks: `Recount of the variances on count ${countNumber(draft)}.`,
      lines: off.map((l) => newCountLine({ ...l, id: undefined, counted: false, countedQty: 0, inWhseQty: 0, unitCost: 0, remarks: '' })),
    };
    navigate(`${COUNT_LIST_PATH}/new`, { state: { copyFrom: copy } });
  };

  const menu: MoreMenuItem[] = [
    ...(open && !isNew ? [{ label: 'Close without posting', icon: 'block', onSelect: () => submit(null, 'close') }] : []),
    ...(!isNew ? [{ label: 'Duplicate as a recount', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(posted && summary.withVariance ? [{ label: 'Recount variances', icon: 'replay', onSelect: recountVariances }] : []),
  ];

  const title = isNew ? 'New stock count' : `Stock count ${countNumber(draft)}`;

  return (
    <Form className="flex-1" onSubmit={(e) => submit(e)} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="inventory"
          title={title}
          subcopy={whs.length ? `${whs.join(', ')} · ${formatDate(draft.countDate)}` : 'Count what’s on the shelf, then post the differences.'}
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
          status={isNew ? undefined : <Badge intent={COUNT_STATUS_INTENT[draft.status]}>{draft.status}</Badge>}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(COUNT_LIST_PATH)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              {open ? (
                <Button type="button" intent="default" variant="solid" size="extra-large" disabled={saving} onClick={() => submit(null, 'post')}>
                  Post variances
                </Button>
              ) : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add' : open ? 'Update' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={() => undefined} />
          {posted ? (
            <Alert intent="default" variant="outline" title="This count is posted">
              In Stock was set to the counted quantities on {formatDate(draft.postingDate)}. Only the remarks can change. To check again, use Recount variances.
            </Alert>
          ) : draft.status === 'Closed' ? (
            <Alert intent="default" variant="outline" title="This count was closed without posting">
              Stock wasn’t changed. Only the remarks can change.
            </Alert>
          ) : null}

          <fieldset disabled={!open} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              <Section icon="tag" title="Document">
                <Fields>
                  <ReadOnly
                    label="No."
                    value={draft.docNum ? countNumber(draft) : `${COUNT_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'} · next number`}
                    hint={draft.docNum ? undefined : 'Assigned when the count is added.'}
                  />
                  <ReadOnly
                    label="Status"
                    value={<Badge intent={COUNT_STATUS_INTENT[draft.status]}>{isNew ? 'New' : draft.status}</Badge>}
                    hint="Open while counting. Posting adjusts stock and can't be undone."
                  />
                  {h.date('countDate', 'Count date', { required: true, error: errors.countDate, hint: 'Also the posting date of the adjustment.' })}
                  {h.text('countTime', 'Count time', { placeholder: 'HH:MM' })}
                </Fields>
              </Section>

              <Section icon="person" title="Counter">
                <Fields cols={1}>
                  {h.master('counter', 'Counted by', salesEmployeeDef, { required: true, error: errors.counter, extra: [CURRENT_USER] })}
                  {h.text('reference', 'Count sheet no.', { placeholder: 'e.g. CS-MNL-2026-10', hint: 'The paper or scanner sheet, if any.' })}
                </Fields>
              </Section>

              <Section icon="summarize" title="Summary">
                <Fields>
                  <ReadOnly label="Counted" value={`${summary.counted} of ${summary.lines} line${summary.lines === 1 ? '' : 's'}`} />
                  <ReadOnly label="With variance" value={String(summary.withVariance)} />
                  <ReadOnly
                    label="Net variance at cost"
                    value={`PHP ${formatAmount(summary.value)}`}
                    hint={posted ? 'As posted.' : 'Against In Stock now; recalculated when posted.'}
                  />
                </Fields>
              </Section>
            </div>

            <CountLines draft={draft} update={update} errors={errors} m={m} readOnly={!open} />
          </fieldset>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="notes" title="Remarks">
              <Fields cols={1}>
                {h.text('journalRemark', 'Journal remarks', { hint: 'Shown on the adjustment journal entry.' })}
                {h.area('remarks', 'Remarks', { rows: 3, hint: 'Scope of the count, and why any big variance happened. Can be changed after posting.' })}
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
              ) : (
                <Text variant="small" tone="muted">
                  {`Posting makes one only if a counted quantity differs from In Stock: losses Dr ${accountText(COUNT_VARIANCE_ACCOUNT, m.accounts)} / Cr Inventory, gains the reverse, at item cost.`}
                </Text>
              )}
            </Section>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
