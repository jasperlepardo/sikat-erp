import { useState } from 'react';
import { Badge, Card, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../../services/format';
import type { Bill } from '../payables';

interface VendorSummary {
  vendorId: string;
  name: string;
  code: string;
  currency: string;
  open: number;
  maxDaysOverdue: number;
}

type Show = 'all' | 'overdue';

/** The left pane: vendors with open bills, most overdue first. Picking one starts a payment to them. */
export function OpVendorList({ bills, selectedId, onPick }: { bills: Bill[]; selectedId: string; onPick: (vendorId: string) => void }) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const byVendor = new Map<string, VendorSummary>();
  for (const b of bills) {
    if (b.balanceDue <= 0) continue;
    const v = byVendor.get(b.vendorId) ?? { vendorId: b.vendorId, name: b.invoice.vendorName, code: b.invoice.vendorCode, currency: b.currency, open: 0, maxDaysOverdue: 0 };
    v.open = Math.round((v.open + b.balanceDue) * 100) / 100;
    v.maxDaysOverdue = Math.max(v.maxDaysOverdue, b.daysOverdue);
    byVendor.set(b.vendorId, v);
  }
  const q = query.trim().toLowerCase();
  const vendors = [...byVendor.values()]
    .filter((v) => (!q || `${v.name} ${v.code}`.toLowerCase().includes(q)) && (show === 'all' || v.maxDaysOverdue > 0))
    .sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || b.open - a.open);

  return (
    <Card>
      <Card.Content>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            <TextField aria-label="Search vendors" placeholder="Search" value={query} onChange={(e) => setQuery(e.currentTarget.value)} className="flex-1" />
            <Select
              aria-label="Show"
              className="w-32"
              options={[
                { value: 'all', label: 'All' },
                { value: 'overdue', label: 'Overdue' },
              ]}
              value={show}
              onValueChange={(v) => setShow(v as Show)}
            />
          </div>
          {vendors.length ? (
            <ul className="flex flex-col gap-1">
              {vendors.map((v) => (
                <li key={v.vendorId}>
                  <button
                    type="button"
                    aria-current={v.vendorId === selectedId || undefined}
                    onClick={() => onPick(v.vendorId)}
                    className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left hover:border-(--color-border-primary-subtle) ${
                      v.vendorId === selectedId ? 'border-(--color-border-primary) bg-(--color-bg-primary-subtle)' : 'border-(--color-border-default)'
                    }`}
                  >
                    <span className="text-sm font-semibold">{v.name}</span>
                    <span className="flex flex-wrap items-center justify-between gap-1">
                      <Text as="span" variant="small" tone="muted" className="tabular-nums">
                        {v.currency} {formatAmount(v.open)}
                      </Text>
                      {v.maxDaysOverdue > 0 ? (
                        <Badge size="small" intent="danger">
                          {v.maxDaysOverdue} {v.maxDaysOverdue === 1 ? 'day' : 'days'} overdue
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Text tone="muted" variant="small">{byVendor.size ? 'No vendors match.' : 'Nothing to pay.'}</Text>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
