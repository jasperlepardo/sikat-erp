import { Combobox } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldOrientationCtx, Form, ReadOnly, Section, bind } from '../../../../components/form/fields';
import type { LcSectionProps } from './types';

export function LcGeneralCard({ draft, update, m, readOnly }: LcSectionProps) {
  const h = bind(draft, update);

  return (
    <Section icon="info" title="General">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          <CtxFormField label="Broker" tooltip="Customs broker or freight forwarder handling clearance.">
            {(p) => (
              <Combobox
                {...p}
                placeholder="None"
                options={m.vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
                value={draft.brokerId || null}
                onValueChange={(brokerId) => {
                  const v = m.vendors.find((x) => x.id === brokerId);
                  update({ brokerId: brokerId ?? '', brokerCode: v?.code ?? '', brokerName: v?.name ?? '' });
                }}
              />
            )}
          </CtxFormField>
          {h.text('reference', 'Reference', { hint: 'External shipment or broker reference.', readOnly: readOnly })}
          {h.text('fileNo', 'File no.', { hint: 'Internal tracking reference.', readOnly: readOnly })}
          {draft.transactionId ? (
            <ReadOnly label="Transaction no." value={draft.transactionId} />
          ) : null}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
