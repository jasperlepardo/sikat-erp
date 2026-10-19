import { CardField, Checkbox, Icon, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import type { Employee } from '../../../../mocks/employees';
import { employeeName } from '../../../../services/employees';
import { nameIn } from '../../../../services/partnerMasters';
import { branches, departments } from '../../../../services/peopleMasters';
import type { PrSectionProps } from './types';

const option = (e: Employee): CardFieldOption => ({
  value: e.id,
  label: employeeName(e),
  icon: <Icon size={16}>badge</Icon>,
  fields: [
    { label: 'Code', value: e.code },
    ...(e.jobTitle ? [{ label: 'Job title', value: e.jobTitle }] : []),
    ...(e.email ? [{ label: 'Email', value: e.email }] : []),
  ],
  href: `#/people/employees/${e.id}`,
});

export function PrRequesterCard({ draft, update, errors, m, ctx }: PrSectionProps) {
  const h = bind(draft, update);

  // Branch and department describe who asked, so they come from the requester. They're
  // stamped on the request, so a later move to another department doesn't rewrite it.
  const pickRequester = (id: string) => {
    const emp = m.employees.find((e) => e.id === id);
    update({
      requesterId: id,
      requesterName: emp ? employeeName(emp) : '',
      branchId: emp?.branchId ?? '',
      departmentId: emp?.departmentId ?? '',
    });
  };

  return (
    <Section icon="person" title="Requester">
      <Fields>
        <div className="md:col-span-2">
          <CardField
            label="Requester"
            required
            placeholder="Search employees"
            options={m.employees.filter((e) => e.active || e.id === draft.requesterId).map(option)}
            value={draft.requesterId}
            onValueChange={pickRequester}
            readOnly={ctx.copied}
          />
          {errors.requesterId && <Text variant="small" tone="danger">{errors.requesterId}</Text>}
          {ctx.copied && !ctx.readOnly ? <Text variant="small" tone="muted">Locked: lines were already copied to an RFQ or PO.</Text> : null}
        </div>
        <ReadOnly label="Branch" value={draft.branchId ? nameIn(branches, draft.branchId) : '—'} hint="The requester's branch." />
        <ReadOnly label="Department" value={draft.departmentId ? nameIn(departments, draft.departmentId) : '—'} hint="The requester's department. Charge costs to another department on the lines." />
        <Flags>
          <Checkbox
            checked={draft.notifyOnPo}
            onChange={(e) => {
              const notifyOnPo = e.currentTarget.checked;
              const email = m.employees.find((x) => x.id === draft.requesterId)?.email ?? '';
              update({ notifyOnPo, ...(notifyOnPo && !draft.notifyEmail ? { notifyEmail: email } : {}) });
            }}
          >
            Send e-mail when PO or goods receipt is added
          </Checkbox>
        </Flags>
        {draft.notifyOnPo ? h.text('notifyEmail', 'Email address', { hint: "Notification email. Defaults to the requester's email." }) : null}
      </Fields>
    </Section>
  );
}
