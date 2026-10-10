import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Badge, Button, ButtonGroup, Form, IconButton, Panel, PanelHeader, panelHeaderIcons, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { AttachmentsCard } from '../../../components/form/AttachmentsCard';
import { Fields, Section, bind, type Errors } from '../../../components/form/fields';
import { MoreMenu, type MoreMenuItem } from '../../../components/form/MoreMenu';
import { ProblemsAlert, type Problem } from '../../../components/form/ProblemsAlert';
import { ORIGIN_LABEL, ORIGIN_PATH, blankJournalEntry, newJeLine, type JournalEntry } from '../../../mocks/journalEntries';
import { formatDate, todayISO } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import {
  JePostError,
  addJournalEntry,
  getJournalEntry,
  jeNumber,
  jeTotals,
  listJournalEntries,
  reverseJournalEntry,
  saveJournalEntryNotes,
  withAutoTax,
  type JeInput,
} from '../../../services/journalEntries';
import { accounts as accountsCollection, taxCodes as taxCodesCollection } from '../../../services/masterData';
import { listPartners } from '../../../services/partners';
import { JeHeaderSections, JeRowsTable, jeProblems, rowsToPost, type JeMasters } from './JeEditor';

export const JE_LIST_PATH = '/accounting/journal-entries';

export const JE_STATUS_INTENT = { Posted: 'success', Reversed: 'default' } as const;

type TabId = 'contents' | 'attachments';

type Masters = JeMasters;

/** Checked on Add: an open period, a valid reversal, rows that can post, and debits = credits. */
const validate = (d: JeInput, m: Masters): Problem<TabId>[] => jeProblems(d, m);

export function JournalEntryDetail() {
  const { id } = useParams();
  const location = useLocation();
  return <JournalEntryForm key={id === 'new' ? location.key : id} />;
}

function JournalEntryForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: JeInput } | null)?.copyFrom;

  const [draft, setDraft] = useState<JeInput | null | undefined>(isNew ? (copyFrom ?? blankJournalEntry(todayISO())) : undefined);
  const [m, setM] = useState<Masters>();
  const [all, setAll] = useState<JournalEntry[]>([]);
  const [problems, setProblems] = useState<Problem<TabId>[]>([]);
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>('contents');

  useEffect(() => {
    let cancelled = false;
    Promise.all([accountsCollection.list(), listPartners(), taxCodesCollection.list()]).then(([accounts, partners, codes]) => !cancelled && setM({ accounts, partners, codes }));
    listJournalEntries().then((list) => !cancelled && setAll(list));
    if (!isNew && id) getJournalEntry(id).then((je) => !cancelled && setDraft(je ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined || !m) return <Text tone="muted" className="p-4">Loading journal entry…</Text>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon="menu_book" iconIntent="default" iconShape="rounded" iconSize={32} iconVariant="outline" title="Journal entry not found" />
        <Panel.Body>
          <Button onClick={() => navigate(JE_LIST_PATH)}>Back to journal entries</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const posted = Boolean(draft.number);
  const manual = draft.origin === 'JE';
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  // Automatic Tax rows follow the taxed rows on a new entry; a posted one shows what was posted.
  const lines = posted ? draft.lines : withAutoTax(draft, m.codes);
  const totals = jeTotals(lines);
  const sorted = [...all].sort((a, b) => b.transNo - a.transNo).map((e) => e.id);
  const at = draft.id ? sorted.indexOf(draft.id) : -1;
  const prevId = at > 0 ? sorted[at - 1] : undefined;
  const nextId = at >= 0 && at < sorted.length - 1 ? sorted[at + 1] : undefined;
  const reversedBy = all.find((e) => e.id === draft.reversedBy);
  const reverses = all.find((e) => e.id === draft.reverses);
  const originPath = ORIGIN_PATH[draft.origin];

  const update = (patch: Partial<JeInput>) => setDraft({ ...draft, ...patch });
  const h = bind(draft, update);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (posted) {
      setSaving(true);
      const je = await saveJournalEntryNotes(draft.id!, { remarks: draft.remarks, attachments: draft.attachments });
      setSaving(false);
      return navigate(JE_LIST_PATH, { state: { notice: `Remarks saved on journal entry ${jeNumber(je)}.` } });
    }
    const doc: JeInput = { ...draft, lines: rowsToPost(lines) };
    const found = validate(doc, m);
    setProblems(found);
    if (found.length) return setTab('contents');
    setSaving(true);
    try {
      const je = await addJournalEntry(doc);
      navigate(JE_LIST_PATH, {
        state: { notice: `Journal entry ${jeNumber(je)} posted — PHP ${formatAmount(totals.debit)}.${doc.reverse ? ` Its reversal is posted for ${formatDate(doc.reversalDate)}.` : ''}` },
      });
    } catch (err) {
      if (!(err instanceof JePostError)) throw err;
      setProblems([{ tab: 'header', key: 'postingDate', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  const reverseNow = async () => {
    try {
      const r = await reverseJournalEntry(draft.id!, todayISO());
      navigate(`${JE_LIST_PATH}/${r.id}`);
    } catch (err) {
      setProblems([{ tab: 'header', key: 'status', message: (err as Error).message }]);
    }
  };

  const duplicate = () => {
    const today = todayISO();
    navigate(`${JE_LIST_PATH}/new`, {
      state: {
        copyFrom: {
          ...blankJournalEntry(today),
          remarks: draft.remarks,
          transCode: draft.transCode,
          projectId: draft.projectId,
          indicator: draft.indicator,
          automaticTax: draft.automaticTax,
          lines: draft.lines.filter((l) => !l.taxOf).map((l) => newJeLine({ ...l, id: undefined })),
        } satisfies JeInput,
      },
    });
  };

  const menu: MoreMenuItem[] = [
    ...(posted && manual && draft.status === 'Posted' && !draft.reverses ? [{ label: 'Reverse now', icon: 'undo', onSelect: reverseNow }] : []),
    ...(posted && manual ? [{ label: 'Duplicate', icon: 'content_copy', onSelect: duplicate }] : []),
    ...(originPath && draft.originId ? [{ label: `Open ${ORIGIN_LABEL[draft.origin]} ${draft.originNo}`, icon: 'open_in_new', onSelect: () => navigate(`${originPath}/${draft.originId}`) }] : []),
    ...(reversedBy ? [{ label: `Open reversal ${jeNumber(reversedBy)}`, icon: 'swap_horiz', onSelect: () => navigate(`${JE_LIST_PATH}/${reversedBy.id}`) }] : []),
    ...(reverses ? [{ label: `Open reversed entry ${jeNumber(reverses)}`, icon: 'swap_horiz', onSelect: () => navigate(`${JE_LIST_PATH}/${reverses.id}`) }] : []),
  ];

  const title = isNew ? 'New journal entry' : jeNumber(draft);

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="details"
          icon="menu_book"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32} iconVariant="outline"
          title={title}
          trailing={
            isNew ? undefined : (
              <ButtonGroup type="enclosed" intent="white" buttonIntent="default" buttonVariant="link">
                <IconButton type="button" label="Previous" size="small"
                  shape="pill" disabled={!prevId} onClick={() => navigate(`${JE_LIST_PATH}/${prevId}`)}>
                  {panelHeaderIcons.arrowUpward}
                </IconButton>
                <IconButton type="button" label="Next" size="small"
                  shape="pill" disabled={!nextId} onClick={() => navigate(`${JE_LIST_PATH}/${nextId}`)}>
                  {panelHeaderIcons.arrowDownward}
                </IconButton>
              </ButtonGroup>
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
          status={posted ? <Badge size="small" intent={JE_STATUS_INTENT[draft.status]}>{draft.status}</Badge> : undefined}
          actions={
            <>
              <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={() => navigate(JE_LIST_PATH)}>
                {posted ? 'Back' : 'Cancel'}
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving}>
                {saving ? 'Saving…' : posted ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert problems={problems} tabLabel={(t) => (t === 'contents' ? 'Contents' : t === 'attachments' ? 'Attachments' : undefined)} />
          {notice ? (
            <Alert intent="default" variant="outline" title="Import from Excel" onClose={() => setNotice(undefined)}>
              {notice}
            </Alert>
          ) : null}
          {posted ? (
            <Alert intent="default" variant="outline" title={draft.status === 'Reversed' ? 'This entry is reversed' : 'This entry is posted'}>
              {draft.status === 'Reversed'
                ? `Entry ${reversedBy ? jeNumber(reversedBy) : '—'} offsets it${reversedBy ? `, posted ${formatDate(reversedBy.postingDate)}` : ''}. The original stays as it was.`
                : manual
                  ? 'Posted entries are never edited — only remarks and attachments change. To undo it, reverse it.'
                  : `Made by ${ORIGIN_LABEL[draft.origin]} ${draft.originNo}. To undo it, cancel that document.`}
            </Alert>
          ) : null}

          <fieldset disabled={posted} className="contents">
            <JeHeaderSections draft={draft} update={update} errors={errors} readOnly={posted} />

            {tab === 'contents' ? <JeRowsTable draft={draft} update={update} errors={errors} readOnly={posted} m={m} lines={lines} onNotice={setNotice} /> : null}
          </fieldset>

          {tab === 'attachments' ? (
            <AttachmentsCard attachments={draft.attachments} onChange={(attachments) => update({ attachments })} emptyHint="Backup for the entry: invoice scan, approval e-mail, schedule. A posted entry can't change, so attach it here." withDescription />
          ) : null}

          <Section icon="notes" title="Remarks">
            <Fields cols={1}>{h.area('remarks', 'Remarks', { rows: 2, hint: 'Describe the entry. Can be changed after posting.' })}</Fields>
          </Section>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
