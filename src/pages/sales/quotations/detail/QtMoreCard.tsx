import { FieldOrientationCtx, Form, Flags, Section, bind } from '../../../../components/form/fields';
import type { QtTabProps } from './types';

const SUMMARY_TYPES = ['No Summary', 'By Items', 'By Document'].map((v) => ({ value: v, label: v }));
const QR_SOURCES = ['None', 'Document number', 'Customer ref.', 'Document total'].map((v) => ({ value: v, label: v }));

/** The remaining SAP B1 header controls: printout summary, QR source, central bank, procurement and account flags. */
export function QtMoreCard({ draft, update, ctx }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="tune" title="More">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {f.choose('summaryType', 'Summary type', SUMMARY_TYPES, { hint: 'How lines group on the printed quotation.', readOnly: ctx.readOnly })}
          {f.choose('createQrCodeFrom', 'Create QR code from', QR_SOURCES, { clearable: true, readOnly: ctx.readOnly })}
          {f.text('centralBankIndicator', 'Central bank indicator', { hint: 'Balance-of-payments reporting code.', readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>
        {f.check('useShippedGoodsAccount', 'Use shipped goods account', { readOnly: ctx.readOnly })}
        {f.check('procureNonDropShip', 'Procure non drop-ship items', { readOnly: ctx.readOnly })}
        {f.check('procureDropShip', 'Procure drop-ship items', { readOnly: ctx.readOnly })}
      </Flags>
    </Section>
  );
}
