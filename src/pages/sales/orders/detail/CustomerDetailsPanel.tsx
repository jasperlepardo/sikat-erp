import { Button, Card, CardField, Icon, Panel, PanelHeader, SidePanel, Text } from '@jasperlepardo/sikat-design-system';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { contactName, type PartnerAddress } from '../../../../mocks/partners';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { countryName } from '../../../../services/partnerMasters';
import { formatAmount } from '../../../../services/format';
import { Fields, Section, bind } from '../../../../components/form/fields';
import type { SoTabProps } from './types';

interface CustomerDetailsPanelProps extends SoTabProps {
  open: boolean;
  onClose: () => void;
  overCredit: boolean;
  openBalance: number;
  totalLc: number;
}

export function CustomerDetailsPanel({ draft, update, ctx, open, onClose, overCredit, openBalance, totalLc }: CustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;

  const customer = ctx.customer;
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
    return [{ value: '__custom__', label: lines[0] ?? 'Address on this order', icon: locationIcon, fields: rest ? [{ label: 'Address', value: rest }] : [] }, ...known];
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
        title={customer.name}
        actions={
          <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>
            Done
          </Button>
        }
      />
      <Panel.Body>
        {customer.creditLimit > 0 ? (
          <Card>
            <Card.Header icon={<Icon size={24}>credit_score</Icon>}>Credit</Card.Header>
            <Card.Content>
              <div className="flex items-baseline justify-between gap-2">
                <Text variant="h3" as="p" tone={overCredit ? 'danger' : undefined}>
                  PHP {formatAmount(openBalance + totalLc)}
                </Text>
                <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                  {Math.round(((openBalance + totalLc) / customer.creditLimit) * 100)}% of PHP {formatAmount(customer.creditLimit)}
                </Text>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-neutral-subtle)' }}>
                {overCredit ? (
                  <div className="h-full w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-danger)' }} />
                ) : (
                  <>
                    <div className="h-full" style={{ width: `${Math.min((openBalance / customer.creditLimit) * 100, 100)}%`, backgroundColor: 'var(--color-bg-primary)' }} />
                    <div className="h-full" style={{ width: `${Math.min((totalLc / customer.creditLimit) * 100, Math.max(0, 100 - (openBalance / customer.creditLimit) * 100))}%`, backgroundColor: 'var(--color-bg-primary-muted)' }} />
                  </>
                )}
              </div>
              <div className="flex justify-between gap-2">
                <Text variant="small" tone={overCredit ? 'danger' : 'muted'}>
                  {overCredit
                    ? `Over limit by PHP ${formatAmount(openBalance + totalLc - customer.creditLimit)}`
                    : `PHP ${formatAmount(customer.creditLimit - openBalance - totalLc)} available`}
                </Text>
                {!overCredit && totalLc > 0 ? (
                  <Text variant="small" tone="muted">this order PHP {formatAmount(totalLc)}</Text>
                ) : null}
              </div>
            </Card.Content>
          </Card>
        ) : null}
        <fieldset disabled={ctx.readOnly} className="contents">
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
                readOnly={ctx.readOnly}
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
                readOnly={ctx.readOnly}
              />
              <CardField
                label="Bill to"
                options={addrOptions(draft.billTo, customer.defaultBillToId, 'default bill-to')}
                value={addrPicked(draft.billTo)}
                onValueChange={(v) => fillAddr('billTo', v)}
                placeholder="Select a billing address"
                readOnly={ctx.readOnly}
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
              {h.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...INDICATORS.map((v) => ({ value: v, label: v }))])}
              {h.text('orderNumber', 'Order number', { hint: 'Internal or chain-store order reference.' })}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
