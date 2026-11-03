import { FieldOrientationCtx, Form, Section } from '../../../../components/form/fields';
import { SeriesNoFields } from '../../../../components/form/SeriesNoFields';
import { lcSeries } from '../../../../services/allSeries';
import { lcNumber } from '../../../../services/landedCosts';
import type { LcSectionProps } from './types';

/** Series + number, on draft only. Once added, the number and status live in the page header. */
export function LcDocumentCard({ draft, update, readOnly }: LcSectionProps) {
  if (readOnly) return null;
  return (
    <Section icon="tag" title="Document">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          <SeriesNoFields
            series={[...lcSeries.snapshot()]}
            seriesId={draft.seriesId}
            docNum={draft.docNum}
            number={lcNumber(draft)}
            noun="Landed cost"
            onSeries={(seriesId) => update({ seriesId, docNum: 0 })}
            onNumber={(docNum) => update({ docNum })}
          />
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
