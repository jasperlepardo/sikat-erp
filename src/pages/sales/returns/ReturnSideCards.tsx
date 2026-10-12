import type { ReactNode } from 'react';
import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import { NO_SALES_EMPLOYEE } from '../../../mocks/salesOrders';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { activeOptions, type InventoryMasters } from '../../../services/inventoryMasters';
import { salesEmployeeDef } from '../../settings/masterDefs';

/** The header fields a sales return and an A/R credit memo both carry. */
interface ReturnFields {
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;
  shippingType: string;
  salesEmployeeId: string;
  ownerId: string;
  remarks: string;
}

interface CardProps {
  draft: ReturnFields;
  update: (patch: Partial<ReturnFields>) => void;
  readOnly: boolean;
}

export function ReturnDatesCard({ draft, update, readOnly, errors, postingHint, dueHint }: CardProps & { errors: Errors; postingHint?: string; dueHint?: string }) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <div className="flex flex-col gap-2">
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: postingHint })}
          {h.date('dueDate', 'Due date', { hint: dueHint })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </div>
      </Section>
    </fieldset>
  );
}

export function ReturnShipmentCard({ draft, update, readOnly, inv }: CardProps & { inv: InventoryMasters }) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="route" title="Shipment">
        <Fields cols={1}>
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
        </Fields>
      </Section>
    </fieldset>
  );
}

/** Sales employee and owner; remarks stay editable after the document is added. */
export function ReturnAssignmentCard({ draft, update, readOnly, noun }: CardProps & { noun: string }) {
  const h = bind(draft, update);
  return (
    <Section icon="person_search" title="Assignment">
      <fieldset disabled={readOnly} className="contents">
        <Fields cols={1}>
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true, placeholder: NO_SALES_EMPLOYEE, hint: 'Defaults from the customer.' })}
          {h.master('ownerId', 'Owner', salesEmployeeDef, { hint: 'Owns the document.' })}
        </Fields>
      </fieldset>
      {h.area('remarks', 'Remarks', { rows: 3, hint: `Can be changed after the ${noun} is added.` })}
    </Section>
  );
}

export function ReturnJournalCard({ journal, accounts, empty, note }: { journal: { account: string; debit: number; credit: number }[]; accounts: Account[]; empty: string; note: ReactNode }) {
  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item key={j.account} title={accountText(j.account, accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
          ))}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">{empty}</Text>
      )}
      <Text variant="small" tone="muted">{note}</Text>
    </Section>
  );
}
