/**
 * Purchasing-side names for the shared document currency view. The implementation lives in
 * `src/pages/shared/documentView.ts` — sales and purchasing use the same engine, so a purchasing
 * document and a sales document convert identically. Kept as a thin re-export so purchasing call
 * sites keep their domain-flavoured `purchaseView` / `PurchaseView` names and a single currency
 * import.
 */
export { documentView as purchaseView, type DocumentView as PurchaseView } from '../../shared/documentView';
export { CurrencyToggle } from './CurrencyToggle';
