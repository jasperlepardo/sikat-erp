/** Shapes shared by master data records. */
import { employeeId } from './masters';

/** A document numbering series — shared by all 15 document types. */
export interface DocumentSeries {
  id: string;
  name: string;
  /** Optional string prepended to the running number, e.g. "PO-" or "2025-". */
  prefix: string;
  /** Starting number for a fresh series; the live counter is one past the highest used. */
  firstNo: number;
  /** Manual series: the user types the number instead of auto-assigning. */
  manual: boolean;
  /** One series per document type is the default for new documents. */
  isDefault: boolean;
  active: boolean;
}

export interface Attachment {
  id: string;
  fileName: string;
  size: number;
  attachedOn: string;
  /** Short note on what the file is, e.g. "SDS Sheet — Rev. 4 (2025)". */
  description?: string;
  createdBy?: string;
}

/** The signed-in user, for "created by" stamps. */
export const CURRENT_USER = 'Jasper L.';
/** The signed-in user as an employee record — the default buyer, owner and sales employee on new documents. */
export const CURRENT_USER_ID = employeeId('Jasper L.');
