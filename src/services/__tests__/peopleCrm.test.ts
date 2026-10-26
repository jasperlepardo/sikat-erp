import { describe, it, expect, beforeEach } from 'vitest';
import { employeeName } from '../employees';
import { getApprovalRule, approverName, approvalRules } from '../approvalRules';
import { salesEmployees } from '../partnerMasters';
import { isActive, defaultContact, defaultBillTo } from '../partners';
import { isOpenTask, isOverdue } from '../activities';
import type { Employee } from '../../mocks/employees';
import type { Activity } from '../../mocks/activities';
import type { ContactPerson, Partner, PartnerAddress } from '../../mocks/partners';

// The frozen clock (src/test/setup.ts) is 2026-06-15 in the company time zone.
const TODAY = '2026-06-15';

// --- minimal fixture builders matching the real types -----------------------

type NameFields = Pick<
  Employee,
  'firstName' | 'middleName' | 'lastName' | 'nameOrder' | 'nameComma' | 'showMiddleName'
>;

const nameOf = (over: Partial<NameFields>): NameFields => ({
  firstName: 'Ana',
  middleName: 'Santos',
  lastName: 'Cruz',
  nameOrder: 'first-last',
  nameComma: false,
  showMiddleName: false,
  ...over,
});

const contact = (over: Partial<ContactPerson>): ContactPerson =>
  ({
    id: 'c1',
    firstName: 'Ana',
    middleName: '',
    lastName: 'Cruz',
    title: '',
    position: '',
    address: '',
    tel1: '',
    tel2: '',
    mobile: '',
    fax: '',
    pager: '',
    email: '',
    emailGroupId: '',
    birthCountryCode: '',
    portalPassword: '',
    remarks1: '',
    remarks2: '',
    blockMarketing: false,
    active: true,
    eDocRecipient: false,
    ...over,
  }) as ContactPerson;

const address = (over: Partial<PartnerAddress>): PartnerAddress =>
  ({
    id: 'a1',
    label: 'Main office',
    name2: '',
    name3: '',
    city: 'Makati',
    province: 'Metro Manila',
    ...over,
  } as unknown as PartnerAddress);

const partner = (over: Partial<Partner>): Partner =>
  ({
    defaultContactId: '',
    defaultBillToId: '',
    contacts: [],
    addresses: [],
    status: 'Active',
    statusFrom: '',
    statusTo: '',
    ...over,
  } as unknown as Partner);

const activity = (over: Partial<Activity>): Activity =>
  ({
    id: 'act1',
    kind: 'task',
    subject: '',
    notes: '',
    date: TODAY,
    time: '',
    dueDate: '',
    done: false,
    ownerId: '',
    partnerId: '',
    contactId: '',
    links: [],
    createdBy: '',
    createdAt: '2026-06-15T04:00:00Z',
    ...over,
  }) as Activity;

// ---------------------------------------------------------------------------

describe('employeeName', () => {
  it('first-last: "Ana Cruz" without the middle name', () => {
    expect(employeeName(nameOf({}))).toBe('Ana Cruz');
  });

  it('shows the middle name when showMiddleName is set', () => {
    expect(employeeName(nameOf({ showMiddleName: true }))).toBe('Ana Santos Cruz');
  });

  it('last-first without comma: "Cruz Ana"', () => {
    expect(employeeName(nameOf({ nameOrder: 'last-first' }))).toBe('Cruz Ana');
  });

  it('last-first with comma: "Cruz, Ana"', () => {
    expect(employeeName(nameOf({ nameOrder: 'last-first', nameComma: true }))).toBe('Cruz, Ana');
  });

  it('last-first with comma and middle name: "Cruz, Ana Santos"', () => {
    expect(
      employeeName(nameOf({ nameOrder: 'last-first', nameComma: true, showMiddleName: true })),
    ).toBe('Cruz, Ana Santos');
  });

  it('trims whitespace around each part', () => {
    expect(employeeName(nameOf({ firstName: '  Ana  ', lastName: '  Cruz ' }))).toBe('Ana Cruz');
  });

  it('drops the comma when only the last name is present (no given part)', () => {
    // nameComma only adds ", " when BOTH last and given are non-empty.
    expect(
      employeeName(nameOf({ firstName: '', lastName: 'Cruz', nameOrder: 'last-first', nameComma: true })),
    ).toBe('Cruz');
  });

  it('drops the comma when only the given name is present (no last part)', () => {
    expect(
      employeeName(nameOf({ firstName: 'Ana', lastName: '', nameOrder: 'last-first', nameComma: true })),
    ).toBe('Ana');
  });

  it('a blank middle name does not add a stray space even when shown', () => {
    expect(employeeName(nameOf({ middleName: '', showMiddleName: true }))).toBe('Ana Cruz');
  });
});

