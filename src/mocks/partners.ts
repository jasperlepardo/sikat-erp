/**
 * Business partners — one record shown as three lists: Leads (CRM),
 * Customers (Sales) and Vendors (Purchasing). A partner can hold several roles,
 * e.g. a customer who also supplies you. Fields follow the SAP B1 BP master
 * field mapping, grouped by tab.
 */
export type PartnerRole = 'lead' | 'customer' | 'vendor';
export type PartnerStatus = 'Active' | 'Inactive' | 'Advanced';
export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Lost';

export const LEAD_SOURCES = ['Referral', 'Website', 'Trade show', 'Walk-in', 'Cold call'] as const;
export const LEAD_STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Lost'];

export interface ContactPerson {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  title: string;
  position: string;
  address: string;
  tel1: string;
  tel2: string;
  mobile: string;
  fax: string;
  email: string;
  emailGroup: string;
  remarks1: string;
  remarks2: string;
  blockMarketing: boolean;
  active: boolean;
  eDocRecipient: boolean;
}

export interface PartnerAddress {
  id: string;
  isBilling: boolean;
  isShipping: boolean;
  /** Address ID — the label picked on documents, e.g. "Main office". */
  label: string;
  name2: string;
  name3: string;
  street: string;
  streetNo: string;
  building: string;
  /** Barangay (SAP "Block"). */
  block: string;
  city: string;
  zip: string;
  /** Province (SAP "State"). */
  province: string;
  country: string;
}

/** One of the partner's bank accounts (where you pay a vendor, or refund a customer). */
export interface PartnerBankAccount {
  id: string;
  country: string;
  bank: string;
  branch: string;
  accountNo: string;
  accountName: string;
  swift: string;
  currency: string;
  active: boolean;
}

export interface PaymentMethodSetting {
  code: string;
  include: boolean;
}

export const CONTACT_CHANNEL_TYPES = ['Phone', 'Mobile', 'WhatsApp', 'Viber', 'Email', 'Fax', 'Website', 'Other'] as const;
export type ContactChannelType = (typeof CONTACT_CHANNEL_TYPES)[number];

export interface PartnerContactChannel {
  id: string;
  type: ContactChannelType;
  /** User-editable label shown on the row, e.g. "Office", "Home", "Direct". */
  label: string;
  value: string;
}

export const newContactChannel = (type: ContactChannelType = 'Phone'): PartnerContactChannel => ({
  id: `ch-${crypto.randomUUID().slice(0, 8)}`,
  type,
  label: type,
  value: '',
});

import type { Attachment } from './common';
import type { SalesVatTreatment, SupplierVatStatus } from './taxes';

export type { Attachment };

/** One income type covered by a tax treaty with a foreign vendor. */
export interface TreatyIncomeEntry {
  id: string;
  incomeType: string;
  approvedRate: number;
  ttraApprovalDate: string;
  attachments: Attachment[];
}

export const newTreatyIncomeEntry = (): TreatyIncomeEntry => ({
  id: `ti-${crypto.randomUUID().slice(0, 8)}`,
  incomeType: '',
  approvedRate: 0,
  ttraApprovalDate: '',
  attachments: [],
});

export interface Partner {
  id: string;

  // Header
  code: string;
  roles: PartnerRole[];
  name: string;
  foreignName: string;
  group: string;
  currency: string;
  /** Federal Tax ID → BIR TIN. */
  tin: string;

  // General
  contactChannels: PartnerContactChannel[];
  /** Shipping type id (Settings › Inventory › Shipping types). */
  shippingType: string;
  project: string;
  industry: string;
  businessType: string;
  aliasName: string;
  gln: string;
  blockMarketing: boolean;
  idNo2: string;
  unifiedTin: string;
  generalRemarks: string;
  salesEmployee: string;
  channel: string;
  technician: string;
  territory: string;
  status: PartnerStatus;
  statusFrom: string;
  statusTo: string;
  statusRemarks: string;
  leadSource?: string;
  leadStage?: LeadStage;

  // Contact persons (the default one is the BP's "Contact Person")
  contacts: ContactPerson[];
  defaultContactId: string;

  // Addresses
  addresses: PartnerAddress[];
  defaultBillToId: string;
  defaultShipToId: string;

