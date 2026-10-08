import { useEffect, useState, type FormEvent } from 'react';
import { useAccounts } from '../../../components/form/AccountField';
import { accountProblem, type Account } from '../../../mocks/chartOfAccounts';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  Form,
  IconButton,
  MultiSelect,
  Panel,
  PanelHeader,
  panelHeaderIcons,
  Select,
  Tabs,
  TextField,
  FormField,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { bpGroupDef, currencyDef } from '../../settings/masterDefs';
import { RDOS } from '../../../mocks/taxes';
import { LEAD_SOURCES, PARTNER_STATUSES, blankPartner, contactName, type ContactPerson, type PartnerAddress, type PartnerRole } from '../../../mocks/partners';
import { convertLeadToCustomer, getPartner, isActive, listPartners, listPartnersByRole, savePartner } from '../../../services/partners';
import { MASTER_CONFIG, ROLE_CONFIG, ROLE_ORDER, type PartnerScope } from '../roles';
import { AddressPanel, AddressesCards } from './AddressesTab';
import { AttachmentsCards } from './AttachmentsTab';
import { accountKind, newAccountFor } from './PaymentAccounts';
import { ContactChannelsFields, channelErrorKey } from './ContactChannelsTab';
import { PaymentEntryPanel, PaymentMethodsCards, accountsOf, includedMethods, methodTitle, saveEntry, type PaymentEntry } from './PaymentMethodsTab';
import { ContactPanel, ContactsCards } from './ContactsTab';
import { PaymentRunTab } from './PaymentRunTab';
import { SettingsTab } from './SettingsTab';
import { TransactionsTab } from './TransactionsTab';
import { TaxTab } from './TaxTab';
import { VendorItemsTab } from './VendorItemsTab';
import { FieldStack, Section, bind, type DefaultKey, type DefaultPicks, type DefaultRole, type Draft, type Errors } from './fields';
import { MoreMenu } from '../../../components/form/MoreMenu';
import { ProblemsAlert, problemCollector, type Problem as ProblemBase } from '../../../components/form/ProblemsAlert';

const TABS = [
  { value: 'settings', label: 'Settings', Component: SettingsTab },
  { value: 'payment-run', label: 'Payment run', Component: PaymentRunTab },
  { value: 'tax', label: 'Tax', Component: TaxTab },
] as const;
type TabId = (typeof TABS)[number]['value'];

/** Top-level views in the panel header. Items shows for vendors only; Activity is a placeholder for now. */
const PAGES = [
  { value: 'details', label: 'Details' },
  { value: 'items', label: 'Items' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'activity', label: 'Activity' },
] as const;
type PageId = (typeof PAGES)[number]['value'];

/** Address problems point at the side column ('addresses'), which opens the address's side panel. */
type ProblemTab = TabId | 'addresses';
type Problem = ProblemBase<ProblemTab>;

/** The contact or address open in the side panel. */
type Editing =
  | { kind: 'contact'; value: ContactPerson; isNew: boolean }
  | { kind: 'address'; value: PartnerAddress; isNew: boolean }
  | { kind: 'payment'; value: PaymentEntry; isNew: boolean }
  | null;

