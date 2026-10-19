import { employeeId } from './masters';

/**
 * CRM activities: calls, meetings, tasks, notes and emails logged against a partner and the
 * records they're about (a quotation, a purchase order, an item). They show on each linked
 * record's Activity tab, on the partner's, and in CRM › Activities.
 */

export const ACTIVITY_KINDS = ['call', 'meeting', 'task', 'note', 'email'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Records an activity can be linked to: an item, a partner, or a sales or purchasing document. */
export type ActivityTargetKind =
  | 'ITEM'
  | 'BP'
  | 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'APRI' | 'PAY' | 'GRET' | 'APCM' | 'DPR' | 'PBA' | 'LC' | 'RI'
  | 'QT' | 'SO' | 'DN' | 'ARINV' | 'RCV' | 'ARCM' | 'SRT' | 'BA';

/** One record the activity shows on. */
export interface ActivityLink {
  kind: ActivityTargetKind;
  id: string;
}

export interface Activity {
  id: string;
  kind: ActivityKind;
  subject: string;
  notes: string;
  /** When it happened, or starts (yyyy-mm-dd). */
  date: string;
  /** '' = no time. */
  time: string;
  /** Tasks: when it's due; '' = none. */
  dueDate: string;
  /** Tasks: finished. Other kinds are done once logged. */
  done: boolean;
  /** Employee id. */
  ownerId: string;
  /** '' = none. The activity also shows on this partner. */
  partnerId: string;
  /** One of the partner's contact persons; '' = none. */
  contactId: string;
  /** Records it shows on besides the partner: documents, items. */
  links: ActivityLink[];
  createdBy: string;
  /** ISO timestamp. */
  createdAt: string;
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = { call: 'Call', meeting: 'Meeting', task: 'Task', note: 'Note', email: 'Email' };
export const ACTIVITY_ICON: Record<ActivityKind, string> = { call: 'call', meeting: 'groups', task: 'task_alt', note: 'sticky_note_2', email: 'mail' };

const BLANK: Omit<Activity, 'id' | 'kind' | 'subject' | 'date' | 'ownerId'> = {
  notes: '',
  time: '',
  dueDate: '',
  done: true,
  partnerId: '',
  contactId: '',
  links: [],
  createdBy: '',
  createdAt: '',
};

let n = 0;
type SeedInput = Pick<Activity, 'kind' | 'subject' | 'date'> & { owner: Parameters<typeof employeeId>[0] } & Partial<Omit<Activity, 'id' | 'ownerId'>>;
const act = ({ owner, ...a }: SeedInput): Activity => {
  const ownerId = employeeId(owner);
  return { ...BLANK, ...a, id: `act-${String(++n).padStart(3, '0')}`, ownerId, createdBy: a.createdBy ?? owner, createdAt: a.createdAt ?? `${a.date}T${a.time || '09:00'}:00+08:00` };
};

/** Built on first use, like the other seeds. Dates run to the as-of day, 9 Oct 2026. */
export const seedActivities = (): Activity[] => {
  n = 0;
  return [
    // Clarkfield's Q3 laptop refresh: quotation → order, delivered and paid.
    act({ kind: 'call', subject: 'Q3 refresh: device count and specs', date: '2026-07-22', time: '10:30', owner: 'Ben Salazar', partnerId: 'bp-004', contactId: 'bp-004-c1',
      notes: 'Anne confirmed 40 seats for the Clark office. Wants Pro models with AppleCare for Enterprise; asked for a quote by Friday.' }),
    act({ kind: 'email', subject: 'Sent quotation and AppleCare terms', date: '2026-07-25', time: '16:10', owner: 'Ben Salazar', partnerId: 'bp-004', contactId: 'bp-004-c1', links: [{ kind: 'QT', id: 'qt-001' }] }),
    act({ kind: 'task', subject: 'Follow up on quotation approval', date: '2026-07-28', dueDate: '2026-08-04', done: true, owner: 'Ben Salazar', partnerId: 'bp-004', contactId: 'bp-004-c1', links: [{ kind: 'QT', id: 'qt-001' }],
      notes: 'Approved 5 Aug; PO from Clarkfield received the next day.' }),
    act({ kind: 'meeting', subject: 'Delivery and asset-tagging walkthrough', date: '2026-08-10', time: '14:00', owner: 'Ben Salazar', partnerId: 'bp-004', contactId: 'bp-004-c1', links: [{ kind: 'SO', id: 'so-c01' }],
      notes: 'Units to be delivered in two drops; IT tags serials on receipt.' }),

    // Bayanihan Savings Bank: open order this month.
    act({ kind: 'call', subject: 'Branch rollout schedule', date: '2026-09-08', time: '11:00', owner: 'Carla Uy', partnerId: 'bp-003', contactId: 'bp-003-c1', links: [{ kind: 'QT', id: 'qt-004' }],
      notes: 'Miguel wants the units staged per branch. Needs the BIR 2307 for the withholding on each invoice.' }),
    act({ kind: 'task', subject: 'Confirm delivery dates for remaining branches', date: '2026-09-23', dueDate: '2026-10-02', done: false, owner: 'Carla Uy', partnerId: 'bp-003', contactId: 'bp-003-c1', links: [{ kind: 'SO', id: 'so-001' }] }),
    act({ kind: 'note', subject: 'Bank requires delivery receipts signed by branch head', date: '2026-09-24', owner: 'Carla Uy', partnerId: 'bp-003', links: [{ kind: 'SO', id: 'so-001' }] }),

    // ASEAN Regional Health Institute and Subic Bay Marine: newer orders.
    act({ kind: 'meeting', subject: 'Kick-off: research tablets', date: '2026-09-15', time: '09:30', owner: 'Ben Salazar', partnerId: 'bp-041', contactId: 'bp-041-c1', links: [{ kind: 'QT', id: 'qt-005' }] }),
    act({ kind: 'task', subject: 'Send zero-rating certificate request', date: '2026-09-25', dueDate: '2026-10-12', done: false, owner: 'Ben Salazar', partnerId: 'bp-041', contactId: 'bp-041-c1', links: [{ kind: 'SO', id: 'so-c05' }],
      notes: 'Institute is VAT-exempt under its host agreement; need their certificate on file before invoicing.' }),
    act({ kind: 'call', subject: 'Vessel crew devices: delivery to Subic', date: '2026-10-06', time: '15:00', owner: 'Dino Pascual', partnerId: 'bp-040', contactId: 'bp-040-c1', links: [{ kind: 'SO', id: 'so-c06' }] }),

    // Open quotations.
    act({ kind: 'task', subject: 'Chase cooperative board approval', date: '2026-08-05', dueDate: '2026-08-31', done: false, owner: 'Andrea Ramos', partnerId: 'bp-007', contactId: 'bp-007-c1', links: [{ kind: 'QT', id: 'qt-008' }],
      notes: 'Teresita says the board meets monthly; quote may need a revised validity date.' }),
    act({ kind: 'call', subject: 'Quotation questions: bulk discount', date: '2026-10-05', time: '13:15', owner: 'Andrea Ramos', partnerId: 'bp-002', links: [{ kind: 'QT', id: 'qt-007' }] }),

    // Purchasing: Luzon iDistribution, Techzone, Apple South Asia.
    act({ kind: 'call', subject: 'Allocation for the iPhone 18 launch', date: '2026-09-17', time: '10:00', owner: 'Jasper L.', partnerId: 'bp-016', contactId: 'bp-016-c1', links: [{ kind: 'RFQ', id: 'rfq-001' }, { kind: 'ITEM', id: 'apl-fam-002' }],
      notes: 'Trade desk can commit 60% of the requested Pro units for launch week; balance two weeks after.' }),
    act({ kind: 'task', subject: 'Compare RFQ responses before ordering', date: '2026-09-29', dueDate: '2026-10-07', done: false, owner: 'Jasper L.', partnerId: 'bp-016', links: [{ kind: 'RFQ', id: 'rfq-004' }] }),
    act({ kind: 'email', subject: 'Price confirmation on cases and chargers', date: '2026-09-26', time: '09:45', owner: 'Jasper L.', partnerId: 'bp-013', contactId: 'bp-013-c1', links: [{ kind: 'RFQ', id: 'rfq-002' }, { kind: 'PO', id: 'po-045' }] }),
    act({ kind: 'call', subject: 'Confirm PO and ship date', date: '2026-10-02', time: '11:30', owner: 'Jasper L.', partnerId: 'bp-013', contactId: 'bp-013-c1', links: [{ kind: 'PO', id: 'po-045' }] }),
    act({ kind: 'note', subject: 'Import shipment booked; customs broker notified', date: '2026-10-01', owner: 'Dino Pascual', partnerId: 'bp-017', links: [{ kind: 'PO', id: 'po-039' }] }),
    act({ kind: 'task', subject: 'Get vendor confirmation on PO', date: '2026-09-25', dueDate: '2026-09-30', done: false, owner: 'Jasper L.', partnerId: 'bp-016', contactId: 'bp-016-c1', links: [{ kind: 'PO', id: 'po-003' }] }),
    act({ kind: 'email', subject: 'Requested updated AWS invoice breakdown', date: '2026-10-02', owner: 'Andrea Ramos', partnerId: 'bp-015', links: [{ kind: 'RFQ', id: 'rfq-005' }] }),

    // Items.
    act({ kind: 'meeting', subject: 'Launch-day allocation across stores', date: '2026-09-12', time: '16:00', owner: 'Dino Pascual', links: [{ kind: 'ITEM', id: 'apl-fam-002' }, { kind: 'ITEM', id: 'apl-fam-001' }],
      notes: 'Pasig holds 30% for corporate orders; the rest split by last quarter’s store sales.' }),
    act({ kind: 'note', subject: 'Display units: rotate every 90 days', date: '2026-06-03', owner: 'Dino Pascual', links: [{ kind: 'ITEM', id: 'apl-fam-001' }] }),
  ];
};
