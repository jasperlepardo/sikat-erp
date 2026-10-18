import { Text } from '@jasperlepardo/sikat-design-system';
import { ActivityTab } from '../../../../../components/activity/ActivityTab';
import { listVariants } from '../../../../../services/items';
import { useAsync } from '../../../../../services/useAsync';
import type { Draft } from '../types';

/** The item's Activity tab. A parent item's timeline covers its variants too: they're what's bought and sold. */
export function ItemActivityTab({ draft }: { draft: Draft }) {
  const isParent = draft.variantAxes.length > 0;
  const variants = useAsync(() => (isParent && draft.id ? listVariants(draft.id) : Promise.resolve([])), [draft.id, isParent]);
  if (!variants) return <Text variant="small" tone="muted" className="p-4">Loading…</Text>;
  return <ActivityTab target={{ kind: 'ITEM', id: draft.id ?? '', ids: variants.map((v) => v.id) }} />;
}
