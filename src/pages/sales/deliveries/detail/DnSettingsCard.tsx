import { Text } from '@jasperlepardo/sikat-design-system';
import { Flags, Section, bind } from '../../../../components/form/fields';
import { SHIPPED_GOODS_ACCOUNT } from '../../../../mocks/deliveries';
import type { DnSectionProps } from './types';

export function DnSettingsCard({ draft, update, ctx, m }: DnSectionProps) {
  const h = bind(draft, update);
  const shipped = m.accounts.find((a) => a.code === SHIPPED_GOODS_ACCOUNT);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <Flags>
          {h.check('useShippedGoodsAccount', 'Use shipped goods account')}
        </Flags>
        <Text variant="small" tone="muted">
          {draft.useShippedGoodsAccount
            ? `Cost goes to ${shipped ? `${shipped.code} ${shipped.name}` : SHIPPED_GOODS_ACCOUNT} until the invoice moves it to COGS.`
            : 'Cost goes straight to COGS when the delivery is added.'}
        </Text>
      </Section>
    </fieldset>
  );
}
