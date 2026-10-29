import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import type { QtTabProps } from './types';

const SUMMARY_TYPES = ['No Summary', 'By Items', 'By Document'].map((v) => ({ value: v, label: v }));
const QR_SOURCES = ['None', 'Document number', 'Customer ref.', 'Document total'].map((v) => ({ value: v, label: v }));

/** The remaining SAP B1 header controls: printout summary, QR source, central bank, procurement and account flags. */
export function QtMoreCard({ draft, update, ctx }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="tune" title="More">
        <FieldStack>
          {f.choose('summaryType', 'Summary type', SUMMARY_TYPES, { hint: 'How lines group on the printed quotation.' })}
          {f.choose('createQrCodeFrom', 'Create QR code from', QR_SOURCES, { clearable: true })}
          {f.text('centralBankIndicator', 'Central bank indicator', { hint: 'Balance-of-payments reporting code.' })}
        </FieldStack>
        <Flags>
          {f.check('useShippedGoodsAccount', 'Use shipped goods account')}
          {f.check('procureNonDropShip', 'Procure non drop-ship items')}
          {f.check('procureDropShip', 'Procure drop-ship items')}
        </Flags>
      </Section>
    </fieldset>
  );
}
