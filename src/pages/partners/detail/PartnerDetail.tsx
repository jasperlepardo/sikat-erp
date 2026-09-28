import { useEffect, useState, type FormEvent } from 'react';
import { useAccounts } from '../../../components/form/AccountField';
import { accountProblem, type Account } from '../../../mocks/chartOfAccounts';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Form,
  MultiSelect,
  Panel,
  PanelHeader,
  Select,
  Tabs,
  TextField,
  FormField,
} from '@jasperlepardo/sikat-design-system';
import { BP_GROUPS } from '../../../mocks/masters';
import { RDOS } from '../../../mocks/taxes';
import { currencies } from '../../../services/masterData';
import { blankPartner, newAddress, newBankAccount, newContact, type ContactPerson, type PartnerAddress, type PartnerBankAccount, type PartnerContactChannel, type PartnerRole } from '../../../mocks/partners';
import { convertLeadToCustomer, getPartner, isActive, savePartner } from '../../../services/partners';
import { MASTER_CONFIG, ROLE_CONFIG, ROLE_ORDER, type PartnerScope } from '../roles';
import { AccountingTab } from './AccountingTab';
import { AddressPanel, AddressesCards } from './AddressesTab';
import { AttachmentsTab } from './AttachmentsTab';
import { BankAccountPanel, BankAccountsCards } from './BankAccountsTab';
import { ContactChannelPanel, ContactChannelsCards } from './ContactChannelsTab';
import { DefaultsCard } from './DefaultsCard';
import { ContactPanel, ContactsCards } from './ContactsTab';
import { GeneralTab } from './GeneralTab';
import { PaymentRunTab } from './PaymentRunTab';
import { PaymentTermsTab } from './PaymentTermsTab';
import { SettingsTab } from './SettingsTab';
import { PropertiesTab } from './PropertiesTab';
import { RemarksTab } from './RemarksTab';
import { Fields, Section, bind, type Draft, type Errors } from './fields';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem as ProblemBase } from '../../../components/form/ProblemsAlert';

