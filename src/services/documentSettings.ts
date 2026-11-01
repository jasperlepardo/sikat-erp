/** Shared document settings (Settings › Document settings), read by both sales and purchasing. */
import { SEED_DOCUMENT_SETTINGS, type DocumentSettings } from '../mocks/documentSettings';
import { createCollection } from './store';

export const documentSettings = createCollection<DocumentSettings>('sikat-erp:document-settings', SEED_DOCUMENT_SETTINGS, 'ds');

/** The current document settings (a singleton), falling back to the seed. */
export const getDocumentSettings = (): DocumentSettings => documentSettings.snapshot()[0] ?? SEED_DOCUMENT_SETTINGS[0];
