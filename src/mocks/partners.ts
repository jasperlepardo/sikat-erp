/**
 * Business partners — one record shown as three lists: Leads (CRM),
 * Customers (Sales) and Vendors (Purchasing). A partner can hold several roles,
 * e.g. a customer who also supplies you.
 */
export type PartnerRole = 'lead' | 'customer' | 'vendor';
export type PartnerStatus = 'Active' | 'Inactive';
export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Lost';

export interface Partner {
  id: string;
  code: string;
  name: string;
  roles: PartnerRole[];
  status: PartnerStatus;
  tin?: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  /** Customer: payment terms you give them. */
  customerTerms?: string;
  creditLimit?: number;
  /** Vendor: payment terms they give you. */
  vendorTerms?: string;
  /** Lead only. */
  leadSource?: string;
  leadStage?: LeadStage;
  notes?: string;
}

export const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 60'] as const;
export const LEAD_SOURCES = ['Referral', 'Website', 'Trade show', 'Walk-in', 'Cold call'] as const;
export const LEAD_STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Lost'];

export const SEED_PARTNERS: Partner[] = [
  {
    id: 'bp-001', code: 'BP-0001', name: 'Acme Construction Corp.', roles: ['customer'], status: 'Active',
    tin: '123-456-789-000', contactPerson: 'Maria Santos', email: 'purchasing@acmeconstruction.ph', phone: '+63 2 8812 3456',
    address: '21 Shaw Blvd.', city: 'Mandaluyong', customerTerms: 'Net 30', creditLimit: 500000,
  },
  {
    id: 'bp-002', code: 'BP-0002', name: 'Metro Hardware Supply', roles: ['customer', 'vendor'], status: 'Active',
    tin: '234-567-890-000', contactPerson: 'Jose Reyes', email: 'orders@metrohardware.ph', phone: '+63 2 8723 1100',
    address: '88 Rizal Ave.', city: 'Manila', customerTerms: 'Net 15', creditLimit: 250000, vendorTerms: 'Net 30',
    notes: 'Buys paint from us; we buy fasteners from them.',
  },
  {
    id: 'bp-003', code: 'BP-0003', name: 'Luzon Steel Industries', roles: ['vendor'], status: 'Active',
    tin: '345-678-901-000', contactPerson: 'Ramon Cruz', email: 'sales@luzonsteel.ph', phone: '+63 44 791 2233',
    address: 'Km 45 MacArthur Hwy.', city: 'Malolos', vendorTerms: 'Net 60',
  },
  {
    id: 'bp-004', code: 'BP-0004', name: 'Visayas Electrical Trading', roles: ['vendor'], status: 'Active',
    tin: '456-789-012-000', contactPerson: 'Ana Villanueva', email: 'ap@visayaselectrical.ph', phone: '+63 32 255 4410',
    address: '12 Osmeña Blvd.', city: 'Cebu City', vendorTerms: 'Net 30',
  },
  {
    id: 'bp-005', code: 'BP-0005', name: 'Northpoint Builders', roles: ['customer'], status: 'Active',
    contactPerson: 'Carlo Mendoza', email: 'carlo@northpointbuilders.ph', phone: '+63 917 555 0142',
    address: '5 Session Rd.', city: 'Baguio', customerTerms: 'COD', creditLimit: 0,
  },
  {
    id: 'bp-006', code: 'BP-0006', name: 'Pacific Paints Inc.', roles: ['vendor', 'customer'], status: 'Active',
    tin: '567-890-123-000', contactPerson: 'Liza Tan', email: 'trade@pacificpaints.ph', phone: '+63 2 8634 7788',
    address: '400 EDSA', city: 'Quezon City', vendorTerms: 'Net 30', customerTerms: 'Net 30', creditLimit: 150000,
  },
  {
    id: 'bp-007', code: 'BP-0007', name: 'Island Homes Development', roles: ['customer'], status: 'Inactive',
    contactPerson: 'Mark Lim', email: 'mark.lim@islandhomes.ph', phone: '+63 82 224 9901',
    address: '77 JP Laurel Ave.', city: 'Davao City', customerTerms: 'Net 30', creditLimit: 300000,
  },
  {
    id: 'bp-008', code: 'BP-0008', name: 'Golden Plumbing Center', roles: ['vendor'], status: 'Inactive',
    contactPerson: 'Rosa Garcia', email: 'rosa@goldenplumbing.ph', phone: '+63 2 8541 2020',
    address: '31 Aurora Blvd.', city: 'San Juan', vendorTerms: 'COD',
  },
  {
    id: 'bp-009', code: 'BP-0009', name: 'Sunrise Renovations', roles: ['lead'], status: 'Active',
    contactPerson: 'Paolo Aquino', email: 'paolo@sunrisereno.ph', phone: '+63 918 222 3344',
    address: '9 Katipunan Ave.', city: 'Quezon City', leadSource: 'Referral', leadStage: 'Qualified',
    notes: 'Referred by Acme. Needs quote for 200 boxes of screws.',
  },
  {
    id: 'bp-010', code: 'BP-0010', name: 'Bayview Condominium Corp.', roles: ['lead'], status: 'Active',
    contactPerson: 'Grace Dela Cruz', email: 'admin@bayviewcondo.ph', phone: '+63 2 8831 6060',
    address: '1200 Roxas Blvd.', city: 'Pasay', leadSource: 'Website', leadStage: 'Contacted',
  },
  {
    id: 'bp-011', code: 'BP-0011', name: 'Mindanao Agri Supplies', roles: ['lead'], status: 'Active',
    contactPerson: 'Nestor Ramos', email: 'nestor@mindanaoagri.ph', phone: '+63 88 856 7123',
    address: '14 Corrales Ave.', city: 'Cagayan de Oro', leadSource: 'Trade show', leadStage: 'New',
  },
  {
    id: 'bp-012', code: 'BP-0012', name: 'Quickfix Home Services', roles: ['lead'], status: 'Active',
    contactPerson: 'Ella Navarro', email: 'ella@quickfix.ph', phone: '+63 927 400 1188',
    address: '3 Alabang–Zapote Rd.', city: 'Las Piñas', leadSource: 'Walk-in', leadStage: 'Lost',
    notes: 'Went with a competitor on price.',
  },
];
