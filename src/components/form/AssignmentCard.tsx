import { type ReactNode } from 'react';
import { FieldOrientationCtx, FieldStack, Flags, Form, Section, bind, type KeysOf } from './fields';
import { salesEmployeeDef } from '../../pages/settings/masterDefs';

interface PersonField {
  /** The draft field, e.g. 'salesEmployeeId' (sales) or 'buyerId' (purchasing). */
  key: string;
  label: string;
  clearable?: boolean;
  placeholder?: string;
  hint?: ReactNode;
}

interface AssignmentCardProps<T> {
  draft: T;
  update: (patch: Partial<T>) => void;
  /** Locks the person pickers and payment flags — remarks stays editable (the remarks-only save). */
  readOnly?: boolean;
  /** The sales employee / buyer picker. Omit where there is none (purchase request). */
  person?: PersonField;
  ownerHint?: ReactNode;
  remarksHint?: ReactNode;
  /** Renders Payment block + Payment order run — the A/P payables. */
  paymentFlags?: boolean;
}

/**
 * The shared document "Assignment" card: a person (sales employee or buyer), the owner, remarks, and —
 * for A/P payables — the payment flags. One definition for every document; see `docs/*` / the per-doc
 * detail pages that render it. Remarks is always editable (never locked).
 */
export function AssignmentCard<T>({ draft, update, readOnly, person, ownerHint, remarksHint, paymentFlags }: AssignmentCardProps<T>) {
  const h = bind(draft, update);
  return (
    <Section icon="person_search" title="Assignment">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {person
            ? h.master(person.key as KeysOf<T, string>, person.label, salesEmployeeDef, { clearable: person.clearable, placeholder: person.placeholder, hint: person.hint, readOnly })
            : null}
          {h.master('ownerId' as KeysOf<T, string>, 'Owner', salesEmployeeDef, { hint: ownerHint ?? 'Owns the document (data access).', readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
      {paymentFlags ? (
        <Flags>
          {h.check('paymentBlock' as KeysOf<T, boolean>, 'Payment block (keep out of payment runs)', { readOnly })}
          {h.check('paymentOrderRun' as KeysOf<T, boolean>, 'Include in payment runs (Payment Order Ref.)', { readOnly })}
        </Flags>
      ) : null}
      <FieldStack>
        {h.area('remarks' as KeysOf<T, string>, 'Remarks', { rows: 3, hint: remarksHint })}
      </FieldStack>
    </Section>
  );
}
