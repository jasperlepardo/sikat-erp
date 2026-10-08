/** Our companies (Settings › Company › Companies) and the one picked in the navbar switcher. */
import { useEffect, useState } from 'react';
import { SEED_COMPANIES, type Company } from '../mocks/companies';
import type { Warehouse } from '../mocks/itemMasters';
import { warehouses } from './inventoryMasters';
import { createCollection } from './store';

export const companies = createCollection<Company>('sikat-erp:companies:v6', SEED_COMPANIES, 'co');

/** The company's registered office, if it's set and still exists. */
export const registeredOfficeOf = (c: Pick<Company, 'registeredOffice'>, locations: readonly Warehouse[]) =>
  c.registeredOffice ? locations.find((w) => w.code === c.registeredOffice) : undefined;

/** The company with its address read from its registered office. */
export const withRegisteredAddress = (c: Company, locations: readonly Warehouse[]): Company => {
  const office = registeredOfficeOf(c, locations);
  return office ? { ...c, address: office.address } : c;
};

const CURRENT_KEY = 'sikat-erp:current-company';
const listeners = new Set<() => void>();

export function currentCompanyId(): string {
  try {
    return localStorage.getItem(CURRENT_KEY) || SEED_COMPANIES[0].id;
  } catch {
    return SEED_COMPANIES[0].id;
  }
}

export function setCurrentCompanyId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* storage unavailable — the switch lasts for this page load only */
  }
  listeners.forEach((fn) => fn());
}

/** The company documents are created in; falls back to the first active one. */
export async function loadCurrentCompany(): Promise<Company> {
  const [all, locations] = await Promise.all([companies.list(), warehouses.list()]);
  const id = currentCompanyId();
  return withRegisteredAddress(all.find((c) => c.id === id) ?? all.find((c) => c.active) ?? SEED_COMPANIES[0], locations);
}

/** The current company, kept up to date when it's switched or edited. `undefined` while loading. */
export function useCurrentCompany() {
  const [company, setCompany] = useState<Company>();
  useEffect(() => {
    let live = true;
    const load = () => loadCurrentCompany().then((c) => live && setCompany(c));
    load();
    listeners.add(load);
    const off = companies.subscribe(load);
    // The address lives on the registered office.
    const offLocations = warehouses.subscribe(load);
    return () => {
      live = false;
      listeners.delete(load);
      off();
      offLocations();
    };
  }, []);
  return company;
}
