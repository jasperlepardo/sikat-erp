import { useMemo, useState } from 'react';
import { Badge, DatePicker, FormField, Select, Table, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../components/form/fields';
import type { TaxDirection } from '../../../mocks/taxes';
import { companyTax, taxCodes, taxGroups, withholdingTaxes } from '../../../services/masterData';
import { listItems } from '../../../services/items';
import { listPartners } from '../../../services/partners';
import { determineTax, type TraceStep } from '../../../services/taxDetermination';
import { useAsync } from '../../../services/useAsync';

const SALES_RULES = [
  'Company is not VAT-registered → PT3 percentage tax on every sale',
  'Item is not tax liable → no tax',
  'Item has a fixed sales tax code → that code',
  'Customer VAT treatment: Government → OVG12 · Zero-rated with a valid certificate → OV0 · Exempt entity → OVX',
  'Item sales tax group → its default code',
  'Company default → OV12',
];
const PURCHASE_RULES = [
  'Supplier VAT status: Non-VAT → INV · Non-resident digital services → IVD12 (you withhold the VAT)',
  'Item has a fixed purchasing tax code → that code',
  'Item purchase tax group → its default code (goods IV12 · services IVS12 · capital goods IVC12)',
  'Company default → IV12 · Import VAT (IVI12) goes on the import entry, not the bill',
];
const WITHHOLDING_RULES = [
  'Vendor override → that withholding tax',
  'Item withholding category: rent → W?100 · contractor → W?120 · professional fees → W?010/011',
  'Goods or services → W?158 (1%) / W?160 (2%), only if the company is a top withholding agent',
  'WI for individuals and sole proprietors, WC for companies (from the partner’s type of business)',
];

const outcomeIntent = (o: TraceStep['outcome']) =>
  o === 'applied' ? 'success' : o === 'warning' ? 'warning' : 'default';

function Trace({ steps, caption }: { steps: TraceStep[]; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-heading">{caption}</p>
      <Table
        caption={caption}
        getRowId={(s) => s.rule + s.detail}
        rows={steps}
        columns={[
          { key: 'rule', header: 'Rule', cell: (s) => s.rule },
          {
            key: 'outcome',
            header: 'Result',
            cell: (s) => (
              <TableStatus intent={outcomeIntent(s.outcome)}>
                {s.outcome === 'applied' ? 'Applied' : s.outcome === 'warning' ? 'Check' : 'Skipped'}
              </TableStatus>
            ),
          },
          { key: 'detail', header: 'Why', cell: (s) => s.detail },
        ]}
      />
    </div>
  );
}

/** Explains the rule order and lets you test it on real partners and items. */
export function RulesTab() {
  const partners = useAsync(listPartners, []) ?? [];
  const items = useAsync(listItems, []) ?? [];
  const data = useAsync(async () => {
    const [[company], codes, groups, withholding] = await Promise.all([
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
    ]);
    return { company, codes, groups, withholding };
  }, []);

  const [direction, setDirection] = useState<TaxDirection>('Purchase');
  const [partnerId, setPartnerId] = useState('bp-002');
  const [itemId, setItemId] = useState('itm-019');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const role = direction === 'Sales' ? 'customer' : 'vendor';
  const partnerOptions = partners.filter((p) => p.roles.includes(role));
  const itemOptions = items.filter((i) => (direction === 'Sales' ? i.salesItem : i.purchaseItem));
  const partner = partnerOptions.find((p) => p.id === partnerId) ?? partnerOptions[0];
  const item = itemOptions.find((i) => i.id === itemId) ?? itemOptions[0];

  const result = useMemo(
    () => (data && partner && item ? determineTax(direction, item, partner, data, date) : undefined),
    [data, partner, item, direction, date],
  );

  return (
    <>
      <Section icon="rule" title="How a tax code is chosen">
        <Text variant="small" tone="muted">
          For each document line the rules run top to bottom and the first match wins, so a special status on the
          company or partner beats the item’s default.
        </Text>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Sales (output VAT)', SALES_RULES],
            ['Purchases (input VAT)', PURCHASE_RULES],
            ['Withholding on purchases', WITHHOLDING_RULES],
          ].map(([title, rules]) => (
            <div key={title as string}>
              <p className="mb-2 text-sm font-semibold text-heading">{title}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-body">
                {(rules as string[]).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="science" title="Try it">
        <Fields cols={3}>
          <FormField label="Document">
            {(p) => (
              <Select
                {...p}
                options={[
                  { value: 'Purchase', label: 'Purchase (bill from a vendor)' },
                  { value: 'Sales', label: 'Sale (invoice to a customer)' },
                ]}
                value={direction}
                onValueChange={(v) => setDirection(v as TaxDirection)}
              />
            )}
          </FormField>
          <FormField label={direction === 'Sales' ? 'Customer' : 'Vendor'}>
            {(p) => (
              <Select
                {...p}
                options={partnerOptions.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))}
                value={partner?.id ?? ''}
                onValueChange={setPartnerId}
              />
            )}
          </FormField>
          <FormField label="Item">
            {(p) => (
              <Select
                {...p}
                options={itemOptions.map((x) => ({ value: x.id, label: `${x.itemNo} · ${x.description}` }))}
                value={item?.id ?? ''}
                onValueChange={setItemId}
              />
            )}
          </FormField>
          <FormField label="Posting date">
            {(p) => <DatePicker {...p} value={date} onValueChange={setDate} />}
          </FormField>
          <ReadOnly
            label="Partner tax status"
            value={
              partner
                ? direction === 'Sales'
                  ? `${partner.salesVatTreatment}${partner.salesVatTreatment === 'Zero-rated' ? ` · cert. ${partner.zeroRatedCertificate || 'missing'}${partner.zeroRatedValidUntil ? ` until ${partner.zeroRatedValidUntil}` : ''}` : ''}`
                  : `${partner.supplierVatStatus} · ${partner.businessType}`
                : '—'
            }
          />
          <ReadOnly
            label="Company"
            value={
              data
                ? `${data.company.vatRegistered ? 'VAT-registered' : 'Non-VAT'} · ${data.company.topWithholdingAgent ? 'Top withholding agent' : 'Not a TWA'}`
                : '—'
            }
          />
        </Fields>

        {result ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-body">
              <span className="font-semibold text-heading">Result:</span>
              {result.taxCode ? (
                <Badge intent="primary">
                  {result.taxCode.code} · {result.rate ?? '—'}%
                </Badge>
              ) : (
                <Badge>No tax</Badge>
              )}
              {result.withholding.map((w) => (
                <Badge key={w.id} intent="warning" variant="outline">
                  {w.atc || 'ATC to confirm'} · withhold {w.rate}%
                </Badge>
              ))}
              {direction === 'Purchase' && !result.withholding.length ? (
                <Badge variant="outline">No withholding</Badge>
              ) : null}
            </div>
            <Trace caption="VAT rules" steps={result.trace} />
            {direction === 'Purchase' ? <Trace caption="Withholding rules" steps={result.withholdingTrace} /> : null}
            {result.notes.map((n) => (
              <Text key={n} variant="small" tone="muted">
                {n}
              </Text>
            ))}
          </>
        ) : (
          <Text variant="small" tone="muted">
            Pick a partner and an item.
          </Text>
        )}
      </Section>
    </>
  );
}
