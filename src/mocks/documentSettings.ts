/** Company-wide document behavior shared by both sales and purchasing documents. */
export interface DocumentSettings {
  id: string;
  /**
   * Offer the Net / Gross / Net-and-Gross price-entry toggle on price-entry documents.
   * Display/entry only — a line's stored unit price is always net.
   */
  separateNetGrossPriceMode: boolean;
}

export const SEED_DOCUMENT_SETTINGS: DocumentSettings[] = [
  {
    id: 'documents',
    separateNetGrossPriceMode: true,
  },
];
