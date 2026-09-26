import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Form,
  FormField,
  Icon,
  Panel,
  PanelHeader,
  Select,
  Text,
  TextField,
  Textarea,
} from '@jasperlepardo/sikat-design-system';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  PAYMENT_TERMS,
  type LeadStage,
  type Partner,
  type PartnerRole,
} from '../../mocks/partners';
import { convertLeadToCustomer, getPartner, savePartner } from '../../services/partners';
import { ROLE_CONFIG, ROLE_ORDER } from './roles';

type Draft = Omit<Partner, 'id'> & { id?: string };

const emptyDraft = (role: PartnerRole): Draft => ({
  code: '',
  name: '',
  roles: [role],
  status: 'Active',
  tin: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  ...(role === 'lead' ? { leadSource: LEAD_SOURCES[0], leadStage: 'New' as const } : {}),
  ...(role === 'customer' ? { customerTerms: 'Net 30', creditLimit: 0 } : {}),
  ...(role === 'vendor' ? { vendorTerms: 'Net 30' } : {}),
});

const options = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** One business partner form, opened from Leads, Customers or Vendors. */
export function PartnerDetail({ role }: { role: PartnerRole }) {
  const config = ROLE_CONFIG[role];
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null | undefined>(isNew ? emptyDraft(role) : undefined);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPartner(id).then((p) => !cancelled && setDraft(p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  if (draft === undefined) return <p className="p-4 text-muted">Loading {config.singular.toLowerCase()}…</p>;
  if (draft === null) {
    return (
      <Panel className="flex-1">
        <PanelHeader icon={config.icon} title={`${config.singular} not found`} />
        <Panel.Body>
          <Button onClick={() => navigate(config.basePath)}>Back to {config.title.toLowerCase()}</Button>
        </Panel.Body>
      </Panel>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const has = (r: PartnerRole) => draft.roles.includes(r);
  const toggleRole = (r: PartnerRole, on: boolean) =>
    setDraft({
      ...draft,
      roles: ROLE_ORDER.filter((x) => (x === r ? on : draft.roles.includes(x))),
      // Give a newly added role sensible defaults.
      ...(on && r === 'customer' && !draft.customerTerms ? { customerTerms: 'Net 30', creditLimit: 0 } : {}),
      ...(on && r === 'vendor' && !draft.vendorTerms ? { vendorTerms: 'Net 30' } : {}),
      ...(on && r === 'lead' && !draft.leadStage ? { leadStage: 'New' as const, leadSource: LEAD_SOURCES[0] } : {}),
    });

  const validate = () => {
    const next: typeof errors = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) next.email = 'Enter a valid email address.';
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await savePartner(draft);
    navigate(config.basePath);
  };

  const convert = async () => {
    if (!draft.id || !validate()) return;
    setSaving(true);
    await savePartner(draft);
    await convertLeadToCustomer(draft.id);
    navigate(`${ROLE_CONFIG.customer.basePath}/${draft.id}`);
  };

  return (
    <Form className="flex-1" onSubmit={submit} noValidate>
      <Panel className="flex-1">
        <PanelHeader
          type="forms"
          icon={config.icon}
          title={isNew ? `New ${config.singular.toLowerCase()}` : draft.name}
          subcopy={isNew ? config.subcopy : draft.code}
          status={
            isNew ? undefined : (
              <div className="flex gap-1">
                {ROLE_ORDER.filter(has).map((r) => (
                  <Badge key={r} intent={r === role ? 'primary' : 'default'} variant={r === role ? 'solid' : 'outline'}>
                    {ROLE_CONFIG[r].singular}
                  </Badge>
                ))}
                {draft.status === 'Inactive' ? <Badge intent="default">Inactive</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              <Button
                type="button"
                intent="default"
                variant="solid"
                size="extra-large"
                onClick={() => navigate(config.basePath)}
              >
                Cancel
              </Button>
              {role === 'lead' && !isNew ? (
                <Button
                  type="button"
                  intent="default"
                  variant="solid"
                  size="extra-large"
                  leadingIcon={<Icon size={20}>person_check</Icon>}
                  disabled={saving}
                  onClick={convert}
                >
                  Convert to customer
                </Button>
              ) : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <Card>
            <Card.Header icon={<Icon size={24}>badge</Icon>}>Details</Card.Header>
            <Card.Content>
              {/* `grid!` — Form.Group's own display:flex is unlayered CSS and would beat a plain `grid` utility. */}
              <Form.Group className="grid! grid-cols-2 gap-2">
                <FormField label="Name" required error={errors.name}>
                  {(p) => <TextField {...p} value={draft.name} onChange={(e) => set('name', e.currentTarget.value)} />}
                </FormField>
                <FormField label="Code">
                  {(p) => <TextField {...p} value={draft.code} placeholder="Assigned on save" readOnly />}
                </FormField>
                <FormField label="TIN" hint="BIR Taxpayer Identification Number">
                  {(p) => (
                    <TextField
                      {...p}
                      value={draft.tin ?? ''}
                      placeholder="000-000-000-000"
                      onChange={(e) => set('tin', e.currentTarget.value)}
                    />
                  )}
                </FormField>
                <FormField label="Status">
                  {(p) => (
                    <Select
                      {...p}
                      options={options(['Active', 'Inactive'])}
                      value={draft.status}
                      onValueChange={(v) => set('status', v as Partner['status'])}
                    />
                  )}
                </FormField>
              </Form.Group>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>contact_mail</Icon>}>Contact</Card.Header>
            <Card.Content>
              <Form.Group className="grid! grid-cols-2 gap-2">
                <FormField label="Contact person">
                  {(p) => (
                    <TextField
                      {...p}
                      value={draft.contactPerson}
                      onChange={(e) => set('contactPerson', e.currentTarget.value)}
                    />
                  )}
                </FormField>
                <FormField label="Email" error={errors.email}>
                  {(p) => (
                    <TextField
                      {...p}
                      type="email"
                      value={draft.email}
                      onChange={(e) => set('email', e.currentTarget.value)}
                    />
                  )}
                </FormField>
                <FormField label="Phone">
                  {(p) => (
                    <TextField
                      {...p}
                      type="tel"
                      value={draft.phone}
                      onChange={(e) => set('phone', e.currentTarget.value)}
                    />
                  )}
                </FormField>
                <FormField label="City">
                  {(p) => <TextField {...p} value={draft.city} onChange={(e) => set('city', e.currentTarget.value)} />}
                </FormField>
                <FormField label="Address" className="col-span-2">
                  {(p) => (
                    <TextField {...p} value={draft.address} onChange={(e) => set('address', e.currentTarget.value)} />
                  )}
                </FormField>
              </Form.Group>
            </Card.Content>
          </Card>

          {has('lead') ? (
            <Card>
              <Card.Header icon={<Icon size={24}>{ROLE_CONFIG.lead.icon}</Icon>}>Lead</Card.Header>
              <Card.Content>
                <Form.Group className="grid! grid-cols-2 gap-2">
                  <FormField label="Source">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(LEAD_SOURCES)}
                        value={draft.leadSource ?? ''}
                        onValueChange={(v) => set('leadSource', v)}
                      />
                    )}
                  </FormField>
                  <FormField label="Stage">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(LEAD_STAGES)}
                        value={draft.leadStage ?? 'New'}
                        onValueChange={(v) => set('leadStage', v as LeadStage)}
                      />
                    )}
                  </FormField>
                </Form.Group>
              </Card.Content>
            </Card>
          ) : null}

          {has('customer') ? (
            <Card>
              <Card.Header icon={<Icon size={24}>{ROLE_CONFIG.customer.icon}</Icon>}>As a customer</Card.Header>
              <Card.Content>
                <Form.Group className="grid! grid-cols-2 gap-2">
                  <FormField label="Payment terms" hint="What you give them.">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(PAYMENT_TERMS)}
                        value={draft.customerTerms ?? ''}
                        onValueChange={(v) => set('customerTerms', v)}
                      />
                    )}
                  </FormField>
                  <FormField label="Credit limit">
                    {(p) => (
                      <TextField
                        {...p}
                        type="number"
                        min={0}
                        prefix="PHP"
                        value={String(draft.creditLimit ?? 0)}
                        onChange={(e) => set('creditLimit', Number(e.currentTarget.value))}
                      />
                    )}
                  </FormField>
                </Form.Group>
              </Card.Content>
            </Card>
          ) : null}

          {has('vendor') ? (
            <Card>
              <Card.Header icon={<Icon size={24}>{ROLE_CONFIG.vendor.icon}</Icon>}>As a vendor</Card.Header>
              <Card.Content>
                <Form.Group className="grid! grid-cols-2 gap-2">
                  <FormField label="Payment terms" hint="What they give you.">
                    {(p) => (
                      <Select
                        {...p}
                        options={options(PAYMENT_TERMS)}
                        value={draft.vendorTerms ?? ''}
                        onValueChange={(v) => set('vendorTerms', v)}
                      />
                    )}
                  </FormField>
                </Form.Group>
              </Card.Content>
            </Card>
          ) : null}

          <Card>
            <Card.Header icon={<Icon size={24}>group_work</Icon>}>Roles</Card.Header>
            <Card.Content>
              <Text variant="small" tone="muted">
                One business partner can be a lead, a customer and a vendor. It appears in each matching list, and
                edits here show everywhere.
              </Text>
              <div className="flex flex-wrap gap-6">
                {ROLE_ORDER.map((r) => (
                  <Checkbox
                    key={r}
                    checked={has(r)}
                    disabled={r === role}
                    onChange={(e) => toggleRole(r, e.currentTarget.checked)}
                  >
                    {ROLE_CONFIG[r].singular} <span className="text-muted">· {ROLE_CONFIG[r].title} list</span>
                  </Checkbox>
                ))}
              </div>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>notes</Icon>}>Notes</Card.Header>
            <Card.Content>
              <Form.Group>
                <FormField label="Notes">
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={3}
                      value={draft.notes ?? ''}
                      onChange={(e) => set('notes', e.currentTarget.value)}
                    />
                  )}
                </FormField>
              </Form.Group>
            </Card.Content>
          </Card>
        </Panel.Body>
      </Panel>
    </Form>
  );
}
