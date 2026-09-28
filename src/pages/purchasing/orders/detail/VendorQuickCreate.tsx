import { useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  Form,
  FormField,
  Icon,
  Panel,
  PanelHeader,
  Select,
  SidePanel,
  Tabs,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { type Currency } from '../../../../mocks/currencies';
import { BP_GROUPS } from '../../../../mocks/masters';
import { blankPartner, type Partner } from '../../../../mocks/partners';
import { savePartner } from '../../../../services/partners';
import { Fields } from '../../../../components/form/fields';
import { type Draft } from '../../../partners/detail/fields';
import { AccountingTab } from '../../../partners/detail/AccountingTab';
import { GeneralTab } from '../../../partners/detail/GeneralTab';
import { PaymentTermsTab } from '../../../partners/detail/PaymentTermsTab';

type TabId = 'general' | 'payment-terms' | 'accounting';

const TABS: { value: TabId; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'payment-terms', label: 'Payment terms' },
  { value: 'accounting', label: 'Accounting' },
];

interface Props {
  currencies: Currency[];
  initialName?: string;
  onClose: () => void;
  onCreated: (vendor: Partner) => void;
}

export function VendorQuickCreate({ currencies, initialName = '', onClose, onCreated }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...blankPartner('vendor'), name: initialName }));
  const [tab, setTab] = useState<TabId>('general');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = 'Name is required.';
    if (!draft.group) found.group = 'Group is required.';
    if (!draft.currency) found.currency = 'Currency is required.';
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setSaving(true);
    try {
      const saved = await savePartner({ ...draft, code: '' });
      onCreated(saved);
    } catch (err) {
      setErrors({ name: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const vendorGroups = BP_GROUPS.filter((g) => g.role === 'vendor').map((g) => g.value);
  const activeCurrencies = [
    ...new Set([...currencies.filter((c) => c.active).map((c) => c.code), 'All currencies', draft.currency]),
  ];

  return (
    <SidePanel
      overlay
      onOverlayClick={onClose}
      style={{ '--sikat-side-panel-width': '900px' } as React.CSSProperties}
    >
      <Form className="flex flex-col flex-1 min-h-0" onSubmit={submit} noValidate>
        <PanelHeader
          type="forms"
          icon="local_shipping"
          title="New vendor"
          subcopy="Fill in the details — you can add contacts and addresses after saving."
          actions={
            <>
              <Button type="button" intent="default" variant="solid" size="extra-large" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" intent="primary" variant="solid" size="extra-large" disabled={saving}>
                {saving ? 'Saving…' : 'Add vendor'}
              </Button>
            </>
          }
        />
        <Panel.Body columns>
          <Panel.Sidebar>
            <Panel.Summary
              icon="local_shipping"
              iconVariant="outline"
              iconSize={40}
              name={draft.name || 'New vendor'}
              code="Assigned on save"
            />
            <Card>
              <Card.Header icon={<Icon size={24}>contacts</Icon>}>Contact persons</Card.Header>
              <Card.Content>
                <p className="text-sm" style={{ color: 'var(--color-text-caption)' }}>
                  Add contacts after saving the vendor.
                </p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header icon={<Icon size={24}>location_on</Icon>}>Billing address</Card.Header>
              <Card.Content>
                <p className="text-sm" style={{ color: 'var(--color-text-caption)' }}>
                  Add addresses after saving the vendor.
                </p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header icon={<Icon size={24}>notes</Icon>}>Remarks</Card.Header>
              <Card.Content>
                <TextField
                  aria-label="General remarks"
                  placeholder="General remarks…"
                  value={draft.generalRemarks}
                  onChange={(e) => update({ generalRemarks: e.currentTarget.value })}
                />
              </Card.Content>
            </Card>
          </Panel.Sidebar>

          <Panel.Main>
            <Card>
              <Card.Header icon={<Icon size={24}>badge</Icon>}>Business partner</Card.Header>
              <Card.Content>
                <Fields cols={3}>
                  <FormField label="Code" tooltip="Assigned on save.">
                    {(p) => <TextField {...p} value="" placeholder="Assigned on save" readOnly />}
                  </FormField>
                  <FormField label="Name" required error={errors.name}>
                    {(p) => (
                      <TextField
                        {...p}
                        value={draft.name}
                        autoFocus
                        onChange={(e) => {
                          setErrors((prev) => ({ ...prev, name: '' }));
                          update({ name: e.currentTarget.value });
                        }}
                      />
                    )}
                  </FormField>
                  <FormField label="Foreign name" tooltip="For bilingual printouts.">
                    {(p) => (
                      <TextField
                        {...p}
                        value={draft.foreignName}
                        onChange={(e) => update({ foreignName: e.currentTarget.value })}
                      />
                    )}
                  </FormField>
                  <FormField label="Group" required error={errors.group}>
                    {(p) => (
                      <Select
                        {...p}
                        options={vendorGroups.map((g) => ({ value: g, label: g }))}
                        value={draft.group}
                        onValueChange={(v) => { setErrors((prev) => ({ ...prev, group: '' })); update({ group: v }); }}
                      />
                    )}
                  </FormField>
                  <FormField label="Currency" required error={errors.currency} tooltip="Active currencies from Settings › Accounting & Tax.">
                    {(p) => (
                      <Select
                        {...p}
                        options={activeCurrencies.map((c) => ({ value: c, label: c }))}
                        value={draft.currency}
                        onValueChange={(v) => { setErrors((prev) => ({ ...prev, currency: '' })); update({ currency: v }); }}
                      />
                    )}
                  </FormField>
                  <FormField label="TIN" tooltip="BIR Taxpayer Identification Number.">
                    {(p) => (
                      <TextField
                        {...p}
                        value={draft.tin}
                        placeholder="000-000-000-000"
                        onChange={(e) => update({ tin: e.currentTarget.value })}
                      />
                    )}
                  </FormField>
                </Fields>
              </Card.Content>
            </Card>

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as TabId)}
              items={TABS}
            />

            {tab === 'general' && (
              <GeneralTab draft={draft} update={update} errors={errors} lockedRole="vendor" />
            )}
            {tab === 'payment-terms' && (
              <PaymentTermsTab draft={draft} update={update} errors={errors} />
            )}
            {tab === 'accounting' && (
              <AccountingTab draft={draft} update={update} errors={errors} />
            )}
          </Panel.Main>
        </Panel.Body>
      </Form>
    </SidePanel>
  );
}
