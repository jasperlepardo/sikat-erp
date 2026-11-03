/**
 * A/P reserve invoices: the billing-before-receipt journal (stock to GR/IR clearing, services to
 * expense), and the lifecycle — add, receipts fulfil it, cancel, recall, remarks.
 */
import { describe, expect, it } from 'vitest';
import { SEED_AP_RESERVE_INVOICES, type ApReserveInvoice } from '../../mocks/apReserveInvoices';
import { SEED_ITEM_GROUPS } from '../../mocks/itemMasters';
import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, rateFrom } from '../../mocks/taxes';
import { GRNI_ACCOUNT } from '../../mocks/goodsReceipts';
import type { TaxMasterData } from '../taxDetermination';
import {
  addApReserveInvoice, apRiNumber, apRiTotals, apriJournal, applyReceivedToApri, cancelApReserveInvoice, getApReserveInvoice,
  listApReserveInvoices, recallApReserveInvoice, saveApRiDraft, saveApRiRemarks,
} from '../apReserveInvoices';

const items = mergedItems(SEED_ITEMS);
const codes = SEED_TAX_CODES;
const tax: TaxMasterData = { company: SEED_COMPANY_TAX[0], codes, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS };
const vendor = SEED_PARTNERS.find((p) => p.id === 'bp-017');
const open = SEED_AP_RESERVE_INVOICES.find((r) => r.id === 'apri-002')!; // 3 imported stock lines (IMVAT) + 1 service line (XIMP)
const ctx = { items, groups: SEED_ITEM_GROUPS, codes, vendor, tax };

const sum = (lines: { debit: number; credit: number }[], k: 'debit' | 'credit') => Math.round(lines.reduce((n, l) => n + l[k], 0) * 100) / 100;
const net = (inv: Pick<ApReserveInvoice, 'lines'>, pick: (itemId: string) => boolean) =>
  inv.lines.filter((l) => pick(l.itemId)).reduce((n, l) => n + l.unitPrice * l.quantity * (1 - l.discountPct / 100), 0);
const isStock = (id: string) => !!items.find((i) => i.id === id)?.inventoryItem;

describe('A/P reserve invoice journal', () => {
  it('parks stock in GR/IR clearing, expenses services, takes no VAT on reverse-charge imports, and balances', () => {
    const j = apriJournal(open, 1, ctx);
    expect(sum(j, 'debit')).toBe(sum(j, 'credit'));
    expect(j.find((l) => l.account === GRNI_ACCOUNT)?.debit).toBeCloseTo(net(open, isStock), 2);
    expect(j.some((l) => l.account === '1420')).toBe(false); // IMVAT is paid to Customs, not the vendor
    expect(j.find((l) => l.account === open.controlAccount)?.credit).toBeGreaterThan(0);
  });

  it('claims input VAT on a regular line, skips unknown items, converts at the rate, and defaults the control account', () => {
    const stock = open.lines[0];
    const inv = {
      ...open,
      controlAccount: '',
      discountPct: 10,
      lines: [{ ...stock, taxCode: 'IVAT', quantity: 1, unitPrice: 1000, discountPct: 0 }, { ...stock, id: 'x', itemId: 'no-such-item' }],
    };
    const j = apriJournal(inv, 2, ctx);
    expect(j.find((l) => l.account === GRNI_ACCOUNT)?.debit).toBe(1800); // 1,000 × 90% × 2
    expect(j.find((l) => l.account === '1410')?.debit).toBe(216);
    expect(j.find((l) => l.account === '2010')?.credit).toBe(sum(j, 'debit'));
  });

  it('has no lines when nothing is billed', () => {
    expect(apriJournal({ ...open, lines: [] }, 1, ctx)).toEqual([]);
  });
});

describe('A/P reserve invoice numbers and totals', () => {
  it('numbers from its series and totals like a purchase order', () => {
    expect(apRiNumber(open)).toBe('APRI-2026-0002');
    const t = apRiTotals(open, rateFrom(codes, open.postingDate));
    expect(t.beforeDiscount).toBeCloseTo(net(open, () => true), 2);
  });
});

