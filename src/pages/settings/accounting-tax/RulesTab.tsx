import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  DatePicker,
  FormField,
  Select,
  Table,
  TableStatus,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../components/form/fields';
import type { TaxDirection } from '../../../mocks/taxes';
import { companyTax, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { listItems } from '../../../services/items';
import { listPartners } from '../../../services/partners';
import { determineTax, type TraceStep } from '../../../services/taxDetermination';
import { useAsync } from '../../../services/useAsync';

const SALES_RULES = [
  'Company is not VAT-registered → PT010 percentage tax on every sale',
  'Item is not tax liable → no tax',
  'Item has a fixed sales tax code → that code',
  'Customer: Government → 31 (buyer withholds 5% VAT) · Zero-rated exemption → 32 · Exempt entity → 33. An exemption counts only with a document attached and not expired.',
  'Item sales tax group → its default code',
  'Company default → 31 VATable Sales',
];
const PURCHASE_RULES = [
  'Goods from a non-resident supplier → 46 Importations (49 if the item isn’t subject to VAT)',
  'Services or property lease from a non-resident → 45: you withhold the 12% VAT (not for a digital service provider registered with BIR, which charges VAT itself)',
  'Supplier not VAT-registered, or a non-resident → 48 no input tax',
  'Item has a fixed purchasing tax code → that code',
  'Item purchase tax group → its default code (a zero-rated group only if the company is a registered export enterprise)',
  'Company default → 44 Domestic Purchases',
];
const WITHHOLDING_RULES = [
  'Government payee → no withholding',
  'Income tier: the lower rate needs this year’s sworn declaration with the document attached (₱3M individuals, ₱720,000 corporations); VAT-registered individuals always get the higher rate',
  'Non-resident services → withholding VAT: WV050 lease / WV070 other services (WV040 / WV060 for a government company)',
  'Government company → WV010 / WV020 5% VAT on VAT-registered suppliers, WB080 3% on non-VAT suppliers',
  'Vendor override → that withholding tax (an income-tiered ATC follows the income tier)',
  'Item withholding group → its ATC. Non-residents: final tax (none on goods), the group’s own ATC or WC230 / WI330 at 25%, lowered to the treaty rate when the treaty income and Certificate of Residence are on file',
  'Goods and services groups (1% / 2%) apply only for top withholding agents and government companies, which use WI640 / WC640 and WI157 / WC157',
  'WI for individuals and sole proprietors, WC for everyone else (from the partner’s type of business)',
];

const outcomeIntent = (o: TraceStep['outcome']) =>
  o === 'applied' ? 'success' : o === 'warning' ? 'warning' : 'default';

function Trace({ steps, caption }: { steps: TraceStep[]; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-heading">{caption}</p>
      <Card>
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
      </Card>
    </div>
  );
}

/** Explains the rule order and lets you test it on real partners and items. */
export function RulesTab() {
  const partners = useAsync(listPartners, []) ?? [];
  const items = useAsync(listItems, []) ?? [];
  const data = useAsync(async () => {
    const [[company], codes, groups, withholding, wGroups] = await Promise.all([
      companyTax.list(),
      taxCodes.list(),
      taxGroups.list(),
      withholdingTaxes.list(),
      withholdingGroups.list(),
    ]);
    return { company, codes, groups, withholding, withholdingGroups: wGroups };
  }, []);

  const [direction, setDirection] = useState<TaxDirection>('Purchase');
  const [partnerId, setPartnerId] = useState('bp-002');
  const [itemId, setItemId] = useState('itm-018');
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
                  ? (() => { const active = partner.vatExemptions.find((e) => e.attachments.length > 0); return active ? `${active.type} · cert. ${active.certificateRef || 'on file'}${active.validUntil ? ` until ${active.validUntil}` : ''}` : partner.businessType === 'Government' ? 'Government' : 'No exemption'; })()
                  : `${partner.vatRegistered ? 'VAT-registered' : 'Non-VAT'}${partner.nonResidentDigitalServices ? ' · digital services' : ''} · ${partner.businessType}`
                : '—'
            }
          />
          <ReadOnly
            label="Company"
            value={
              data
                ? [
                    data.company.vatRegistered ? 'VAT-registered' : 'Non-VAT',
                    data.company.governmentEntity ? 'Government entity' : data.company.topWithholdingAgent ? 'Top withholding agent' : 'Not a TWA',
                    data.company.exportEnterprise ? 'Export enterprise' : null,
                  ].filter(Boolean).join(' · ')
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