  // Payment terms
  customerPaymentTerms: string;
  vendorPaymentTerms: string;
  interestOnArrears: number;
  priceList: string;
  totalDiscount: number;
  creditLimit: number;
  commitmentLimit: number;
  dunningTerm: string;
  effectiveDiscountGroups: string;
  effectivePrice: string;
  effectivePriceAllSources: boolean;
  bankAccounts: PartnerBankAccount[];
  defaultBankAccountId: string;
  averageDelayDays: number;
  priority: string;
  holidays: string;
  allowPartialDelivery: boolean;
  allowPartialDeliveryPerRow: boolean;
  noDiscountGroups: boolean;
  endorsableChecks: boolean;
  acceptsEndorsedChecks: boolean;

  // Payment run
  paymentReference: string;
  paymentBlock: boolean;
  singlePayment: boolean;
  collectionAuthorization: boolean;
  bankChargesCode: string;
  autoBankCharges: boolean;
  paymentMethods: PaymentMethodSetting[];
  defaultPaymentMethod: string;

  // Tax — inputs to tax determination (services/taxDetermination.ts)
  /** Partner's BIR Revenue District Office code. */
  rdoCode: string;
  /** Date the partner registered for VAT with BIR. */
  vatRegistrationDate: string;
  /** As a customer: overrides the item's output VAT (government, zero-rated, exempt). */
  salesVatTreatment: SalesVatTreatment;
  /** Zero-rated customers: the BIR/PEZA/BOI certificate backing the zero-rating. */
  zeroRatedCertificate: string;
  zeroRatedValidUntil: string;
  /** Exempt entity customers: legal ground for the VAT exemption. */
  exemptionBasis: string;
  /** Exempt entity customers: certificate/ruling/registration number. */
  exemptionCertificate: string;
  exemptionValidUntil: string;
  /** As a supplier: decides whether you get input VAT at all. */
  supplierVatStatus: SupplierVatStatus;
  /** VAT-registered or Non-VAT vendors: BIR Certificate of Registration (Form 2303) number. */
  birCorNumber: string;
  /** Withholding tax (id) that always applies to this vendor, replacing the rules. '' = use the rules. */
  withholdingOverrideId: string;
  /**
   * As a supplier: gross income this year is above the BIR withholding threshold
   * (₱3M for individuals, ₱720,000 for corporations). Picks the higher ATC of an
   * income-tiered pair, e.g. WC011 (15%) instead of WC010 (10%).
   */
  grossIncomeAboveThreshold: boolean;
  /**
   * As a supplier: a non-resident (foreign corporation or alien) not doing business in the
   * Philippines. Payments to them carry final withholding tax instead of EWT.
   */
  nonResident: boolean;
  /** Non-resident vendors: BIR Form 0901 approval no. or Certificate of Residence reference. */
  taxTreatyCertificate: string;
  taxTreatyCertificateExpiry: string;
  /** Country whose tax treaty with the Philippines is being invoked. */
  taxTreatyCountry: string;
  /** One entry per income type covered by the treaty (Dividends, Interest, Royalties, etc.). */
  taxTreatyIncomes: TreatyIncomeEntry[];

  // Accounting
  consolidatingPartnerId: string;
  consolidationType: 'payment' | 'delivery';
  /** G/L account codes (Accounting › Chart of Accounts); '' for none. */
  receivableAccount: string;
  payableAccount: string;
  downPaymentClearingAccount: string;
  downPaymentInterimAccount: string;
  blockDunning: boolean;
  dunningLevel: number;
  dunningDate: string;
  planningGroup: string;
  affiliate: boolean;
  useShippedGoodsAccount: boolean;

  // Properties, remarks, attachments
  properties: string[];
  remarks: string;
  attachments: Attachment[];
}

export const newContact = (patch: Partial<ContactPerson> = {}): ContactPerson => ({
  id: `ct-${crypto.randomUUID().slice(0, 8)}`,
  firstName: '',
  middleName: '',
  lastName: '',
  title: '',
  position: '',
  address: '',
  tel1: '',
  tel2: '',
  mobile: '',
  fax: '',
  email: '',
  emailGroup: '— None —',
  remarks1: '',
  remarks2: '',
  blockMarketing: false,
  active: true,
  eDocRecipient: false,
  ...patch,
});

export const newBankAccount = (patch: Partial<PartnerBankAccount> = {}): PartnerBankAccount => ({
  id: `ba-${crypto.randomUUID().slice(0, 8)}`,
  country: 'Philippines',
  bank: '',
  branch: '',
  accountNo: '',
  accountName: '',
  swift: '',
  currency: 'PHP',
  active: true,
  ...patch,
});

