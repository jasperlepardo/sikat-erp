import React from 'react';
import { DocLines } from '../../../../components/form/docLines/DocLines';
import { listBlanketAgreements } from '../../../../services/blanketAgreements';
import { useAsync } from '../../../../services/useAsync';
import { soDoc, soDeliveryDoc } from './soDoc';
import type { SoTabProps } from './types';

/**
 * Sales Order contents: the shared <DocLines> driven by `soDoc` (Item tab) or
 * `soDeliveryDoc` (read-only Delivery tab). The Item/Delivery tabs render in the
 * doc header; selectable-row removal and the Columns menu come from the shell.
 */
export function SoLinesCard({ tabs, contentTab, cardFooter, ...tabProps }: SoTabProps & { tabs?: React.ReactNode; contentTab?: 'item' | 'delivery'; cardFooter?: React.ReactNode }) {
  const agreements = useAsync(listBlanketAgreements, []) ?? [];

  if (contentTab === 'delivery') {
    return <DocLines {...soDeliveryDoc(tabProps)} header={tabs} />;
  }
  return <DocLines {...soDoc({ ...tabProps, agreements })} header={tabs} footer={cardFooter} />;
}
