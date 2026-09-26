import { SEED_ITEMS, type Item } from '../mocks/items';

/**
 * Fake "API" for items. Every call is async with a small delay so screens handle
 * loading states like they would against a real backend — swap these bodies for
 * `fetch` calls later without touching the UI.
 */
const STORAGE_KEY = 'sikat-erp:items';
const LATENCY_MS = 250;

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

function load(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Item[];
  } catch {
    /* storage unavailable or corrupt — fall back to seed */
  }
  return structuredClone(SEED_ITEMS);
}

function persist(items: Item[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — changes live for this page load only */
  }
}

let items = load();

export const isLowStock = (item: Item) => item.onHand <= item.reorderLevel;

export async function listItems(): Promise<Item[]> {
  await wait();
  return structuredClone(items);
}

export async function getItem(id: string): Promise<Item | undefined> {
  await wait();
  const item = items.find((i) => i.id === id);
  return item && structuredClone(item);
}

export async function saveItem(input: Omit<Item, 'id'> & { id?: string }): Promise<Item> {
  await wait();
  const item: Item = { ...input, id: input.id ?? `itm-${crypto.randomUUID().slice(0, 8)}` };
  const index = items.findIndex((i) => i.id === item.id);
  items = index === -1 ? [...items, item] : items.map((i) => (i.id === item.id ? item : i));
  persist(items);
  return structuredClone(item);
}

/** Restore the seed data (handy while demoing). */
export async function resetItems(): Promise<void> {
  items = structuredClone(SEED_ITEMS);
  persist(items);
}
