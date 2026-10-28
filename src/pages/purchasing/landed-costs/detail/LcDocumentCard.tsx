import { Combobox, Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, Section, SideFields, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { LC_SERIES, LC_STATUSES, type LcStatus } from '../../../../mocks/landedCosts';
import { lcNumber } from '../../../../services/landedCosts';
import { LC_STATUS_HINT } from './types';
import type { LcSectionProps } from './types';
import { LC_STATUS_INTENT } from '../../paths';

interface LcDocumentCardProps extends LcSectionProps {
  statusMoves: Partial<Record<LcStatus, () => void>>;
}

export function LcDocumentCard({ draft, update, errors, m, statusMoves, readOnly }: LcDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <Section icon="tag" title="Document">
      <SideFields>
        <CtxFormField label="No.">
          {() => (
            <div className="flex gap-1">
              <Select
                aria-label="Series"
                className="w-40"
                disabled={readOnly}
                options={LC_SERIES.map((s) => ({ value: s.id, label: s.name }))}
                value={draft.seriesId}
                onValueChange={(seriesId) => update({ seriesId })}
              />
              <span className="flex-1 self-center text-sm">
                {draft.docNum ? lcNumber(draft) : <span className="text-placeholder">Next number</span>}
              </span>
            </div>
          )}
        </CtxFormField>
        <StatusField
          statuses={LC_STATUSES}
          intents={LC_STATUS_INTENT}
          value={draft.status}
          moves={statusMoves}
          hint={LC_STATUS_HINT[draft.status]}
          error={errors.status}
        />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, disabled: readOnly })}
        {h.date('dueDate', 'Due date', { disabled: readOnly })}
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
        {h.text('reference', 'Reference', { hint: 'External shipment or broker reference.', disabled: readOnly })}
        {h.text('fileNo', 'File no.', { hint: 'Internal tracking reference.', disabled: readOnly })}
      </SideFields>
    </Section>
  );
}
