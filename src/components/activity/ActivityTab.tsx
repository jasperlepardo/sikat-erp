import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge, Button, Card, Checkbox, Icon, Link, Tabs, Text } from '@jasperlepardo/sikat-design-system';
import { ACTIVITY_ICON, ACTIVITY_KINDS, ACTIVITY_LABEL, type Activity, type ActivityKind, type ActivityLink } from '../../mocks/activities';
import { CURRENT_USER_ID } from '../../mocks/common';
import { activities, isOpenTask, isOverdue, saveActivity } from '../../services/activities';
import { formatDate, todayISO } from '../../services/dates';
import { nameIn, salesEmployees } from '../../services/partnerMasters';
import { auditLog } from '../../services/store';
import { useAsync } from '../../services/useAsync';
import { useCollection } from '../form/MasterLookup';
import { MoreMenu } from '../form/MoreMenu';
import { ActivityPanel } from './ActivityPanel';
import { activityEntries, auditEntries, sortFeed, systemEntries, type FeedEntry, type FeedTarget } from './feed';

type Filter = 'all' | 'activities' | 'system' | 'open';

const PAGE = 50;

const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const monthOf = (at: string) => MONTH.format(new Date(`${at.slice(0, 7)}-01T00:00:00Z`));

/** "25 Sep 2026 · 10:30" */
const whenText = (at: string) => [formatDate(at.slice(0, 10)), at.slice(11, 16)].filter(Boolean).join(' · ');

/** A fresh activity for this record: today, owned by the user, linked to the record and its partner. */
export function blankActivity(kind: ActivityKind, target: FeedTarget | undefined, partnerId = ''): Activity {
  const links: ActivityLink[] = target && target.kind !== 'BP' ? [{ kind: target.kind, id: target.id }] : [];
  return {
    id: '',
    kind,
    subject: '',
    notes: '',
    date: todayISO(),
    time: '',
    dueDate: '',
    done: kind !== 'task',
    ownerId: CURRENT_USER_ID,
    partnerId: target?.kind === 'BP' ? target.id : partnerId,
    contactId: '',
    links,
    createdBy: '',
    createdAt: '',
  };
}

/** "Log ▾": a menu of the kinds of activity. */
export function LogMenu({ onPick }: { onPick: (kind: ActivityKind) => void }) {
  return (
    <MoreMenu
      label="Log activity"
      button={{ intent: 'primary', size: 'small' }}
      items={ACTIVITY_KINDS.map((k) => ({ label: ACTIVITY_LABEL[k], icon: ACTIVITY_ICON[k], onSelect: () => onPick(k) }))}
    />
  );
}

/**
 * A record's Activity tab: one timeline of what happened to it. The documents it's part of come
 * first-hand from the document chain (quotation → order → delivery → invoice → payment, or
 * request → order → receipt → bill → payment); changes saved in the app come from the audit log;
 * calls, meetings, tasks, notes and emails are logged here.
 */
