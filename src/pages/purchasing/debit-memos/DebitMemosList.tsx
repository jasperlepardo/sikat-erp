import { ReturnDocumentsList } from '../shared/ReturnDocumentsList';

/** Purchasing › Returns & Debits, on the A/P credit memos tab. */
export function DebitMemosList() {
  return <ReturnDocumentsList kind="memos" />;
}
