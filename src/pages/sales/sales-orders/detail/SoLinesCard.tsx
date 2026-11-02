import React from 'react';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { priceModeEnabled, priceModeHeader } from '../../../../components/form/priceMode';
import { listBlanketAgreements } from '../../../../services/blanketAgreements';
import { useAsync } from '../../../../services/useAsync';
import { soDoc } from './soDoc';
import { SoDeliveriesTab, type SoDeliveryDocs } from './SoDeliveriesTab';
import type { SoTabProps } from './types';
import type { SalesView } from '../../shared/salesView';
import type { Item } from '../../../../mocks/items';

/**
 * Sales Order contents: the shared <DocLines> driven by `soDoc` (Item tab) or
 * `SoDeliveriesTab` (expandable document-tree Deliveries tab). The Ordered items /
 * Delivery switch sits above the card, in the detail layout; selectable-row removal
 * and the Columns menu come from the shell.
 */
export function SoLinesCard({ contentTab, cardFooter, view, docs, items, ...tabProps }: SoTabProps & { contentTab?: 'item' | 'delivery'; cardFooter?: React.ReactNode; view: SalesView; docs: SoDeliveryDocs | undefined; items: readonly Item[] }) {
  const agreements = useAsync(listBlanketAgreements, []) ?? [];

  if (contentTab === 'delivery') {
    return <SoDeliveriesTab draft={tabProps.draft} docs={docs} items={items} />;
  }
  // Prices lock when the order leaves Draft and while viewing PHP (a read-only conversion).
  const locked = tabProps.ctx.readOnly || tabProps.draft.status !== 'Draft' || view.converted;
  const header = priceModeEnabled() && !locked
    ? priceModeHeader('so-price-mode', tabProps.draft.priceMode ?? 'Net', (mode) => tabProps.update({ priceMode: mode }))
    : undefined;
  return <DocLines {...soDoc({ ...tabProps, agreements }, view)} header={header} footer={cardFooter} />;
}
