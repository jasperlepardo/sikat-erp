/**
 * Sales-side names for the shared document currency view. The implementation lives in
 * `src/pages/shared/documentView.ts` — sales and purchasing use the same engine, so a sales
 * document and a purchasing document convert identically. Kept as a thin re-export so sales call
 * sites keep their domain-flavoured `salesView` / `SalesView` names and a single currency import.
 */
export { documentView as salesView, type DocumentView as SalesView } from '../../shared/documentView';
export { CurrencyToggle } from '../../purchasing/shared/CurrencyToggle';