describe('getApprovalRule / approverName', () => {
  beforeEach(async () => {
    await approvalRules.reset();
    await salesEmployees.reset();
  });

  it('returns the seeded rule for a known doc type', () => {
    const rule = getApprovalRule('PO');
    expect(rule.id).toBe('PO');
    // Seeds start with no approver assigned.
    expect(rule).toHaveProperty('approverId');
  });

  it('falls back to a blank rule for an unknown doc type', () => {
    // @ts-expect-error — exercising the runtime fallback path.
    const rule = getApprovalRule('NOPE');
    expect(rule).toEqual({ id: 'NOPE', approverId: '' });
  });

  it('approverName is "" when no approver is assigned', () => {
    expect(approverName('PO')).toBe('');
  });

  it('approverName resolves to the sales employee name once a rule points at one', async () => {
    const emp = await salesEmployees.save({ name: 'Rico Bautista', active: true });
    await approvalRules.save({ id: 'PO', approverId: emp.id });
    expect(getApprovalRule('PO').approverId).toBe(emp.id);
    expect(approverName('PO')).toBe('Rico Bautista');
  });

  it('approverName is "" when the rule points at a missing employee', async () => {
    await approvalRules.save({ id: 'SO', approverId: 'emp-does-not-exist' });
    expect(approverName('SO')).toBe('');
  });
});

describe('partners.isActive', () => {
  it('is true for status Active', () => {
    expect(isActive(partner({ status: 'Active' }))).toBe(true);
  });

  it('is false for status Inactive', () => {
    expect(isActive(partner({ status: 'Inactive' }))).toBe(false);
  });

  it('Advanced with no date bounds is active', () => {
    expect(isActive(partner({ status: 'Advanced', statusFrom: '', statusTo: '' }))).toBe(true);
  });

  it('Advanced is active when today is inside [from, to]', () => {
    expect(isActive(partner({ status: 'Advanced', statusFrom: '2026-01-01', statusTo: '2026-12-31' }))).toBe(true);
  });

  it('Advanced boundaries are inclusive (from == today, to == today)', () => {
    expect(isActive(partner({ status: 'Advanced', statusFrom: TODAY, statusTo: TODAY }))).toBe(true);
  });

  it('Advanced is inactive before the From date', () => {
    expect(isActive(partner({ status: 'Advanced', statusFrom: '2026-07-01', statusTo: '' }))).toBe(false);
  });

  it('Advanced is inactive after the To date', () => {
    expect(isActive(partner({ status: 'Advanced', statusFrom: '', statusTo: '2026-06-14' }))).toBe(false);
  });

  it('honours an explicit "today" argument over the frozen clock', () => {
    const p = partner({ status: 'Advanced', statusFrom: '2026-07-01', statusTo: '2026-07-31' });
    expect(isActive(p)).toBe(false); // frozen 2026-06-15 is before the window
    expect(isActive(p, '2026-07-15')).toBe(true);
  });
});

