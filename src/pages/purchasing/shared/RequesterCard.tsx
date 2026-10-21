import type { ReactNode } from 'react';
import { Avatar, CardField, Link, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section } from '../../../components/form/fields';
import type { Employee } from '../../../mocks/employees';
import { employeeName } from '../../../services/employees';
import { initialsOf } from '../../../services/format';

interface RequesterCardProps {
  employees: Employee[];
  requesterId: string;
  /** The picked employee, when found; their name becomes the link that opens the details panel. */
  requester: Employee | undefined;
  /** The whole card is read-only (document closed/cancelled). */
  readOnly: boolean;
  /** Force the picker locked (e.g. lines already copied to an RFQ or PO). */
  locked?: boolean;
  error?: string;
  hint?: string;
  tooltip?: ReactNode;
  pickRequester: (id: string | null) => void;
  onOpenDetails: () => void;
}

/** A document's requester: picked as a card; the selected name links to the requester details side panel. */
export function RequesterCard({ employees, requesterId, readOnly, locked = false, error, hint, tooltip, pickRequester, onOpenDetails }: RequesterCardProps) {
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="person" title="Requester">
        <Fields>
          <div className="md:col-span-2">
            <CardField
              aria-label="Requester"
              required
              placeholder="Search employees"
              tooltip={tooltip}
              hint={hint}
              options={employees
                .filter((e) => e.active || e.id === requesterId)
                .map((e): CardFieldOption => {
                  const detail = [e.code, e.jobTitle, e.email].filter(Boolean).join(' · ');
                  return {
                    value: e.id,
                    label: employeeName(e),
                    // First then last, whatever the display order ("Cruz, Juan" is still JC).
                    icon: <Avatar initials={initialsOf(`${e.firstName} ${e.lastName}`)} icon="person" size={36} />,
                    // The title opens the requester details side panel; in dropdown rows it flattens to plain text.
                    texts: [
                      { variant: 'small' as const, children: <Link onClick={(ev) => { ev.stopPropagation(); onOpenDetails(); }}>{employeeName(e)}</Link> },
                      ...(detail ? [{ variant: 'caption' as const, children: detail }] : []),
                    ],
                  };
                })}
              value={requesterId}
              onValueChange={(id) => pickRequester(id || null)}
              readOnly={locked}
            />
            {error && <Text variant="small" tone="danger">{error}</Text>}
          </div>
        </Fields>
      </Section>
    </fieldset>
  );
}
