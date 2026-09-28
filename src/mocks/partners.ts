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

/**
 * One of the partner's addresses. Any address can be picked as bill-to or ship-to on a
 * document; the partner's defaultBillToId / defaultShipToId say which one is picked first.
 */
export interface PartnerAddress {
  id: string;
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
import type { VatExemptionEntry } from './taxes';
export type { VatExemptionEntry };

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
  /** Whether this entity is BIR-registered for VAT. Applies regardless of role (customer / vendor / lead). */
  vatRegistered: boolean;
  /** Date the partner registered for VAT with BIR. */
  vatRegistrationDate: string;
  /** BIR Certificate of Registration (Form 2303) number. */
  birCorNumber: string;
  /**
   * Document-backed VAT exemptions for this customer (Zero-rated, Exempt entity).
   * An entry is active only when it has at least one attached document and has not expired.
   * Government treatment is automatic from businessType, not stored here.
   */
  vatExemptions: VatExemptionEntry[];
  /**
   * Non-resident vendor that provides digital services to Philippine consumers.
   * Triggers 12% VAT self-withholding (BIR Form 1600-VT). Only relevant when nonResident is true.
   */
  nonResidentDigitalServices: boolean;
  /** Withholding tax (id) that always applies to this vendor, replacing the rules. '' = use the rules. */
  withholdingOverrideId: string;
  /** BIR Sworn Declaration reference number (e.g. internal doc no. or BIR-acknowledged stamp). */
  swornDeclarationRef: string;
  /** Date the vendor submitted the sworn declaration to you. Must be in the same calendar year as the posting date for the lower rate to apply. */
  swornDeclarationDate: string;
  /** The actual sworn declaration document(s). The lower withholding rate applies only when at least one file is attached. */
  swornDeclarationAttachments: Attachment[];
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

/** An address as printed on documents; the last line is the province at home, the country abroad. */
export const formatAddress = (a?: PartnerAddress, name = '') =>
  a
    ? [
        name,
        [a.building, [a.streetNo, a.street].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        [a.block, a.city].filter(Boolean).join(', '),
        [a.zip, a.country === 'Philippines' ? a.province : a.country].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

export const contactName =(c?: ContactPerson) =>
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
    industry: 'Retail',
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
    vatRegistered: true,
    birCorNumber: '',
    vatExemptions: [],
    nonResidentDigitalServices: false,
    withholdingOverrideId: '',
    swornDeclarationRef: '',
    swornDeclarationDate: '',
    swornDeclarationAttachments: [],
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
  const a = newAddress({ id: `${id}-a1`, label: 'Main office', ...address });
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

/** Seed helper: an attached document. */
const doc = (id: string, fileName: string, attachedOn: string, description?: string): Attachment => ({
  id, fileName, size: 120000, attachedOn, ...(description ? { description } : {}),
});
/** Seed helper: this year's sworn declaration (RR 11-2018), signed and on file. */
const sworn = (id: string, ref: string, date: string) => ({
  swornDeclarationRef: ref,
  swornDeclarationDate: date,
  swornDeclarationAttachments: [doc(`att-${id}-sd`, `Sworn_Declaration_${ref}.pdf`, date, 'Sworn declaration of gross income')],
});
const email = (id: string, value: string, label = 'Email'): PartnerContactChannel => ({ id, type: 'Email', label, value });
const phone = (id: string, value: string, label = 'Phone'): PartnerContactChannel => ({ id, type: 'Phone', label, value });
const mobile = (id: string, value: string, label = 'Mobile'): PartnerContactChannel => ({ id, type: 'Mobile', label, value });
const web = (id: string, value: string): PartnerContactChannel => ({ id, type: 'Website', label: 'Website', value });

/**
 * The business partners of an Apple Premium Reseller in the Philippines. Together they cover
 * every VAT and withholding tax combination the rules produce (services/taxDetermination.ts);
 * each partner's remarks say which one, with the company profile's defaults (VAT-registered,
 * private top withholding agent).
 *
 * Foreign providers are listed under their real contracting entities for realism. Whether each
 * one is registered with BIR as a digital service provider is a demo setting here — match it to
 * what their invoice shows.
 */
export const SEED_PARTNERS: Partner[] = [
  // ── Customers ──────────────────────────────────────────────────────────────
  seed(
    'bp-001', 'customer',
    { name: 'Walk-in customer', businessType: 'Individual', group: 'Customers – Retail', industry: 'Retail', channel: 'Walk-in',
      customerPaymentTerms: 'COD', vatRegistered: false,
      remarks: 'Tax scenario (sales): regular consumer → 31 VATable sales, 12% output VAT.' },
    { firstName: 'Walk-in', lastName: 'Customer', position: 'Consumer' },
    { street: 'Ortigas Ave.', block: 'San Antonio', city: 'Pasig', zip: '1605', province: 'Metro Manila' },
  ),
  seed(
    'bp-002', 'vendor',
    { roles: ['vendor', 'customer'], name: 'Northgate Prime Malls Inc.', tin: '201-334-517-000', businessType: 'Company', group: 'Vendors – Services',
      industry: 'Real estate', contactChannels: [phone('bp-002-ch1', '+63 2 8631 4400'), email('bp-002-ch2', 'leasing@northgateprime.example.ph')],
      vendorPaymentTerms: 'Net 15', customerPaymentTerms: 'Net 30', creditLimit: 300000, ...sworn('bp-002', 'SD-NPM-2026', '2026-01-12'),
      remarks: 'Our landlord at Northgate Mall, and a customer (buys iPads for its mall admin office).\n'
        + 'Tax scenario (purchase, mall rent): 44 input VAT · WC100 5% EWT on rent.\n'
        + 'Tax scenario (sales): 31 VATable; as a top withholding agent it withholds 1% and sends us BIR Form 2307.' },
    { firstName: 'Patricia', lastName: 'Gonzales', position: 'Leasing Manager', email: 'patricia.gonzales@northgateprime.example.ph' },
    { street: 'Northgate Ave.', block: 'Filinvest City', city: 'Muntinlupa', zip: '1781', province: 'Metro Manila' },
  ),
  seed(
    'bp-003', 'customer',
    { name: 'Bayanihan Savings Bank Corp.', tin: '004-112-908-000', businessType: 'Company', group: 'Customers – Trade', industry: 'Financial services',
      contactChannels: [email('bp-003-ch1', 'procurement@bayanihanbank.example.ph')], customerPaymentTerms: 'Net 30', creditLimit: 2500000,
      salesEmployee: 'Carla Uy', territory: 'NCR', properties: ['Key account', 'Requires PO'],
      remarks: 'Corporate fleet of MacBooks and iPhones for branch staff.\n'
        + 'Tax scenario (sales): 31 VATable. Top withholding agent: withholds 1% on goods / 2% on services and issues BIR Form 2307.' },
    { firstName: 'Miguel', lastName: 'Ferrer', position: 'Head of Procurement', email: 'miguel.ferrer@bayanihanbank.example.ph' },
    { street: 'Paseo de Roxas', streetNo: '8750', block: 'Bel-Air', city: 'Makati', zip: '1226', province: 'Metro Manila' },
  ),
  seed(
    'bp-004', 'customer',
    { name: 'Clarkfield Global Services Inc.', tin: '009-876-120-000', businessType: 'Company', group: 'Customers – Trade', industry: 'BPO / IT-BPM',
      contactChannels: [email('bp-004-ch1', 'it.procurement@clarkfieldgs.example.ph')], customerPaymentTerms: 'Net 30', creditLimit: 1500000, territory: 'North Luzon',
      vatExemptions: [{ id: 've-bp-004', type: 'Zero-rated', certificateRef: 'PEZA-EO-2023-0417', basis: '', validUntil: '2028-06-30',
        attachments: [doc('att-bp-004-peza', 'PEZA_Certificate_of_Registration.pdf', '2023-07-02', 'PEZA IT enterprise registration')] }],
      remarks: 'PEZA-registered IT-BPM company in Clark Freeport. Buys Macs and iPads for its delivery floor.\n'
        + 'Tax scenario (sales): valid zero-rating certificate → 32 zero-rated sales; the invoice must say "ZERO-RATED SALE".' },
    { firstName: 'Anne', lastName: 'Sison', position: 'IT Asset Manager', email: 'anne.sison@clarkfieldgs.example.ph' },
    { street: 'Manuel A. Roxas Hwy.', streetNo: 'Bldg 7', block: 'Clark Freeport Zone', city: 'Mabalacat', zip: '2023', province: 'Pampanga' },
  ),
  seed(
    'bp-005', 'customer',
    { name: 'Mactan Pixel Animation Studio Inc.', tin: '011-445-760-000', businessType: 'Company', group: 'Customers – Trade', industry: 'BPO / IT-BPM',
      contactChannels: [email('bp-005-ch1', 'admin@mactanpixel.example.ph')], customerPaymentTerms: 'Net 15', territory: 'Visayas',
      vatExemptions: [{ id: 've-bp-005', type: 'Zero-rated', certificateRef: 'PEZA-EO-2021-0932', basis: '', validUntil: '2026-06-30',
        attachments: [doc('att-bp-005-peza', 'PEZA_Certificate_2021.pdf', '2021-07-15', 'PEZA registration (expired)')] }],
      remarks: 'Animation studio in Mactan Economic Zone.\n'
        + 'Tax scenario (sales): zero-rating certificate expired on 30 Jun 2026 → warning, charged 31 VATable until they send the renewal.' },
    { firstName: 'Kevin', lastName: 'Ong', position: 'Admin Head', email: 'kevin.ong@mactanpixel.example.ph' },
    { street: 'MEPZ 1', block: 'Mactan Economic Zone', city: 'Lapu-Lapu City', zip: '6015', province: 'Cebu' },
  ),
  seed(
    'bp-006', 'customer',
    { name: 'Lourdes M. Villanueva', businessType: 'Individual', group: 'Customers – Retail', industry: 'Retail', channel: 'Walk-in',
      customerPaymentTerms: 'COD', vatRegistered: false, contactChannels: [mobile('bp-006-ch1', '+63 917 402 1188')],
      vatExemptions: [{ id: 've-bp-006', type: 'Exempt entity', certificateRef: 'OSCA-PSG-2019-44871', basis: 'RA 9994 / RA 10754 — Senior citizen / PWD', validUntil: '',
        attachments: [doc('att-bp-006-osca', 'OSCA_Senior_Citizen_ID.jpg', '2026-08-03', 'OSCA senior citizen ID')] }],
      remarks: 'Senior citizen, buys for personal use.\n'
        + 'Tax scenario (sales): senior citizen exemption with ID on file → 33 VAT-exempt sales (the 20% senior discount applies too).' },
    { firstName: 'Lourdes', middleName: 'M.', lastName: 'Villanueva', position: 'Senior citizen' },
    { street: 'Dr. Sixto Antonio Ave.', streetNo: '41', block: 'Kapasigan', city: 'Pasig', zip: '1600', province: 'Metro Manila' },
  ),
  seed(
    'bp-007', 'customer',
    { name: 'Guro ng Bayan Multi-Purpose Cooperative', tin: '412-778-903-000', businessType: 'Cooperative', group: 'Customers – Trade', industry: 'Cooperative',
      contactChannels: [email('bp-007-ch1', 'office@gurongbayancoop.example.ph')], customerPaymentTerms: 'Net 15', vatRegistered: false,
      vatExemptions: [{ id: 've-bp-007', type: 'Exempt entity', certificateRef: 'CDA-9520-00418823', basis: 'RA 9520 — Cooperative Code', validUntil: '2027-12-31',
        attachments: [doc('att-bp-007-cda', 'CDA_Certificate_of_Registration.pdf', '2025-01-20', 'CDA registration + BIR certificate of tax exemption')] }],
      remarks: 'Teachers’ cooperative; buys iPads for members through salary loans.\n'
        + 'Tax scenario (sales): cooperative with CDA certificate on file → 33 VAT-exempt sales.' },
    { firstName: 'Teresita', lastName: 'Ramos', position: 'Treasurer', email: 'treasurer@gurongbayancoop.example.ph' },
    { street: 'Caruncho Ave.', streetNo: '118', block: 'San Nicolas', city: 'Pasig', zip: '1600', province: 'Metro Manila' },
  ),
  seed(
    'bp-008', 'vendor',
    { roles: ['vendor', 'customer'], name: 'Kapitbahayan Transport Service Cooperative', tin: '415-202-661-000', businessType: 'Cooperative', group: 'Vendors – Services',
      industry: 'Logistics', contactChannels: [mobile('bp-008-ch1', '+63 918 330 7711', 'Dispatch')],
      vendorPaymentTerms: 'Net 7', customerPaymentTerms: 'COD', vatRegistered: false,
      vatExemptions: [{ id: 've-bp-008', type: 'Exempt entity', certificateRef: 'CDA-9520-00520190', basis: 'RA 9520 — Cooperative Code', validUntil: '', attachments: [] }],
      remarks: 'Delivery riders for our same-day deliveries; also buys iPhones for its dispatchers.\n'
        + 'Tax scenario (purchase, courier): non-VAT → 48 no input tax · WC160 2% EWT.\n'
        + 'Tax scenario (sales): exemption entered but no certificate attached → warning, charged 31 VATable.' },
    { firstName: 'Rodel', lastName: 'Manalo', position: 'Manager', email: 'kapitbahayan.tsc@example.ph' },
    { street: 'C. Raymundo Ave.', streetNo: '22', block: 'Maybunga', city: 'Pasig', zip: '1607', province: 'Metro Manila' },
  ),
  seed(
    'bp-009', 'customer',
    { name: 'Department of Education – Schools Division Office of Pasig City', businessType: 'Government', group: 'Customers – Government', industry: 'Government',
      contactChannels: [email('bp-009-ch1', 'supply.office@depedpasig.example.gov.ph')], customerPaymentTerms: 'Net 60', priceList: 'Government',
      remarks: 'iPads for teachers under a public bidding award (PhilGEPS).\n'
        + 'Tax scenario (sales): 31 VATable. The agency withholds 5% creditable VAT and 1% EWT and issues BIR Form 2307 — claim the VAT on 2550Q item 16.' },
    { firstName: 'Ramil', lastName: 'Ocampo', position: 'Supply Officer', email: 'supply.office@depedpasig.example.gov.ph' },
    { street: 'Caruncho Ave.', block: 'Malinao', city: 'Pasig', zip: '1600', province: 'Metro Manila' },
  ),
  seed(
    'bp-010', 'customer',
    { name: 'Harbourline Travel Pte. Ltd.', businessType: 'Non-resident foreign company', group: 'Customers – Trade', industry: 'Services',
      contactChannels: [email('bp-010-ch1', 'finance@harbourline.example.sg')], currency: 'USD', customerPaymentTerms: '50% DP, balance on delivery',
      vatRegistered: false, nonResident: true,
      remarks: 'Singapore travel company buying iPhones for its Manila-based staff, delivered here.\n'
        + 'Tax scenario (sales): non-resident buyer, goods consumed in the Philippines → 31 VATable (no exemption applies).' },
    { firstName: 'Rachel', lastName: 'Tan', position: 'Finance Manager', email: 'finance@harbourline.example.sg' },
    { street: 'Cecil St.', streetNo: '138', city: 'Singapore', zip: '069538', province: 'Other', country: 'Singapore' },
  ),

  // ── Leads ──────────────────────────────────────────────────────────────────
  seed(
    'bp-011', 'lead',
    { name: 'Mabini Academy Foundation Inc.', businessType: 'Company', industry: 'Education', leadSource: 'Trade show', leadStage: 'Qualified',
      contactChannels: [email('bp-011-ch1', 'registrar@mabiniacademy.example.edu.ph')],
      remarks: 'Private school planning a 1:1 iPad program for Grade 7. Needs a quote for 180 iPads with education pricing.' },
    { firstName: 'Paolo', lastName: 'Aquino', position: 'IT Coordinator', email: 'paolo.aquino@mabiniacademy.example.edu.ph' },
    { street: 'Mabini St.', streetNo: '15', city: 'Marikina', zip: '1800', province: 'Metro Manila' },
  ),
  seed(
    'bp-012', 'lead',
    { name: 'Tala Creative Agency', businessType: 'Partnership', industry: 'Media & advertising', leadSource: 'Website', leadStage: 'Lost',
      contactChannels: [email('bp-012-ch1', 'hello@talacreative.example.ph')],
      remarks: 'Wanted 12 MacBook Pros on 0% installment; went with another reseller on price.' },
    { firstName: 'Ella', lastName: 'Navarro', position: 'Operations', email: 'ella@talacreative.example.ph' },
    { street: 'Kalayaan Ave.', streetNo: '220', block: 'Poblacion', city: 'Makati', zip: '1210', province: 'Metro Manila' },
  ),

  // ── Vendors: local suppliers ───────────────────────────────────────────────
  seed(
    'bp-013', 'vendor',
    { name: 'Techzone Accessories Distribution Inc.', tin: '203-118-456-000', businessType: 'Company', group: 'Vendors – Local', industry: 'Wholesale',
      contactChannels: [phone('bp-013-ch1', '+63 2 8570 2210'), email('bp-013-ch2', 'orders@techzone.example.ph')], vendorPaymentTerms: 'Net 30',
      remarks: 'Third-party accessories (cases, screen protectors, chargers).\n'
        + 'Tax scenario (purchase, goods): 44 input VAT · WC158 1% EWT (we are a top withholding agent). The 1% is flat, so no sworn declaration is needed.' },
    { firstName: 'Janine', lastName: 'Co', position: 'Account Manager', email: 'janine.co@techzone.example.ph' },
    { street: 'Pioneer St.', streetNo: '55', block: 'Buayang Bato', city: 'Mandaluyong', zip: '1550', province: 'Metro Manila' },
  ),
  seed(
    'bp-014', 'vendor',
    { name: 'Sentinel Guard & Security Agency Inc.', tin: '206-554-120-000', businessType: 'Company', group: 'Vendors – Services', industry: 'Security services',
      contactChannels: [email('bp-014-ch1', 'billing@sentinelguard.example.ph')], vendorPaymentTerms: 'Net 15',
      remarks: 'Security guards for the Pasig and Muntinlupa stores.\n'
        + 'Tax scenario (purchase, contractor): 44 input VAT · WC120 2% EWT.' },
    { firstName: 'Ernesto', lastName: 'Dizon', position: 'Operations Manager', email: 'ernesto.dizon@sentinelguard.example.ph' },
    { street: 'Shaw Blvd.', streetNo: '410', block: 'Oranbo', city: 'Pasig', zip: '1600', province: 'Metro Manila' },
  ),
  seed(
    'bp-015', 'vendor',
    { name: 'Amazon Web Services, Inc.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [web('bp-015-ch1', 'aws.amazon.com')], currency: 'USD', vendorPaymentTerms: 'Net 7',
      vatRegistered: false, nonResident: true, nonResidentDigitalServices: true,
      remarks: 'Cloud hosting for our online store and POS back office, billed monthly in USD.\n'
        + 'Tax scenario (purchase, digital services, provider not registered with BIR — demo setting): 45 reverse-charge VAT · WV070 12% withholding VAT (1600-VT) · WC230 25% final tax.' },
    { firstName: 'AWS', lastName: 'Billing', position: 'Accounts receivable' },
    { street: 'Terry Ave. North', streetNo: '410', city: 'Seattle, WA', zip: '98109', province: 'Other', country: 'United States' },
  ),
  seed(
    'bp-016', 'vendor',
    { roles: ['vendor', 'customer'], name: 'Luzon iDistribution Corp.', tin: '789-012-345-000', businessType: 'Company', group: 'Vendors – Local', industry: 'Wholesale',
      contactChannels: [phone('bp-016-ch1', '+63 2 8845 6000'), email('bp-016-ch2', 'reseller.orders@luzonidist.example.ph')],
      customerPaymentTerms: 'Net 30', vendorPaymentTerms: 'Net 30', properties: ['Preferred supplier', 'Accepts e-invoice'], ...sworn('bp-016', 'SD-LID-2026', '2026-01-03'),
      bankAccounts: [newBankAccount({ id: 'bp-016-b1', bank: 'BDO Unibank', branch: 'Ayala Avenue', accountNo: '0045-8812-3301', accountName: 'Luzon iDistribution Corp.' })],
      defaultBankAccountId: 'bp-016-b1',
      remarks: 'Authorized Apple distributor: our local source for iPhone, iPad, Mac and AppleCare+. Also buys surplus stock back from us.\n'
        + 'Tax scenario (purchase, goods): 44 input VAT · WC158 1% EWT. AppleCare+ (services): 44 · WC160 2%.\n'
        + 'Tax scenario (sales): 31 VATable.' },
    { firstName: 'Trade', lastName: 'Desk', position: 'Reseller accounts', email: 'reseller.orders@luzonidist.example.ph' },
    { street: 'Ayala Ave.', streetNo: '6750', city: 'Makati', zip: '1226', province: 'Metro Manila' },
  ),

  // ── Vendors: non-resident ──────────────────────────────────────────────────
  seed(
    'bp-017', 'vendor',
    { name: 'Apple South Asia Pte. Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Import', industry: 'Technology',
      contactChannels: [web('bp-017-ch1', 'apple.com')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      remarks: 'Direct imports of Apple products, shipped from Singapore and cleared through our customs broker.\n'
        + 'Tax scenario (purchase, imported goods): 46 importations — the 12% import VAT is paid to the Bureau of Customs on the import entry, not to Apple · no withholding (foreign-source income).' },
    { firstName: 'Channel', lastName: 'Operations', position: 'Reseller channel' },
    { street: 'Ang Mo Kio Street 64', streetNo: '7', city: 'Singapore', zip: '569086', province: 'Other', country: 'Singapore' },
  ),
  seed(
    'bp-018', 'vendor',
    { name: 'OpenAI, LLC', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [web('bp-018-ch1', 'openai.com')], currency: 'USD', vendorPaymentTerms: 'COD',
      vatRegistered: false, nonResident: true, nonResidentDigitalServices: true,
      remarks: 'ChatGPT Team seats for the store and marketing teams, charged to the company card monthly.\n'
        + 'Tax scenario (purchase, digital services, provider not registered with BIR — demo setting): 45 · WV070 12% · WC230 25%.' },
    { firstName: 'OpenAI', lastName: 'Billing', position: 'Accounts receivable' },
    { street: '3rd Street', streetNo: '1455', city: 'San Francisco, CA', zip: '94158', province: 'Other', country: 'United States' },
  ),
  seed(
    'bp-019', 'vendor',
    { name: 'Google Asia Pacific Pte. Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [web('bp-019-ch1', 'ads.google.com')], vendorPaymentTerms: 'Net 30',
      vatRegistered: true, nonResident: true, nonResidentDigitalServices: true,
      remarks: 'Google Ads (search and YouTube) and Google Workspace.\n'
        + 'Tax scenario (purchase, digital services, provider registered with BIR — demo setting): it charges 12% VAT on the invoice → 44 input VAT · WC230 25% final tax.' },
    { firstName: 'Google Ads', lastName: 'Billing', position: 'Collections' },
    { street: 'Pasir Panjang Rd.', streetNo: '70', building: '#03-71 Mapletree Business City II', city: 'Singapore', zip: '117371', province: 'Other', country: 'Singapore' },
  ),
  seed(
    'bp-020', 'vendor',
    { name: 'Meta Platforms Ireland Limited', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [web('bp-020-ch1', 'facebook.com/business')], vendorPaymentTerms: 'COD',
      vatRegistered: true, nonResident: true, nonResidentDigitalServices: true,
      remarks: 'Facebook and Instagram ads for launches and promos.\n'
        + 'Tax scenario (purchase, digital services, provider registered with BIR — demo setting): 44 input VAT from its invoice · WC230 25% final tax.' },
    { firstName: 'Meta Ads', lastName: 'Billing', position: 'Collections' },
    { street: 'Merrion Rd.', city: 'Dublin 4', zip: 'D04 X2K5', province: 'Other', country: 'Ireland' },
  ),

  // ── Vendors: professionals and service providers ───────────────────────────
  seed(
    'bp-021', 'vendor',
    { name: 'Reyes Tan Aquino & Co., CPAs', tin: '212-667-890-000', businessType: 'General professional partnership', group: 'Vendors – Services', industry: 'Professional services',
      contactChannels: [email('bp-021-ch1', 'audit@rtaco.example.ph')], vendorPaymentTerms: 'Net 30',
      remarks: 'External auditor (annual audit and BIR filings). No sworn declaration on file.\n'
        + 'Tax scenario (purchase, professional fees): 44 input VAT · WC011 15% EWT (juridical payee, no declaration → higher rate).' },
    { firstName: 'Victor', lastName: 'Tan', position: 'Audit Partner', email: 'victor.tan@rtaco.example.ph' },
    { street: 'Valero St.', streetNo: '120', block: 'Salcedo Village', city: 'Makati', zip: '1227', province: 'Metro Manila' },
  ),
  seed(
    'bp-022', 'vendor',
    { name: 'Pier Four Customs Brokerage Inc.', tin: '218-331-045-000', businessType: 'Company', group: 'Vendors – Services', industry: 'Logistics',
      contactChannels: [email('bp-022-ch1', 'entries@pierfour.example.ph')], vendorPaymentTerms: 'Net 7', ...sworn('bp-022', 'SD-PFC-2026', '2026-01-09'),
      remarks: 'Clears our Apple imports at NAIA and the Port of Manila. Small firm: declared gross income ≤ ₱720,000.\n'
        + 'Tax scenario (purchase, broker commission): 44 input VAT · WC139 10% EWT (sworn declaration on file → lower rate).' },
    { firstName: 'Arnel', lastName: 'Bautista', position: 'Licensed Customs Broker', email: 'arnel.bautista@pierfour.example.ph' },
    { street: 'Railroad St.', building: 'Pier 4 Bldg., 2F', block: 'Port Area', city: 'Manila', zip: '1018', province: 'Metro Manila' },
  ),
  seed(
    'bp-023', 'vendor',
    { name: 'Bea Salonga Photography', tin: '301-778-221-000', businessType: 'Individual', group: 'Vendors – Services', industry: 'Media & advertising',
      contactChannels: [email('bp-023-ch1', 'bea@beasalonga.example.ph')], vendorPaymentTerms: 'Net 7', vatRegistered: false, ...sworn('bp-023', 'SD-BSP-2026', '2026-02-02'),
      remarks: 'Freelance product photographer for launch visuals. Non-VAT; declared gross income ≤ ₱3M.\n'
        + 'Tax scenario (purchase, professional fees): 48 no input tax · WI010 5% EWT.' },
    { firstName: 'Bea', lastName: 'Salonga', position: 'Photographer', email: 'bea@beasalonga.example.ph' },
    { street: 'Maginhawa St.', streetNo: '88', block: 'Teachers Village', city: 'Quezon City', zip: '1101', province: 'Metro Manila' },
  ),
  seed(
    'bp-024', 'vendor',
    { name: 'Engr. Marco D. Lim', tin: '305-990-114-000', businessType: 'Individual', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [email('bp-024-ch1', 'marco.lim@example.ph')], vendorPaymentTerms: 'Net 15', vatRegistrationDate: '2022-04-01',
      remarks: 'Independent IT consultant: network and MDM setup for corporate deployments. VAT-registered.\n'
        + 'Tax scenario (purchase, professional fees): 44 input VAT · WI011 10% EWT (VAT-registered individual → higher rate; no declaration needed).' },
    { firstName: 'Marco', middleName: 'D.', lastName: 'Lim', position: 'IT Consultant', email: 'marco.lim@example.ph' },
    { street: 'Scout Rallos St.', streetNo: '17', block: 'Laging Handa', city: 'Quezon City', zip: '1103', province: 'Metro Manila' },
  ),
  seed(
    'bp-025', 'vendor',
    { name: 'RJ Dizon Interiors & Construction', tin: '308-445-672-000', businessType: 'Sole proprietorship', group: 'Vendors – Services', industry: 'Construction',
      contactChannels: [mobile('bp-025-ch1', '+63 917 889 2040')], vendorPaymentTerms: '50% DP, balance on delivery', vatRegistered: false,
      remarks: 'Store fit-out and repairs. Non-VAT sole proprietor.\n'
        + 'Tax scenario (purchase, contractor): 48 no input tax · WI120 2% EWT.' },
    { firstName: 'Rolando', lastName: 'Dizon', position: 'Owner', email: 'rjdizon.interiors@example.ph' },
    { street: 'A. Mabini St.', streetNo: '301', block: 'Santolan', city: 'Pasig', zip: '1610', province: 'Metro Manila' },
  ),
  seed(
    'bp-026', 'vendor',
    { name: 'Jolina P. Cruz', tin: '310-552-008-000', businessType: 'Individual', group: 'Vendors – Services', industry: 'Retail',
      contactChannels: [mobile('bp-026-ch1', '+63 928 115 6630')], vendorPaymentTerms: 'Net 15', vatRegistered: false,
      swornDeclarationRef: 'SD-JPC-2025', swornDeclarationDate: '2025-01-15',
      swornDeclarationAttachments: [doc('att-bp-026-sd', 'Sworn_Declaration_SD-JPC-2025.pdf', '2025-01-15')],
      remarks: 'Independent sales agent for corporate accounts, paid a commission per closed deal. Non-VAT.\n'
        + 'Tax scenario (purchase, sales commission): 48 no input tax · WI516 10% EWT — her sworn declaration is for 2025, so the higher rate applies until she submits the 2026 one.' },
    { firstName: 'Jolina', middleName: 'P.', lastName: 'Cruz', position: 'Sales agent', email: 'jolina.cruz@example.ph' },
    { street: 'Col. Bonny Serrano Ave.', streetNo: '9', block: 'Bagong Lipunan', city: 'Quezon City', zip: '1111', province: 'Metro Manila' },
  ),
  seed(
    'bp-027', 'vendor',
    { name: 'SwiftCargo Express Corp.', tin: '221-908-334-000', businessType: 'Company', group: 'Vendors – Services', industry: 'Logistics',
      contactChannels: [email('bp-027-ch1', 'corporate@swiftcargo.example.ph')], vendorPaymentTerms: 'Net 15',
      remarks: 'Nationwide courier for provincial deliveries and store-to-store transfers.\n'
        + 'Tax scenario (purchase, services): 44 input VAT · WC160 2% EWT.' },
    { firstName: 'Liza', lastName: 'Mercado', position: 'Corporate Accounts', email: 'liza.mercado@swiftcargo.example.ph' },
    { street: 'Domestic Rd.', streetNo: '1480', block: 'Barangay 191', city: 'Pasay', zip: '1301', province: 'Metro Manila' },
  ),
  seed(
    'bp-028', 'vendor',
    { name: 'Philippine Postal Corporation', businessType: 'Government', group: 'Vendors – Services', industry: 'Government',
      contactChannels: [web('bp-028-ch1', 'phlpost.gov.ph')], vendorPaymentTerms: 'COD',
      remarks: 'Registered mail for warranty documents and BIR correspondence.\n'
        + 'Tax scenario (purchase, services): government payee → 44 input VAT · no withholding.' },
    { firstName: 'Business', lastName: 'Center', position: 'Corporate accounts' },
    { street: 'Liwasang Bonifacio', block: 'Ermita', city: 'Manila', zip: '1000', province: 'Metro Manila' },
  ),
  seed(
    'bp-029', 'vendor',
    { name: 'Kestrel Retail Systems Pte. Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [email('bp-029-ch1', 'projects@kestrelretail.example.sg')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      taxTreatyCountry: 'Singapore', taxTreatyCertificate: 'IRAS-COR-2026-118830', taxTreatyCertificateExpiry: '2026-12-31',
      remarks: 'Singapore firm integrating our POS with the ERP; its consultants work remotely and on site.\n'
        + 'Tax scenario (purchase, services from a non-resident, not digital services): 45 reverse-charge VAT · WV070 12% · WC230 25% final tax (no treaty income entered — the Philippines–Singapore treaty has no reduced rate for technical fees).' },
    { firstName: 'Daniel', lastName: 'Koh', position: 'Project Director', email: 'daniel.koh@kestrelretail.example.sg' },
    { street: 'Tanjong Pagar Rd.', streetNo: '1', city: 'Singapore', zip: '088537', province: 'Other', country: 'Singapore' },
  ),
  seed(
    'bp-030', 'vendor',
    { name: 'Nakamura Retail Software K.K.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [email('bp-030-ch1', 'licensing@nakamura-rs.example.jp')], currency: 'JPY', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      taxTreatyCountry: 'Japan', taxTreatyCertificate: 'NTA-COR-2026-55102', taxTreatyCertificateExpiry: '2027-03-31',
      taxTreatyIncomes: [{ id: 'ti-bp-030', incomeType: 'Royalties', approvedRate: 10, ttraApprovalDate: '2026-03-18',
        attachments: [doc('att-bp-030-ttra', 'TTRA_Confirmation_Royalties.pdf', '2026-03-18', 'BIR ruling on the treaty rate'), doc('att-bp-030-cor', 'Certificate_of_Residence_2026.pdf', '2026-02-10')] }],
      remarks: 'Licenses the POS software we run in every store (annual licence fee).\n'
        + 'Tax scenario (purchase, royalties from a non-resident with treaty relief): 45 · WV050 12% withholding VAT on use of property rights · WC230 at the 10% Japan treaty rate instead of 25%.' },
    { firstName: 'Haruto', lastName: 'Sato', position: 'Licensing', email: 'licensing@nakamura-rs.example.jp' },
    { street: 'Shiba-koen', streetNo: '2-4-1', city: 'Minato-ku, Tokyo', zip: '105-0011', province: 'Other', country: 'Japan' },
  ),
  seed(
    'bp-031', 'vendor',
    { name: 'Ayu Pratama', businessType: 'Individual', group: 'Vendors – Services', industry: 'Media & advertising',
      contactChannels: [email('bp-031-ch1', 'ayu.pratama@example.id')], currency: 'USD', vendorPaymentTerms: 'Net 7', vatRegistered: false, nonResident: true,
      remarks: 'Freelance motion designer in Jakarta; makes our launch videos remotely.\n'
        + 'Tax scenario (purchase, services from a non-resident individual): 45 · WV070 12% · WI330 25% final tax.' },
    { firstName: 'Ayu', lastName: 'Pratama', position: 'Motion designer', email: 'ayu.pratama@example.id' },
    { street: 'Jl. Kemang Raya', streetNo: '12', city: 'Jakarta', zip: '12730', province: 'Other', country: 'Indonesia' },
  ),
  seed(
    'bp-032', 'vendor',
    { name: 'Harbour Capital Asia Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Financial services',
      contactChannels: [email('bp-032-ch1', 'loans@harbourcapital.example.hk')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      remarks: 'Hong Kong lender: USD inventory financing for the iPhone launch season.\n'
        + 'Tax scenario (purchase, interest): 48 no input tax (interest is not VATable) · WC180 20% final tax on interest on foreign loans.' },
    { firstName: 'Winnie', lastName: 'Chan', position: 'Relationship Manager', email: 'winnie.chan@harbourcapital.example.hk' },
    { street: 'Queen’s Rd. Central', streetNo: '99', city: 'Hong Kong', zip: '', province: 'Other', country: 'Hong Kong' },
  ),

  // ── Edge cases: overrides, incomplete paperwork, other business types ──────
  seed(
    'bp-033', 'vendor',
    { name: 'Santos Villareal & Partners Law Offices', tin: '214-003-778-000', businessType: 'General professional partnership', group: 'Vendors – Services',
      industry: 'Professional services', contactChannels: [email('bp-033-ch1', 'billing@svplaw.example.ph')], vendorPaymentTerms: 'Net 30',
      withholdingOverrideId: 'wt-WC010',
      remarks: 'Corporate counsel on retainer (contracts, labor cases, BIR assessments).\n'
        + 'Tax scenario (purchase, vendor override): withholding fixed to professional fees WC010 on the vendor, adjusted for the income tier — no sworn declaration, so WC011 15% · 44 input VAT.' },
    { firstName: 'Andres', lastName: 'Villareal', position: 'Managing Partner', email: 'andres.villareal@svplaw.example.ph' },
    { street: 'Rufino St.', streetNo: '6780', block: 'Legaspi Village', city: 'Makati', zip: '1229', province: 'Metro Manila' },
  ),
  seed(
    'bp-034', 'vendor',
    { name: 'Metro Aircon Services Inc.', tin: '223-417-906-000', businessType: 'Company', group: 'Vendors – Services', industry: 'Services',
      contactChannels: [phone('bp-034-ch1', '+63 2 8911 2045')], vendorPaymentTerms: 'Net 15', withholdingOverrideId: 'wt-WC120',
      remarks: 'Aircon maintenance for all stores under a service contract.\n'
        + 'Tax scenario (purchase, vendor override): the contract is treated as a contractor’s service, so the vendor carries WC120 2% instead of the item’s services ATC (WC160) · 44 input VAT.' },
    { firstName: 'Noel', lastName: 'Pineda', position: 'Service Manager', email: 'service@metroaircon.example.ph' },
    { street: 'E. Rodriguez Jr. Ave.', streetNo: '1520', block: 'Bagumbayan', city: 'Quezon City', zip: '1110', province: 'Metro Manila' },
  ),
  seed(
    'bp-035', 'vendor',
    { name: 'Pixelhaus Design Studio Inc.', tin: '226-880-312-000', businessType: 'Company', group: 'Vendors – Services', industry: 'Media & advertising',
      contactChannels: [email('bp-035-ch1', 'accounts@pixelhaus.example.ph')], vendorPaymentTerms: 'Net 15',
      swornDeclarationRef: 'SD-PXH-2026', swornDeclarationDate: '2026-02-20', swornDeclarationAttachments: [],
      remarks: 'In-store signage and campaign design. Sent the sworn declaration reference by email but not the signed copy.\n'
        + 'Tax scenario (purchase, professional fees): declaration without a document → warning, WC011 15% until the file is uploaded · 44 input VAT.' },
    { firstName: 'Carmela', lastName: 'Reyes', position: 'Studio Manager', email: 'carmela.reyes@pixelhaus.example.ph' },
    { street: 'Tomas Morato Ave.', streetNo: '255', block: 'South Triangle', city: 'Quezon City', zip: '1103', province: 'Metro Manila' },
  ),
  seed(
    'bp-036', 'vendor',
    { name: 'Rosario T. Uy', tin: '118-440-925-000', businessType: 'Individual', group: 'Vendors – Services', industry: 'Real estate',
      contactChannels: [mobile('bp-036-ch1', '+63 917 620 4410')], vendorPaymentTerms: 'Net 7', vatRegistered: false,
      remarks: 'Owns the building on Osmeña Blvd. where our Cebu store is. Non-VAT individual lessor.\n'
        + 'Tax scenario (purchase, rent from an individual): 48 no input tax · WI100 5% EWT.' },
    { firstName: 'Rosario', middleName: 'T.', lastName: 'Uy', position: 'Lessor' },
    { street: 'Osmeña Blvd.', streetNo: '210', block: 'Capitol Site', city: 'Cebu City', zip: '6000', province: 'Cebu' },
  ),
  seed(
    'bp-037', 'vendor',
    { name: 'Kyle Andrada', tin: '331-207-554-000', businessType: 'Individual', group: 'Vendors – Services', industry: 'Media & advertising',
      contactChannels: [email('bp-037-ch1', 'kyle.andrada@example.ph')], vendorPaymentTerms: 'Net 7', vatRegistered: false,
      remarks: 'Freelance video editor for unboxing and launch content. New vendor, non-VAT, no sworn declaration yet.\n'
        + 'Tax scenario (purchase, professional fees): 48 no input tax · WI011 10% EWT until he submits a declaration (then WI010 5%).' },
    { firstName: 'Kyle', lastName: 'Andrada', position: 'Video editor', email: 'kyle.andrada@example.ph' },
    { street: 'P. Tuazon Blvd.', streetNo: '64', block: 'Socorro', city: 'Quezon City', zip: '1109', province: 'Metro Manila' },
  ),
  seed(
    'bp-038', 'vendor',
    { name: 'Pacific Rim Equipment Leasing Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Financial services',
      contactChannels: [email('bp-038-ch1', 'leases@pacificrimleasing.example.hk')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      remarks: 'Hong Kong lessor of our POS terminals and card readers (36-month operating lease).\n'
        + 'Tax scenario (purchase, equipment lease from a non-resident): 45 · WV050 12% withholding VAT on use of property · WC300 7.5% final tax on equipment rentals.' },
    { firstName: 'Kelvin', lastName: 'Lau', position: 'Lease Administrator', email: 'kelvin.lau@pacificrimleasing.example.hk' },
    { street: 'Connaught Rd. Central', streetNo: '28', city: 'Hong Kong', zip: '', province: 'Other', country: 'Hong Kong' },
  ),
  seed(
    'bp-039', 'vendor',
    { name: 'Hanil Digital Signage Co., Ltd.', businessType: 'Non-resident foreign company', group: 'Vendors – Services', industry: 'Technology',
      contactChannels: [email('bp-039-ch1', 'global@hanilsignage.example.kr')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      taxTreatyCountry: 'South Korea', taxTreatyCertificate: 'NTS-COR-2025-30418', taxTreatyCertificateExpiry: '2026-06-30',
      taxTreatyIncomes: [{ id: 'ti-bp-039', incomeType: 'Royalties', approvedRate: 10, ttraApprovalDate: '2025-08-12',
        attachments: [doc('att-bp-039-ttra', 'TTRA_Confirmation_Royalties.pdf', '2025-08-12', 'BIR ruling on the treaty rate')] }],
      remarks: 'Licenses the content software for our in-store video walls.\n'
        + 'Tax scenario (purchase, royalties, treaty paperwork lapsed): Certificate of Residence expired 30 Jun 2026 → warning, WC230 25% instead of the 10% treaty rate until a new one arrives · 45 · WV050 12%.' },
    { firstName: 'Ji-woo', lastName: 'Park', position: 'Global Accounts', email: 'global@hanilsignage.example.kr' },
    { street: 'Teheran-ro', streetNo: '152', city: 'Gangnam-gu, Seoul', zip: '06236', province: 'Other', country: 'South Korea' },
  ),
  seed(
    'bp-040', 'customer',
    { name: 'Subic Bay Marine Logistics Inc.', tin: '015-330-871-000', businessType: 'Company', group: 'Customers – Trade', industry: 'Logistics',
      contactChannels: [email('bp-040-ch1', 'purchasing@sbml.example.ph')], customerPaymentTerms: 'Net 30', territory: 'North Luzon',
      vatExemptions: [{ id: 've-bp-040', type: 'Zero-rated', certificateRef: 'SBMA-CRT-2026-0215', basis: '', validUntil: '2029-03-31', attachments: [] }],
      remarks: 'New SBMA-registered export enterprise ordering iPads for its terminal crew. Gave the certificate number; the copy is still to follow.\n'
        + 'Tax scenario (sales): zero-rating entered without a document → warning, charged 31 VATable until the certificate is attached.' },
    { firstName: 'Rafael', lastName: 'Domingo', position: 'Purchasing Officer', email: 'rafael.domingo@sbml.example.ph' },
    { street: 'Rizal Hwy.', streetNo: 'Bldg 229', block: 'Subic Bay Freeport Zone', city: 'Olongapo', zip: '2222', province: 'Other' },
  ),
  seed(
    'bp-041', 'customer',
    { name: 'ASEAN Regional Health Institute', tin: '016-902-448-000', businessType: 'Company', group: 'Customers – Trade', industry: 'Services',
      contactChannels: [email('bp-041-ch1', 'procurement@arhi.example.org')], customerPaymentTerms: 'Net 30',
      vatExemptions: [{ id: 've-bp-041', type: 'Exempt entity', certificateRef: 'BIR-ITAD-2023-117', basis: 'Sec. 109 NIRC — BIR tax exemption ruling', validUntil: '2026-03-31',
        attachments: [doc('att-bp-041-ruling', 'BIR_Exemption_Ruling_2023.pdf', '2023-04-05', 'BIR tax exemption ruling (expired)')] }],
      remarks: 'Regional research institute buying MacBooks for its Manila office. Its exemption ruling lapsed on 31 Mar 2026.\n'
        + 'Tax scenario (sales): exempt-entity ruling expired → warning, charged 31 VATable until the renewed ruling is on file.' },
    { firstName: 'Nadia', lastName: 'Rahman', position: 'Procurement Officer', email: 'nadia.rahman@arhi.example.org' },
    { street: 'Pedro Gil St.', streetNo: '625', block: 'Ermita', city: 'Manila', zip: '1000', province: 'Metro Manila' },
  ),
  seed(
    'bp-042', 'vendor',
    { name: 'Nordlys Freight AS – Philippine Branch', tin: '227-661-093-000', businessType: 'Resident foreign company', group: 'Vendors – Services', industry: 'Logistics',
      contactChannels: [email('bp-042-ch1', 'manila@nordlysfreight.example.com')], vendorPaymentTerms: 'Net 30',
      remarks: 'Philippine branch of a Norwegian freight forwarder: air freight for our Apple imports from Singapore.\n'
        + 'Tax scenario (purchase, services): a resident foreign corporation is taxed like a domestic one → 44 input VAT · WC160 2% EWT.' },
    { firstName: 'Erik', lastName: 'Haugen', position: 'Branch Manager', email: 'erik.haugen@nordlysfreight.example.com' },
    { street: 'NAIA Rd.', building: 'Cargo Terminal 3', block: 'Barangay 191', city: 'Pasay', zip: '1301', province: 'Metro Manila' },
  ),
  seed(
    'bp-043', 'vendor',
    { name: 'Brightline Retail Advisory LLP', businessType: 'Non-resident foreign partnership', group: 'Vendors – Services', industry: 'Professional services',
      contactChannels: [email('bp-043-ch1', 'engagements@brightline.example.co.uk')], currency: 'USD', vendorPaymentTerms: 'Net 30', vatRegistered: false, nonResident: true,
      remarks: 'UK retail consultancy that reviewed our store layouts and staffing, working remotely.\n'
        + 'Tax scenario (purchase, services from a non-resident partnership): 45 · WV070 12% · WC230 25% final tax.' },
    { firstName: 'Olivia', lastName: 'Hart', position: 'Partner', email: 'olivia.hart@brightline.example.co.uk' },
    { street: 'Old Broad St.', streetNo: '25', city: 'London', zip: 'EC2N 1HN', province: 'Other', country: 'United Kingdom' },
  ),
  seed(
    'bp-044', 'customer',
    { name: 'Kessler & Voss Architects – Manila Branch', tin: '228-104-560-000', businessType: 'Resident foreign partnership', group: 'Customers – Trade', industry: 'Professional services',
      contactChannels: [email('bp-044-ch1', 'office.manila@kesslervoss.example.de')], customerPaymentTerms: 'Net 15',
      remarks: 'Manila office of a German architecture firm; buys MacBook Pros and Studio Displays for its designers.\n'
        + 'Tax scenario (sales): 31 VATable.' },
    { firstName: 'Lukas', lastName: 'Brandt', position: 'Office Manager', email: 'office.manila@kesslervoss.example.de' },
    { street: '5th Ave.', streetNo: '30', block: 'Bonifacio Global City', city: 'Taguig', zip: '1634', province: 'Metro Manila' },
  ),
];
