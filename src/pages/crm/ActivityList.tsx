import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Panel,
  Table,
  TableContent,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../components/form/PageHeader';
import { blankActivity, LogMenu } from '../../components/activity/ActivityTab';
import { ActivityPanel } from '../../components/activity/ActivityPanel';
import { choiceField, dateField, masterField, textField } from '../../components/filter/fieldKit';
import { EMPTY_FILTER, oneRule, type FilterField } from '../../components/filter/engine';
import { useListPresets } from '../../components/filter/useListPresets';
import { type BuiltInView } from '../../components/filter/useListViews';
import { fillCardClass, useListPage } from '../../components/form/DataTable';
import { useCollection } from '../../components/form/MasterLookup';
import { ACTIVITY_ICON, ACTIVITY_LABEL, type Activity, type ActivityLink } from '../../mocks/activities';
import { activities, isOverdue } from '../../services/activities';
import { formatDate, todayISO } from '../../services/dates';
import { listItems } from '../../services/items';
import { nameIn, salesEmployees } from '../../services/partnerMasters';
import { listPartners } from '../../services/partners';
import { useAsync } from '../../services/useAsync';
import { useDocTitle } from '../../services/useDocTitle';
import { salesEmployeeDef } from '../settings/masterDefs';
import { purchaseDocNodes } from '../purchasing/shared/documentLinks';
import { salesDocNodes } from '../sales/shared/salesDocumentLinks';

/** A record an activity links to, as shown: its number or name, and where it opens. */
interface Shown {
  label: string;
  sub?: string;
  href: string;
}

const ACTIVITY_STATUSES = ['Open', 'Overdue', 'Done', 'Logged'] as const;

/** Built-in views mirror the old status tabs: all, open tasks (open + overdue), overdue. */
const ACTIVITY_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All activities', filter: EMPTY_FILTER },
  { id: 'open', name: 'Open tasks', filter: oneRule('status', 'in', ['Open', 'Overdue']) },
  { id: 'overdue', name: 'Overdue', filter: oneRule('status', 'in', ['Overdue']) },
];

const statusOf = (a: Activity, today: string) =>
  a.kind !== 'task' ? { label: 'Logged', intent: 'default' as const }
  : a.done ? { label: 'Done', intent: 'success' as const }
  : isOverdue(a, today) ? { label: 'Overdue', intent: 'danger' as const }
  : { label: 'Open', intent: 'primary' as const };

