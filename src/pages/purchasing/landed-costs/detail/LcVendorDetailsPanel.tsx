import { useNavigate } from 'react-router';
import { Combobox, FormField, Icon, IconButton, Panel, PanelHeader, Select, SidePanel, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../../components/form/fields';
import type { Partner } from '../../../../mocks/partners';
import type { LcSectionProps } from './types';

interface LcVendorDetailsPanelProps extends LcSectionProps {
  vendor: Partner | undefined;
  open: boolean;
  onClose: () => void;
}

/** The vendor side panel on a landed cost: broker, currency, shipping reference and customs file no. */
export function LcVendorDetailsPanel({ draft, update, m, readOnly, vendor, open, onClose }: LcVendorDetailsPanelProps) {
  const navigate = useNavigate();
  const broker = m.vendors.find((v) => v.id === draft.brokerId);

  if (!open || !vendor) return null;

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="storefront"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={vendor.name}
        actions={
          <>
            <IconButton type="button" intent="default" variant="link" label={`Open vendor ${vendor.code}`} onClick={() => navigate(`/purchasing/vendors/${vendor.id}`)}>
              <Icon size={20}>open_in_new</Icon>
            </IconButton>
            <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
          </>
        }
      />
      <Panel.Body>
        <fieldset disabled={readOnly} className="contents">
          <Section icon="local_shipping" title="Shipping & customs">
            <Fields cols={1}>
              {broker && readOnly ? (
                <ReadOnly label="Broker" value={draft.brokerName} description={draft.brokerCode} />
              ) : (
                <FormField label="Broker">
                  {(p) => (
                    <Combobox
                      {...p}
                      placeholder="Search brokers / forwarding agents"
                      options={[{ value: '', label: 'None', text: '' }, ...m.vendors
                        .filter((v) => v.status !== 'Inactive' || v.id === draft.brokerId)
                        .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))]}
                      value={draft.brokerId || null}
                      onValueChange={(id) => {
                        const b = m.vendors.find((v) => v.id === id);
                        update({ brokerId: id ?? '', brokerCode: b?.code ?? '', brokerName: b?.name ?? '' });
                      }}
                    />
                  )}
                </FormField>
              )}
              <FormField label="Currency">
                {(p) => (
                  <Select
                    {...p}
                    disabled={readOnly}
                    options={[{ value: 'PHP', label: 'PHP — Philippine Peso' }]}
                    value={draft.currency}
                    onValueChange={(currency) => update({ currency })}
                  />
                )}
              </FormField>
              <FormField label="Reference">
                {(p) => <TextField {...p} value={draft.reference} disabled={readOnly} onChange={(e) => update({ reference: e.currentTarget.value })} />}
              </FormField>
              <FormField label="File no.">
                {(p) => <TextField {...p} value={draft.fileNo} disabled={readOnly} onChange={(e) => update({ fileNo: e.currentTarget.value })} />}
              </FormField>
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
