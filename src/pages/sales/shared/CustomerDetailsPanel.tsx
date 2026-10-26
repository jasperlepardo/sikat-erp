import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardField, Icon, IconButton, Panel, PanelHeader, SidePanel, Text } from '@jasperlepardo/sikat-design-system';
import { formatAddress, type PostalAddress } from '../../../mocks/address';
import { contactName, type Partner, type PartnerAddress } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { countryName } from '../../../services/partnerMasters';
import { formatAmount } from '../../../services/format';
import { Fields, Section, bind } from '../../../components/form/fields';

/** The header fields the panel edits; sales orders and quotations both carry them. */
interface CustomerDetailsFields {
  contactId: string;
  customerRef: string;
  shipTo: string;
  billTo: string;
  indicator: string;
  orderNumber: string;
}

interface CustomerDetailsPanelProps {
  customer: Partner | undefined;
  draft: CustomerDetailsFields;
  update: (patch: Partial<CustomerDetailsFields>) => void;
  readOnly: boolean;
  /** What the document is called in the credit note: "order", "quotation". */
  noun: string;
  open: boolean;
  onClose: () => void;
  /** The credit bar; left out where the document adds nothing to what the customer owes (a delivery against an order). */
  credit?: { overCredit: boolean; openBalance: number; totalLc: number };
  orderNumberHint?: string;
  /** Sections only this document has, after Order details. */
  children?: ReactNode;
}

/** The customer side panel on a sales document: credit, contact, addresses and order details. */
export function CustomerDetailsPanel({ customer, draft, update, readOnly, noun, open, onClose, credit, orderNumberHint = 'Internal or chain-store order reference.', children }: CustomerDetailsPanelProps) {
  const navigate = useNavigate();
  if (!open || !customer) return null;

  const h = bind(draft, update);
  const customerAddresses = customer.addresses ?? [];

  const addrText = (a: PartnerAddress) => formatAddress(a, customer.name);
  const addrFields = (a: PostalAddress) => {
    const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
    return line ? [{ label: 'Address', value: line }] : [];
  };
  const locationIcon = <Icon size={16}>location_on</Icon>;
  const addrOptions = (current: string, defaultId: string | undefined, tag: string) => {
    const known = customerAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addrFields(a),
    }));
    if (!current || customerAddresses.some((a) => addrText(a) === current)) return known;
    const lines = current.split('\n').filter(Boolean);
    const rest = lines.slice(1).join(', ');
    return [{ value: '__custom__', label: lines[0] ?? `Address on this ${noun}`, icon: locationIcon, fields: rest ? [{ label: 'Address', value: rest }] : [] }, ...known];
  };
  const addrPicked = (current: string) => customerAddresses.find((a) => addrText(a) === current)?.id ?? (current ? '__custom__' : '');
  const fillAddr = (field: 'shipTo' | 'billTo', id: string) => {
    const a = customerAddresses.find((x) => x.id === id);
    if (a) update({ [field]: addrText(a) });
  };

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="person"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={customer.name}
        actions={
          <>
            <IconButton type="button" intent="default" variant="link" label={`Open customer ${customer.code}`} onClick={() => navigate(`/sales/customers/${customer.id}`)}>
              <Icon size={20}>open_in_new</Icon>
            </IconButton>
            <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
          </>
        }
      />
      <Panel.Body>
        {credit && customer.creditLimit > 0 ? (
          <Card>
            <Card.Header icon={<Icon size={24}>credit_score</Icon>}>Credit</Card.Header>
            <Card.Content>
              <div className="flex items-baseline justify-between gap-2">
                <Text variant="h3" as="p" tone={credit.overCredit ? 'danger' : undefined}>
                  PHP {formatAmount(credit.openBalance + credit.totalLc)}
                </Text>
                <Text variant="small" tone={credit.overCredit ? 'danger' : 'muted'}>
                  {Math.round(((credit.openBalance + credit.totalLc) / customer.creditLimit) * 100)}% of PHP {formatAmount(customer.creditLimit)}
                </Text>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-neutral-subtle)' }}>
                {credit.overCredit ? (
                  <div className="h-full w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-danger)' }} />
                ) : (
                  <>
                    <div className="h-full" style={{ width: `${Math.min((credit.openBalance / customer.creditLimit) * 100, 100)}%`, backgroundColor: 'var(--color-bg-primary)' }} />
                    <div className="h-full" style={{ width: `${Math.min((credit.totalLc / customer.creditLimit) * 100, Math.max(0, 100 - (credit.openBalance / customer.creditLimit) * 100))}%`, backgroundColor: 'var(--color-bg-primary-muted)' }} />
                  </>
                )}
              </div>
              <div className="flex justify-between gap-2">
                <Text variant="small" tone={credit.overCredit ? 'danger' : 'muted'}>
                  {credit.overCredit
                    ? `Over limit by PHP ${formatAmount(credit.openBalance + credit.totalLc - customer.creditLimit)}`
                    : `PHP ${formatAmount(customer.creditLimit - credit.openBalance - credit.totalLc)} available`}
                </Text>
                {!credit.overCredit && credit.totalLc > 0 ? (
                  <Text variant="small" tone="muted">this {noun} PHP {formatAmount(credit.totalLc)}</Text>
                ) : null}
              </div>
            </Card.Content>
          </Card>
        ) : null}
        <fieldset disabled={readOnly} className="contents">
          <Section icon="person" title="Contact">
            <Fields cols={1}>
              <CardField
                label="Contact person"
                options={(customer.contacts ?? [])
                  .filter((c) => c.active || c.id === draft.contactId)
                  .map((c) => ({
                    value: c.id,
                    label: contactName(c),
                    icon: <Icon size={16}>person</Icon>,
                    fields: [
                      ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                      ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                      ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                    ],
                  }))}
                value={draft.contactId}
                onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
                placeholder="Select a contact person"
                readOnly={readOnly}
              />
              {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's own PO or reference number." })}
            </Fields>
          </Section>
          <Section icon="local_shipping" title="Delivery & billing">
            <Fields cols={1}>
              <CardField
                label="Ship to"
                options={addrOptions(draft.shipTo, customer.defaultShipToId, 'default ship-to')}
                value={addrPicked(draft.shipTo)}
                onValueChange={(v) => fillAddr('shipTo', v)}
                placeholder="Select a delivery address"
                readOnly={readOnly}
              />
              <CardField
                label="Bill to"
                options={addrOptions(draft.billTo, customer.defaultBillToId, 'default bill-to')}
                value={addrPicked(draft.billTo)}
                onValueChange={(v) => fillAddr('billTo', v)}
                placeholder="Select a billing address"
                readOnly={readOnly}
              />
              {!customerAddresses.length ? (
                <Text variant="small" tone="muted">
                  {customer.name} has no addresses yet — add them on the customer record.
                </Text>
              ) : null}
            </Fields>
          </Section>
          <Section icon="tune" title="Order details">
            <Fields cols={1}>
              {h.choose('indicator', 'Indicator', INDICATORS.map((v) => ({ value: v, label: v })), { clearable: true })}
              {h.text('orderNumber', 'Order number', { hint: orderNumberHint })}
            </Fields>
          </Section>
          {children}
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