const TABS = [
  { value: 'general', label: 'General', Component: GeneralTab },
  { value: 'payment-terms', label: 'Payment terms', Component: PaymentTermsTab },
  { value: 'payment-run', label: 'Payment run', Component: PaymentRunTab },
  { value: 'settings', label: 'Settings', Component: SettingsTab },
  { value: 'accounting', label: 'Accounting', Component: AccountingTab },
  { value: 'properties', label: 'Properties', Component: PropertiesTab },
  { value: 'remarks', label: 'Remarks', Component: RemarksTab },
  { value: 'attachments', label: 'Attachments', Component: AttachmentsTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

/** Address problems point at the side column ('addresses'), which opens the address's side panel. */
type ProblemTab = TabId | 'addresses';
type Problem = ProblemBase<ProblemTab>;

/** The contact or address open in the side panel. */
type Editing =
  | { kind: 'contact'; value: ContactPerson; isNew: boolean }
  | { kind: 'address'; value: PartnerAddress; isNew: boolean }
  | { kind: 'bank'; value: PartnerBankAccount; isNew: boolean }
  | { kind: 'channel'; value: PartnerContactChannel; isNew: boolean }
  | null;

/** Mandatory fields from the BP field mapping, checked on Add/Save. */
/** `chart` is undefined until the chart of accounts loads; account checks then only require a value. */
function validate(d: Draft, codeMode: 'auto' | 'manual', chart: Account[] | undefined): Problem[] {
  const { problems, need } = problemCollector<ProblemTab>();

  need(codeMode === 'auto' || d.code.trim(), 'header', 'code', 'Enter a code, or switch numbering to Auto.');
  need(d.name.trim(), 'header', 'name', 'Name is required.');
  need(d.group, 'header', 'group', 'Group is required.');
  need(d.currency, 'header', 'currency', 'Currency is required.');
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
    const ar = chart ? accountProblem(d.receivableAccount, 'receivable', chart, true) : d.receivableAccount ? undefined : 'Pick an account.';
    need(!ar, 'accounting', 'receivableAccount', ar === 'Pick an account.' ? 'Customers need an accounts receivable account.' : `Accounts receivable: ${ar}`);
  }
  if (d.roles.includes('vendor')) {
    need(d.vendorPaymentTerms, 'payment-terms', 'vendorPaymentTerms', 'Vendor payment terms are required.');
    const ap = chart ? accountProblem(d.payableAccount, 'payable', chart, true) : d.payableAccount ? undefined : 'Pick an account.';
    need(!ap, 'accounting', 'payableAccount', ap === 'Pick an account.' ? 'Vendors need an accounts payable account.' : `Accounts payable: ${ap}`);
  }
  for (const [key, role, label] of [
    ['downPaymentClearingAccount', 'downPaymentClearing', 'Down payment clearing account'],
    ['downPaymentInterimAccount', 'downPaymentInterim', 'Down payment interim account'],
  ] as const) {
    const problem = chart && accountProblem(d[key], role, chart);
    need(!problem, 'accounting', key, `${label}: ${problem}`);
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
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [tab, setTab] = useState<TabId>('general');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([]);

  const chart = useAccounts();
  useEffect(() => {
    currencies.list().then((all) => setCurrencyCodes(all.filter((c) => c.active).map((c) => c.code)));
  }, []);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPartner(id).then((p) => !cancelled && setDraft(p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const config = scope === 'all' ? MASTER_CONFIG : ROLE_CONFIG[isNew ? (draft?.roles[0] ?? initialType) : scope];

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

  const changeRoles = (next: PartnerRole[]) => {
    if (next.length === 0) return;
    const hadLead = draft.roles.includes('lead');
    update({
      roles: next,
      ...(!hadLead && next.includes('lead') && !draft.leadStage ? { leadStage: 'New' as const } : {}),
    });
  };

  /** Show where a problem is: a tab, or the side panel of the address it's about. */
  const openProblem = (t: ProblemTab, found = problems) => {
    if (t !== 'addresses') return setTab(t);
    const id = found.find((p) => p.tab === 'addresses')?.key.split(':')[1];
    const address = draft.addresses.find((a) => a.id === id);
    if (address) setEditing({ kind: 'address', value: address, isNew: false });
  };

  const check = () => {
    const found = validate(draft, isNew ? codeMode : 'manual', chart);
    setProblems(found);
    const first = found[0];
    if (first && first.tab !== 'header') openProblem(first.tab, found);
    return !found.length;
  };

  const applyContact = (c: ContactPerson, added: boolean) => {
    update(
      added
        ? { contacts: [...draft.contacts, c], defaultContactId: draft.defaultContactId || c.id }
        : { contacts: draft.contacts.map((x) => (x.id === c.id ? c : x)) },
    );
    setEditing(null);
  };
  const applyChannel = (ch: PartnerContactChannel, added: boolean) => {
    update(
      added
        ? { contactChannels: [...draft.contactChannels, ch] }
        : { contactChannels: draft.contactChannels.map((x) => (x.id === ch.id ? ch : x)) },
    );
    setEditing(null);
  };

  const applyBank = (b: PartnerBankAccount, added: boolean) => {
    update(
      added
        ? { bankAccounts: [...draft.bankAccounts, b], defaultBankAccountId: draft.defaultBankAccountId || b.id }
        : { bankAccounts: draft.bankAccounts.map((x) => (x.id === b.id ? b : x)) },
    );
    setEditing(null);
  };
  const applyAddress = (a: PartnerAddress, added: boolean) => {
    update(
      added
        ? {
            addresses: [...draft.addresses, a],
            // The first address becomes the default for both until another is picked.
            defaultBillToId: draft.defaultBillToId || a.id,
            defaultShipToId: draft.defaultShipToId || a.id,
          }
        : { addresses: draft.addresses.map((x) => (x.id === a.id ? a : x)) },
    );
    setProblems(problems.filter((p) => !p.key.startsWith(`address:${a.id}:`)));
    setEditing(null);
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

  const counts: Partial<Record<TabId, number>> = { attachments: draft.attachments.length };
  const ActiveTab = TABS.find((t) => t.value === tab)!.Component;

  return (
    <>
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
              tabLabel={(t) => (t === 'addresses' ? 'Addresses' : TABS.find((x) => x.value === t)?.label)}
              onOpenTab={(t) => openProblem(t)}
            />

            <div className="grid gap-2 lg:grid-cols-12">
              <aside className="flex flex-col gap-2 lg:col-span-3">
                <DefaultsCard
                  draft={draft}
                  update={update}
                  onCreate={(what) => {
                    if (what === 'contact') setEditing({ kind: 'contact', value: newContact(), isNew: true });
                    else if (what === 'address') setEditing({ kind: 'address', value: newAddress({ label: 'Main office' }), isNew: true });
                    else if (what === 'bank') setEditing({ kind: 'bank', value: newBankAccount({ accountName: draft.name, currency: draft.currency === 'All currencies' ? 'PHP' : draft.currency }), isNew: true });
                    else setTab('payment-run');
                  }}
                />
                <ContactChannelsCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'channel', value, isNew: added })} />
                <ContactsCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'contact', value, isNew: added })} />
                <AddressesCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'address', value, isNew: added })} />
                <BankAccountsCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'bank', value, isNew: added })} />
              </aside>

              <div className="flex min-w-0 flex-col gap-2 lg:col-span-9">
                <Section icon="badge" title="Business partner">
                  <Fields cols={3}>
                    {isNew ? (
                      <FormField label="Numbering" tooltip="Auto assigns the next BP code.">
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
                    <FormField label="Code" required error={errors.code} tooltip={isNew ? undefined : 'Locked after the partner is added.'}>
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
                    <FormField label="Type">
                      {(p) => (
                        <MultiSelect
                          {...p}
                          options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_CONFIG[r].singular }))}
                          value={draft.roles}
                          onValueChange={(v) => changeRoles(v as PartnerRole[])}
                        />
                      )}
                    </FormField>
                    {h.text('name', 'Name', { required: true, error: errors.name })}
                    {h.text('foreignName', 'Foreign name', { hint: 'For bilingual printouts.' })}
                    {h.pick('group', 'Group', groups, { required: true, error: errors.group })}
                    {h.pick('currency', 'Currency', [...new Set([...currencyCodes, draft.currency, 'All currencies'])], {
                      required: true,
                      error: errors.currency,
                      hint: 'Active currencies from Settings › Accounting & Tax.',
                    })}
                    {h.text('tin', 'TIN', { placeholder: '000-000-000-000', hint: 'BIR Taxpayer Identification Number.' })}
                    {h.text('birCorNumber', 'BIR COR no.', { placeholder: '000-000-000-000', hint: 'BIR Certificate of Registration (Form 2303).' })}
                    {h.choose('rdoCode', 'BIR RDO', [{ value: '', label: '— None —' }, ...RDOS], { hint: 'Revenue District Office where the partner is registered.' })}
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
                  lockedRole={scope === 'all' ? undefined : scope}
                />
              </div>
            </div>
          </Panel.Body>
        </Panel>
      </Form>

      {/* Outside the <Form>, so Enter in a panel field doesn't save the partner. */}
      {editing?.kind === 'contact' ? (
        <ContactPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          onDone={(c) => applyContact(c, editing.isNew)}
          onCancel={() => setEditing(null)}
        />
      ) : editing?.kind === 'address' ? (
        <AddressPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          errors={errors}
          onDone={(a) => applyAddress(a, editing.isNew)}
          onCancel={() => setEditing(null)}
        />
      ) : editing?.kind === 'bank' ? (
        <BankAccountPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          currencies={currencyCodes}
          onDone={(b) => applyBank(b, editing.isNew)}
          onCancel={() => setEditing(null)}
        />
      ) : editing?.kind === 'channel' ? (
        <ContactChannelPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          onDone={(ch) => applyChannel(ch, editing.isNew)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
