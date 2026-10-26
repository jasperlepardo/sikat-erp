import type { ArCmInput } from '../../../services/arCreditMemos';
import type { SalesReturn } from '../../../mocks/salesReturns';
import type { Errors } from '../../../components/form/fields';
import type { ArInvoice } from '../../../mocks/arInvoices';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { Company } from '../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../mocks/currencies';
import type { Delivery } from '../../../mocks/deliveries';
import type { Item } from '../../../mocks/items';
import type { Partner } from '../../../mocks/partners';
import type { InventoryMasters } from '../../../services/inventoryMasters';
import type { TaxMasterData } from '../../../services/taxDetermination';
import type { DnContext } from '../deliveries/detail/types';


type ArCmDraft = ArCmInput;



;

// ── Sales return form ─────────────────────────────────────────────────────────

export type SrDraft = Omit<SalesReturn, 'id'> & { id?: string };

export interface SrMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  accounts: Account[];
  company: Company;
  deliveries: Delivery[];
  returns: SalesReturn[];
}

/** Same context as a delivery: customer, rates, fixed rate once added, based on a delivery. */
export type SrContext = DnContext;

export interface SrSectionProps {
  draft: SrDraft;
  update: (patch: Partial<SrDraft>) => void;
  errors: Errors;
  m: SrMasters;
  ctx: SrContext;
}

// ── A/R credit memo form ──────────────────────────────────────────────────────

export interface ArCmMasters extends Omit<SrMasters, 'deliveries'> {
  invoices: ArInvoice[];
}

export interface ArCmSectionProps {
  draft: ArCmDraft;
  update: (patch: Partial<ArCmDraft>) => void;
  errors: Errors;
  m: ArCmMasters;
  ctx: SrContext;
}
