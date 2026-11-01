/** A document's name, said once: the sidebar, breadcrumb, buttons, titles and captions are all built from it. */
export interface Noun {
  one: string;
  many: string;
  /** Section title for the document's line-item table, lowercase (e.g. 'ordered items'); title-cased with cap() at render. */
  lineLabel?: string;
}

/** Sentence case for a heading: capitalises the first letter only ("purchase orders" → "Purchase orders"). */
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
