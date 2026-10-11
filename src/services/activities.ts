import { seedActivities, type Activity, type ActivityTargetKind } from '../mocks/activities';
import { createCollection } from './store';

/** CRM activities. Not audited: an activity is itself the record of what happened. */
export const activities = createCollection<Activity>('sikat-erp:activities', seedActivities, 'act');

/** Whether the activity shows on this record: the partner it's for, or a record it's linked to. */
export const isLinkedTo = (a: Activity, kind: ActivityTargetKind, ids: string[]) =>
  kind === 'BP' ? ids.includes(a.partnerId) : a.links.some((l) => l.kind === kind && ids.includes(l.id));

/** A task still to do. */
export const isOpenTask = (a: Activity) => a.kind === 'task' && !a.done;

/** An open task past its due date. */
export const isOverdue = (a: Activity, today: string) => isOpenTask(a) && !!a.dueDate && a.dueDate < today;

export const saveActivity = (input: Omit<Activity, 'id'> & { id?: string }) => activities.save(input);
export const removeActivity = (id: string) => activities.remove(id);
