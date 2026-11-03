import { beforeEach, describe, expect, it } from 'vitest';

import { addQuotation, expireQuotations, getQuotation, qtStatusOn, saveQuotationRemarks } from '../quotations';
import { blankQuotation } from '../../mocks/quotations';
import { addDays, todayISO } from '../dates';

// An Open sales quotation past its valid-until date is Expired; moving the date on reopens it.

const today = todayISO();
const base = (validUntil: string) => ({ ...blankQuotation('emp-1'), customerId: 'bp-x', customerName: 'X', validUntil, approved: true });

describe('sales quotation expiry', () => {
  beforeEach(() => localStorage.clear());

  it('qtStatusOn: Open past its date is Expired; Expired with a current date is Open', () => {
    expect(qtStatusOn({ status: 'Open', validUntil: '2026-01-01' }, '2026-01-02')).toBe('Expired');
    expect(qtStatusOn({ status: 'Open', validUntil: '2026-01-02' }, '2026-01-02')).toBe('Open');
    expect(qtStatusOn({ status: 'Expired', validUntil: '2026-01-05' }, '2026-01-02')).toBe('Open');
    expect(qtStatusOn({ status: 'Cancelled', validUntil: '2026-01-01' }, '2026-01-02')).toBe('Cancelled');
  });

  it('the expiry run turns lapsed Open quotations Expired, and reads see it', async () => {
    const q = await addQuotation(base(addDays(today, 5)));
    expect(q.status).toBe('Open');
    await expireQuotations(addDays(today, 6));
    expect((await getQuotation(q.id))!.status).toBe('Expired');
  });

  it('saving an added quotation keeps a new valid-until date and reopens it', async () => {
    const expired = await addQuotation(base(addDays(today, -1)));
    expect(expired.status).toBe('Expired');
    const later = addDays(today, 30);
    const reopened = await saveQuotationRemarks(expired, { remarks: 'Re-quoted', attachments: [], documentDate: expired.documentDate, validUntil: later });
    expect(reopened).toMatchObject({ status: 'Open', validUntil: later, docNum: expired.docNum, remarks: 'Re-quoted' });
  });
});