/** Mandatory fields from the BP field mapping, checked on Add/Save. */
/** `chart` is undefined until the chart of accounts loads; account checks then only require a value. */
function validate(d: Draft, codeMode: 'auto' | 'manual', chart: Account[] | undefined): Problem[] {
  const { problems, need } = problemCollector<ProblemTab>();

  need(codeMode === 'auto' || d.code.trim(), 'header', 'code', 'Enter a code, or switch numbering to Auto.');
  need(d.name.trim(), 'header', 'name', 'Name is required.');
  need(d.bpGroupId, 'header', 'bpGroupId', 'Group is required.');
  need(d.currency, 'header', 'currency', 'Currency is required.');
  if (d.status === 'Advanced') {
    need(d.statusFrom, 'header', 'statusFrom', 'Pick a start date.');
    need(d.statusTo, 'header', 'statusTo', 'Pick an end date.');
    need(!d.statusFrom || !d.statusTo || d.statusFrom <= d.statusTo, 'header', 'statusTo', 'End date is before the start date.');
  }
  for (const ch of d.contactChannels) {
    need(ch.value.trim(), 'header', channelErrorKey(ch.id), `Enter the ${ch.label || ch.type} value, or remove it.`);
  }
  for (const a of d.addresses) {
    need(a.label.trim(), 'addresses', `address:${a.id}:label`, 'Every address needs an Address ID.');
    need(a.country, 'addresses', `address:${a.id}:country`, 'Every address needs a country.');
  }
  if (d.roles.includes('customer')) {
    need(d.customerPaymentTermId, 'settings', 'customerPaymentTermId', 'Customer payment terms are required.');
    const ar = chart ? accountProblem(d.receivableAccount, 'receivable', chart, true) : d.receivableAccount ? undefined : 'Pick an account.';
    need(!ar, 'settings', 'receivableAccount', ar === 'Pick an account.' ? 'Customers need an accounts receivable account.' : `Accounts receivable: ${ar}`);
  }
  if (d.roles.includes('vendor')) {
    need(d.vendorPaymentTermId, 'settings', 'vendorPaymentTermId', 'Vendor payment terms are required.');
    const ap = chart ? accountProblem(d.payableAccount, 'payable', chart, true) : d.payableAccount ? undefined : 'Pick an account.';
    need(!ap, 'settings', 'payableAccount', ap === 'Pick an account.' ? 'Vendors need an accounts payable account.' : `Accounts payable: ${ap}`);
  }
  for (const [key, role, label] of [
    ['downPaymentClearingAccount', 'downPaymentClearing', 'Down payment clearing account'],
    ['downPaymentInterimAccount', 'downPaymentInterim', 'Down payment interim account'],
  ] as const) {
    const problem = chart && accountProblem(d[key], role, chart);
    need(!problem, 'settings', key, `${label}: ${problem}`);
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
  const [page, setPage] = useState<PageId>('details');
  const [tab, setTab] = useState<TabId>('settings');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const chart = useAccounts();
  // Partners in the list this form was opened from, in the list's default order (by name), for previous/next.
  const [siblings, setSiblings] = useState<{ id: string }[]>([]);
  useEffect(() => {
    if (isNew) return;
    (scope === 'all' ? listPartners() : listPartnersByRole(scope)).then((all) =>
      setSiblings([...all].sort((a, b) => a.name.localeCompare(b.name))),
    );
  }, [scope, isNew]);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    getPartner(id).then((p) => !cancelled && setDraft(p ?? null));
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const config = scope === 'all' ? MASTER_CONFIG : ROLE_CONFIG[isNew ? (draft?.roles[0] ?? initialType) : scope];

  if (draft === undefined) return <Text tone="muted" className="p-4">Loading {config.singular.toLowerCase()}…</Text>;
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
  // Side-column fields: label beside the control.
  const beside = { orientation: 'responsive' as const };

  // A partner always keeps at least one role, and the role of the list it was opened from.
  const changeRoles = (picked: PartnerRole[]) => {
    const next = ROLE_ORDER.filter((r) => picked.includes(r) || r === scope);
    if (next.length === 0) return;
    const hadLead = draft.roles.includes('lead');
    update({
      roles: next,
      ...(!hadLead && next.includes('lead') && !draft.leadStage ? { leadStage: 'New' as const, leadSource: LEAD_SOURCES[0] } : {}),
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
    if (found.length) setPage('details');
    const first = found[0];
    if (first && first.tab !== 'header') openProblem(first.tab, found);
    return !found.length;
  };

  /** The defaults a record holds, or could take over, for its edit panel. A new record starts holding any that are free. */
  const role = (key: DefaultKey, label: string, id: string, isNew: boolean, nameOf: (id: string) => string | undefined): DefaultRole => {
    const current = draft[key];
    return { key, label, checked: isNew ? !current : current === id, holder: current && current !== id ? nameOf(current) : undefined };
  };
  /** Points each picked default at `id`; an unticked default this record held is cleared. `was` is its id before a change. */
  const pickDefaults = (picks: DefaultPicks, id: string, was = id): Partial<Draft> =>
    Object.fromEntries(
      (Object.keys(picks) as DefaultKey[]).map((k) => [k, picks[k] ? id : draft[k] === was ? '' : draft[k]]),
    );

  const applyContact = (c: ContactPerson, added: boolean, picks: DefaultPicks) => {
    update({
      contacts: added ? [...draft.contacts, c] : draft.contacts.map((x) => (x.id === c.id ? c : x)),
      ...pickDefaults(picks, c.id),
    });
    setEditing(null);
  };
  /** Adds or updates a payment method entry; `from` is the entry as it was, when editing. */
  const applyPayment = (entry: PaymentEntry, picks: DefaultPicks, from?: PaymentEntry) => {
    update({
      paymentMethods: saveEntry(draft, entry, !!picks.defaultAccount, from),
      ...pickDefaults({ defaultPaymentMethod: picks.defaultPaymentMethod }, entry.code, from?.code ?? entry.code),
    });
    setEditing(null);
  };
  const applyAddress = (a: PartnerAddress, added: boolean, picks: DefaultPicks) => {
    update({
      addresses: added ? [...draft.addresses, a] : draft.addresses.map((x) => (x.id === a.id ? a : x)),
      ...pickDefaults(picks, a.id),
    });
    setProblems(problems.filter((p) => !p.key.startsWith(`address:${a.id}:`)));
    setEditing(null);
  };

  const contactLabel = (id: string) => {
    const c = draft.contacts.find((x) => x.id === id);
    return c ? contactName(c) : undefined;
  };
  const addressLabel = (id: string) => draft.addresses.find((x) => x.id === id)?.label || undefined;

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

  const ActiveTab = TABS.find((t) => t.value === tab)!.Component;
  const at = siblings.findIndex((p) => p.id === draft.id);
  const prevId = at > 0 ? siblings[at - 1].id : undefined;
  const nextId = at >= 0 && at < siblings.length - 1 ? siblings[at + 1].id : undefined;

  return (
    <>
      <Form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
        <Panel className="min-h-0 flex-1">
          <PanelHeader
            type="details"
            icon={config.icon}
            title={isNew ? `New ${config.singular.toLowerCase()}` : draft.name}
            subcopy={isNew ? config.subcopy : draft.code}
            // A saved partner leads with previous/next (through the list it was opened from); a new one with the icon.
            leading={
              isNew ? undefined : (
                <>
                  <IconButton
                    type="button"
                    label="Next"
                    intent="default"
                    variant="solid"
                    size="extra-large"
                    disabled={!nextId}
                    onClick={() => navigate(`${config.basePath}/${nextId}`)}
                  >
                    {panelHeaderIcons.arrowDownward}
                  </IconButton>
                  <IconButton
                    type="button"
                    label="Previous"
                    intent="default"
                    variant="solid"
                    size="extra-large"
                    disabled={!prevId}
                    onClick={() => navigate(`${config.basePath}/${prevId}`)}
                  >
                    {panelHeaderIcons.arrowUpward}
                  </IconButton>
                </>
              )
            }
            tabs={
              <Tabs
                variant="outline"
                value={page}
                onValueChange={(v) => setPage(v as PageId)}
                // A partner has no items, transactions or activity until it's added; Items is for vendors.
                items={PAGES.filter((p) => p.value !== 'items' || draft.roles.includes('vendor')).map((p) => ({
                  ...p,
                  disabled: isNew && p.value !== 'details',
                }))}
              />
            }
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
          {page !== 'details' ? (
            <Panel.Body className={page === 'items' ? 'flex flex-col' : undefined}>
              {page === 'items' ? (
                <VendorItemsTab draft={draft} />
              ) : page === 'transactions' ? (
                <TransactionsTab draft={draft} />
              ) : (
                <Text variant="small" tone="muted" className="p-4">Activity will show here.</Text>
              )}
            </Panel.Body>
          ) : (
            /* Side by side (lg), each column scrolls on its own; stacked, the body scrolls as one. */
            <Panel.Body className="flex flex-col gap-2 lg:overflow-hidden!">
              <ProblemsAlert
                problems={problems}
                tabLabel={(t) => (t === 'addresses' ? 'Addresses' : TABS.find((x) => x.value === t)?.label)}
                onOpenTab={(t) => openProblem(t)}
              />

              <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-1">
                <aside className="flex flex-col gap-2 lg:col-span-3 lg:min-h-0 lg:overflow-y-auto">
                  <Section icon="badge" title="Business partner">
                    <FieldStack>
                      {isNew ? (
                        <FormField orientation="responsive" label="Numbering" tooltip="Auto assigns the next BP code.">
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
                      <FormField orientation="responsive" label="Code" required error={errors.code} tooltip={isNew ? undefined : 'Locked after the partner is added.'}>
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
                      <FormField
                        orientation="responsive"
                        label="Type"
                        tooltip="A partner can be a lead, a customer and a vendor at once. It shows in each matching list, and edits here show everywhere."
                      >
                        {(p) => (
                          <MultiSelect
                            {...p}
                            options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_CONFIG[r].singular }))}
                            value={draft.roles}
                            onValueChange={(v) => changeRoles(v as PartnerRole[])}
                          />
                        )}
                      </FormField>
                      {h.text('name', 'Name', { ...beside, placeholder: 'e.g. Acme Trading Corp.', required: true, error: errors.name })}
                      {h.text('foreignName', 'Foreign name', { ...beside, placeholder: 'Name in another language', hint: 'For bilingual printouts.' })}
                      {h.master('bpGroupId', 'Group', bpGroupDef, {
                        ...beside,
                        required: true,
                        error: errors.bpGroupId,
                        where: (g) => draft.roles.includes(g.role),
                        seed: { role: draft.roles.find((r) => r !== 'lead') ?? draft.roles[0] },
                      })}
                      {h.master('currency', 'Currency', currencyDef, {
                        ...beside,
                        required: true,
                        error: errors.currency,
                        extra: ['All currencies'],
                      })}
                      {h.text('tin', 'TIN', { ...beside, placeholder: '000-000-000-000', hint: 'BIR Taxpayer Identification Number.' })}
                      {h.text('birCorNumber', 'BIR COR no.', { ...beside, placeholder: '000-000-000-000', hint: 'BIR Certificate of Registration (Form 2303).' })}
                      {h.lookup('rdoCode', 'BIR RDO', RDOS, { ...beside, clearable: true, hint: 'Revenue District Office where the partner is registered.' })}
                      {h.choose('status', 'Status', PARTNER_STATUSES.map((s) => ({ value: s, label: s })), {
                        ...beside,
                        hint: 'Advanced: active only between the dates you set.',
                      })}
                      {draft.status === 'Advanced' ? (
                        <>
                          {h.date('statusFrom', 'Active from', { ...beside, required: true, error: errors.statusFrom })}
                          {h.date('statusTo', 'Active to', { ...beside, required: true, error: errors.statusTo })}
                        </>
                      ) : null}
                      {h.text('statusRemarks', 'Status remarks', { ...beside, placeholder: 'Why the status changed' })}
                      {/* Free text: label above, so the box gets the column's full width. */}
                      {h.area('generalRemarks', 'Remarks', { placeholder: 'Add a note about this partner', rows: 1 })}
                      {h.area('remarks', 'Internal remarks', {
                        placeholder: 'Add internal notes',
                        rows: 1,
                        hint: 'Not printed on documents sent to the partner.',
                      })}
                    </FieldStack>
                  </Section>
                  <ContactChannelsFields draft={draft} update={update} errors={errors} />
                  <ContactsCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'contact', value, isNew: added })} />
                  <AddressesCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'address', value, isNew: added })} />
                  <PaymentMethodsCards draft={draft} update={update} onOpen={(value, added) => setEditing({ kind: 'payment', value, isNew: added })} />
                  <AttachmentsCards draft={draft} update={update} />
                </aside>

                <div className="flex min-w-0 flex-col gap-2 lg:col-span-9 lg:min-h-0 lg:overflow-y-auto">

                  <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as TabId)}
                    items={TABS.map((t) => ({
                      value: t.value,
                      label: t.label,
                      badge: problems.some((p) => p.tab === t.value) ? '!' : undefined,
                    }))}
                  />
                  <ActiveTab draft={draft} update={update} errors={errors} />
                </div>
              </div>
            </Panel.Body>
          )}
        </Panel>
      </Form>

      {/* Outside the <Form>, so Enter in a panel field doesn't save the partner. */}
      {editing?.kind === 'contact' ? (
        <ContactPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          defaults={[role('defaultContactId', 'Default contact person', editing.value.id, editing.isNew, contactLabel)]}
          onDone={(c, picks) => applyContact(c, editing.isNew, picks)}
          onCancel={() => setEditing(null)}
        />
      ) : editing?.kind === 'address' ? (
        <AddressPanel
          key={editing.value.id}
          value={editing.value}
          isNew={editing.isNew}
          errors={errors}
          defaults={[
            role('defaultBillToId', 'Default bill-to (mailing) address', editing.value.id, editing.isNew, addressLabel),
            role('defaultShipToId', 'Default ship-to address', editing.value.id, editing.isNew, addressLabel),
          ]}
          onDone={(a, picks) => applyAddress(a, editing.isNew, picks)}
          onCancel={() => setEditing(null)}
        />
      ) : editing?.kind === 'payment' ? (
        <PaymentEntryPanel
          key={editing.value.account?.id ?? (editing.value.code || 'new')}
          value={editing.value}
          isNew={editing.isNew}
          // Methods with accounts stay pickable: each pick adds another account.
          taken={includedMethods(draft)
            .map((m) => m.code)
            .filter((c) => !accountKind(c) && (editing.isNew || c !== editing.value.code))}
          defaultsFor={(code) => {
            const r = role('defaultPaymentMethod', 'Default payment method', code, !includedMethods(draft).some((m) => m.code === code), methodTitle);
            // Swapping the default method for another carries the default over.
            const swappingDefault = !editing.isNew && code !== editing.value.code && draft.defaultPaymentMethod === editing.value.code;
            return [swappingDefault ? { ...r, checked: true, holder: undefined } : r];
          }}
          accountsFor={(code) => accountsOf(draft, code)}
          newAccount={(code) => newAccountFor(code, draft)}
          onDone={(entry, picks) => applyPayment(entry, picks, editing.isNew ? undefined : editing.value)}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