describe('partners.defaultContact', () => {
  it('returns the contact matching defaultContactId', () => {
    const c1 = contact({ id: 'c1', firstName: 'Ana' });
    const c2 = contact({ id: 'c2', firstName: 'Ben' });
    const p = partner({ contacts: [c1, c2], defaultContactId: 'c2' });
    expect(defaultContact(p)?.id).toBe('c2');
  });

  it('falls back to the first contact when defaultContactId is unset', () => {
    const c1 = contact({ id: 'c1', firstName: 'Ana' });
    const c2 = contact({ id: 'c2', firstName: 'Ben' });
    const p = partner({ contacts: [c1, c2], defaultContactId: '' });
    expect(defaultContact(p)?.id).toBe('c1');
  });

  it('falls back to the first contact when defaultContactId points at a missing contact', () => {
    const c1 = contact({ id: 'c1' });
    const p = partner({ contacts: [c1], defaultContactId: 'gone' });
    expect(defaultContact(p)?.id).toBe('c1');
  });

  it('returns undefined when there are no contacts', () => {
    expect(defaultContact(partner({ contacts: [] }))).toBeUndefined();
  });
});

describe('partners.defaultBillTo', () => {
  it('returns the address matching defaultBillToId', () => {
    const a1 = address({ id: 'a1', city: 'Makati' });
    const a2 = address({ id: 'a2', city: 'Cebu' });
    const p = partner({ addresses: [a1, a2], defaultBillToId: 'a2' });
    expect(defaultBillTo(p)?.id).toBe('a2');
  });

  it('falls back to the first address when defaultBillToId is unset', () => {
    const a1 = address({ id: 'a1', city: 'Makati' });
    const a2 = address({ id: 'a2', city: 'Cebu' });
    const p = partner({ addresses: [a1, a2], defaultBillToId: '' });
    expect(defaultBillTo(p)?.id).toBe('a1');
  });

  it('falls back to the first address when defaultBillToId points at a missing address', () => {
    const a1 = address({ id: 'a1' });
    const p = partner({ addresses: [a1], defaultBillToId: 'gone' });
    expect(defaultBillTo(p)?.id).toBe('a1');
  });

  it('returns undefined when there are no addresses', () => {
    expect(defaultBillTo(partner({ addresses: [] }))).toBeUndefined();
  });
});

describe('activities.isOpenTask', () => {
  it('is true for an unfinished task', () => {
    expect(isOpenTask(activity({ kind: 'task', done: false }))).toBe(true);
  });

  it('is false for a finished task', () => {
    expect(isOpenTask(activity({ kind: 'task', done: true }))).toBe(false);
  });

  it('is false for non-task kinds (call, meeting, note, email)', () => {
    for (const kind of ['call', 'meeting', 'note', 'email'] as const) {
      expect(isOpenTask(activity({ kind, done: false }))).toBe(false);
    }
  });
});

describe('activities.isOverdue', () => {
  it('is true for an open task whose due date is before today', () => {
    expect(isOverdue(activity({ dueDate: '2026-06-14' }), TODAY)).toBe(true);
  });

  it('is false when due today (strictly before, so today is not overdue)', () => {
    expect(isOverdue(activity({ dueDate: TODAY }), TODAY)).toBe(false);
  });

  it('is false when due in the future', () => {
    expect(isOverdue(activity({ dueDate: '2026-06-16' }), TODAY)).toBe(false);
  });

  it('is false when the task has no due date', () => {
    expect(isOverdue(activity({ dueDate: '' }), TODAY)).toBe(false);
  });

  it('is false for a completed task even if past due', () => {
    expect(isOverdue(activity({ dueDate: '2026-06-14', done: true }), TODAY)).toBe(false);
  });

  it('is false for a non-task activity even if its date is in the past', () => {
    expect(isOverdue(activity({ kind: 'note', dueDate: '2026-06-14' }), TODAY)).toBe(false);
  });
});
