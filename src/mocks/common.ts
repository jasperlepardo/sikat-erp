/** Shapes shared by master data records. */

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
