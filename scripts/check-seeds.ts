/**
 * Checks that the seeded year ties out: documents against each other, stock against the
 * documents, and the ledger against both. Run it after changing anything in src/mocks:
 *
 *   npx tsx scripts/check-seeds.ts
 *
 * It loads the seeds the way the app does (with an in-memory localStorage) and exits non-zero,
 * listing what's off, when a check fails.
 */
const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  },
});

const { SEED_AS_OF } = await import('../src/mocks/supplyPlan');
const { SEED_AR_INVOICES, seedNetDue } = await import('../src/mocks/arInvoices');
const { SEED_AR_CREDIT_MEMOS } = await import('../src/mocks/arCreditMemos');
const { SEED_BLANKET_AGREEMENTS } = await import('../src/mocks/blanketAgreements');
const { SEED_DELIVERIES } = await import('../src/mocks/deliveries');
const { SEED_INCOMING_PAYMENTS } = await import('../src/mocks/incomingPayments');
const { SEED_QUOTATIONS } = await import('../src/mocks/quotations');
const { SEED_SALES_ORDERS } = await import('../src/mocks/salesOrders');
const { SEED_SALES_RETURNS } = await import('../src/mocks/salesReturns');
const { SEED_PARTNERS } = await import('../src/mocks/partners');
const { SEED_ITEMS, mergedItems } = await import('../src/mocks/items');
const { SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, rateAt, vatNotPaidToVendor } = await import('../src/mocks/taxes');
const { SEED_PURCHASE_ORDERS } = await import('../src/mocks/purchaseOrders');
const { SEED_PURCHASE_REQUESTS } = await import('../src/mocks/purchaseRequests');
const { SEED_TRANSFER_REQUESTS } = await import('../src/mocks/inventoryTransferRequests');
const { SEED_TRANSFERS } = await import('../src/mocks/inventoryTransfers');
const { SEED_COUNTINGS, SEED_POSTINGS, countedQty } = await import('../src/mocks/inventoryCountings');
const { SEED_LANDED_COSTS } = await import('../src/mocks/landedCosts');
const { SEED_PURCHASE_BLANKET_AGREEMENTS } = await import('../src/mocks/purchaseBlanketAgreements');
const { SEED_BINS } = await import('../src/mocks/binLocations');
const { purchasingHistory } = await import('../src/services/purchasingHistory');
const { stockHistory } = await import('../src/services/stockHistory');
const { seededLedger } = await import('../src/services/ledgerHistory');
const { listItems } = await import('../src/services/items');
const { poTotals } = await import('../src/services/purchaseOrders');
const { poWithholding, withSeedWithholding } = await import('../src/services/withholding');

const failures: string[] = [];
const check = (name: string, problems: string[]) => {
  console.log(`${problems.length ? '✗' : '✓'} ${name}${problems.length ? ` — ${problems.length} problem(s)` : ''}`);
  for (const p of problems.slice(0, 12)) console.log(`    ${p}`);
  if (problems.length) failures.push(name);
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, tolerance = 0.05) => Math.abs(a - b) <= tolerance;
const posted = (status: string) => status !== 'Draft' && status !== 'Cancelled';

