import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, Combobox, Form, FormField, IconButton, List, Panel, PanelHeader, panelHeaderIcons, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { ProblemsAlert, problemCollector, type Problem } from '../../../components/form/ProblemsAlert';
import { useCollection } from '../../../components/form/MasterLookup';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import { COUNT_VARIANCE_ACCOUNT, DEFAULT_POSTING_JOURNAL_REMARK, POSTING_SERIES, blankPosting, countedQty, type InventoryCounting, type PriceSource } from '../../../mocks/inventoryCountings';
import { formatAmount } from '../../../services/format';
import { formatDate, todayISO } from '../../../services/dates';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import {
  PostingError,
  addPosting,
  countNumber,
  countWarehouses,
  getCounting,
  getPosting,
  listCountings,
  listPostings,
  postingFromCount,
  postingJournal,
  postingNumber,
  postingTotal,
  savePostingRemarks,
  sourcePrice,
  stockAfter,
} from '../../../services/inventoryCountings';
import { priceLists } from '../../../services/partnerMasters';
import { priceListName } from '../../../services/priceLists';
import { PostingLines, type PostingDraft } from './PostingLines';
import { COUNT_LIST_PATH, POSTING_LIST_PATH, nowHHMM, type CountMasters } from './shared';

type TabId = 'contents' | 'attachments';

interface Masters extends CountMasters {
  accounts: Account[];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(d: PostingDraft, m: Masters): Problem<TabId>[] {
  const { problems, need } = problemCollector<TabId>();
  need(d.postingDate, 'header', 'postingDate', 'Posting date is required.');
  need(d.countDate, 'header', 'countDate', 'Count date is required.');
  need(!d.countDate || !d.postingDate || d.countDate <= d.postingDate, 'header', 'countDate', 'The count date can’t be after the posting date.');
  need(TIME.test(d.countTime), 'header', 'countTime', 'Time is required, as HH:MM (24-hour).');
  need(d.priceSource !== 'price-list' || d.priceListId, 'header', 'priceListId', 'Pick the price list to value the variance at.');
  need(d.lines.length, 'contents', 'lines', 'Copy from an inventory counting or add the items to adjust.');
  const seen = new Set<string>();
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    const item = m.items.find((x) => x.id === l.itemId);
    need(item, 'contents', `line:${l.id}:item`, `${n}: pick an item.`);
    if (!item) continue;
    need(item.inventoryItem, 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} isn't an inventory item.`);
    need(l.warehouse, 'contents', `line:${l.id}:warehouse`, `${n}: pick the warehouse.`);
    const key = `${l.itemId}@${l.warehouse}`;
    need(!seen.has(key), 'contents', `line:${l.id}:item`, `${n}: ${item.itemNo} in ${l.warehouse} is on the posting twice.`);
    seen.add(key);
    need(l.uomCountedQty >= 0, 'contents', `line:${l.id}:countedQty`, `${n}: counted quantity can't be negative.`);
    need(item.manageBy !== 'Serial Numbers' || Number.isInteger(countedQty(l)), 'contents', `line:${l.id}:countedQty`, `${n}: serial-managed items are counted in whole units.`);
    need(l.price >= 0, 'contents', `line:${l.id}:price`, `${n}: price can't be negative.`);
    need(stockAfter(l, m.items) >= 0, 'contents', `line:${l.id}:countedQty`, `${n}: ${item.itemNo} would go below zero in ${l.warehouse} — stock moved out after the count. Recount it.`);
  }
  return problems;
}

export function InventoryPostingDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <PostingForm key={id === 'new' ? location.key : id} />;
}

function PostingForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const fromCountId = (useLocation().state as { fromCountId?: string } | null)?.fromCountId;
  const lists = useCollection(priceLists) ?? [];

  const [draft, setDraft] = useState<PostingDraft | null | undefined>(isNew ? blankPosting(todayISO(), nowHHMM()) : undefined);
  const [m, setM] = useState<Masters>();
  const [openCounts, setOpenCounts] = useState<InventoryCounting[]>([]);
  const [count, setCount] = useState<InventoryCounting>();
  const [siblings, setSiblings] = useState<string[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('contents');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listItems(), loadInventoryMasters(), listCountings()]).then(([items, inv, counts]) => {
      if (cancelled) return;
      const masters = { items, warehouses: inv.warehouses, groups: inv.groups, accounts: inv.accounts };
      setM(masters);
      setOpenCounts(counts.filter((c) => c.status === 'Open' && c.lines.some((l) => l.counted)));
      // Arrived from a count's "Copy to inventory posting".
      const from = fromCountId && counts.find((c) => c.id === fromCountId);
      if (isNew && from) {
        setCount(from);
        setDraft((d) => d && postingFromCount(from, d, items));
      }
    });
    if (!isNew && id) {
      getPosting(id).then((p) => {
        if (cancelled) return;
        setDraft(p ?? null);
        if (p?.countingId) getCounting(p.countingId).then((c) => !cancelled && setCount(c));
      });
      listPostings().then((all) => !cancelled && setSiblings([...all].sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map((p) => p.id)));
    }
    return () => {
      cancelled = true;
    };
  }, [id, isNew, fromCountId]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading posting…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="fact_check" title="Posting not found" />
        <Panel.Body>
          <Button onClick={() => navigate(POSTING_LIST_PATH)}>Back to inventory postings</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const added = Boolean(draft.docNum);
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const at = draft.id ? siblings.indexOf(draft.id) : -1;
  const prevId = at > 0 ? siblings[at - 1] : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : undefined;
  const journal = postingJournal(draft, m.items, m.groups);
  const whs = countWarehouses(draft);

  const update = (patch: Partial<PostingDraft>) => setDraft({ ...draft, ...patch });

  /** A new price source reprices every line. */
  const setPriceSource = (priceSource: PriceSource, priceListId = draft.priceListId) => {
    const next = { ...draft, priceSource, priceListId };
    update({
      priceSource,
      priceListId,
      lines: draft.lines.map((l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return item ? { ...l, price: sourcePrice(item, next) } : l;
      }),
    });
  };

  // A new price source reprices the lines; other header fields just set.
  const h = bind(draft, (p) => (p.priceSource && p.priceSource !== draft.priceSource ? setPriceSource(p.priceSource) : update(p)));

  const copyFromCount = (countId: string | null) => {
    const c = openCounts.find((x) => x.id === countId);
    setCount(c);
    setDraft(c ? postingFromCount(c, draft, m.items) : { ...draft, countingId: '', lines: [] });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (added) {
      setSaving(true);
      const p = await savePostingRemarks(draft.id!, { remarks: draft.remarks, journalRemark: draft.journalRemark, attachments: draft.attachments });
      setSaving(false);
      return navigate(POSTING_LIST_PATH, { state: { notice: `Remarks saved on inventory posting ${postingNumber(p)}.` } });
    }
    const doc: PostingDraft = {
      ...draft,
      lines: draft.lines.filter((l) => l.itemId),
      journalRemark:
        draft.journalRemark === DEFAULT_POSTING_JOURNAL_REMARK && whs.length ? `${DEFAULT_POSTING_JOURNAL_REMARK} – ${whs.join(', ')}${count ? ` count ${countNumber(count)}` : ''}` : draft.journalRemark,
    };
    const found = validate(doc, m);
    setProblems(found);
    if (found.length) return setTab('contents');
    setSaving(true);
    try {
      const p = await addPosting(doc);
      navigate(POSTING_LIST_PATH, {
        state: {
          notice: `Inventory posting ${postingNumber(p)} added — stock adjusted by PHP ${formatAmount(postingTotal(p))} at ${p.priceSource === 'item-cost' ? 'item cost' : priceListName(p.priceListId)}.${count ? ` Count ${countNumber(count)} is now closed.` : ''}`,
        },
      });
    } catch (err) {
      if (!(err instanceof PostingError)) throw err;
      setProblems([{ tab: 'contents', key: 'lines', message: err.message }]);
      listItems().then((items) => setM((prev) => prev && { ...prev, items }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="fact_check"
          title={added ? `Inventory posting ${postingNumber(draft)}` : 'New inventory posting'}
          subcopy={isNew ? 'Adjust stock to what was counted, and book the difference.' : undefined}
          leading={
            isNew ? undefined : (
              <>
                <IconButton type="button" label="Next" intent="default" variant="solid" size="large" disabled={!nextId} onClick={() => navigate(`${POSTING_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
                <IconButton type="button" label="Previous" intent="default" variant="solid" size="large" disabled={!prevId} onClick={() => navigate(`${POSTING_LIST_PATH}/${prevId}`)}>
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
          status={added ? <Badge size="small" intent="success">Posted</Badge> : undefined}
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="large" onClick={() => navigate(POSTING_LIST_PATH)}>
                Cancel
              </Button>
              <Button type="submit" intent="primary" variant="solid" size="large" disabled={saving}>
                {saving ? 'Saving…' : added ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => (t === 'attachments' ? 'Attachments' : t === 'contents' ? 'Contents' : undefined)} />
          {added ? (
            <Alert intent="default" variant="outline" title="This posting is added">
              Stock and the journal entry are posted. Only remarks, journal remarks and attachments can change. To correct it, count again and post the difference.
            </Alert>
          ) : (
            <Alert intent="warning" variant="outline" title="Adding this changes stock">
              Review the variances first — large ones may need a recount or Finance approval. Note who approved it in Remarks.
            </Alert>
          )}

          <fieldset disabled={added} className="contents">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Section icon="tag" title="Document">
                <Fields>
                  <ReadOnly
                    label="No."
                    value={added ? postingNumber(draft) : `${POSTING_SERIES.find((s) => s.id === draft.seriesId)?.name ?? 'Primary'} · next number`}
                    hint={added ? undefined : 'Assigned when the posting is added.'}
                  />
                  {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'When the adjustment hits the books.' })}
                  {h.date('countDate', 'Count date', { required: true, error: errors.countDate, hint: count ? 'From the counting.' : undefined })}
                  {h.text('countTime', 'Time', { required: true, error: errors.countTime, placeholder: 'HH:MM' })}
                  {h.text('reference', 'Ref. 2', { placeholder: 'Count sheet no.' })}
                  {h.date('endOfFiscalYear', 'End of fiscal year', { hint: 'For a year-end adjustment.' })}
                </Fields>
              </Section>

              <Section icon="link" title="Source and valuation">
                <Fields>
                  {added || fromCountId ? (
                    <ReadOnly
                      label="Referenced document"
                      value={
                        count ? (
                          <button type="button" className="underline" onClick={() => navigate(`${COUNT_LIST_PATH}/${count.id}`)}>
                            Inventory Counting {countNumber(count)}
                          </button>
                        ) : (
                          '— Added directly'
                        )
                      }
                    />
                  ) : (
                    <FormField label="Copy from inventory counting" tooltip="Pulls in the count’s counted lines. Copying closes the count when this posting is added.">
                      {(p) => (
                        <Combobox
                          {...p}
                          placeholder="Pick an open count, or add items below"
                          options={openCounts.map((c) => ({
                            value: c.id,
                            label: `${countNumber(c)} · ${countWarehouses(c).join(', ')} · ${formatDate(c.countDate)}`,
                          }))}
                          value={draft.countingId || null}
                          onValueChange={copyFromCount}
                        />
                      )}
                    </FormField>
                  )}
                  {h.choose(
                    'priceSource',
                    'Price source',
                    [
                      { value: 'item-cost', label: 'Item cost' },
                      { value: 'price-list', label: 'Price list' },
                    ],
                    { hint: 'Values the variance. Each line’s price can still be changed.' },
                  )}
                  {draft.priceSource === 'price-list' ? (
                    <FormField label="Price list" required error={errors.priceListId}>
                      {(p) => (
                        <Combobox
                          {...p}
                          options={lists.filter((l) => l.active || l.id === draft.priceListId).map((l) => ({ value: l.id, label: l.name }))}
                          value={draft.priceListId || null}
                          onValueChange={(v) => setPriceSource('price-list', v ?? '')}
                        />
                      )}
                    </FormField>
                  ) : null}
                  <ReadOnly label="Total" value={`PHP ${formatAmount(postingTotal(draft))}`} hint="Σ variance × price." />
                </Fields>
              </Section>
            </div>

            {tab === 'contents' ? <PostingLines draft={draft} update={update} errors={errors} m={m} readOnly={added} /> : null}
          </fieldset>

          {tab === 'attachments' ? (
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="The approved count sheet, Finance sign-off." withDescription />
          ) : null}

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Section icon="notes" title="Remarks">
              <Fields cols={1}>
                {h.area('remarks', 'Remarks', { rows: 3, hint: 'Who approved the adjustment, and why large variances happened.' })}
                {h.text('journalRemark', 'Journal remark', { hint: 'Shown on the journal entry.' })}
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
                  {`None until a line has a variance. Losses: Dr ${accountText(COUNT_VARIANCE_ACCOUNT, m.accounts)} / Cr Inventory; gains the reverse.`}
                </Text>
              )}
            </Section>
          </div>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
