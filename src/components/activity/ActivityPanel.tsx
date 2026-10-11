import { useEffect, useState, type CSSProperties } from 'react';
import { Alert, Button, Icon, IconButton, Panel, PanelHeader, SidePanel } from '@jasperlepardo/sikat-design-system';
import { ACTIVITY_ICON, ACTIVITY_KINDS, ACTIVITY_LABEL, type Activity } from '../../mocks/activities';
import { CURRENT_USER } from '../../mocks/common';
import { contactName } from '../../mocks/partners';
import { removeActivity, saveActivity } from '../../services/activities';
import { getPartner, listPartners } from '../../services/partners';
import { useAsync } from '../../services/useAsync';
import { salesEmployeeDef } from '../../pages/settings/masterDefs';
import { bind, FieldStack, Flags, type Errors } from '../form/fields';

/** What's wrong with the activity, by field. */
export function validateActivity(a: Pick<Activity, 'subject' | 'date' | 'dueDate' | 'kind'>): Errors {
  const e: Errors = {};
  if (!a.subject.trim()) e.subject = 'Enter a subject.';
  if (!a.date) e.date = 'Pick a date.';
  if (a.kind === 'task' && a.dueDate && a.date && a.dueDate < a.date) e.dueDate = 'Due date can’t be before the start date.';
  return e;
}

/**
 * Side panel for logging or editing one activity. It saves straight away (activities aren't part
 * of the record's own Save), so the timeline it was opened from updates at once.
 */
export function ActivityPanel({
  value,
  isNew,
  partnerFixed,
  onClose,
}: {
  value: Activity;
  isNew: boolean;
  /** Opened from a document or partner: its partner is set, not picked. */
  partnerFixed?: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Activity>) => setDraft((d) => ({ ...d, ...patch }));
  const f = bind(draft, update);

  const partners = useAsync(() => (partnerFixed ? Promise.resolve([]) : listPartners()), [partnerFixed]);
  const partner = useAsync(() => (draft.partnerId ? getPartner(draft.partnerId) : Promise.resolve(undefined)), [draft.partnerId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    const e = validateActivity(draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const stamp = isNew ? { createdBy: CURRENT_USER, createdAt: new Date().toISOString() } : {};
    await saveActivity({
      ...draft,
      ...stamp,
      subject: draft.subject.trim(),
      // Only tasks carry a due date and can be open.
      dueDate: draft.kind === 'task' ? draft.dueDate : '',
      done: draft.kind === 'task' ? draft.done : true,
      id: isNew ? undefined : draft.id,
    });
    onClose();
  };

  const remove = async () => {
    setSaving(true);
    await removeActivity(draft.id);
    onClose();
  };

  const contacts = partner?.contacts ?? [];
  const problems = Object.values(errors);

  return (
    <SidePanel overlay onOverlayClick={onClose} style={{ '--sikat-side-panel-width': '560px' } as CSSProperties}>
      <PanelHeader
        icon={ACTIVITY_ICON[draft.kind]}
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={isNew ? `Log ${ACTIVITY_LABEL[draft.kind].toLowerCase()}` : ACTIVITY_LABEL[draft.kind]}
        actions={
          <>
            <IconButton intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
            {isNew ? null : (
              <Button type="button" intent="danger" variant="ghost" size="medium" shape="pill" disabled={saving} onClick={remove}>
                Delete
              </Button>
            )}
            <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" intent="primary" variant="solid" size="medium" shape="pill" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : isNew ? 'Log' : 'Save'}
            </Button>
          </>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {problems.length ? <Alert intent="danger" title="Check the activity">{problems.join(' ')}</Alert> : null}
        <FieldStack>
          {f.choose('kind', 'Type', ACTIVITY_KINDS.map((k) => ({ value: k, label: ACTIVITY_LABEL[k] })), { required: true })}
          {f.text('subject', 'Subject', { required: true, error: errors.subject, placeholder: 'What it’s about' })}
          {f.date('date', draft.kind === 'task' ? 'Start date' : 'Date', { required: true, error: errors.date })}
          {draft.kind === 'task' ? null : f.text('time', 'Time', { type: 'time' })}
          {draft.kind === 'task' ? f.date('dueDate', 'Due date', { error: errors.dueDate }) : null}
          {f.master('ownerId', 'Owner', salesEmployeeDef, { clearable: true })}
          {partnerFixed
            ? null
            : f.lookup('partnerId', 'Business partner', (partners ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), {
                clearable: true,
                placeholder: 'None',
              })}
          {f.choose('contactId', 'Contact person', contacts.map((c) => ({ value: c.id, label: contactName(c) })), {
            clearable: true,
            placeholder: draft.partnerId ? 'None' : 'Pick a partner first',
            disabled: !draft.partnerId,
          })}
          {f.area('notes', 'Notes', { rows: 5 })}
        </FieldStack>
        {draft.kind === 'task' ? <Flags>{f.check('done', 'Done')}</Flags> : null}
      </Panel.Body>
    </SidePanel>
  );
}