// ── Documents ────────────────────────────────────────────────────────────────
const H = purchasingHistory();
{
  const bad: string[] = [];
  for (const b of H.invoices) {
    const paid = H.payments.flatMap((p) => p.rows).filter((r) => r.docType === 'APINV' && r.invoiceId === b.id).reduce((n, r) => n + r.amount, 0);
    const credited = H.memos.flatMap((m) => m.applications).filter((a) => a.invoiceId === b.id).reduce((n, a) => n + a.amount, 0);
    if (!near(paid + credited, b.appliedAmount, 0.01)) bad.push(`${b.id}: applied ${b.appliedAmount}, paid ${r2(paid)} + credited ${r2(credited)}`);
    const drawn = (b.drawnDownPayments ?? []).reduce((n, d) => n + d.amount, 0);
    if (!near(drawn, b.downPayment, 0.01)) bad.push(`${b.id}: down payment ${b.downPayment}, drawn ${drawn}`);
  }
  for (const g of H.receipts)
    for (const l of g.lines) {
      const billed = H.invoices.flatMap((b) => b.lines).filter((x) => x.baseType === 'GRPO' && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if (billed !== l.invoicedQty) bad.push(`${g.id}/${l.id}: invoiced ${l.invoicedQty}, billed ${billed}`);
    }
  for (const g of H.receipts) {
    const full = g.lines.every((l) => l.invoicedQty + (l.returnedQty ?? 0) >= l.quantity);
    if (full !== (g.status === 'Closed')) bad.push(`${g.id}: ${g.status} but ${full ? 'fully' : 'not fully'} billed`);
  }
  for (const d of H.downPayments) {
    const paid = H.payments.flatMap((p) => p.rows).filter((r) => r.docType === 'DPR' && r.invoiceId === d.id).reduce((n, r) => n + r.amount, 0);
    const drawn = H.invoices.flatMap((b) => b.drawnDownPayments ?? []).filter((x) => x.requestId === d.id).reduce((n, x) => n + x.amount, 0);
    if (!near(paid, d.appliedAmount, 0.01) || !near(drawn, d.drawnAmount, 0.01)) bad.push(`${d.id}: paid/drawn don't match the payments and bills`);
  }
  check('Purchasing documents tie out', bad);
}
{
  // Orders vs fulfilment, purchasing side: each PO line's received qty is what its goods-receipt
  // lines count, and a line (and the order) is Closed exactly when it's fully received.
  const bad: string[] = [];
  const grLines = H.receipts.filter((g) => posted(g.status)).flatMap((g) => g.lines);
  for (const po of SEED_PURCHASE_ORDERS) {
    if (po.status === 'Cancelled') continue;
    for (const l of po.lines) {
      const received = grLines.filter((gl) => gl.baseId === po.id && gl.baseLineId === l.id).reduce((n, gl) => n + gl.quantity, 0);
      if (received !== (l.receivedQty ?? 0)) bad.push(`${po.id}/${l.id}: received ${l.receivedQty ?? 0}, goods receipts ${received}`);
      if ((l.status === 'Closed') !== ((l.receivedQty ?? 0) >= l.quantity)) bad.push(`${po.id}/${l.id}: ${l.status} with ${l.receivedQty ?? 0} of ${l.quantity} received`);
    }
    const fully = po.lines.every((l) => (l.receivedQty ?? 0) >= l.quantity);
    if (po.status === 'Closed' && !fully) bad.push(`${po.id}: Closed but not fully received`);
  }
  // Returns, purchasing side: what's returned on a receipt/bill is what the goods-return lines took
  // off it, and a goods-return line's credited qty is what the A/P credit memos copied from it.
  const retLines = H.returns.filter((r) => posted(r.status)).flatMap((r) => r.lines.map((l) => ({ ...l, docId: r.id })));
  const cmLines = H.memos.filter((m) => posted(m.status)).flatMap((m) => m.lines);
  for (const g of H.receipts)
    for (const l of g.lines) {
      const returned = retLines.filter((x) => x.baseType === 'GRPO' && x.baseId === g.id && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if ((l.returnedQty ?? 0) !== returned) bad.push(`${g.id}/${l.id}: returned ${l.returnedQty ?? 0}, goods returns ${returned}`);
    }
  for (const b of H.invoices)
    for (const l of b.lines) {
      const returned = retLines.filter((x) => x.baseType === 'APINV' && x.baseId === b.id && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if ((l.returnedQty ?? 0) !== returned) bad.push(`${b.id}/${l.id}: returned ${l.returnedQty ?? 0}, goods returns ${returned}`);
    }
  for (const r of H.returns)
    for (const l of r.lines) {
      const credited = cmLines.filter((x) => x.baseType === 'GRET' && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if ((l.creditedQty ?? 0) !== credited) bad.push(`${r.id}/${l.id}: credited ${l.creditedQty ?? 0}, A/P credit memos ${credited}`);
    }
  check('Purchase orders, receipts and returns tie out to their fulfilment', bad);
}
{
  const bad: string[] = [];
  for (const a of SEED_AR_INVOICES) {
    const paid = SEED_INCOMING_PAYMENTS.flatMap((p) => p.rows).filter((r) => r.invoiceId === a.id).reduce((n, r) => n + r.amount, 0);
    const credited = SEED_AR_CREDIT_MEMOS.flatMap((m) => m.applications).filter((x) => x.invoiceId === a.id).reduce((n, x) => n + x.amount, 0);
    if (!near(paid + credited, a.appliedAmount, 0.011)) bad.push(`${a.id}: applied ${a.appliedAmount}, paid ${r2(paid)} + credited ${r2(credited)}`);
    if ((a.appliedAmount >= seedNetDue(a) - 0.01) !== (a.status === 'Closed')) bad.push(`${a.id}: ${a.status} but applied ${a.appliedAmount} of ${seedNetDue(a)}`);
    if (a.closeDate > SEED_AS_OF) bad.push(`${a.id}: closes after the as-of day (${a.closeDate})`);
  }
  for (const d of SEED_DELIVERIES)
    for (const l of d.lines) {
      const billed = SEED_AR_INVOICES.flatMap((a) => a.lines).filter((x) => x.baseType === 'DN' && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if (billed !== l.invoicedQty) bad.push(`${d.id}: invoiced ${l.invoicedQty}, billed ${billed}`);
      if ((d.status === 'Closed') !== (l.invoicedQty >= l.quantity)) bad.push(`${d.id}: ${d.status} with ${l.invoicedQty} of ${l.quantity} billed`);
    }
  for (const so of SEED_SALES_ORDERS)
    for (const l of so.lines) {
      const delivered =
        SEED_DELIVERIES.flatMap((d) => d.lines).filter((x) => x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0) +
        SEED_AR_INVOICES.flatMap((a) => a.lines).filter((x) => x.baseType === 'SO' && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if (delivered !== l.deliveredQty) bad.push(`${so.id}/${l.id}: delivered ${l.deliveredQty}, documents ${delivered}`);
    }
  for (const b of SEED_BLANKET_AGREEMENTS)
    for (const bl of b.lines) {
      let committed = 0;
      let used = 0;
      for (const so of SEED_SALES_ORDERS)
        for (const l of so.lines)
          if (l.agreementLineId === bl.id) {
            if (so.status === 'Open' && l.status === 'Open') committed += l.quantity;
            if (l.status === 'Closed') used += l.quantity;
          }
      if (committed !== bl.cumulativeCommittedQty || used !== bl.cumulativeQty) bad.push(`${bl.id}: committed ${bl.cumulativeCommittedQty}/${committed}, used ${bl.cumulativeQty}/${used}`);
    }
  for (const q of SEED_QUOTATIONS)
    if (q.convertedToOrderId && SEED_SALES_ORDERS.find((o) => o.id === q.convertedToOrderId)?.baseQuotationId !== q.id) bad.push(`${q.id}: converted order doesn't point back`);
  for (const m of SEED_AR_CREDIT_MEMOS)
    for (const x of m.applications) if (SEED_AR_INVOICES.find((a) => a.id === x.invoiceId)?.customerId !== m.customerId) bad.push(`${m.id}: applied to another customer's invoice`);
  for (const r of SEED_SALES_RETURNS)
    for (const l of r.lines) {
      const billedBefore = SEED_AR_INVOICES.filter((a) => a.postingDate < r.postingDate).flatMap((a) => a.lines).filter((x) => x.baseLineId === l.baseLineId).reduce((n, x) => n + x.quantity, 0);
      const dl = SEED_DELIVERIES.find((d) => d.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
      if (!dl || l.quantity > dl.quantity - billedBefore) bad.push(`${r.id}: returns goods already billed`);
    }
  for (const p of SEED_INCOMING_PAYMENTS) {
    const means = p.means.transfer.amount + p.means.cash.amount + p.means.checks.reduce((n, c) => n + c.amount, 0) + p.means.cards.reduce((n, c) => n + c.amount, 0);
    const rows = p.rows.reduce((n, r) => n + r.amount, 0) + p.accountRows.reduce((n, r) => n + r.amount, 0);
    if (!near(means, rows, 0.01)) bad.push(`${p.id}: means ${r2(means)} vs rows ${r2(rows)}`);
  }
  // Returns, sales side: a sales-return line's credited qty is what the A/R credit memos copied from it took.
  for (const r of SEED_SALES_RETURNS)
    for (const l of r.lines) {
      const credited = SEED_AR_CREDIT_MEMOS.flatMap((m) => m.lines).filter((x) => x.baseType === 'SRT' && x.baseId === r.id && x.baseLineId === l.id).reduce((n, x) => n + x.quantity, 0);
      if ((l.creditedQty ?? 0) !== credited) bad.push(`${r.id}/${l.id}: credited ${l.creditedQty ?? 0}, A/R credit memos ${credited}`);
    }
  check('Sales documents tie out', bad);
}

// ── Stock ────────────────────────────────────────────────────────────────────
const S = stockHistory();
check('Stock never goes negative; items released during the year open at nil', S.problems);

// ── Ledger ───────────────────────────────────────────────────────────────────
const L = seededLedger();
check('Every entry balances', L.problems);
const balance = new Map<string, number>();
for (const e of L.entries) for (const l of e.lines) balance.set(l.account, (balance.get(l.account) ?? 0) + l.debit - l.credit);
const bal = (...accounts: string[]) => r2(accounts.reduce((n, a) => n + (balance.get(a) ?? 0), 0));
check('Trial balance is zero', near([...balance.values()].reduce((n, v) => n + v, 0), 0, 0.01) ? [] : [`difference ${r2([...balance.values()].reduce((n, v) => n + v, 0))}`]);
check('Nothing posts after the as-of day', L.entries.filter((e) => e.postingDate > SEED_AS_OF).map((e) => `${e.id} on ${e.postingDate}`));

// A/R: open invoices less unapplied credit.
{
  const open = SEED_AR_INVOICES.filter((a) => posted(a.status)).reduce((n, a) => n + (seedNetDue(a) - a.appliedAmount) * (a.fxRate || 1), 0);
  const credit = SEED_AR_CREDIT_MEMOS.filter((m) => posted(m.status)).reduce((n, m) => {
    const total = m.lines.reduce((k, l) => {
      const net = r2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
      return k + net + r2((net * (l.taxCode === 'OVAT' ? 12 : 0)) / 100);
    }, 0);
    return n + (total - m.appliedAmount) * (m.fxRate || 1);
  }, 0);
  check('A/R (1120) equals the open invoices less unapplied credit', near(bal('1120'), open - credit, 1) ? [] : [`ledger ${bal('1120')}, documents ${r2(open - credit)}`]);
}
// A/P: open bills, at the rate they were booked at.
{
  const items = mergedItems(SEED_ITEMS);
  const TAX = { company: SEED_COMPANY_TAX[0], codes: SEED_TAX_CODES, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS };
  const vendor = (id: string) => SEED_PARTNERS.find((p) => p.id === id);
  const rateOf = (date: string) => (code: string) => {
    const c = SEED_TAX_CODES.find((x) => x.code === code);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const reverse = (code: string) => vatNotPaidToVendor(SEED_TAX_CODES.find((x) => x.code === code));
  const net = (doc: Parameters<typeof poTotals>[0] & { postingDate: string; vendorId: string }) => {
    const total = poTotals(doc, rateOf(doc.postingDate), undefined, reverse).total;
    const wt = poWithholding(doc, vendor(doc.vendorId), items, TAX, doc.postingDate).filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0);
    return total - wt;
  };
  const open = H.invoices.filter((b) => posted(b.status)).reduce((n, b) => n + (net(b) - b.downPayment - b.appliedAmount) * (b.fxRate || 1), 0);
  const credit = H.memos.filter((m) => posted(m.status)).reduce((n, m) => n + (net(m) - m.appliedAmount) * (m.fxRate || 1), 0);
  const ledger = -bal('2010', '2015', '2020');
  check('A/P (2010, 2015, 2020) equals the open bills less unapplied credit', near(ledger, open - credit, 5) ? [] : [`ledger ${ledger}, documents ${r2(open - credit)}`]);
  // Goods received not invoiced: what's received and neither billed nor sent back, at receipt cost.
  const grni = H.receipts.filter((g) => posted(g.status)).reduce((n, g) => n + g.lines.reduce((k, l) => k + l.unitCostLc * (l.itemsPerUnit || 1) * (l.quantity - l.invoicedQty - (l.returnedQty ?? 0)), 0), 0);
  check('Goods Received Not Invoiced (2025) equals what\'s received and not billed', near(-bal('2025'), grni, 5) ? [] : [`ledger ${-bal('2025')}, documents ${r2(grni)}`]);
  const advances = H.downPayments.reduce((n, d) => n + d.paidLc - (d.drawnAmount ? d.paidLc * (d.drawnAmount / d.appliedAmount) : 0), 0);
  check('Advances to Suppliers (1150) equals the down payments paid and not drawn', near(bal('1150'), advances, 1) ? [] : [`ledger ${bal('1150')}, documents ${r2(advances)}`]);
}
// Inventory: the stock on hand at its cost. Moving-average costs round to the centavo per receipt,
// so the two drift by a little; anything past 0.01% is a real difference.
{
  const items = await listItems();
  const fifo = S.layers.filter((l) => l.qty > 0).reduce((n, l) => n + l.qty * l.unitCost, 0);
  const average = items.filter((i) => i.inventoryItem && i.valuationMethod !== 'FIFO').reduce((n, i) => n + i.warehouses.reduce((k, w) => k + w.inStock, 0) * i.itemCost, 0);
  const value = fifo + average;
  check('Inventory (1310) equals the stock on hand at cost (within 0.01%)', near(bal('1310'), value, value * 0.0001) ? [] : [`ledger ${bal('1310')}, stock ${r2(value)}`]);
}
// Cash: no account below zero on any day.
{
  const bad: string[] = [];
  for (const account of ['1011', '1012', '1013', '1015', '1016', '1017', '1018']) {
    let run = 0;
    for (const e of L.entries) {
      for (const l of e.lines) if (l.account === account) run += l.debit - l.credit;
      if (run < -0.005) {
        bad.push(`${account} goes to ${r2(run)} on ${e.postingDate} (${e.id})`);
        break;
      }
    }
  }
  check('Cash accounts never go negative', bad);
}

// ── Activities ───────────────────────────────────────────────────────────────
{
  const { seedActivities } = await import('../src/mocks/activities');
  const { SEED_SALES_EMPLOYEES } = await import('../src/mocks/partnerMasters');
  const { SEED_RFQS } = await import('../src/mocks/rfqs');
  const { SEED_PURCHASE_ORDERS } = await import('../src/mocks/purchaseOrders');
  const { SEED_PURCHASE_REQUESTS } = await import('../src/mocks/purchaseRequests');
  type Doc = { id: string; vendorId?: string; customerId?: string };
  const records: Record<string, Doc[]> = {
    ITEM: SEED_ITEMS, BP: SEED_PARTNERS, PR: SEED_PURCHASE_REQUESTS, RFQ: SEED_RFQS, PO: SEED_PURCHASE_ORDERS,
    GRPO: H.receipts, APINV: H.invoices, PAY: H.payments, GRET: H.returns, APCM: H.memos, DPR: H.downPayments,
    QT: SEED_QUOTATIONS, SO: SEED_SALES_ORDERS, DN: SEED_DELIVERIES, ARINV: SEED_AR_INVOICES, RCV: SEED_INCOMING_PAYMENTS,
    ARCM: SEED_AR_CREDIT_MEMOS, SRT: SEED_SALES_RETURNS,
  };
  const bad: string[] = [];
  for (const a of seedActivities()) {
    const partner = SEED_PARTNERS.find((p) => p.id === a.partnerId);
    if (a.partnerId && !partner) bad.push(`${a.id}: no partner ${a.partnerId}`);
    if (a.contactId && !partner?.contacts.some((c) => c.id === a.contactId)) bad.push(`${a.id}: contact ${a.contactId} isn't ${a.partnerId}'s`);
    if (!SEED_SALES_EMPLOYEES.some((e) => e.id === a.ownerId)) bad.push(`${a.id}: no employee ${a.ownerId}`);
    if (a.date > SEED_AS_OF) bad.push(`${a.id}: dated ${a.date}, after the as-of day`);
    for (const l of a.links) {
      const doc = records[l.kind]?.find((r) => r.id === l.id);
      if (!doc) bad.push(`${a.id}: no ${l.kind} ${l.id}`);
      else if (a.partnerId && (doc.vendorId ?? doc.customerId) !== undefined && (doc.vendorId ?? doc.customerId) !== a.partnerId)
        bad.push(`${a.id}: ${l.kind} ${l.id} is ${doc.vendorId ?? doc.customerId}'s, not ${a.partnerId}'s`);
    }
  }
  check('Activities link to records that exist, for the right partner', bad);
}

// ── Requests ───────────────────────────────────────────────────────────────────
{
  // Transfer requests: a line's open qty is its quantity less what posted transfers copied from it took.
  const bad: string[] = [];
  const transferred = (requestId: string, lineId: string) =>
    SEED_TRANSFERS.filter((t) => t.status === 'Posted' && t.baseRequestId === requestId).flatMap((t) => t.lines).filter((l) => l.baseLineId === lineId).reduce((n, l) => n + l.quantity, 0);
  for (const r of SEED_TRANSFER_REQUESTS)
    for (const l of r.lines) {
      const open = l.quantity - transferred(r.id, l.id);
      if (l.openQty !== open) bad.push(`${r.id}/${l.id}: open ${l.openQty}, quantity ${l.quantity} less ${l.quantity - open} transferred`);
      if (r.status === 'Closed' && l.openQty > 0) bad.push(`${r.id}/${l.id}: Closed with ${l.openQty} still open`);
    }
  // Purchase requests don't carry a back-link from the orders that drew them, so open qty is checked
  // for consistency: it stays between zero and the quantity, and a closed line has nothing open.
  for (const pr of SEED_PURCHASE_REQUESTS)
    for (const l of pr.lines) {
      if (l.openQty < 0 || l.openQty > l.quantity) bad.push(`${pr.id}/${l.id}: open ${l.openQty} outside 0..${l.quantity}`);
      if (l.status === 'Closed' && l.openQty !== 0) bad.push(`${pr.id}/${l.id}: Closed with ${l.openQty} still open`);
    }
  check("Requests' open quantities match what's been drawn", bad);
}

// ── Blanket agreements ─────────────────────────────────────────────────────────
{
  // Purchasing blanket agreements: the linked PO lines reference real agreement lines, and never
  // commit more than the planned quantity. (Seeded cumulative figures are illustrative, so they're
  // not re-derived from the POs — the sales agreements' committed/used qty are checked above.)
  const bad: string[] = [];
  const pbaById = new Map(SEED_PURCHASE_BLANKET_AGREEMENTS.map((b) => [b.id, b]));
  const pbaLineById = new Map(SEED_PURCHASE_BLANKET_AGREEMENTS.flatMap((b) => b.lines).map((l) => [l.id, l]));
  const drawn = new Map<string, number>();
  for (const po of SEED_PURCHASE_ORDERS)
    for (const l of po.lines) {
      if (l.agreementId && !pbaById.has(l.agreementId)) bad.push(`${po.id}/${l.id}: agreement ${l.agreementId} doesn't exist`);
      if (l.agreementLineId) {
        if (!pbaLineById.has(l.agreementLineId)) bad.push(`${po.id}/${l.id}: agreement line ${l.agreementLineId} doesn't exist`);
        else drawn.set(l.agreementLineId, (drawn.get(l.agreementLineId) ?? 0) + l.quantity);
      }
      if (l.agreementLineId && !l.agreementId) bad.push(`${po.id}/${l.id}: agreement line without an agreement`);
    }
  for (const [lineId, qty] of drawn) {
    const bl = pbaLineById.get(lineId)!;
    if (qty > bl.plannedQty) bad.push(`${lineId}: PO lines draw ${qty}, more than the planned ${bl.plannedQty}`);
  }
  check('Purchasing blanket agreements link to real lines within their planned quantity', bad);
}

// ── Cost batches ───────────────────────────────────────────────────────────────
{
  // FIFO cost layers: what's left in an item's layers at a warehouse equals its stock on hand there,
  // and the item's cost is the weighted average of its remaining layers.
  const bad: string[] = [];
  const items = await listItems();
  const byItem = new Map(items.map((i) => [i.id, i]));
  const layerQty = new Map<string, number>();
  const itemLayerValue = new Map<string, { qty: number; value: number }>();
  for (const l of S.layers) {
    if (l.qty <= 0) continue;
    layerQty.set(`${l.itemId}@${l.warehouse}`, (layerQty.get(`${l.itemId}@${l.warehouse}`) ?? 0) + l.qty);
    const agg = itemLayerValue.get(l.itemId) ?? { qty: 0, value: 0 };
    itemLayerValue.set(l.itemId, { qty: agg.qty + l.qty, value: agg.value + l.qty * l.unitCost });
  }
  for (const i of items) {
    if (!i.inventoryItem || i.valuationMethod !== 'FIFO') continue;
    for (const w of i.warehouses) {
      const q = layerQty.get(`${i.id}@${w.code}`) ?? 0;
      if (!near(q, w.inStock, 0.001)) bad.push(`${i.itemNo} @${w.code}: layers ${r2(q)}, stock on hand ${w.inStock}`);
    }
    const agg = itemLayerValue.get(i.id);
    if (agg && agg.qty > 0) {
      const avg = r2(agg.value / agg.qty);
      if (!near(avg, i.itemCost, 0.02)) bad.push(`${i.itemNo}: item cost ${i.itemCost}, weighted avg of layers ${avg}`);
    }
  }
  // A layer only ever sits in a warehouse the item has a row for.
  for (const l of S.layers)
    if (l.qty > 0 && !byItem.get(l.itemId)?.warehouses.some((w) => w.code === l.warehouse)) bad.push(`layer ${l.id}: ${byItem.get(l.itemId)?.itemNo} has stock in ${l.warehouse}, which it has no row for`);
  check('FIFO cost layers tie out to stock on hand and item cost', bad);
}

// ── Bins ───────────────────────────────────────────────────────────────────────
{
  // Bins don't carry their own quantities in the prototype, so "stock in bins never exceeds the
  // warehouse" reduces to: every default bin an item names is a real, active bin in that warehouse.
  const bad: string[] = [];
  const binById = new Map(SEED_BINS.map((b) => [b.id, b]));
  for (const i of SEED_ITEMS)
    for (const w of i.warehouses) {
      if (!w.defaultBinId) continue;
      const bin = binById.get(w.defaultBinId);
      if (!bin) bad.push(`${i.itemNo} @${w.code}: default bin ${w.defaultBinId} doesn't exist`);
      else if (bin.warehouse !== w.code) bad.push(`${i.itemNo} @${w.code}: default bin ${w.defaultBinId} is in ${bin.warehouse}`);
      else if (!bin.active) bad.push(`${i.itemNo} @${w.code}: default bin ${w.defaultBinId} is inactive`);
    }
  check('Item default bins are real, active bins in the right warehouse', bad);
}

// ── Transfers and counts ───────────────────────────────────────────────────────
{
  const bad: string[] = [];
  // A transfer only moves stock between two different warehouses (total quantity is conserved).
  for (const t of SEED_TRANSFERS)
    for (const l of t.lines) {
      const to = l.toWarehouse || t.toWarehouse;
      if (to === t.fromWarehouse) bad.push(`${t.id}/${l.id}: moves stock to its own warehouse ${to}`);
      if (l.quantity <= 0) bad.push(`${t.id}/${l.id}: quantity ${l.quantity}`);
    }
  // An inventory posting copied from a count carries the counted quantity of each count line.
  for (const p of SEED_POSTINGS) {
    if (!p.countingId) continue;
    const count = SEED_COUNTINGS.find((c) => c.id === p.countingId);
    if (!count) {
      bad.push(`${p.id}: count ${p.countingId} doesn't exist`);
      continue;
    }
    if (count.postingId !== p.id) bad.push(`${p.id}: count ${count.id} points at posting ${count.postingId || '(none)'}`);
    for (const pl of p.lines) {
      if (!pl.baseLineId) continue;
      const cl = count.lines.find((c) => c.id === pl.baseLineId);
      if (!cl) bad.push(`${p.id}/${pl.id}: count line ${pl.baseLineId} doesn't exist`);
      else if (countedQty(cl) !== countedQty(pl)) bad.push(`${p.id}/${pl.id}: posts ${countedQty(pl)}, counted ${countedQty(cl)}`);
    }
  }
  // A closed count has a posting; a count's posting (if any) exists.
  for (const c of SEED_COUNTINGS) {
    if (c.status === 'Closed' && !c.postingId) bad.push(`${c.id}: Closed without a posting`);
    if (c.postingId && !SEED_POSTINGS.some((p) => p.id === c.postingId)) bad.push(`${c.id}: posting ${c.postingId} doesn't exist`);
  }
  check('Transfers conserve stock; count postings carry the counted quantity', bad);
}

// ── Landed costs ───────────────────────────────────────────────────────────────
{
  // A landed cost's per-line allocations add up to the total of its cost rows (to the centavo,
  // allowing a penny of rounding per line).
  const bad: string[] = [];
  for (const lc of SEED_LANDED_COSTS) {
    const costTotal = lc.costs.reduce((n, c) => n + c.amount, 0);
    const allocated = lc.lines.reduce((n, l) => n + l.allocCostsVal, 0);
    if (!near(costTotal, allocated, Math.max(0.01, lc.lines.length * 0.01))) bad.push(`${lc.id}: costs ${r2(costTotal)}, allocated ${r2(allocated)}`);
    for (const l of lc.lines)
      if (!near(l.allocCostsVal, l.constCosts + l.varCosts, 0.01)) bad.push(`${lc.id}/${l.id}: allocated ${l.allocCostsVal} vs constant ${l.constCosts} + variable ${l.varCosts}`);
  }
  check('Landed cost allocations add up to the cost total', bad);
}

// ── Numbering ──────────────────────────────────────────────────────────────────
{
  // Document numbers are unique within each series (0 = an unnumbered draft, skipped).
  const bad: string[] = [];
  const uniqueNos = (name: string, docs: readonly { seriesId?: string; docNum?: number }[]) => {
    const seen = new Map<string, Set<number>>();
    for (const d of docs) {
      if (!d.docNum) continue;
      const key = d.seriesId ?? 'default';
      const nos = seen.get(key) ?? new Set<number>();
      if (nos.has(d.docNum)) bad.push(`${name}: #${d.docNum} appears twice in series ${key}`);
      nos.add(d.docNum);
      seen.set(key, nos);
    }
  };
  uniqueNos('Purchase orders', SEED_PURCHASE_ORDERS);
  uniqueNos('Goods receipts', H.receipts);
  uniqueNos('A/P invoices', H.invoices);
  uniqueNos('Goods returns', H.returns);
  uniqueNos('A/P credit memos', H.memos);
  uniqueNos('Outgoing payments', H.payments);
  uniqueNos('Down payment requests', H.downPayments);
  uniqueNos('Quotations', SEED_QUOTATIONS);
  uniqueNos('Sales orders', SEED_SALES_ORDERS);
  uniqueNos('Deliveries', SEED_DELIVERIES);
  uniqueNos('A/R invoices', SEED_AR_INVOICES);
  uniqueNos('A/R credit memos', SEED_AR_CREDIT_MEMOS);
  uniqueNos('Incoming payments', SEED_INCOMING_PAYMENTS);
  uniqueNos('Sales returns', SEED_SALES_RETURNS);
  uniqueNos('Inventory transfers', SEED_TRANSFERS);
  uniqueNos('Inventory postings', SEED_POSTINGS);
  uniqueNos('Landed costs', SEED_LANDED_COSTS);
  check('Document numbers are unique within each series', bad);
}

// ── Tax ────────────────────────────────────────────────────────────────────────
{
  const bad: string[] = [];
  // A posted A/P invoice's withholding summary totals its per-line withholding, per ATC. Stamped the
  // way the app stamps a document on adding (services/withholding.ts), then checked for consistency.
  for (const b of withSeedWithholding(H.invoices)) {
    if (!posted(b.status)) continue;
    const perAtc = new Map<string, number>();
    for (const l of b.lines) for (const w of l.lineWithholding ?? []) perAtc.set(w.atc, r2((perAtc.get(w.atc) ?? 0) + w.amount));
    for (const s of b.withholdingSummary ?? []) {
      const lineSum = perAtc.get(s.atc) ?? 0;
      if (!near(lineSum, s.amount, 0.01)) bad.push(`${b.id}: ${s.atc} summary ${r2(s.amount)} vs line total ${r2(lineSum)}`);
      perAtc.delete(s.atc);
    }
    for (const [atc, amount] of perAtc) if (Math.abs(amount) > 0.01) bad.push(`${b.id}: ${atc} on lines (${r2(amount)}) missing from the summary`);
  }
  // The tax code each posted line carries is a real one — the ATC it would stamp with resolves from it.
  const codeByCode = new Map(SEED_TAX_CODES.map((c) => [c.code, c]));
  for (const b of H.invoices) {
    if (!posted(b.status)) continue;
    for (const l of b.lines) {
      if (l.taxCode && !codeByCode.has(l.taxCode)) bad.push(`${b.id}/${l.id}: tax code ${l.taxCode} doesn't exist`);
      if (l.taxAtc !== undefined && l.taxAtc !== (codeByCode.get(l.taxCode)?.atc ?? '')) bad.push(`${b.id}/${l.id}: stamped ATC ${l.taxAtc}, tax code ${l.taxCode} is ${codeByCode.get(l.taxCode)?.atc ?? ''}`);
    }
  }
  // Services take the services input-VAT code (IVAT-S), never the goods-only IVAT.
  const taxCodeOf = (item: { purchaseTaxCode: string; purchaseTaxGroup: string }) =>
    item.purchaseTaxCode || (SEED_TAX_GROUPS.find((g) => g.code === item.purchaseTaxGroup)?.taxCode ?? '');
  for (const item of mergedItems(SEED_ITEMS))
    if (item.itemGroupId === 'ig-SVC' && taxCodeOf(item) === 'IVAT') bad.push(`${item.itemNo}: a service on the goods-only IVAT code`);
  check('Withholding summaries, stamped ATCs and service VAT codes are consistent', bad);
}

const profit = -r2([...balance.entries()].filter(([a]) => a >= '4000').reduce((n, [, v]) => n + v, 0));
console.log(`\n${L.entries.length} journal entries · revenue ${r2(-bal('4010', '4030', '4040', '4050')).toLocaleString()} · profit before tax ${profit.toLocaleString()} (1 Jan – ${SEED_AS_OF})`);
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
