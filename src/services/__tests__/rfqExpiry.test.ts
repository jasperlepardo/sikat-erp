import { beforeEach, describe, expect, it } from 'vitest';

import { addRfq, expireRfqs, getRfq, rfqStatusOn } from '../rfqs';
import { blankRfq } from '../../mocks/rfqs';
import { addDays, todayISO } from '../dates';

// An Open purchase quotation past its valid-until date is Expired; moving the date on reopens it.

const today = todayISO();
const base = (validUntil: string) => ({ ...blankRfq('emp-buyer'), vendorId: 'bp-x', vendorName: 'X', validUntil, approved: true });

describe('purchase quotation expiry', () => {
  beforeEach(() => localStorage.clear());

  it('rfqStatusOn: Open past its date is Expired; Expired with a current date is Open', () => {
    expect(rfqStatusOn({ status: 'Open', validUntil: '2026-01-01' }, '2026-01-02')).toBe('Expired');
    expect(rfqStatusOn({ status: 'Open', validUntil: '2026-01-02' }, '2026-01-02')).toBe('Open');
    expect(rfqStatusOn({ status: 'Open', validUntil: '' }, '2026-01-02')).toBe('Open');
    expect(rfqStatusOn({ status: 'Expired', validUntil: '2026-01-05' }, '2026-01-02')).toBe('Open');
    expect(rfqStatusOn({ status: 'Expired', validUntil: '2026-01-01' }, '2026-01-02')).toBe('Expired');
    expect(rfqStatusOn({ status: 'Closed', validUntil: '2026-01-01' }, '2026-01-02')).toBe('Closed');
  });

  it('the expiry run turns lapsed Open quotes Expired, and reads see it', async () => {
    const q = await addRfq(base(addDays(today, 5)));
    expect(q.status).toBe('Open');
    await expireRfqs(addDays(today, 6));
    expect((await getRfq(q.id))!.status).toBe('Expired');
  });

  it('adding a quote already past its date makes it Expired', async () => {
    expect((await addRfq(base(addDays(today, -1)))).status).toBe('Expired');
  });

  it('saving with a later date reopens it and keeps its number', async () => {
    const expired = await addRfq(base(addDays(today, -1)));
    const reopened = await addRfq({ ...expired, validUntil: addDays(today, 30) });
    expect(reopened.status).toBe('Open');
    expect(reopened.docNum).toBe(expired.docNum);
  });
});