describe('A/P reserve invoice lifecycle', () => {
  it('lists the seed and finds by id or number', async () => {
    expect((await listApReserveInvoices()).length).toBeGreaterThanOrEqual(2);
    expect((await getApReserveInvoice('apri-002'))?.id).toBe('apri-002');
    expect((await getApReserveInvoice('APRI-2026-0001'))?.id).toBe('apri-001');
    expect(await getApReserveInvoice('nope')).toBeNull();
  });

  it('adds an approved invoice open with withholding stamped, and an unapproved one Not Confirmed', async () => {
    const { id: _id, ...input } = open;
    const draft = await saveApRiDraft(input);
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);

    const added = await addApReserveInvoice({ ...input, docNum: 0, approved: true });
    expect(added.status).toBe('Open');
    expect(added.docNum).toBeGreaterThan(2);
    expect(Array.isArray(added.withholdingSummary)).toBe(true);

    const pending = await addApReserveInvoice({ ...input, docNum: 0, approved: false });
    expect(pending.status).toBe('Not Confirmed');
    expect(pending.docNum).toBe(added.docNum + 1);

    const recalled = await recallApReserveInvoice(pending);
    expect(recalled.status).toBe('Draft');
    await expect(recallApReserveInvoice(added)).rejects.toThrow('Only Not Confirmed');
  });

  it('closes when every line is received and stays open on a partial receipt', async () => {
    const inv = (await getApReserveInvoice('apri-002'))!;
    const [a, b] = inv.lines;
    await applyReceivedToApri([{ apriId: inv.id, apriLineId: a.id, quantity: a.quantity }, { apriId: 'gone', apriLineId: 'x', quantity: 1 }], 1);
    expect((await getApReserveInvoice(inv.id))?.status).toBe('Open');

    await applyReceivedToApri(inv.lines.slice(1).map((l) => ({ apriId: inv.id, apriLineId: l.id, quantity: l.quantity })), 1);
    const closed = (await getApReserveInvoice(inv.id))!;
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBe('2026-06-15');

    // A cancelled receipt takes the quantity back; it never goes below zero.
    await applyReceivedToApri([{ apriId: inv.id, apriLineId: b.id, quantity: b.quantity * 3 }], -1);
    expect((await getApReserveInvoice(inv.id))?.lines.find((l) => l.id === b.id)?.receivedQty).toBe(0);
  });

  it('leaves a cancelled invoice cancelled when receipts move', async () => {
    const inv = (await getApReserveInvoice('apri-002'))!;
    await saveApRiRemarks(inv, { remarks: inv.remarks, paymentBlock: inv.paymentBlock, paymentOrderRun: inv.paymentOrderRun });
    const cancelled = await cancelApReserveInvoice({ ...inv, status: 'Open' });
    expect(cancelled.status).toBe('Cancelled');
    await applyReceivedToApri(inv.lines.map((l) => ({ apriId: inv.id, apriLineId: l.id, quantity: l.quantity })), 1);
    expect((await getApReserveInvoice(inv.id))?.status).toBe('Cancelled');
    await expect(cancelApReserveInvoice(cancelled)).rejects.toThrow('Only open');
  });

  it('saves remarks on the stored invoice and refuses one that no longer exists', async () => {
    const inv = (await getApReserveInvoice('apri-001'))!;
    const saved = await saveApRiRemarks(inv, { remarks: 'Checked', paymentBlock: true, paymentOrderRun: false });
    expect(saved.remarks).toBe('Checked');
    expect(saved.paymentBlock).toBe(true);
    await expect(saveApRiRemarks({ ...inv, id: 'gone' }, { remarks: '', paymentBlock: false, paymentOrderRun: false })).rejects.toThrow('no longer exists');
  });
});