/** CRM › Activities: every call, meeting, task, note and email, across partners and documents. */
export function ActivityList() {
  useDocTitle('Activities');
  const navigate = useNavigate();
  const rows = useCollection(activities);
  const all = useMemo(() => [...(rows ?? [])], [rows]);
  const employees = useCollection(salesEmployees);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const [editing, setEditing] = useState<{ value: Activity; isNew: boolean } | null>(null);

  // Names and numbers for what activities link to, so the list never shows a raw id.
  const lookup = useAsync(async () => {
    const [partners, items, docs] = await Promise.all([listPartners(), listItems(), Promise.all([purchaseDocNodes(), salesDocNodes()]).then((d) => d.flat())]);
    const shown = new Map<string, Shown>();
    for (const p of partners) shown.set(`BP:${p.id}`, { label: p.name, sub: p.code, href: `/crm/business-partners/${p.id}` });
    for (const i of items) shown.set(`ITEM:${i.id}`, { label: i.itemNo, sub: i.name, href: `/inventory/items/${i.id}` });
    for (const d of docs) shown.set(`${d.kind}:${d.id}`, { label: d.number, sub: d.type, href: d.href });
    return shown;
  }, []);

  const today = todayISO();
  const ownerName = (id: string) => (id && employees ? nameIn(salesEmployees, id) : '');
  const linkOf = (l: ActivityLink) => lookup?.get(`${l.kind}:${l.id}`);
  const partnerOf = (a: Activity) => (a.partnerId ? lookup?.get(`BP:${a.partnerId}`) : undefined);

  const fields = useMemo<FilterField<Activity>[]>(
    () => [
      textField<Activity>('subject', 'Subject', (a) => a.subject),
      textField<Activity>('notes', 'Notes', (a) => a.notes),
      choiceField<Activity>('kind', 'Type', ACTIVITY_LABEL, (a) => a.kind),
      choiceField<Activity>('status', 'Status', ACTIVITY_STATUSES, (a) => statusOf(a, today).label),
      masterField<Activity>('owner', 'Owner', salesEmployeeDef, (a) => a.ownerId),
      textField<Activity>('partner', 'Business partner', (a) => partnerOf(a)?.label),
      dateField<Activity>('date', 'Date / due', (a) => a.dueDate || a.date),
    ],
    // partnerOf reads from lookup; rebuild the fields once names resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, lookup],
  );

  const presets = useListPresets({
    list: 'activities',
    fields,
    builtIns: ACTIVITY_VIEWS,
    defaultSort: { key: 'date', direction: 'desc' },
    rows: rows ? all : undefined,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = presets.apply(all).filter(
      (a) =>
        !q ||
        [a.subject, a.notes, partnerOf(a)?.label, ...a.links.map((l) => linkOf(l)?.label)]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
    if (!sort) return list;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (a: Activity) =>
      sort.key === 'owner' ? ownerName(a.ownerId)
      : sort.key === 'partner' ? partnerOf(a)?.label ?? ''
      : sort.key === 'date' ? `${a.dueDate || a.date}${a.time}`
      : String(a[sort.key as keyof Activity] ?? '');
    return [...list].sort((a, b) => value(a).localeCompare(value(b)) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, presets.filter, query, sort, lookup, employees]);

  const columns: TableColumn<Activity>[] = [
    {
      key: 'subject',
      header: 'Activity',
      sortable: true,
      cell: (a) => (
        <div className="flex items-center gap-2">
          <Icon size={20}>{ACTIVITY_ICON[a.kind]}</Icon>
          <TableContent onClick={() => setEditing({ value: a, isNew: false })} subcopy={ACTIVITY_LABEL[a.kind]}>{a.subject}</TableContent>
        </div>
      ),
    },
    {
      key: 'partner',
      header: 'Business partner',
      sortable: true,
      cell: (a) => {
        const p = partnerOf(a);
        return p ? (
          <TableContent href={`#${p.href}`} subcopy={p.sub}>{p.label}</TableContent>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'links',
      header: 'Linked to',
      cell: (a) => {
        const shown = a.links.map(linkOf).filter((s): s is Shown => !!s);
        return shown.length ? (
          <div className="flex flex-col">
            {shown.map((s) => (
              <TableContent key={s.href} onClick={() => navigate(s.href)} subcopy={s.sub}>{s.label}</TableContent>
            ))}
          </div>
        ) : (
          '—'
        );
      },
    },
    { key: 'owner', header: 'Owner', sortable: true, cell: (a) => ownerName(a.ownerId) || '—' },
    {
      key: 'date',
      header: 'Date / due',
      sortable: true,
      cell: (a) =>
        a.kind === 'task' && a.dueDate ? (
          <TableContent subcopy={`From ${formatDate(a.date)}`}>Due {formatDate(a.dueDate)}</TableContent>
        ) : (
          <TableContent subcopy={a.time || undefined}>{formatDate(a.date)}</TableContent>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => {
        const s = statusOf(a, today);
        return <TableStatus intent={s.intent}>{s.label}</TableStatus>;
      },
    },
  ];

  const { visible: onPage, pagination } = paginate(filtered);

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel="Search activities"
        searchPlaceholder="Search by subject, notes, partner or document"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="event"
        title={presets.menu}
        actions={<LogMenu onPick={(k) => setEditing({ value: blankActivity(k, undefined), isNew: true })} />}
      />
      <Panel.Body className="flex flex-col gap-2">
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {!rows || !lookup ? (
            <Text tone="muted" className="p-4">Loading activities…</Text>
          ) : filtered.length ? (
            <Table
              caption="Activities"
              columns={columns}
              rows={onPage}
              getRowId={(a) => a.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
            />
          ) : (
            <Text tone="muted" className="p-4">{rows.length ? 'Nothing matches.' : 'No activities yet.'}</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
      {editing ? <ActivityPanel value={editing.value} isNew={editing.isNew} onClose={() => setEditing(null)} /> : null}
    </Panel>
  );
}
