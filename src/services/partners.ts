import { SEED_PARTNERS, contactName, type Partner, type PartnerRole } from '../mocks/partners';
import { createCollection } from './store';

// v8: G/L accounts are stored as chart-of-accounts codes.
const partners = createCollection<Partner>('sikat-erp:partners:v21', SEED_PARTNERS, 'bp');

export const listPartners = partners.list;
export const getPartner = partners.get;
export const resetPartners = partners.reset;

export async function listPartnersByRole(role: PartnerRole): Promise<Partner[]> {
  return (await partners.list()).filter((p) => p.roles.includes(role));
}

/** Codes are unique. Auto-numbered partners get the next BP-####. */
export async function savePartner(input: Omit<Partner, 'id'> & { id?: string }): Promise<Partner> {
  const all = await partners.list();
  const code = input.code.trim();
  if (code && all.some((p) => p.id !== input.id && p.code.toLowerCase() === code.toLowerCase())) {
    throw new Error(`Code ${code} is already used by another business partner.`);
  }
  if (code) return partners.save({ ...input, code });
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
  return partners.save({ ...partner, roles, group: partner.group === 'Leads' ? 'Customers – Trade' : partner.group });
}

/** Active now: Active, or Advanced with today inside From/To. */
export function isActive(p: Pick<Partner, 'status' | 'statusFrom' | 'statusTo'>, today = new Date().toISOString().slice(0, 10)) {
  if (p.status === 'Advanced') return (!p.statusFrom || p.statusFrom <= today) && (!p.statusTo || today <= p.statusTo);
  return p.status === 'Active';
}

export const defaultContact = (p: Partner) => p.contacts.find((c) => c.id === p.defaultContactId) ?? p.contacts[0];
export const defaultContactName = (p: Partner) => contactName(defaultContact(p));
export const defaultBillTo = (p: Partner) =>
  p.addresses.find((a) => a.id === p.defaultBillToId) ?? p.addresses.find((a) => a.isBilling);
