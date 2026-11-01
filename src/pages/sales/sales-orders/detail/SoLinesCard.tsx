import React from 'react';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { priceModeEnabled, priceModeHeader } from '../../../../components/form/priceMode';
import { listBlanketAgreements } from '../../../../services/blanketAgreements';
import { useAsync } from '../../../../services/useAsync';
import { soDoc, soDeliveryDoc } from './soDoc';
import type { SoTabProps } from './types';
import type { SalesView } from '../../shared/salesView';

/**
 * Sales Order contents: the shared <DocLines> driven by `soDoc` (Item tab) or
 * `soDeliveryDoc` (read-only Delivery tab). The Item/Delivery tabs render in the
 * doc header; selectable-row removal and the Columns menu come from the shell.
 */
export function SoLinesCard({ tabs, contentTab, cardFooter, view, ...tabProps }: SoTabProps & { tabs?: React.ReactNode; contentTab?: 'item' | 'delivery'; cardFooter?: React.ReactNode; view: SalesView }) {
  const agreements = useAsync(listBlanketAgreements, []) ?? [];

  if (contentTab === 'delivery') {
    return <DocLines {...soDeliveryDoc(tabProps)} header={tabs} />;
  }
  // Prices lock when the order leaves Draft and while viewing PHP (a read-only conversion).
  const locked = tabProps.ctx.readOnly || tabProps.draft.status !== 'Draft' || view.converted;
  const header = priceModeEnabled() && !locked ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {tabs}
      {priceModeHeader('so-price-mode', tabProps.draft.priceMode ?? 'Net', (mode) => tabProps.update({ priceMode: mode }))}
    </div>
  ) : tabs;
  return <DocLines {...soDoc({ ...tabProps, agreements }, view)} header={header} footer={cardFooter} />;
}
