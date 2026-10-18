import { Checkbox, FormField, Select } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import { BRANCHES } from '../../../../mocks/purchaseRequests';
import { DEPARTMENTS } from '../../../../mocks/purchaseOrders';
import type { PrSectionProps } from './types';

export function PrRequesterCard({ draft, update, errors, m }: PrSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="person" title="Requester">
      <FieldStack>
        <FormField label="Requester" required error={errors.requesterId}>
          {(p) => (
            <Select
              {...p}
              options={[
                { value: '', label: '— None —' },
                ...m.employees.filter((e) => e.active || e.id === draft.requesterId).map((e) => ({ value: e.id, label: e.name })),
              ]}
              value={draft.requesterId}
              onValueChange={(id) => {
                const emp = m.employees.find((e) => e.id === id);
                update({ requesterId: id ?? '', requesterName: emp?.name ?? '' });
              }}
            />
          )}
        </FormField>
        {h.text('requesterName', 'Requester name', { readOnly: true, hint: 'Auto-filled from the requester selection.' })}
        <FormField label="Branch" required>
          {(p) => (
            <Select {...p} options={BRANCHES.map((b) => ({ value: b, label: b }))} value={draft.branch} onValueChange={(v) => v && update({ branch: v })} />
          )}
        </FormField>
        <FormField label="Department">
          {(p) => (
            <Select {...p} options={[{ value: '', label: '— None —' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]} value={draft.department} onValueChange={(v) => update({ department: v ?? '' })} />
          )}
        </FormField>
        <Flags>
          <Checkbox checked={draft.notifyOnPo} onChange={(e) => update({ notifyOnPo: e.currentTarget.checked })}>
            Send e-mail when PO or goods receipt is added
          </Checkbox>
        </Flags>
        {draft.notifyOnPo ? h.text('notifyEmail', 'Email address', { hint: "Notification email. Defaults to the requester's email." }) : null}
      </FieldStack>
    </Section>
  );
}
