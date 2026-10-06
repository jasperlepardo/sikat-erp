import type { LeadStage, PartnerRole } from '../../mocks/partners';

/** How each business partner role presents itself: which hub owns it and what it's called. */
export const ROLE_CONFIG: Record<
  PartnerRole,
  { title: string; singular: string; icon: string; basePath: string; subcopy: string }
> = {
  lead: {
    title: 'Leads',
    singular: 'Lead',
    icon: 'person_search',
    basePath: '/crm/leads',
    subcopy: "Prospects you haven't sold to yet.",
  },
  customer: {
    title: 'Customers',
    singular: 'Customer',
    icon: 'storefront',
    basePath: '/sales/customers',
    subcopy: 'Businesses and people you sell to.',
  },
  vendor: {
    title: 'Vendors',
    singular: 'Vendor',
    icon: 'local_shipping',
    basePath: '/purchasing/vendors',
    subcopy: 'Suppliers you buy from.',
  },
};

export const ROLE_ORDER: PartnerRole[] = ['lead', 'customer', 'vendor'];

/** Where a partner screen is opened from: the master (all partners) or one role's list. */
export type PartnerScope = PartnerRole | 'all';

export const MASTER_CONFIG = {
  title: 'Business Partners',
  singular: 'Business partner',
  icon: 'groups',
  basePath: '/crm/business-partners',
  subcopy: 'Every lead, customer and vendor — one record per company or person.',
};

export const scopeConfig = (scope: PartnerScope) => (scope === 'all' ? MASTER_CONFIG : ROLE_CONFIG[scope]);

export const STAGE_INTENT: Record<LeadStage, 'default' | 'primary' | 'success' | 'danger'> = {
  New: 'default',
  Contacted: 'primary',
  Qualified: 'success',
  Lost: 'danger',
};
