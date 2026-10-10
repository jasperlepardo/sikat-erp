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
const { purchasingHistory } = await import('../src/services/purchasingHistory');
const { stockHistory } = await import('../src/services/stockHistory');
const { seededLedger } = await import('../src/services/ledgerHistory');
const { listItems } = await import('../src/services/items');
const { poTotals, poWithholding } = await import('../src/services/purchaseOrders');

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
      return k + net + r2((net * (l.taxCode === '31' ? 12 : 0)) / 100);
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

const profit = -r2([...balance.entries()].filter(([a]) => a >= '4000').reduce((n, [, v]) => n + v, 0));
console.log(`\n${L.entries.length} journal entries · revenue ${r2(-bal('4010', '4030', '4040', '4050')).toLocaleString()} · profit before tax ${profit.toLocaleString()} (1 Jan – ${SEED_AS_OF})`);
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
