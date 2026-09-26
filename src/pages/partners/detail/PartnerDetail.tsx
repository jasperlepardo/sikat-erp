import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Form,
  Panel,
  PanelHeader,
  Select,
  Tabs,
  TextField,
  FormField,
} from '@jasperlepardo/sikat-design-system';
import { BP_GROUPS, CURRENCIES } from '../../../mocks/masters';
import { blankPartner, type PartnerRole } from '../../../mocks/partners';
import { convertLeadToCustomer, getPartner, isActive, savePartner } from '../../../services/partners';
import { MASTER_CONFIG, ROLE_CONFIG, ROLE_ORDER, type PartnerScope } from '../roles';
import { AccountingTab } from './AccountingTab';
import { AddressesTab } from './AddressesTab';
import { AttachmentsTab } from './AttachmentsTab';
import { ContactsTab } from './ContactsTab';
import { GeneralTab } from './GeneralTab';
import { PaymentRunTab } from './PaymentRunTab';
import { PaymentTermsTab } from './PaymentTermsTab';
import { PropertiesTab } from './PropertiesTab';
import { RemarksTab } from './RemarksTab';
import { Fields, Section, bind, type Draft, type Errors } from './fields';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem as ProblemBase } from '../../../components/form/ProblemsAlert';

const TABS = [
  { value: 'general', label: 'General', Component: GeneralTab },
  { value: 'contacts', label: 'Contact persons', Component: ContactsTab },
  { value: 'addresses', label: 'Addresses', Component: AddressesTab },
  { value: 'payment-terms', label: 'Payment terms', Component: PaymentTermsTab },
  { value: 'payment-run', label: 'Payment run', Component: PaymentRunTab },
  { value: 'accounting', label: 'Accounting', Component: AccountingTab },
  { value: 'properties', label: 'Properties', Component: PropertiesTab },
  { value: 'remarks', label: 'Remarks', Component: RemarksTab },
  { value: 'attachments', label: 'Attachments', Component: AttachmentsTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

type Problem = ProblemBase<TabId>;

/** Mandatory fields from the BP field mapping, checked on Add/Save. */
function validate(d: Draft, codeMode: 'auto' | 'manual'): Problem[] {
  const { problems, need } = problemCollector<TabId>();

  need(codeMode === 'auto' || d.code.trim(), 'header', 'code', 'Enter a code, or switch numbering to Auto.');
  need(d.name.trim(), 'header', 'name', 'Name is required.');
  need(d.group, 'header', 'group', 'Group is required.');
  need(d.currency, 'header', 'currency', 'Currency is required.');
  need(!d.email || /^\S+@\S+\.\S+$/.test(d.email), 'general', 'email', 'Enter a valid email address.');
  if (d.status === 'Advanced') {
    need(d.statusFrom, 'general', 'statusFrom', 'Pick a start date.');
    need(d.statusTo, 'general', 'statusTo', 'Pick an end date.');
    need(!d.statusFrom || !d.statusTo || d.statusFrom <= d.statusTo, 'general', 'statusTo', 'End date is before the start date.');
  }
  for (const a of d.addresses) {
    need(a.label.trim(), 'addresses', `address:${a.id}:label`, 'Every address needs an Address ID.');
    need(a.country, 'addresses', `address:${a.id}:country`, 'Every address needs a country.');
  }
  if (d.roles.includes('customer')) {
    need(d.customerPaymentTerms, 'payment-terms', 'customerPaymentTerms', 'Customer payment terms are required.');
    need(d.receivableAccount, 'accounting', 'receivableAccount', 'Customers need an accounts receivable account.');
  }
  if (d.roles.includes('vendor')) {
    need(d.vendorPaymentTerms, 'payment-terms', 'vendorPaymentTerms', 'Vendor payment terms are required.');
    need(d.payableAccount, 'accounting', 'payableAccount', 'Vendors need an accounts payable account.');
  }
  return problems;
}

/**
 * The business partner master form, opened from Business Partners or from the
 * Leads, Customers or Vendors list. Keyed by record so moving between records
 * (or duplicating into /new) starts a fresh form.
 */
export function PartnerDetail({ scope }: { scope: PartnerScope }) {
  const { id } = useParams();
  const location = useLocation();
  return <PartnerForm key={id === 'new' ? location.key : id} scope={scope} />;
}

function PartnerForm({ scope }: { scope: PartnerScope }) {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const copyFrom = (useLocation().state as { copyFrom?: Draft } | null)?.copyFrom;

  // From the master, a new partner starts as a customer; from a role list, as that role.
  const initialType: PartnerRole = scope === 'all' ? 'customer' : scope;
  const [draft, setDraft] = useState<Draft | null | undefined>(
    isNew ? (copyFrom ?? blankPartner(initialType)) : undefined,
  );
  const [type, setType] = useState<PartnerRole>(initialType);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('general');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPartner(id).then((p) => !cancelled && setDraft(p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const config = scope === 'all' ? MASTER_CONFIG : ROLE_CONFIG[isNew ? type : scope];

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

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const errors: Errors = Object.fromEntries(problems.map((p) => [p.key, p.message]));
  const h = bind(draft, update);
  const groups = BP_GROUPS.filter((g) => draft.roles.includes(g.role)).map((g) => g.value);

  const changeType = (next: PartnerRole) => {
    setType(next);
    update({ roles: [next], group: blankPartner(next).group, ...(next === 'lead' ? { leadStage: 'New' } : {}) });
  };

  const check = () => {
    const found = validate(draft, isNew ? codeMode : 'manual');
    setProblems(found);
    const first = found[0];
    if (first && first.tab !== 'header') setTab(first.tab);
    return !found.length;
  };

  const save = async () => {
    setSaving(true);
    try {
      return await savePartner({ ...draft, code: isNew && codeMode === 'auto' ? '' : draft.code });
    } catch (err) {
      setProblems([{ tab: 'header', key: 'code', message: (err as Error).message }]);
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!check()) return;
    if (await save()) navigate(config.basePath);
  };

  const convert = async () => {
    if (!draft.id || !check()) return;
    if (!(await save())) return;
    const converted = await convertLeadToCustomer(draft.id);
    if (scope === 'all') setDraft(converted ?? draft);
    else navigate(`${ROLE_CONFIG.customer.basePath}/${draft.id}`);
  };

  const duplicate = () => {
    const copy: Draft = { ...structuredClone(draft), id: undefined, code: '', name: `${draft.name} (copy)` };
    navigate(`${config.basePath}/new`, { state: { copyFrom: copy } });
  };

  const menu = [
    { label: 'Duplicate', icon: 'content_copy', onSelect: duplicate, show: !isNew },
    { label: 'Convert to customer', icon: 'person_check', onSelect: convert, show: !isNew && draft.roles.includes('lead') },
    ...(scope === 'all' ? [] : [MASTER_CONFIG])
      .concat(ROLE_ORDER.filter((r) => r !== scope && draft.roles.includes(r)).map((r) => ROLE_CONFIG[r]))
      .map((target) => ({
        label: `Open in ${target.title}`,
        icon: target.icon,
        onSelect: () => navigate(`${target.basePath}/${draft.id}`),
        show: !isNew,
      })),
  ].filter((m) => m.show);

  const counts: Partial<Record<TabId, number>> = {
    contacts: draft.contacts.length,
    addresses: draft.addresses.length,
    attachments: draft.attachments.length,
  };
  const ActiveTab = TABS.find((t) => t.value === tab)!.Component;

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
                {ROLE_ORDER.filter((r) => draft.roles.includes(r)).map((r) => (
                  <Badge key={r} intent={r === scope ? 'primary' : 'default'} variant={r === scope ? 'solid' : 'outline'}>
                    {ROLE_CONFIG[r].singular}
                  </Badge>
                ))}
                {!isActive(draft) ? <Badge intent="default">Inactive</Badge> : null}
              </div>
            )
          }
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={() => navigate(config.basePath)}>
                Cancel
              </Button>
              {menu.length ? <MoreMenu items={menu} /> : null}
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add' : 'Save'}
              </Button>
            </>
          }
        />
        <Panel.Body className="flex flex-col gap-2">
          <ProblemsAlert
            problems={problems}
            tabLabel={(t) => TABS.find((x) => x.value === t)?.label}
            onOpenTab={setTab}
          />

          <Section icon="badge" title="Business partner">
            <Fields cols={3}>
              {isNew ? (
                <FormField label="Numbering" hint="Auto assigns the next BP code.">
                  {(p) => (
                    <Select
                      {...p}
                      options={[
                        { value: 'auto', label: 'Auto (BP-####)' },
                        { value: 'manual', label: 'Manual' },
                      ]}
                      value={codeMode}
                      onValueChange={(v) => setCodeMode(v as 'auto' | 'manual')}
                    />
                  )}
                </FormField>
              ) : null}
              <FormField label="Code" required error={errors.code} hint={isNew ? undefined : 'Locked after the partner is added.'}>
                {(p) => (
                  <TextField
                    {...p}
                    value={isNew && codeMode === 'auto' ? '' : draft.code}
                    placeholder={isNew && codeMode === 'auto' ? 'Assigned on save' : 'e.g. C-ACME'}
                    readOnly={!isNew || codeMode === 'auto'}
                    onChange={(e) => update({ code: e.currentTarget.value })}
                  />
                )}
              </FormField>
              <FormField label="Type" hint={isNew ? 'Locks after the partner is added.' : 'Add more roles on the General tab.'}>
                {(p) => (
                  <Select
                    {...p}
                    options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_CONFIG[r].singular }))}
                    value={isNew ? type : scope === 'all' ? draft.roles[0] : scope}
                    disabled={!isNew}
                    onValueChange={(v) => changeType(v as PartnerRole)}
                  />
                )}
              </FormField>
              {h.text('name', 'Name', { required: true, error: errors.name })}
              {h.text('foreignName', 'Foreign name', { hint: 'For bilingual printouts.' })}
              {h.pick('group', 'Group', groups, { required: true, error: errors.group })}
              {h.pick('currency', 'Currency', CURRENCIES, { required: true, error: errors.currency })}
              {h.text('tin', 'TIN', { placeholder: '000-000-000-000', hint: 'BIR Taxpayer Identification Number.' })}
            </Fields>
          </Section>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabId)}
            items={TABS.map((t) => ({
              value: t.value,
              label: t.label,
              badge: problems.some((p) => p.tab === t.value) ? '!' : counts[t.value] ? String(counts[t.value]) : undefined,
            }))}
          />
          <ActiveTab
            draft={draft}
            update={update}
            errors={errors}
            lockedRole={scope === 'all' ? undefined : isNew ? type : scope}
          />
        </Panel.Body>
      </Panel>
    </Form>
  );
}
