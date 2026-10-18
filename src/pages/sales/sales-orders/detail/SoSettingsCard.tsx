import { Text } from '@jasperlepardo/sikat-design-system';
import { Flags, Section, bind } from '../../../../components/form/fields';
import type { SoTabProps } from './types';

export function SoSettingsCard({ draft, update, ctx }: SoTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <Flags>
          {h.check('allowPartialDelivery', 'Allow partial delivery')}
          {h.check('approved', 'Approved')}
        </Flags>
        <Text variant="small" tone="muted">
          {draft.allowPartialDelivery ? 'Lines can be delivered in parts.' : 'Each line must be delivered in full in one go.'} Defaults from the customer.
        </Text>
      </Section>
    </fieldset>
  );
}
