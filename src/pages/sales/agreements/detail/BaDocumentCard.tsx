import { FieldOrientationCtx, Form, Section } from '../../../../components/form/fields';
import { SeriesNoFields } from '../../../../components/form/SeriesNoFields';
import { baNumber } from '../../../../services/blanketAgreements';
import { type BlanketAgreement } from '../../../../mocks/blanketAgreements';
import type { BaDraft, BaMasters } from './types';

interface Props {
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  m: BaMasters;
  added: boolean;
}

/** Series + number, on draft only. Once added, the number and status live in the page header. */
export function BaDocumentCard({ draft, update, m, added }: Props) {
  if (added) return null;
  return (
    <Section icon="tag" title="Document">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          <SeriesNoFields
            series={[...m.baSeries]}
            seriesId={draft.seriesId}
            docNum={draft.docNum}
            number={baNumber(draft as BlanketAgreement)}
            noun="Agreement"
            onSeries={(seriesId) => update({ seriesId, docNum: 0 })}
            onNumber={(docNum) => update({ docNum })}
          />
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
