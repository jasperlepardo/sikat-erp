import type { AuditEvent } from '../services/store';

/**
 * Seeded audit history: creates and edits that happened before the app's as-of date.
 * Real saves append to this; the seed gives every document a creation event and a
 * realistic edit trail so the Activity tab shows a living year, not a blank slate.
 */

let n = 0;
const id = () => `aud-${String(++n).padStart(4, '0')}`;

type AuditInput = Omit<AuditEvent, 'id'>;
const e = (ev: AuditInput): AuditEvent => ({ ...ev, id: id() });

/** ph(date, time) → ISO timestamp in Philippine time (UTC+8). */
const ph = (date: string, time = '09:00') => `${date}T${time}:00+08:00`;

const created = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'created', changes: [] });

const opened = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Status Draft → Open'] });

const approved = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Status Draft → Open', 'Approved: Yes'] });

const submitted = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Status Draft → Not Confirmed'] });



const closed = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Status Open → Closed'] });

const posted = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Posted'] });

const cancelled = (kind: string, recordId: string, at: string, by: string): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes: ['Status Open → Cancelled'] });

const edited = (kind: string, recordId: string, at: string, by: string, changes: string[]): AuditEvent =>
  e({ kind, recordId, at, by, action: 'updated', changes });

export const seedAuditEvents = (): AuditEvent[] => {
  n = 0;
  return [

    // ── Business partners ────────────────────────────────────────────────────

    e({ kind: 'BP', recordId: 'bp-002', at: ph('2025-09-10', '10:00'), by: 'Jasper L.', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-003', at: ph('2025-11-04', '10:12'), by: 'Jasper L.', action: 'created', changes: [] }),
    edited('BP', 'bp-003', ph('2026-01-08', '14:37'), 'Andrea Ramos',
      ['Payment terms: Net 30 → Net 45', 'Credit limit: 500,000 → 1,500,000']),
    edited('BP', 'bp-003', ph('2026-09-03', '09:21'), 'Jasper L.',
      ['Remarks: "Confirmed 2307 required per invoice." → "Confirmed 2307 required per invoice. Branch head must sign delivery receipts."']),

    e({ kind: 'BP', recordId: 'bp-004', at: ph('2025-10-15', '11:00'), by: 'Jasper L.', action: 'created', changes: [] }),
    edited('BP', 'bp-004', ph('2026-03-12', '16:05'), 'Andrea Ramos',
      ['Credit limit: 2,000,000 → 3,000,000', 'Payment terms: Net 30 → Net 45']),

    e({ kind: 'BP', recordId: 'bp-005', at: ph('2025-10-20', '09:30'), by: 'Jasper L.', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-007', at: ph('2025-11-15', '14:00'), by: 'Ben Salazar', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-009', at: ph('2026-08-01', '09:00'), by: 'Carla Uy', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-010', at: ph('2026-09-01', '10:00'), by: 'Dino Pascual', action: 'created', changes: [] }),

    e({ kind: 'BP', recordId: 'bp-013', at: ph('2025-09-20', '09:45'), by: 'Jasper L.', action: 'created', changes: [] }),
    edited('BP', 'bp-013', ph('2026-02-04', '10:30'), 'Dino Pascual',
      ['Contact', 'Remarks: "Third-party accessories (cases, screen protectors, chargers)." → "Third-party accessories (cases, screen protectors, chargers). 1% EWT flat — no sworn declaration needed."']),

    e({ kind: 'BP', recordId: 'bp-015', at: ph('2025-08-01', '14:00'), by: 'Andrea Ramos', action: 'created', changes: [] }),
    edited('BP', 'bp-015', ph('2026-01-07', '09:15'), 'Andrea Ramos',
      ['Remarks: "Cloud hosting for our online store." → "Cloud hosting for our online store and POS back office, billed monthly in USD."']),
    edited('BP', 'bp-015', ph('2026-04-15', '11:00'), 'Andrea Ramos',
      ['Payment terms: Net 7 → Net 30']),
    edited('BP', 'bp-015', ph('2026-07-10', '09:30'), 'Andrea Ramos',
      ['Remarks: "…billed monthly in USD." → "…billed monthly in USD. TAM letter on file confirming reverse-charge VAT classification."']),

    e({ kind: 'BP', recordId: 'bp-016', at: ph('2025-07-18', '10:00'), by: 'Jasper L.', action: 'created', changes: [] }),
    edited('BP', 'bp-016', ph('2026-06-02', '14:22'), 'Jasper L.',
      ['Credit limit: 5,000,000 → 8,000,000']),

    e({ kind: 'BP', recordId: 'bp-017', at: ph('2025-07-18', '10:05'), by: 'Jasper L.', action: 'created', changes: [] }),
    edited('BP', 'bp-017', ph('2026-08-28', '15:00'), 'Jasper L.',
      ['Remarks: "Direct imports of Apple products from Singapore." → "Direct imports of Apple products, shipped from Singapore and cleared through our customs broker."']),

    e({ kind: 'BP', recordId: 'bp-018', at: ph('2026-01-10', '10:00'), by: 'Andrea Ramos', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-040', at: ph('2026-09-01', '09:00'), by: 'Dino Pascual', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-041', at: ph('2026-08-01', '09:00'), by: 'Ben Salazar', action: 'created', changes: [] }),
    e({ kind: 'BP', recordId: 'bp-044', at: ph('2026-07-15', '10:00'), by: 'Ben Salazar', action: 'created', changes: [] }),

    // ── Purchase blanket agreements ──────────────────────────────────────────

    created('PBA', 'pba-001', ph('2026-01-01', '08:30'), 'Jasper L.'),
    e({ kind: 'PBA', recordId: 'pba-001', at: ph('2026-01-02', '10:00'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('PBA', 'pba-003', ph('2026-01-01', '08:35'), 'Jasper L.'),
    e({ kind: 'PBA', recordId: 'pba-003', at: ph('2026-01-02', '10:05'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('PBA', 'pba-005', ph('2026-01-01', '08:40'), 'Andrea Ramos'),
    e({ kind: 'PBA', recordId: 'pba-005', at: ph('2026-01-03', '09:00'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('PBA', 'pba-002', ph('2026-09-30', '14:00'), 'Jasper L.'),
    e({ kind: 'PBA', recordId: 'pba-002', at: ph('2026-10-01', '09:00'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('PBA', 'pba-004', ph('2026-09-30', '15:00'), 'Dino Pascual'),

    // ── Sales blanket agreements ─────────────────────────────────────────────

    created('BA', 'ba-001', ph('2026-07-01', '09:00'), 'Carla Uy'),
    e({ kind: 'BA', recordId: 'ba-001', at: ph('2026-07-02', '11:00'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('BA', 'ba-002', ph('2026-08-01', '09:00'), 'Ben Salazar'),
    e({ kind: 'BA', recordId: 'ba-002', at: ph('2026-08-02', '10:30'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    created('BA', 'ba-003', ph('2026-01-01', '09:00'), 'Andrea Ramos'),
    e({ kind: 'BA', recordId: 'ba-003', at: ph('2026-01-02', '10:00'), by: 'Jasper L.', action: 'updated', changes: ['Status Draft → Approved'] }),
    closed('BA', 'ba-003', ph('2026-09-30', '17:00'), 'Jasper L.'),

    // ── Landed costs ─────────────────────────────────────────────────────────

    created('LC', 'lc-001', ph('2026-01-28', '11:00'), 'Andrea Ramos'),
    edited('LC', 'lc-001', ph('2026-01-28', '14:00'), 'Andrea Ramos',
      ['Remarks: "" → "BOC import entry 2026-0124. Freight and customs duties — allocated to the Jan shipment."']),
    created('LC', 'lc-002', ph('2026-02-28', '11:00'), 'Andrea Ramos'),

    // ── Purchase requests ────────────────────────────────────────────────────

    created('PR', 'prq-001', ph('2026-09-16', '08:45'), 'Andrea Ramos'),
    opened('PR', 'prq-001', ph('2026-09-16', '09:00'), 'Andrea Ramos'),
    created('PR', 'prq-002', ph('2026-10-03', '10:00'), 'Carla Uy'),
    opened('PR', 'prq-002', ph('2026-10-03', '10:15'), 'Carla Uy'),
    created('PR', 'prq-003', ph('2026-09-22', '13:00'), 'Jasper L.'),
    opened('PR', 'prq-003', ph('2026-09-22', '13:30'), 'Jasper L.'),
    closed('PR', 'prq-003', ph('2026-09-28', '16:00'), 'Jasper L.'),

    // ── RFQs ─────────────────────────────────────────────────────────────────

    created('RFQ', 'rfq-001', ph('2026-09-18', '09:00'), 'Jasper L.'),
    opened('RFQ', 'rfq-001', ph('2026-09-19', '11:00'), 'Jasper L.'),
    created('RFQ', 'rfq-002', ph('2026-09-24', '09:30'), 'Jasper L.'),
    opened('RFQ', 'rfq-002', ph('2026-09-24', '10:00'), 'Jasper L.'),
    closed('RFQ', 'rfq-002', ph('2026-09-30', '15:00'), 'Jasper L.'),
    created('RFQ', 'rfq-003', ph('2026-09-05', '09:00'), 'Dino Pascual'),
    opened('RFQ', 'rfq-003', ph('2026-09-05', '10:30'), 'Jasper L.'),
    closed('RFQ', 'rfq-003', ph('2026-09-15', '11:00'), 'Jasper L.'),
    created('RFQ', 'rfq-004', ph('2026-09-28', '14:00'), 'Jasper L.'),
    opened('RFQ', 'rfq-004', ph('2026-09-28', '14:30'), 'Jasper L.'),
    created('RFQ', 'rfq-005', ph('2026-09-30', '10:00'), 'Andrea Ramos'),
    opened('RFQ', 'rfq-005', ph('2026-10-01', '09:30'), 'Jasper L.'),
    created('RFQ', 'rfq-006', ph('2026-08-15', '10:00'), 'Jasper L.'),
    opened('RFQ', 'rfq-006', ph('2026-08-15', '10:30'), 'Jasper L.'),
    cancelled('RFQ', 'rfq-006', ph('2026-08-22', '16:00'), 'Jasper L.'),
    created('RFQ', 'rfq-007', ph('2026-11-04', '09:00'), 'Jasper L.'),
    created('RFQ', 'rfq-008', ph('2026-09-18', '09:05'), 'Dino Pascual'),
    opened('RFQ', 'rfq-008', ph('2026-09-18', '11:30'), 'Jasper L.'),

    // ── Purchase orders — H1 monthly (Jan–Jun) ───────────────────────────────

    created('PO', 'po-m005-01', ph('2026-01-01', '09:00'), 'Andrea Ramos'),
    opened('PO', 'po-m005-01', ph('2026-01-01', '09:30'), 'Jasper L.'),
    closed('PO', 'po-m005-01', ph('2026-01-08', '10:00'), 'Andrea Ramos'),
    created('PO', 'po-m011-01', ph('2026-01-01', '09:10'), 'Dino Pascual'),
    opened('PO', 'po-m011-01', ph('2026-01-01', '09:30'), 'Jasper L.'),
    closed('PO', 'po-m011-01', ph('2026-01-16', '14:00'), 'Andrea Ramos'),
    created('PO', 'po-r2601-017', ph('2026-01-06', '10:00'), 'Dino Pascual'),
    opened('PO', 'po-r2601-017', ph('2026-01-06', '11:00'), 'Jasper L.'),
    closed('PO', 'po-r2601-017', ph('2026-01-24', '10:00'), 'Dino Pascual'),
    created('PO', 'po-r2601-013', ph('2026-01-20', '09:00'), 'Dino Pascual'),
    opened('PO', 'po-r2601-013', ph('2026-01-20', '10:00'), 'Jasper L.'),
    closed('PO', 'po-r2601-013', ph('2026-01-27', '14:00'), 'Dino Pascual'),
    created('PO', 'po-r2601-016', ph('2026-01-20', '09:05'), 'Jasper L.'),
    opened('PO', 'po-r2601-016', ph('2026-01-20', '10:00'), 'Jasper L.'),
    closed('PO', 'po-r2601-016', ph('2026-01-27', '15:00'), 'Andrea Ramos'),

    // ── Purchase orders — key Sep/Oct POs ────────────────────────────────────

    created('PO', 'po-001', ph('2026-09-10', '09:00'), 'Jasper L.'),
    opened('PO', 'po-001', ph('2026-09-10', '11:00'), 'Jasper L.'),
    closed('PO', 'po-001', ph('2026-09-20', '10:00'), 'Dino Pascual'),

    created('PO', 'po-002', ph('2026-09-18', '10:00'), 'Jasper L.'),
    opened('PO', 'po-002', ph('2026-09-18', '11:30'), 'Jasper L.'),

    created('PO', 'po-003', ph('2026-09-18', '11:00'), 'Jasper L.'),
    submitted('PO', 'po-003', ph('2026-09-18', '17:45'), 'Jasper L.'),

    created('PO', 'po-004', ph('2026-11-04', '08:00'), 'Jasper L.'),

    created('PO', 'po-005', ph('2026-09-26', '09:00'), 'Andrea Ramos'),
    opened('PO', 'po-005', ph('2026-09-26', '09:30'), 'Jasper L.'),

    created('PO', 'po-006', ph('2026-09-22', '14:00'), 'Dino Pascual'),
    opened('PO', 'po-006', ph('2026-09-22', '15:00'), 'Jasper L.'),
    edited('PO', 'po-006', ph('2026-09-26', '10:00'), 'Dino Pascual',
      ['Delivery date: 29 Sep 2026 → 15 Oct 2026', 'Remarks: "" → "Apple confirmed Oct shipment window; BOC clearance timeline adjusted."']),

    created('PO', 'po-007', ph('2026-08-18', '09:00'), 'Dino Pascual'),
    opened('PO', 'po-007', ph('2026-08-18', '10:00'), 'Jasper L.'),
    closed('PO', 'po-007', ph('2026-09-05', '14:00'), 'Dino Pascual'),

    created('PO', 'po-008', ph('2026-09-02', '09:00'), 'Dino Pascual'),
    opened('PO', 'po-008', ph('2026-09-02', '10:00'), 'Jasper L.'),
    closed('PO', 'po-008', ph('2026-09-10', '11:00'), 'Dino Pascual'),

    created('PO', 'po-009', ph('2026-09-21', '10:00'), 'Jasper L.'),
    opened('PO', 'po-009', ph('2026-09-21', '11:00'), 'Jasper L.'),

    created('PO', 'po-010', ph('2026-09-08', '09:00'), 'Jasper L.'),
    opened('PO', 'po-010', ph('2026-09-08', '10:00'), 'Jasper L.'),
    cancelled('PO', 'po-010', ph('2026-09-15', '16:00'), 'Jasper L.'),

    created('PO', 'po-013', ph('2026-09-01', '08:30'), 'Andrea Ramos'),
    opened('PO', 'po-013', ph('2026-09-01', '09:00'), 'Jasper L.'),
    closed('PO', 'po-013', ph('2026-09-12', '14:00'), 'Andrea Ramos'),

    created('PO', 'po-020', ph('2026-09-24', '10:00'), 'Jasper L.'),
    submitted('PO', 'po-020', ph('2026-09-24', '16:00'), 'Jasper L.'),

    created('PO', 'po-023', ph('2026-11-04', '09:00'), 'Dino Pascual'),

    created('PO', 'po-035', ph('2026-08-25', '10:00'), 'Andrea Ramos'),
    opened('PO', 'po-035', ph('2026-08-25', '11:00'), 'Jasper L.'),
    closed('PO', 'po-035', ph('2026-09-05', '16:00'), 'Andrea Ramos'),

    created('PO', 'po-036', ph('2026-09-27', '09:00'), 'Jasper L.'),
    submitted('PO', 'po-036', ph('2026-09-27', '14:00'), 'Jasper L.'),

    created('PO', 'po-038', ph('2026-09-23', '09:00'), 'Jasper L.'),
    opened('PO', 'po-038', ph('2026-09-23', '10:00'), 'Jasper L.'),

    created('PO', 'po-039', ph('2026-09-25', '09:30'), 'Dino Pascual'),
    opened('PO', 'po-039', ph('2026-09-25', '14:00'), 'Jasper L.'),

    created('PO', 'po-040', ph('2026-10-06', '09:00'), 'Jasper L.'),
    opened('PO', 'po-040', ph('2026-10-06', '10:00'), 'Jasper L.'),

    created('PO', 'po-041', ph('2026-09-08', '09:00'), 'Jasper L.'),
    opened('PO', 'po-041', ph('2026-09-08', '10:00'), 'Jasper L.'),
    closed('PO', 'po-041', ph('2026-09-22', '14:00'), 'Dino Pascual'),

    created('PO', 'po-042', ph('2026-09-14', '10:00'), 'Dino Pascual'),
    opened('PO', 'po-042', ph('2026-09-14', '11:00'), 'Jasper L.'),
    closed('PO', 'po-042', ph('2026-09-25', '15:00'), 'Dino Pascual'),

    created('PO', 'po-043', ph('2026-09-09', '09:00'), 'Dino Pascual'),
    opened('PO', 'po-043', ph('2026-09-09', '10:00'), 'Jasper L.'),
    closed('PO', 'po-043', ph('2026-09-20', '11:00'), 'Dino Pascual'),

    created('PO', 'po-044', ph('2026-09-24', '09:00'), 'Jasper L.'),
    opened('PO', 'po-044', ph('2026-09-24', '10:00'), 'Jasper L.'),
    closed('PO', 'po-044', ph('2026-10-02', '14:00'), 'Dino Pascual'),

    created('PO', 'po-045', ph('2026-09-26', '09:05'), 'Jasper L.'),
    opened('PO', 'po-045', ph('2026-09-26', '16:30'), 'Jasper L.'),
    edited('PO', 'po-045', ph('2026-09-30', '10:15'), 'Jasper L.',
      ['Delivery date: 3 Oct 2026 → 10 Oct 2026', 'Remarks: "" → "Vendor requested one-week extension due to warehouse stock count."']),

    // ── Goods receipts — representative sample ───────────────────────────────

    created('GRPO', 'gr-001', ph('2026-01-01', '11:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-001', ph('2026-01-01', '11:30'), 'Dino Pascual'),
    created('GRPO', 'gr-006', ph('2026-01-24', '14:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-006', ph('2026-01-24', '14:30'), 'Dino Pascual'),
    created('GRPO', 'gr-007', ph('2026-01-27', '10:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-007', ph('2026-01-27', '10:30'), 'Dino Pascual'),
    created('GRPO', 'gr-008', ph('2026-01-27', '11:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-008', ph('2026-01-27', '11:30'), 'Dino Pascual'),

    created('GRPO', 'gr-018', ph('2026-02-24', '14:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-018', ph('2026-02-24', '14:30'), 'Dino Pascual'),
    created('GRPO', 'gr-019', ph('2026-02-27', '10:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-019', ph('2026-02-27', '10:30'), 'Dino Pascual'),
    created('GRPO', 'gr-020', ph('2026-02-27', '11:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-020', ph('2026-02-27', '11:30'), 'Dino Pascual'),

    created('GRPO', 'gr-030', ph('2026-04-20', '10:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-030', ph('2026-04-20', '10:30'), 'Dino Pascual'),
    created('GRPO', 'gr-040', ph('2026-06-25', '10:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-040', ph('2026-06-25', '10:30'), 'Dino Pascual'),
    created('GRPO', 'gr-050', ph('2026-08-20', '10:00'), 'Dino Pascual'),
    posted('GRPO', 'gr-050', ph('2026-08-20', '10:30'), 'Dino Pascual'),

    // ── A/P invoices — representative sample ────────────────────────────────

    created('APINV', 'ap-001', ph('2026-01-01', '14:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-001', ph('2026-01-01', '14:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-001', ph('2026-01-08', '10:00'), 'Andrea Ramos'),

    created('APINV', 'ap-006', ph('2026-01-24', '15:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-006', ph('2026-01-24', '15:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-006', ph('2026-02-23', '10:00'), 'Andrea Ramos'),

    created('APINV', 'ap-007', ph('2026-01-27', '14:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-007', ph('2026-01-27', '14:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-007', ph('2026-02-26', '14:00'), 'Andrea Ramos'),

    created('APINV', 'ap-008', ph('2026-01-27', '15:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-008', ph('2026-01-27', '15:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-008', ph('2026-02-26', '15:00'), 'Andrea Ramos'),

    created('APINV', 'ap-013', ph('2026-02-01', '14:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-013', ph('2026-02-01', '14:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-013', ph('2026-03-08', '10:00'), 'Andrea Ramos'),

    created('APINV', 'ap-018', ph('2026-02-24', '15:00'), 'Andrea Ramos'),
    opened('APINV', 'ap-018', ph('2026-02-24', '15:30'), 'Andrea Ramos'),
    closed('APINV', 'ap-018', ph('2026-03-26', '14:00'), 'Andrea Ramos'),

    // ── Down payment requests ────────────────────────────────────────────────

    created('DPR', 'dp-001', ph('2026-09-03', '10:00'), 'Jasper L.'),
    opened('DPR', 'dp-001', ph('2026-09-03', '11:00'), 'Jasper L.'),
    closed('DPR', 'dp-001', ph('2026-09-10', '14:00'), 'Andrea Ramos'),

    created('DPR', 'dp-002', ph('2026-09-24', '09:00'), 'Jasper L.'),
    opened('DPR', 'dp-002', ph('2026-09-24', '10:00'), 'Jasper L.'),

    created('DPR', 'dp-003', ph('2026-10-01', '10:00'), 'Dino Pascual'),
    opened('DPR', 'dp-003', ph('2026-10-01', '11:00'), 'Jasper L.'),

    // ── A/P reserve invoices ─────────────────────────────────────────────────

    created('APRI', 'apri-001', ph('2026-08-19', '10:00'), 'Andrea Ramos'),
    opened('APRI', 'apri-001', ph('2026-08-19', '10:30'), 'Andrea Ramos'),
    closed('APRI', 'apri-001', ph('2026-09-22', '14:00'), 'Andrea Ramos'),

    created('APRI', 'apri-002', ph('2026-09-23', '10:00'), 'Andrea Ramos'),
    opened('APRI', 'apri-002', ph('2026-09-23', '11:00'), 'Andrea Ramos'),

    // ── A/P down payment invoices ────────────────────────────────────────────

    created('APDPI', 'dpi-001', ph('2026-10-02', '10:00'), 'Andrea Ramos'),
    opened('APDPI', 'dpi-001', ph('2026-10-02', '11:00'), 'Andrea Ramos'),

    // ── Outgoing payments — representative sample ────────────────────────────

    created('PAY', 'op-g001', ph('2026-01-01', '16:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g001', ph('2026-01-01', '16:30'), 'Andrea Ramos'),
    created('PAY', 'op-g002', ph('2026-01-08', '10:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g002', ph('2026-01-08', '10:30'), 'Andrea Ramos'),
    created('PAY', 'op-g008', ph('2026-02-08', '10:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g008', ph('2026-02-08', '10:30'), 'Andrea Ramos'),
    created('PAY', 'op-g013', ph('2026-02-23', '14:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g013', ph('2026-02-23', '14:30'), 'Andrea Ramos'),
    created('PAY', 'op-g014', ph('2026-02-26', '10:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g014', ph('2026-02-26', '10:30'), 'Andrea Ramos'),
    created('PAY', 'op-g015', ph('2026-02-26', '11:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g015', ph('2026-02-26', '11:30'), 'Andrea Ramos'),
    created('PAY', 'op-g020', ph('2026-03-08', '10:00'), 'Andrea Ramos'),
    posted('PAY', 'op-g020', ph('2026-03-08', '10:30'), 'Andrea Ramos'),

    // ── Goods returns ────────────────────────────────────────────────────────

    created('GRR', 'grr-001', ph('2026-08-15', '10:00'), 'Dino Pascual'),
    opened('GRR', 'grr-001', ph('2026-08-15', '10:30'), 'Jasper L.'),
    edited('GRR', 'grr-001', ph('2026-08-18', '09:00'), 'Dino Pascual',
      ['Remarks: "" → "Defective units from the Aug batch — scratched bezels confirmed by photo inspection."']),

    created('GRET', 'rt-001', ph('2026-10-02', '09:00'), 'Dino Pascual'),
    opened('GRET', 'rt-001', ph('2026-10-02', '10:00'), 'Jasper L.'),
    closed('GRET', 'rt-001', ph('2026-10-03', '14:00'), 'Dino Pascual'),

    created('GRET', 'rt-002', ph('2026-09-25', '09:00'), 'Dino Pascual'),
    opened('GRET', 'rt-002', ph('2026-09-25', '10:00'), 'Jasper L.'),
    closed('GRET', 'rt-002', ph('2026-09-26', '11:00'), 'Dino Pascual'),

    created('GRET', 'rt-003', ph('2026-08-01', '09:00'), 'Dino Pascual'),
    closed('GRET', 'rt-003', ph('2026-08-02', '14:00'), 'Dino Pascual'),

    created('GRET', 'rt-004', ph('2026-08-21', '10:00'), 'Dino Pascual'),
    closed('GRET', 'rt-004', ph('2026-08-22', '11:00'), 'Dino Pascual'),

    // ── A/P credit memos ─────────────────────────────────────────────────────

    created('APCM', 'cm-001', ph('2026-09-27', '10:00'), 'Andrea Ramos'),
    opened('APCM', 'cm-001', ph('2026-09-27', '11:00'), 'Andrea Ramos'),
    closed('APCM', 'cm-001', ph('2026-10-01', '14:00'), 'Andrea Ramos'),

    created('APCM', 'cm-002', ph('2026-10-03', '10:00'), 'Andrea Ramos'),
    opened('APCM', 'cm-002', ph('2026-10-03', '11:00'), 'Andrea Ramos'),

    created('APCM', 'cm-rt-003', ph('2026-08-01', '15:00'), 'Andrea Ramos'),
    closed('APCM', 'cm-rt-003', ph('2026-08-05', '10:00'), 'Andrea Ramos'),

    created('APCM', 'cm-rt-004', ph('2026-08-21', '15:00'), 'Andrea Ramos'),
    closed('APCM', 'cm-rt-004', ph('2026-08-25', '10:00'), 'Andrea Ramos'),

    // ── Quotations — H1 history ──────────────────────────────────────────────

    created('QT', 'qt-h01', ph('2026-01-06', '10:00'), 'Ben Salazar'),
    opened('QT', 'qt-h01', ph('2026-01-06', '10:30'), 'Ben Salazar'),
    closed('QT', 'qt-h01', ph('2026-01-13', '09:00'), 'Ben Salazar'),

    created('QT', 'qt-h03', ph('2026-02-02', '10:00'), 'Carla Uy'),
    opened('QT', 'qt-h03', ph('2026-02-02', '10:30'), 'Carla Uy'),
    closed('QT', 'qt-h03', ph('2026-02-09', '09:00'), 'Carla Uy'),

    created('QT', 'qt-h04', ph('2026-02-16', '11:00'), 'Ben Salazar'),
    opened('QT', 'qt-h04', ph('2026-02-16', '11:30'), 'Ben Salazar'),
    closed('QT', 'qt-h04', ph('2026-02-23', '09:00'), 'Ben Salazar'),

    created('QT', 'qt-h07', ph('2026-03-30', '10:00'), 'Ben Salazar'),
    opened('QT', 'qt-h07', ph('2026-03-30', '10:30'), 'Ben Salazar'),
    closed('QT', 'qt-h07', ph('2026-04-06', '09:00'), 'Ben Salazar'),

    created('QT', 'qt-h09', ph('2026-05-04', '10:00'), 'Carla Uy'),
    opened('QT', 'qt-h09', ph('2026-05-04', '10:30'), 'Carla Uy'),
    closed('QT', 'qt-h09', ph('2026-05-11', '09:00'), 'Carla Uy'),

    created('QT', 'qt-h11', ph('2026-06-01', '09:00'), 'Dino Pascual'),
    opened('QT', 'qt-h11', ph('2026-06-01', '09:30'), 'Dino Pascual'),
    closed('QT', 'qt-h11', ph('2026-06-08', '14:00'), 'Dino Pascual'),

    // ── Quotations — current ─────────────────────────────────────────────────

    created('QT', 'qt-001', ph('2026-07-25', '16:00'), 'Ben Salazar'),
    opened('QT', 'qt-001', ph('2026-07-25', '16:08'), 'Ben Salazar'),
    closed('QT', 'qt-001', ph('2026-08-06', '09:12'), 'Ben Salazar'),

    created('QT', 'qt-002', ph('2026-08-12', '10:00'), 'Ben Salazar'),
    opened('QT', 'qt-002', ph('2026-08-12', '10:30'), 'Ben Salazar'),
    closed('QT', 'qt-002', ph('2026-08-20', '14:00'), 'Ben Salazar'),

    created('QT', 'qt-003', ph('2026-08-20', '09:00'), 'Dino Pascual'),
    opened('QT', 'qt-003', ph('2026-08-20', '09:30'), 'Dino Pascual'),
    closed('QT', 'qt-003', ph('2026-08-26', '14:00'), 'Dino Pascual'),

    created('QT', 'qt-004', ph('2026-09-10', '10:00'), 'Carla Uy'),
    opened('QT', 'qt-004', ph('2026-09-10', '10:20'), 'Carla Uy'),
    edited('QT', 'qt-004', ph('2026-09-22', '14:35'), 'Carla Uy',
      ['Valid until: 30 Sep 2026 → 31 Oct 2026', 'Discount: 2% → 3%', 'Remarks: "" → "Extended validity and added 1% incremental discount per Miguel\'s request."']),
    closed('QT', 'qt-004', ph('2026-09-25', '09:00'), 'Carla Uy'),

    created('QT', 'qt-005', ph('2026-09-18', '11:00'), 'Ben Salazar'),
    opened('QT', 'qt-005', ph('2026-09-18', '11:30'), 'Ben Salazar'),
    closed('QT', 'qt-005', ph('2026-09-24', '09:00'), 'Ben Salazar'),

    created('QT', 'qt-006', ph('2026-09-28', '10:00'), 'Dino Pascual'),
    opened('QT', 'qt-006', ph('2026-09-28', '10:30'), 'Dino Pascual'),
    closed('QT', 'qt-006', ph('2026-10-05', '14:00'), 'Dino Pascual'),

    created('QT', 'qt-007', ph('2026-09-28', '15:30'), 'Andrea Ramos'),
    opened('QT', 'qt-007', ph('2026-09-28', '16:00'), 'Andrea Ramos'),

    created('QT', 'qt-008', ph('2026-08-04', '14:00'), 'Andrea Ramos'),
    opened('QT', 'qt-008', ph('2026-08-04', '14:30'), 'Andrea Ramos'),
    edited('QT', 'qt-008', ph('2026-08-28', '09:05'), 'Andrea Ramos',
      ['Valid until: 31 Aug 2026 → 30 Sep 2026', 'Remarks: "" → "Board meets monthly — extended validity to cover next meeting."']),

    created('QT', 'qt-009', ph('2026-10-08', '10:00'), 'Ben Salazar'),
    opened('QT', 'qt-009', ph('2026-10-08', '10:30'), 'Ben Salazar'),

    // ── Sales orders — H1 history ────────────────────────────────────────────

    created('SO', 'so-h01', ph('2026-01-13', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-h01', ph('2026-01-13', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h01', ph('2026-01-19', '15:00'), 'Ben Salazar'),

    created('SO', 'so-h02', ph('2026-01-26', '09:00'), 'Carla Uy'),
    approved('SO', 'so-h02', ph('2026-01-26', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h02', ph('2026-02-02', '15:00'), 'Carla Uy'),

    created('SO', 'so-h03', ph('2026-02-09', '09:00'), 'Carla Uy'),
    approved('SO', 'so-h03', ph('2026-02-09', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h03', ph('2026-02-16', '15:00'), 'Carla Uy'),

    created('SO', 'so-h04', ph('2026-02-23', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-h04', ph('2026-02-23', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h04', ph('2026-03-02', '15:00'), 'Ben Salazar'),

    created('SO', 'so-h05', ph('2026-03-09', '09:00'), 'Dino Pascual'),
    approved('SO', 'so-h05', ph('2026-03-09', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h05', ph('2026-03-13', '14:00'), 'Dino Pascual'),

    created('SO', 'so-h06', ph('2026-03-23', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-h06', ph('2026-03-23', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h06', ph('2026-03-27', '15:00'), 'Ben Salazar'),

    created('SO', 'so-h07', ph('2026-04-06', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-h07', ph('2026-04-06', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h07', ph('2026-04-13', '15:00'), 'Ben Salazar'),

    created('SO', 'so-h08', ph('2026-04-20', '09:00'), 'Carla Uy'),
    approved('SO', 'so-h08', ph('2026-04-20', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h08', ph('2026-04-24', '15:00'), 'Carla Uy'),

    created('SO', 'so-h09', ph('2026-05-11', '09:00'), 'Carla Uy'),
    approved('SO', 'so-h09', ph('2026-05-11', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h09', ph('2026-05-18', '15:00'), 'Carla Uy'),

    created('SO', 'so-h10', ph('2026-05-25', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-h10', ph('2026-05-25', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h10', ph('2026-06-01', '15:00'), 'Ben Salazar'),

    created('SO', 'so-h11', ph('2026-06-08', '09:00'), 'Dino Pascual'),
    approved('SO', 'so-h11', ph('2026-06-08', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h11', ph('2026-06-15', '14:00'), 'Dino Pascual'),

    created('SO', 'so-h12', ph('2026-06-22', '09:00'), 'Carla Uy'),
    approved('SO', 'so-h12', ph('2026-06-22', '10:00'), 'Jasper L.'),
    closed('SO', 'so-h12', ph('2026-06-26', '15:00'), 'Carla Uy'),

    // ── Sales orders — current ───────────────────────────────────────────────

    created('SO', 'so-c01', ph('2026-08-07', '10:00'), 'Ben Salazar'),
    approved('SO', 'so-c01', ph('2026-08-07', '10:30'), 'Jasper L.'),
    closed('SO', 'so-c01', ph('2026-08-22', '16:00'), 'Ben Salazar'),

    created('SO', 'so-004', ph('2026-08-14', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-004', ph('2026-08-14', '10:00'), 'Jasper L.'),
    closed('SO', 'so-004', ph('2026-08-21', '14:00'), 'Ben Salazar'),

    created('SO', 'so-c02', ph('2026-08-20', '10:00'), 'Ben Salazar'),
    approved('SO', 'so-c02', ph('2026-08-20', '10:30'), 'Jasper L.'),
    closed('SO', 'so-c02', ph('2026-09-02', '16:00'), 'Ben Salazar'),

    created('SO', 'so-005', ph('2026-08-26', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-005', ph('2026-08-26', '10:00'), 'Jasper L.'),
    closed('SO', 'so-005', ph('2026-09-04', '14:00'), 'Ben Salazar'),

    created('SO', 'so-c03', ph('2026-08-26', '10:00'), 'Dino Pascual'),
    approved('SO', 'so-c03', ph('2026-08-26', '10:30'), 'Jasper L.'),
    closed('SO', 'so-c03', ph('2026-09-05', '15:00'), 'Dino Pascual'),

    created('SO', 'so-013', ph('2026-09-02', '09:00'), 'Carla Uy'),
    approved('SO', 'so-013', ph('2026-09-02', '10:00'), 'Jasper L.'),
    closed('SO', 'so-013', ph('2026-09-10', '14:00'), 'Carla Uy'),

    created('SO', 'so-c04', ph('2026-09-09', '09:00'), 'Ben Salazar'),
    approved('SO', 'so-c04', ph('2026-09-09', '10:00'), 'Jasper L.'),
    closed('SO', 'so-c04', ph('2026-09-20', '15:00'), 'Ben Salazar'),

    created('SO', 'so-009', ph('2026-09-08', '09:00'), 'Dino Pascual'),
    approved('SO', 'so-009', ph('2026-09-08', '10:00'), 'Jasper L.'),
    closed('SO', 'so-009', ph('2026-09-15', '14:00'), 'Dino Pascual'),

    created('SO', 'so-001', ph('2026-09-16', '09:00'), 'Carla Uy'),
    approved('SO', 'so-001', ph('2026-09-16', '09:30'), 'Jasper L.'),
    edited('SO', 'so-001', ph('2026-09-30', '14:00'), 'Carla Uy',
      ['Remarks: "" → "Delivery in branches per schedule confirmed with Miguel — BDO Makati first, then the provincial branches."']),

    created('SO', 'so-c05', ph('2026-09-26', '11:00'), 'Ben Salazar'),
    approved('SO', 'so-c05', ph('2026-09-26', '11:30'), 'Jasper L.'),

    created('SO', 'so-c06', ph('2026-10-05', '10:00'), 'Dino Pascual'),
    approved('SO', 'so-c06', ph('2026-10-05', '10:30'), 'Jasper L.'),

    created('SO', 'so-b01', ph('2026-09-15', '10:00'), 'Ben Salazar'),
    approved('SO', 'so-b01', ph('2026-09-15', '11:00'), 'Jasper L.'),
    closed('SO', 'so-b01', ph('2026-09-22', '15:00'), 'Ben Salazar'),

    created('SO', 'so-002', ph('2026-09-30', '09:00'), 'Carla Uy'),
    approved('SO', 'so-002', ph('2026-09-30', '10:00'), 'Jasper L.'),

    created('SO', 'so-006', ph('2026-09-15', '09:00'), 'Carla Uy'),
    approved('SO', 'so-006', ph('2026-09-15', '10:00'), 'Jasper L.'),

    created('SO', 'so-012', ph('2026-09-04', '10:00'), 'Carla Uy'),
    approved('SO', 'so-012', ph('2026-09-04', '11:00'), 'Jasper L.'),

    created('SO', 'so-010', ph('2026-10-06', '09:00'), 'Carla Uy'),
    approved('SO', 'so-010', ph('2026-10-06', '10:00'), 'Jasper L.'),

    // ── Deliveries — key records ─────────────────────────────────────────────

    created('DN', 'dn-h01', ph('2026-01-19', '10:00'), 'Dino Pascual'),
    posted('DN', 'dn-h01', ph('2026-01-19', '11:00'), 'Dino Pascual'),

    created('DN', 'dn-h02', ph('2026-02-02', '10:00'), 'Dino Pascual'),
    posted('DN', 'dn-h02', ph('2026-02-02', '11:00'), 'Dino Pascual'),

    created('DN', 'dn-h03', ph('2026-02-16', '10:00'), 'Dino Pascual'),
    posted('DN', 'dn-h03', ph('2026-02-16', '11:00'), 'Dino Pascual'),

    created('DN', 'dn-c01', ph('2026-08-14', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-c01', ph('2026-08-14', '14:00'), 'Dino Pascual'),

    created('DN', 'dn-002', ph('2026-08-21', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-002', ph('2026-08-21', '14:00'), 'Dino Pascual'),

    created('DN', 'dn-003', ph('2026-08-28', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-003', ph('2026-08-28', '14:00'), 'Dino Pascual'),

    created('DN', 'dn-007', ph('2026-09-04', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-007', ph('2026-09-04', '14:00'), 'Dino Pascual'),

    created('DN', 'dn-005', ph('2026-09-10', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-005', ph('2026-09-10', '14:00'), 'Dino Pascual'),

    created('DN', 'dn-c04', ph('2026-09-11', '13:00'), 'Dino Pascual'),
    posted('DN', 'dn-c04', ph('2026-09-11', '14:00'), 'Dino Pascual'),

    // ── A/R down payment invoices ────────────────────────────────────────────

    created('ARDI', 'ardi-001', ph('2026-09-10', '10:00'), 'Andrea Ramos'),
    opened('ARDI', 'ardi-001', ph('2026-09-10', '11:00'), 'Andrea Ramos'),

    created('ARDI', 'ardi-002', ph('2026-09-22', '10:00'), 'Andrea Ramos'),
    opened('ARDI', 'ardi-002', ph('2026-09-22', '11:00'), 'Andrea Ramos'),

    // ── A/R invoices — key records ───────────────────────────────────────────

    created('ARINV', 'ar-h01', ph('2026-01-19', '15:00'), 'Andrea Ramos'),
    opened('ARINV', 'ar-h01', ph('2026-01-19', '15:30'), 'Andrea Ramos'),
    closed('ARINV', 'ar-h01', ph('2026-02-18', '10:00'), 'Andrea Ramos'),

    // ── Incoming payments — representative sample ────────────────────────────

    created('RCV', 'rc-h01', ph('2026-02-18', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h01', ph('2026-02-18', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h02', ph('2026-03-04', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h02', ph('2026-03-04', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h03', ph('2026-03-18', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h03', ph('2026-03-18', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h04', ph('2026-03-17', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h04', ph('2026-03-17', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h07', ph('2026-05-13', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h07', ph('2026-05-13', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h08', ph('2026-05-24', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h08', ph('2026-05-24', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h09', ph('2026-06-17', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h09', ph('2026-06-17', '10:30'), 'Andrea Ramos'),

    created('RCV', 'rc-h12', ph('2026-07-26', '10:00'), 'Andrea Ramos'),
    posted('RCV', 'rc-h12', ph('2026-07-26', '10:30'), 'Andrea Ramos'),

    // ── A/R credit memos ─────────────────────────────────────────────────────

    created('ARCM', 'acm-001', ph('2026-08-20', '10:00'), 'Andrea Ramos'),
    opened('ARCM', 'acm-001', ph('2026-08-20', '11:00'), 'Andrea Ramos'),

    created('ARCM', 'acm-002', ph('2026-09-25', '10:00'), 'Andrea Ramos'),
    opened('ARCM', 'acm-002', ph('2026-09-25', '11:00'), 'Andrea Ramos'),
    closed('ARCM', 'acm-002', ph('2026-09-30', '14:00'), 'Andrea Ramos'),

    created('ARCM', 'acm-003', ph('2026-10-05', '10:00'), 'Andrea Ramos'),
    opened('ARCM', 'acm-003', ph('2026-10-05', '11:00'), 'Andrea Ramos'),
    closed('ARCM', 'acm-003', ph('2026-10-07', '14:00'), 'Andrea Ramos'),

    // ── Sales returns ─────────────────────────────────────────────────────────

    created('SRT', 'sr-001', ph('2026-10-03', '09:00'), 'Dino Pascual'),
    opened('SRT', 'sr-001', ph('2026-10-03', '10:00'), 'Jasper L.'),
    closed('SRT', 'sr-001', ph('2026-10-05', '14:00'), 'Dino Pascual'),

    // ── Items ─────────────────────────────────────────────────────────────────

    created('ITEM', 'apl-fam-001', ph('2025-06-01', '10:00'), 'Jasper L.'),
    edited('ITEM', 'apl-fam-001', ph('2026-03-15', '14:10'), 'Dino Pascual',
      ['Description: "iPhone 17 Pro" → "iPhone 17 Pro (A3293)"', 'Item group: Phones → Phones – Flagship']),
    edited('ITEM', 'apl-fam-001', ph('2026-09-10', '09:00'), 'Jasper L.',
      ['Remarks: "Display units rotate every 90 days." → "Display units rotate every 90 days. Launch stock held at Pasig; 30% reserved for corporate."']),

    created('ITEM', 'apl-fam-002', ph('2026-09-01', '09:00'), 'Jasper L.'),
    edited('ITEM', 'apl-fam-002', ph('2026-09-08', '10:15'), 'Dino Pascual',
      ['Description: "iPhone 18 Pro" → "iPhone 18 Pro (A3361)"', 'Remarks: "" → "Launch item — allocation confirmed with Apple South Asia Sep 2026."']),

  ];
};
