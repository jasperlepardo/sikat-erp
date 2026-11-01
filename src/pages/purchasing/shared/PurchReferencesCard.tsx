import type { ReactNode } from 'react';
import { FieldOrientationCtx, Form, ReadOnly, Section, bind, type KeysOf } from '../../../components/form/fields';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { projectDef } from '../../settings/masterDefs';
import type { Partner } from '../../../mocks/partners';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

/**
 * Reference fields shared by the posting purchasing documents (goods receipt, goods return, A/P
 * invoice, A/P reserve invoice, debit memo, down-payment request): the editable BP project and BIR
 * indicator, plus the vendor's TIN and the source order number (read-only). Lives in the aside,
 * mirroring the PO's `PoReferencesCard`; the Journal entry card keeps only the control account,
 * consolidating BP and remark.
 */
export function PurchReferencesCard<D extends { projectId: string; indicator: string; orderNumber: string }>({
  draft,
  update,
  ctx,
  projectHint,
  orderNumberHint,
}: {
  draft: D;
  update: (patch: Partial<D>) => void;
  ctx: { vendor?: Partner; readOnly: boolean };
  projectHint?: ReactNode;
  orderNumberHint?: ReactNode;
}) {
  const f = bind(draft, update);
  return (
    <Section icon="bookmark" title="References">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.master('projectId' as KeysOf<D, string>, 'BP project', projectDef, { clearable: true, hint: projectHint, readOnly: ctx.readOnly })}
          {f.choose('indicator' as KeysOf<D, string>, 'Indicator', asOptions(INDICATORS), { clearable: true, readOnly: ctx.readOnly })}
          <ReadOnly
            label="Federal tax ID"
            value={ctx.vendor?.tin || <span className="text-muted">{ctx.vendor ? 'Not on the vendor record' : '—'}</span>}
            hint="The vendor's TIN, from its business partner record."
          />
          <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint={orderNumberHint} />
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