export const newAddress = (patch: Partial<PartnerAddress> = {}): PartnerAddress => ({
  id: `ad-${crypto.randomUUID().slice(0, 8)}`,
  isBilling: false,
  isShipping: false,
  label: '',
  name2: '',
  name3: '',
  street: '',
  streetNo: '',
  building: '',
  block: '',
  city: '',
  zip: '',
  province: '',
  country: 'Philippines',
  ...patch,
});

export const contactName = (c?: ContactPerson) =>
  c ? [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') || 'Unnamed contact' : '';

/** A blank partner with sensible defaults for the role it's created from. */
export function blankPartner(role: PartnerRole): Omit<Partner, 'id'> {
  return {
    code: '',
    roles: [role],
    name: '',
    foreignName: '',
    group: role === 'lead' ? 'Leads' : role === 'customer' ? 'Customers – Trade' : 'Vendors – Local',
    currency: 'PHP',
    tin: '',
    contactChannels: [],
    shippingType: 'sh-own',
    project: '— None —',
    industry: 'Construction',
    businessType: 'Company',
    aliasName: '',
    gln: '',
    blockMarketing: false,
    idNo2: '',
    unifiedTin: '',
    generalRemarks: '',
    salesEmployee: '— None —',
    channel: '— None —',
    technician: '— None —',
    territory: '— None —',
    status: 'Active',
    statusFrom: '',
    statusTo: '',
    statusRemarks: '',
    ...(role === 'lead' ? { leadSource: LEAD_SOURCES[0], leadStage: 'New' as const } : {}),
    contacts: [],
    defaultContactId: '',
    addresses: [],
    defaultBillToId: '',
    defaultShipToId: '',
    customerPaymentTerms: 'Net 30',
    vendorPaymentTerms: 'Net 30',
    interestOnArrears: 0,
    priceList: 'Base price',
    totalDiscount: 0,
    creditLimit: 0,
    commitmentLimit: 0,
    dunningTerm: '— None —',
    effectiveDiscountGroups: 'Lowest discount',
    effectivePrice: 'Default priority',
    effectivePriceAllSources: false,
    bankAccounts: [],
    defaultBankAccountId: '',
    averageDelayDays: 0,
    priority: '— None —',
    holidays: 'Philippines (national)',
    allowPartialDelivery: true,
    allowPartialDeliveryPerRow: true,
    noDiscountGroups: false,
    endorsableChecks: false,
    acceptsEndorsedChecks: false,
    paymentReference: '',
    paymentBlock: false,
    singlePayment: false,
    collectionAuthorization: false,
    bankChargesCode: '— None —',
    autoBankCharges: false,
    paymentMethods: [
      { code: 'CASH', include: true },
      { code: 'CHECK', include: true },
      { code: 'PDC', include: false },
      { code: 'BANK', include: true },
      { code: 'GCASH', include: false },
      { code: 'MAYA', include: false },
    ],
    defaultPaymentMethod: 'BANK',
    rdoCode: '',
    vatRegistrationDate: '',
    salesVatTreatment: 'Regular',
    zeroRatedCertificate: '',
    zeroRatedValidUntil: '',
    exemptionBasis: '',
    exemptionCertificate: '',
    exemptionValidUntil: '',
    supplierVatStatus: 'VAT-registered',
    birCorNumber: '',
    withholdingOverrideId: '',
    grossIncomeAboveThreshold: false,
    nonResident: false,
    taxTreatyCertificate: '',
    taxTreatyCertificateExpiry: '',
    taxTreatyCountry: '',
    taxTreatyIncomes: [],
    consolidatingPartnerId: '',
    consolidationType: 'payment',
    receivableAccount: '1120',
    payableAccount: '2010',
    downPaymentClearingAccount: '',
    downPaymentInterimAccount: '',
    blockDunning: false,
    dunningLevel: 0,
    dunningDate: '',
    planningGroup: '— None —',
    affiliate: false,
    useShippedGoodsAccount: false,
    properties: [],
    remarks: '',
    attachments: [],
  };
}

/** Seed helper: a blank partner of `role`, one contact and one bill-to/ship-to address. */
function seed(
  id: string,
  role: PartnerRole,
  patch: Partial<Partner>,
  contact: Partial<ContactPerson>,
  address: Partial<PartnerAddress>,
): Partner {
  const c = newContact({ id: `${id}-c1`, ...contact });
  const a = newAddress({ id: `${id}-a1`, label: 'Main office', isBilling: true, isShipping: true, ...address });
  return {
    ...blankPartner(role),
    id,
    code: `BP-${id.slice(3).padStart(4, '0')}`,
    contacts: [c],
    defaultContactId: c.id,
    addresses: [a],
    defaultBillToId: a.id,
    defaultShipToId: a.id,
    ...patch,
  };
}

export const SEED_PARTNERS: Partner[] = [
  seed(
    'bp-001', 'customer',
    { name: 'Acme Construction Corp.', tin: '123-456-789-000', contactChannels: [{ id: 'bp-001-ch1', type: 'Phone', label: 'Phone', value: '+63 2 8812 3456' }, { id: 'bp-001-ch2', type: 'Email', label: 'Email', value: 'purchasing@acmeconstruction.ph' }], creditLimit: 500000, commitmentLimit: 750000, salesEmployee: 'Andrea Ramos', territory: 'NCR', properties: ['Key account', 'Requires PO'], averageDelayDays: 4 },
    { firstName: 'Maria', lastName: 'Santos', position: 'Purchasing Manager', email: 'maria.santos@acmeconstruction.ph', mobile: '+63 917 800 1122' },
    { street: 'Shaw Blvd.', streetNo: '21', block: 'Wack-Wack', city: 'Mandaluyong', zip: '1552', province: 'Metro Manila' },
  ),
  seed(
    'bp-002', 'customer',
    { roles: ['customer', 'vendor'], name: 'Metro Hardware Supply', tin: '234-567-890-000', contactChannels: [{ id: 'bp-002-ch1', type: 'Phone', label: 'Phone', value: '+63 2 8723 1100' }, { id: 'bp-002-ch2', type: 'Email', label: 'Email', value: 'orders@metrohardware.ph' }], customerPaymentTerms: 'Net 15', vendorPaymentTerms: 'Net 30', creditLimit: 250000, industry: 'Retail', remarks: 'Buys paint from us; we buy fasteners from them.' },
    { firstName: 'Jose', lastName: 'Reyes', position: 'Owner', email: 'jose@metrohardware.ph' },
    { street: 'Rizal Ave.', streetNo: '88', block: 'Sta. Cruz', city: 'Manila', zip: '1003', province: 'Metro Manila' },
  ),
  seed(
    'bp-003', 'vendor',
    { name: 'Luzon Steel Industries', tin: '345-678-901-000', contactChannels: [{ id: 'bp-003-ch1', type: 'Phone', label: 'Phone', value: '+63 44 791 2233' }, { id: 'bp-003-ch2', type: 'Email', label: 'Email', value: 'sales@luzonsteel.ph' }], vendorPaymentTerms: 'Net 60', industry: 'Manufacturing', group: 'Vendors – Local', grossIncomeAboveThreshold: true,
      bankAccounts: [newBankAccount({ id: 'bp-003-b1', bank: 'BPI', branch: 'Malolos', accountNo: '8890-1122-33', accountName: 'Luzon Steel Industries Inc.' })],
      defaultBankAccountId: 'bp-003-b1' },
    { firstName: 'Ramon', lastName: 'Cruz', position: 'Sales Director', email: 'ramon.cruz@luzonsteel.ph' },
    { street: 'MacArthur Hwy.', streetNo: 'Km 45', block: 'Longos', city: 'Malolos', zip: '3000', province: 'Bulacan' },
  ),
  seed(
    'bp-004', 'vendor',
    { name: 'Visayas Electrical Trading', tin: '456-789-012-000', contactChannels: [{ id: 'bp-004-ch1', type: 'Phone', label: 'Phone', value: '+63 32 255 4410' }, { id: 'bp-004-ch2', type: 'Email', label: 'Email', value: 'ap@visayaselectrical.ph' }], industry: 'Retail' },
    { firstName: 'Ana', lastName: 'Villanueva', position: 'Accounts Officer', email: 'ana@visayaselectrical.ph' },
    { street: 'Osmeña Blvd.', streetNo: '12', block: 'Capitol Site', city: 'Cebu City', zip: '6000', province: 'Cebu' },
  ),
  seed(
    'bp-005', 'customer',
    { name: 'Northpoint Builders', contactChannels: [{ id: 'bp-005-ch1', type: 'Mobile', label: 'Mobile', value: '+63 917 555 0142' }, { id: 'bp-005-ch2', type: 'Email', label: 'Email', value: 'hello@northpointbuilders.ph' }], customerPaymentTerms: 'COD', group: 'Customers – Retail', territory: 'North Luzon' },
    { firstName: 'Carlo', lastName: 'Mendoza', position: 'Project Engineer', email: 'carlo@northpointbuilders.ph' },
    { street: 'Session Rd.', streetNo: '5', city: 'Baguio', zip: '2600', province: 'Benguet' },
  ),
  seed(
    'bp-006', 'vendor',
    { roles: ['vendor', 'customer'], name: 'Pacific Paints Inc.', tin: '567-890-123-000', contactChannels: [{ id: 'bp-006-ch1', type: 'Phone', label: 'Phone', value: '+63 2 8634 7788' }, { id: 'bp-006-ch2', type: 'Email', label: 'Email', value: 'trade@pacificpaints.ph' }], creditLimit: 150000, industry: 'Manufacturing', properties: ['Preferred supplier', 'Accepts e-invoice'] },
    { firstName: 'Liza', lastName: 'Tan', position: 'Trade Marketing', email: 'liza.tan@pacificpaints.ph' },
    { street: 'EDSA', streetNo: '400', block: 'Bagong Pag-asa', city: 'Quezon City', zip: '1105', province: 'Metro Manila' },
  ),
  seed(
    'bp-007', 'customer',
    { name: 'Island Homes Development', contactChannels: [{ id: 'bp-007-ch1', type: 'Email', label: 'Email', value: 'finance@islandhomes.ph' }], status: 'Inactive', statusRemarks: 'Project completed; account closed.', industry: 'Real estate', territory: 'Mindanao' },
    { firstName: 'Mark', lastName: 'Lim', position: 'Finance Head', email: 'mark.lim@islandhomes.ph' },
    { street: 'JP Laurel Ave.', streetNo: '77', block: 'Bajada', city: 'Davao City', zip: '8000', province: 'Davao del Sur' },
  ),
  seed(
    'bp-008', 'vendor',
    { name: 'Golden Plumbing Center', contactChannels: [{ id: 'bp-008-ch1', type: 'Email', label: 'Email', value: 'rosa@goldenplumbing.ph' }], vendorPaymentTerms: 'COD', status: 'Inactive', supplierVatStatus: 'Non-VAT', businessType: 'Sole proprietorship' },
    { firstName: 'Rosa', lastName: 'Garcia', position: 'Owner', email: 'rosa@goldenplumbing.ph' },
    { street: 'Aurora Blvd.', streetNo: '31', city: 'San Juan', zip: '1500', province: 'Metro Manila' },
  ),
  seed(
    'bp-009', 'lead',
    { name: 'Sunrise Renovations', contactChannels: [{ id: 'bp-009-ch1', type: 'Email', label: 'Email', value: 'info@sunrisereno.ph' }], leadSource: 'Referral', leadStage: 'Qualified', remarks: 'Referred by Acme. Needs quote for 200 boxes of screws.' },
    { firstName: 'Paolo', lastName: 'Aquino', position: 'Operations', email: 'paolo@sunrisereno.ph', mobile: '+63 918 222 3344' },
    { street: 'Katipunan Ave.', streetNo: '9', block: 'Loyola Heights', city: 'Quezon City', zip: '1108', province: 'Metro Manila' },
  ),
  seed(
    'bp-010', 'lead',
    { name: 'Bayview Condominium Corp.', contactChannels: [{ id: 'bp-010-ch1', type: 'Email', label: 'Email', value: 'admin@bayviewcondo.ph' }], leadSource: 'Website', leadStage: 'Contacted', industry: 'Real estate' },
    { firstName: 'Grace', lastName: 'Dela Cruz', position: 'Admin Officer', email: 'grace@bayviewcondo.ph' },
    { street: 'Roxas Blvd.', streetNo: '1200', city: 'Pasay', zip: '1300', province: 'Metro Manila' },
  ),
  seed(
    'bp-011', 'lead',
    { name: 'Mindanao Agri Supplies', contactChannels: [{ id: 'bp-011-ch1', type: 'Email', label: 'Email', value: 'sales@mindanaoagri.ph' }], leadSource: 'Trade show', leadStage: 'New', industry: 'Agriculture' },
    { firstName: 'Nestor', lastName: 'Ramos', email: 'nestor@mindanaoagri.ph' },
    { street: 'Corrales Ave.', streetNo: '14', city: 'Cagayan de Oro', zip: '9000', province: 'Misamis Oriental' },
  ),
  seed(
    'bp-012', 'lead',
    { name: 'Quickfix Home Services', contactChannels: [{ id: 'bp-012-ch1', type: 'Email', label: 'Email', value: 'ella@quickfix.ph' }], leadSource: 'Walk-in', leadStage: 'Lost', industry: 'Services', remarks: 'Went with a competitor on price.' },
    { firstName: 'Ella', lastName: 'Navarro', email: 'ella@quickfix.ph' },
    { street: 'Alabang–Zapote Rd.', streetNo: '3', city: 'Las Piñas', zip: '1740', province: 'Metro Manila' },
  ),
  seed(
    'bp-013', 'customer',
    { name: 'Cavite Export Assemblers Inc.', tin: '678-901-234-000', contactChannels: [{ id: 'bp-013-ch1', type: 'Email', label: 'Email', value: 'procurement@caviteexport.ph' }], industry: 'Manufacturing',
      salesVatTreatment: 'Zero-rated', zeroRatedCertificate: 'PEZA-REE-2024-0183', zeroRatedValidUntil: '2027-12-31',
      remarks: 'PEZA-registered export enterprise in Cavite Economic Zone. Keep the VAT zero-rating certificate on file.' },
    { firstName: 'Lorna', lastName: 'Bautista', position: 'Procurement Head', email: 'lorna.bautista@caviteexport.ph' },
    { street: 'Main Ave.', streetNo: 'Lot 7', block: 'CEZ', city: 'Rosario', zip: '4106', province: 'Cavite' },
  ),
  seed(
    'bp-014', 'customer',
    { name: 'City Government of Pasig – Engineering Office', contactChannels: [{ id: 'bp-014-ch1', type: 'Email', label: 'Email', value: 'engineering@pasigcity.gov.ph' }], industry: 'Government',
      businessType: 'Government', group: 'Customers – Government', salesVatTreatment: 'Government', customerPaymentTerms: 'Net 60',
      remarks: 'Withholds 5% creditable VAT and 1% EWT on our invoices; expect BIR Form 2307.' },
    { firstName: 'Ramil', lastName: 'Ocampo', position: 'City Engineer', email: 'r.ocampo@pasigcity.gov.ph' },
    { street: 'Caruncho Ave.', block: 'Malinao', city: 'Pasig', zip: '1600', province: 'Metro Manila' },
  ),
  seed(
    'bp-015', 'vendor',
    { name: 'CloudStack Pte. Ltd.', contactChannels: [{ id: 'bp-015-ch1', type: 'Email', label: 'Email', value: 'billing@cloudstack.example.sg' }], industry: 'Services', group: 'Vendors – Services',
      currency: 'USD', supplierVatStatus: 'Non-resident digital services', nonResident: true, vendorPaymentTerms: 'Net 7',
      remarks: 'Cloud hosting subscription. Non-resident digital service provider: we withhold and remit the 12% VAT (RA 12023).' },
    { firstName: 'Mei', lastName: 'Lin', position: 'Billing', email: 'billing@cloudstack.example.sg' },
    { street: 'Robinson Rd.', streetNo: '71', city: 'Singapore', zip: '068895', province: 'Other', country: 'Singapore' },
  ),
  seed(
    'bp-016', 'vendor',
    { roles: ['lead', 'customer', 'vendor'], name: 'Apple Authorized Distributor (placeholder)', tin: '789-012-345-000', contactChannels: [{ id: 'bp-016-ch1', type: 'Email', label: 'Email', value: 'orders@apple-distributor.example.ph' }], industry: 'Wholesale',
      group: 'Vendors – Local', customerPaymentTerms: 'Net 30', vendorPaymentTerms: 'Net 30', leadSource: 'Referral', leadStage: 'Qualified',
      properties: ['Preferred supplier', 'Accepts e-invoice'], grossIncomeAboveThreshold: true,
      remarks: 'Demo vendor for the Apple catalog. Replace with the actual Apple distributor and its price file (part numbers, UPCs, cost).' },
    { firstName: 'Trade', lastName: 'Desk', position: 'Reseller accounts', email: 'orders@apple-distributor.example.ph' },
    { street: 'Ayala Ave.', streetNo: '6750', city: 'Makati', zip: '1226', province: 'Metro Manila' },
  ),
];
