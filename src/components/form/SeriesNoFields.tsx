import { Select, TextField } from '@jasperlepardo/sikat-design-system';
import { CtxFormField } from './fields';
import { activeOptions } from '../../services/inventoryMasters';
import { seriesPattern } from '../../services/allSeries';
import type { DocumentSeries } from '../../mocks/common';

interface SeriesNoFieldsProps {
  /** The document's numbering series (a collection snapshot, or the seed array). */
  series: DocumentSeries[];
  seriesId: string;
  docNum: number;
  /** The formatted document number, shown once the series has assigned it (docNum > 0). */
  number: string;
  /** Noun for the manual-entry placeholder, e.g. "PO" → "PO number". */
  noun: string;
  error?: string;
  /** Locks both fields — rendered as disabled inputs. */
  readOnly?: boolean;
  onSeries: (seriesId: string) => void;
  onNumber: (docNum: number) => void;
}

/**
 * The document's numbering as two fields: a **Series** picker and a **No.** The No. is a typed input
 * for a manual series, otherwise a disabled field ("Next number" until the series assigns it on add).
 * Locked fields render **disabled** (greyed), not as flat read-only values.
 */
export function SeriesNoFields({ series, seriesId, docNum, number, noun, error, readOnly, onSeries, onNumber }: SeriesNoFieldsProps) {
  const current = series.find((s) => s.id === seriesId);
  const manual = current?.manual ?? false;
  const pattern = current ? seriesPattern(current) : 'Next number';
  return (
    <>
      <CtxFormField label="Series" tooltip="The numbering series this document draws from.">
        {() => (
          <Select
            aria-label="Series"
            disabled={readOnly}
            options={activeOptions(series, (s) => s.id, (s) => s.name, seriesId)}
            value={seriesId}
            onValueChange={onSeries}
          />
        )}
      </CtxFormField>
      {manual ? (
        <CtxFormField label="No." required error={error} tooltip="Manual series: type the number.">
          {(p) => (
            <TextField {...p} type="number" placeholder={`${noun} number`} value={docNum ? String(docNum) : ''} onChange={(e) => onNumber(Number(e.currentTarget.value))} disabled={readOnly} />
          )}
        </CtxFormField>
      ) : (
        <CtxFormField label="No." tooltip={`Follows the ${pattern} pattern; assigned from the series when the document is added.`}>
          {(p) => <TextField {...p} placeholder={pattern} value={docNum ? number : ''} disabled />}
        </CtxFormField>
      )}
    </>
  );
}
