import { useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  Form,
  FormField,
  Icon,
  Panel,
  PanelHeader,
  SidePanel,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { blankPartner, type Partner } from '../../../../mocks/partners';
import { savePartner } from '../../../../services/partners';
import { Fields } from '../../../../components/form/fields';
import { type Draft } from '../../../partners/detail/fields';
import { SettingsTab } from '../../../partners/detail/SettingsTab';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { bpGroupDef, currencyDef } from '../../../settings/masterDefs';

interface Props {
  initialName?: string;
  onClose: () => void;
  onCreated: (vendor: Partner) => void;
}

export function VendorQuickCreate({ initialName = '', onClose, onCreated }: Props) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...blankPartner('vendor'), name: initialName }));
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
                <Text variant="small" tone="muted">
                  Add contacts after saving the vendor.
                </Text>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header icon={<Icon size={24}>location_on</Icon>}>Billing address</Card.Header>
              <Card.Content>
                <Text variant="small" tone="muted">
                  Add addresses after saving the vendor.
                </Text>
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
                  <FormField label="Code" disabled tooltip="Assigned on save.">
                    {(p) => <TextField {...p} value="" placeholder="Assigned on save" />}
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
                  <FormField label="Group" required error={errors.group} tooltip="Vendor groups from Settings › Sales & CRM.">
                    {(p) => (
                      <MasterLookup
                        def={bpGroupDef}
                        fieldProps={p}
                        where={(g) => g.role === 'vendor'}
                        seed={{ role: 'vendor' }}
                        placeholder="Search…"
                        value={draft.group}
                        onChange={(v) => { setErrors((prev) => ({ ...prev, group: '' })); update({ group: v }); }}
                      />
                    )}
                  </FormField>
                  <FormField label="Currency" required error={errors.currency} tooltip="Active currencies from Settings › Accounting & Tax.">
                    {(p) => (
                      <MasterLookup
                        def={currencyDef}
                        fieldProps={p}
                        extra={['All currencies']}
                        placeholder="Search…"
                        value={draft.currency}
                        onChange={(v) => { setErrors((prev) => ({ ...prev, currency: '' })); update({ currency: v }); }}
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

            <SettingsTab draft={draft} update={update} errors={errors} />
          </Panel.Main>
        </Panel.Body>
      </Form>
    </SidePanel>
  );
}
