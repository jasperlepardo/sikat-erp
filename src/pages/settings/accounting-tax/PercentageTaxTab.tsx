import { useState } from 'react';
import { Card, Table, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { ListRoute } from '../../../components/form/MasterList';
import { SEED_PERCENTAGE_ATCS } from '../../../mocks/taxes';

/**
 * Read-only reference: the BIR percentage tax ATCs (BIR Form 2551Q), keyed by the nature of
 * business / NIRC section. Codes and descriptions follow RMO 57-2022, Schedule 4; rates are the
 * NIRC Secs. 116-127 rates as amended. A tax code points at one of these in its "BIR ATC" field.
 */
export function PercentageTaxTab(_route: ListRoute) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const rows = (
    query
      ? SEED_PERCENTAGE_ATCS.filter((a) => `${a.code} ${a.category} ${a.coverage} ${a.description}`.toLowerCase().includes(query))
      : SEED_PERCENTAGE_ATCS
  ).map((a) => ({ ...a, id: a.code }));

  return (
    <div className="flex flex-col gap-4">
      <Text variant="small" tone="muted">
        BIR percentage tax Alphanumeric Tax Codes (BIR Form 2551Q), keyed by the nature of business / NIRC section - from RMO 57-2022,
        Schedule 4. Percentage tax applies to non-VAT persons and specific businesses (carriers, franchises, amusement, etc.). Assign one
        to a tax code on the Tax codes tab. Reference only.
      </Text>
      <TextField
        aria-label="Search percentage tax ATCs"
        placeholder="Search by code, category or description…"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      <Card>
        <Table
          caption="Percentage tax ATCs"
          getRowId={(a) => a.id}
          rows={rows}
          columns={[
            { key: 'code', header: 'Code', cell: (a) => <span className="whitespace-nowrap font-semibold">{a.code}</span> },
            { key: 'category', header: 'Category', cell: (a) => <span className="max-w-xs whitespace-normal">{a.category}</span> },
            { key: 'coverage', header: 'Coverage', cell: (a) => (a.coverage ? <span className="whitespace-normal">{a.coverage}</span> : <span className="text-muted">—</span>) },
            { key: 'description', header: 'Description', cell: (a) => <span className="max-w-md whitespace-normal">{a.description}</span> },
            { key: 'rate', header: 'Rate', align: 'end', cell: (a) => `${a.rate}%` },
            { key: 'note', header: 'Notes', cell: (a) => (a.note ? <span className="max-w-xs whitespace-normal text-muted">{a.note}</span> : <span className="text-muted">—</span>) },
          ]}
        />
      </Card>
    </div>
  );
}
