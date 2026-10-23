import { useState } from 'react';
import { Card, Table, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { ListRoute } from '../../../components/form/MasterList';
import { SEED_VAT_ATCS } from '../../../mocks/taxes';

/**
 * Read-only reference: the BIR VAT Alphanumeric Tax Codes (ATCs) as published on eFPS / 2550Q,
 * keyed by nature of sale and industry. A tax code points at one of these in its "BIR ATC" field
 * (Tax codes tab) — this is the catalog those come from, mirroring the Withholding tax tab.
 */
export function VatAtcsTab(_route: ListRoute) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const rows = (
    query
      ? SEED_VAT_ATCS.filter((a) => `${a.code} ${a.category} ${a.coverage} ${a.description}`.toLowerCase().includes(query))
      : SEED_VAT_ATCS
  ).map((a) => ({ ...a, id: a.code }));

  return (
    <div className="flex flex-col gap-4">
      <Text variant="small" tone="muted">
        BIR output and import VAT Alphanumeric Tax Codes, keyed by the nature of sale / industry (PSIC) - verbatim from RMO 57-2022,
        Schedule 3. Output VAT uses the code for the business's activity (this reseller: VT010 wholesale & retail). Withholding VAT
        (WV codes) is on the Withholding tab; percentage tax on the Percentage tax codes. Assign one to a tax code on the Tax codes tab. Reference only.
      </Text>
      <TextField
        aria-label="Search ATCs"
        placeholder="Search by code, category or description…"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      <Card>
        <Table
          caption="VAT ATCs"
          getRowId={(a) => a.id}
          rows={rows}
          columns={[
            { key: 'code', header: 'Code', cell: (a) => <span className="whitespace-nowrap font-semibold">{a.code}</span> },
            { key: 'category', header: 'Category', cell: (a) => <span className="max-w-xs whitespace-normal">{a.category}</span> },
            { key: 'coverage', header: 'Coverage', cell: (a) => (a.coverage ? <span className="whitespace-normal">{a.coverage}</span> : <span className="text-muted">—</span>) },
            { key: 'description', header: 'Description', cell: (a) => <span className="max-w-md whitespace-normal">{a.description}</span> },
            { key: 'rate', header: 'Rate', align: 'end', cell: (a) => `${a.rate}%` },
          ]}
        />
      </Card>
    </div>
  );
}
