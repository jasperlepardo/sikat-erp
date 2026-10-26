import { useAsync } from '../../../services/useAsync';
import { DocumentFlowTable } from '../../purchasing/shared/DocumentFlow';
import { linkedSalesDocuments, type SalesDocKind } from './salesDocumentLinks';

/** A sales document's Transactions view: see DocumentFlow. */
export function SalesDocumentFlow({ kind, id, notes }: { kind: SalesDocKind; id: string; notes: string }) {
  return <DocumentFlowTable rows={useAsync(() => linkedSalesDocuments(kind, id), [kind, id])} notes={notes} />;
}