export function ActivityTab({ target, partnerId = '' }: { target: FeedTarget; partnerId?: string }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<{ value: Activity; isNew: boolean } | null>(null);

  const idsKey = (target.ids ?? []).join(',');
  const system = useAsync(() => systemEntries(target), [target.kind, target.id, idsKey]);
  const log = useCollection(auditLog);
  const acts = useCollection(activities);
  const employees = useCollection(salesEmployees);

  const today = todayISO();
  const entries = useMemo(() => {
    const owner = (id: string) => (employees ? nameIn(salesEmployees, id) : '');
    return sortFeed([...(system ?? []), ...auditEntries(target, log ?? []), ...activityEntries(target, acts ?? [], owner)]);
    // `target` is rebuilt each render; its parts are the real dependencies.
  },[system, log, acts, employees, target.kind, target.id, idsKey]);

  const counts = {
    all: entries.length,
    activities: entries.filter((e) => e.source === 'activity').length,
    system: entries.filter((e) => e.source === 'system').length,
    open: entries.filter((e) => e.activity && isOpenTask(e.activity)).length,
  };
  const visible = entries.filter((e) =>
    filter === 'all' ? true : filter === 'activities' ? e.source === 'activity' : filter === 'system' ? e.source === 'system' : !!e.activity && isOpenTask(e.activity),
  );
  const page = visible.slice(0, shown);
  const loading = !system || !acts;

  const toggleDone = (a: Activity) => void saveActivity({ ...a, done: !a.done });

  return (
    <div className="flex flex-col gap-2">
      <Card>
        <Card.Header icon={<Icon size={24}>history</Icon>} actions={<LogMenu onPick={(k) => setEditing({ value: blankActivity(k, target, partnerId), isNew: true })} />}>
          Activity
        </Card.Header>
        <Card.Content>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setShown(PAGE);
            }}
            items={[
              { value: 'all', label: 'All', badge: String(counts.all) },
              { value: 'activities', label: 'Activities', badge: String(counts.activities) },
              { value: 'system', label: 'Documents & changes', badge: String(counts.system) },
              { value: 'open', label: 'Open tasks', badge: String(counts.open) },
            ]}
          />
          {loading ? (
            <Text variant="small" tone="muted" className="p-4">Loading…</Text>
          ) : !page.length ? (
            <Text variant="small" tone="muted" className="p-4">
              {filter === 'open' ? 'No open tasks.' : filter === 'activities' ? 'No activities logged yet.' : 'No activity yet.'}
            </Text>
          ) : (
            <ol className="flex flex-col" aria-label="Activity timeline">
              {page.map((e, i) => (
                <li key={e.id} className="flex flex-col">
                  {i === 0 || monthOf(page[i - 1].at) !== monthOf(e.at) ? (
                    <Text variant="caption" tone="muted" weight="semibold" className="pt-3 pb-1">
                      {monthOf(e.at)}
                    </Text>
                  ) : null}
                  <EntryRow
                    entry={e}
                    today={today}
                    onOpen={() => (e.activity ? setEditing({ value: e.activity, isNew: false }) : e.href && navigate(e.href))}
                    onToggle={e.activity?.kind === 'task' ? () => toggleDone(e.activity!) : undefined}
                  />
                </li>
              ))}
            </ol>
          )}
          {visible.length > shown ? (
            <div>
              <Button type="button" intent="white" variant="solid" size="small" shape="pill" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more
              </Button>
            </div>
          ) : null}
        </Card.Content>
      </Card>
      {editing ? (
        <ActivityPanel value={editing.value} isNew={editing.isNew} partnerFixed={target.kind === 'BP' || !!partnerId} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function EntryRow({ entry: e, today, onOpen, onToggle }: { entry: FeedEntry; today: string; onOpen: () => void; onToggle?: () => void }) {
  const a = e.activity;
  const meta = [whenText(e.at), e.actor, a ? ACTIVITY_LABEL[a.kind] : undefined].filter(Boolean).join(' · ');
  const openable = !!a || !!e.href;
  return (
    <div className="flex items-start gap-3 border-b border-default py-2 last:border-b-0">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${a ? 'bg-primary-subtle' : 'bg-neutral-subtle'}`}>
        <Icon size={18}>{e.icon}</Icon>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {onToggle ? <Checkbox aria-label={a?.done ? 'Mark as not done' : 'Mark as done'} checked={!!a?.done} onChange={onToggle} /> : null}
          {openable ? (
            <Link
              href="#"
              onClick={(ev) => {
                ev.preventDefault();
                onOpen();
              }}
            >
              {e.title}
            </Link>
          ) : (
            <Text variant="small" weight="medium">{e.title}</Text>
          )}
          {e.status ? <Badge size="extra-small" variant="outline" intent={e.intent === 'default' ? 'default' : e.intent}>{e.status}</Badge> : null}
          {a && isOverdue(a, today) ? <Badge size="extra-small" intent="danger">Overdue</Badge> : null}
          {a && isOpenTask(a) && a.dueDate && !isOverdue(a, today) ? <Badge size="extra-small" variant="outline" intent="warning">Due {formatDate(a.dueDate)}</Badge> : null}
          {a && a.kind === 'task' && a.done ? <Badge size="extra-small" variant="outline" intent="success">Done</Badge> : null}
        </div>
        {e.detail ? (
          <Text variant="small" tone="muted" className="line-clamp-2">
            {e.detail}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {meta}
        </Text>
      </div>
    </div>
  );
}
