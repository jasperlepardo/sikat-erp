import { employeeId } from './masters';

/**
 * CRM activities: calls, meetings, tasks, notes and emails logged against a partner and the
 * records they're about (a quotation, a purchase order, an item). They show on each linked
 * record's Activity tab, on the partner's, and in CRM › Activities.
 */

export const ACTIVITY_KINDS = ['call', 'meeting', 'task', 'note', 'email'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Records an activity can be linked to: an item, a partner, an employee, or a sales or purchasing document. */
export type ActivityTargetKind =
  | 'ITEM'
  | 'BP'
  | 'EMP'
  | 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'APRI' | 'PAY' | 'GRET' | 'GRR' | 'APCM' | 'DPR' | 'APDPI' | 'PBA' | 'LC' | 'RI'
  | 'QT' | 'SO' | 'DN' | 'ARINV' | 'ARDI' | 'RCV' | 'ARCM' | 'SRT' | 'BA';

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

    act({ kind: 'task', subject: 'File withholding VAT remittance for Sep AWS invoice', date: '2026-10-08', dueDate: '2026-10-20', done: false, owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'BIR Form 1600-VT due by the 20th. Sep invoice was USD 4,218.50; apply the BSP rate from the invoice date for the PHP conversion.' }),

    // Amazon Web Services — year-round account management.
    act({ kind: 'call', subject: 'AWS account review: cost optimization for Q1', date: '2026-01-15', time: '10:00', owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'Reviewed Reserved Instance vs. On-Demand spend for the RDS cluster. AWS TAM suggested Savings Plans for the EC2 layer; will model the expected savings before committing.' }),
    act({ kind: 'task', subject: 'Clarify Feb invoice spike — data transfer charges', date: '2026-02-18', dueDate: '2026-02-25', done: true, owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'Resolved — the spike came from holiday season backup jobs running into February. Documented for next year\'s budgeting cycle.' }),
    act({ kind: 'email', subject: 'Submitted 1-year Reserved Instance commitment for RDS', date: '2026-04-10', time: '14:30', owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'Locked in 1-year RI for the us-east-1 RDS instances. Projected 28% savings vs. On-Demand. Billing team confirmed the commitment; first adjusted invoice due in May.' }),
    act({ kind: 'meeting', subject: 'Mid-year cloud cost review with AWS TAM', date: '2026-07-08', time: '15:00', owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'TAM walked through the Cost Explorer report — spend tracking 8% under budget YTD due to the RI. BIR documentation for the reverse-charge VAT and withholding treatment confirmed; TAM sent a letter for our tax records.' }),
    act({ kind: 'task', subject: 'Reconcile AWS spend vs. budget for Q3', date: '2026-09-30', dueDate: '2026-10-05', done: true, owner: 'Andrea Ramos', partnerId: 'bp-015', contactId: 'bp-015-c1',
      notes: 'Q3 actual: PHP 631,400 (vs. PHP 660,000 budget). RI savings offset the Jul storage spike. Posted to cost center IT-OPS.' }),

    // Apple South Asia — iPhone 18 launch cycle.
    act({ kind: 'meeting', subject: 'iPhone 18 launch allocation confirmed', date: '2026-08-25', time: '09:00', owner: 'Jasper L.', partnerId: 'bp-017', contactId: 'bp-017-c1',
      notes: 'Channel Ops confirmed 150 Pro units and 80 standard for the launch window across Natural Titanium, Black Titanium, and Desert. Delivery from Singapore Oct 15–18. Import documentation to go through our customs broker.' }),
    act({ kind: 'task', subject: 'Finalize and send iPhone 18 launch PO to Apple', date: '2026-09-05', dueDate: '2026-09-12', done: true, owner: 'Jasper L.', partnerId: 'bp-017', contactId: 'bp-017-c1',
      notes: 'PO sent and acknowledged. L/C opened with BDO. Customs broker briefed on the shipment timeline and BoC import VAT settlement.' }),

    // Techzone Accessories — accessory launch window.
    act({ kind: 'call', subject: 'Launch-window pricing on iPhone 18 accessories', date: '2026-08-20', time: '10:30', owner: 'Jasper L.', partnerId: 'bp-013', contactId: 'bp-013-c1',
      notes: 'Janine confirmed launch pricing holds through end of September; standard MSRP from Oct 1. Final SKU list (cases, MagSafe chargers, screen protectors) to be sent by Sep 1 for the RFQ.' }),

    // OpenAI — SaaS subscription management.
    act({ kind: 'note', subject: 'ChatGPT Team renewed: 8 seats confirmed', date: '2026-09-15', owner: 'Andrea Ramos', partnerId: 'bp-018',
      notes: '5 seats for store staff (Pasig + Muntinlupa), 3 for the marketing team. Billed monthly to the corporate Amex. Same withholding treatment as AWS — 25% final tax on digital services.' }),
    act({ kind: 'task', subject: 'Issue PO for Q4 ChatGPT Team subscription', date: '2026-10-03', dueDate: '2026-10-10', done: false, owner: 'Andrea Ramos', partnerId: 'bp-018',
      notes: 'Finance requires a PO for the audit trail. USD 400/month x 3 months; use the BSP rate on the PO date.' }),

    // Items.
    act({ kind: 'meeting', subject: 'Launch-day allocation across stores', date: '2026-09-12', time: '16:00', owner: 'Dino Pascual', links: [{ kind: 'ITEM', id: 'apl-fam-002' }, { kind: 'ITEM', id: 'apl-fam-001' }],
      notes: 'Pasig holds 30% for corporate orders; the rest split by last quarter’s store sales.' }),
    act({ kind: 'note', subject: 'Display units: rotate every 90 days', date: '2026-06-03', owner: 'Dino Pascual', links: [{ kind: 'ITEM', id: 'apl-fam-001' }] }),
  ];
};
