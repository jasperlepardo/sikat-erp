import { SEED_PARTNERS, type Partner, type PartnerRole } from '../mocks/partners';
import { createCollection } from './store';

const partners = createCollection<Partner>('sikat-erp:partners', SEED_PARTNERS, 'bp');

export const listPartners = partners.list;
export const getPartner = partners.get;
export const resetPartners = partners.reset;

export async function listPartnersByRole(role: PartnerRole): Promise<Partner[]> {
  return (await partners.list()).filter((p) => p.roles.includes(role));
}

/** New partners get the next BP-#### code. */
export async function savePartner(input: Omit<Partner, 'id'> & { id?: string }): Promise<Partner> {
  if (input.code.trim()) return partners.save(input);
  const all = await partners.list();
  const next = Math.max(0, ...all.map((p) => Number(p.code.replace(/\D/g, '')) || 0)) + 1;
  return partners.save({ ...input, code: `BP-${String(next).padStart(4, '0')}` });
}

/**
 * Lead → customer on the same record: the lead role is swapped for customer,
 * so the partner leaves the Leads list and appears under Sales › Customers.
 */
export async function convertLeadToCustomer(id: string): Promise<Partner | undefined> {
  const partner = await partners.get(id);
  if (!partner) return undefined;
  const roles: PartnerRole[] = [...new Set([...partner.roles.filter((r) => r !== 'lead'), 'customer' as const])];
  return partners.save({ ...partner, roles, customerTerms: partner.customerTerms ?? 'Net 30', creditLimit: partner.creditLimit ?? 0 });
}
