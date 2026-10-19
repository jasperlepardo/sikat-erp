import type { Errors } from '../../../../components/form/fields';
import type { InventoryTransferRequest, TransferRequestLine } from '../../../../mocks/inventoryTransferRequests';
import type { TransferMasters } from '../../transfers/TransferLines';

export type ItrDraft = Omit<InventoryTransferRequest, 'id'> & { id?: string };

/** Items, warehouses and bins — bins only so Copy to Inventory Transfer can pre-fill them. */
export type ItrMasters = TransferMasters;

export interface ItrSectionProps {
  draft: ItrDraft;
  update: (patch: Partial<ItrDraft>) => void;
  errors: Errors;
  m: ItrMasters;
  readOnly: boolean;
}

/** Already moved by posted transfers copied from the request. */
export const transferredQty = (l: Pick<TransferRequestLine, 'quantity' | 'openQty'>) => Math.max(0, l.quantity - l.openQty);
