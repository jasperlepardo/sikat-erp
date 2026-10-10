import type { CoveredLine, DocNode } from './documentLinks';

export type Relation = 'Base' | 'This' | 'Target';

/** A document linked to the one open, directly or through others. */
export interface LinkedDocument extends DocNode {
  relation: Relation;
  /** Steps from the open document: 1 = copied straight from or to it. */
  depth: number;
  /** For an indirect link, the document it's linked through (the next one toward the open document). */
  via?: string;
  /** The lines copied across the link this row was reached by. */
  covers: CoveredLine[];
  /** What a link without lines carried, e.g. a payment's "Paid PHP 1,000.00". */
  note?: string;
}

const keyOf = (kind: string, id: string) => `${kind}:${id}`;

/**
 * The open document's whole lineage: every base document it came from, however far back
 * (PO ← RFQ ← PR), and every target document made from it, however far forward
 * (GRPO → A/P invoice → credit memo). Documents on other branches — another receipt from the
 * same PO — aren't in its lineage, so they aren't listed.
 */
export function lineage(nodes: DocNode[], kind: string, id: string): LinkedDocument[] {
  const byKey = new Map(nodes.map((n) => [keyOf(n.kind, n.id), n]));
  const targetsOf = new Map<string, { node: DocNode; lines: CoveredLine[]; note?: string }[]>();
  for (const n of nodes) {
    for (const b of n.bases) {
      const k = keyOf(b.kind, b.id);
      targetsOf.set(k, [...(targetsOf.get(k) ?? []), { node: n, lines: b.lines, note: b.note }]);
    }
  }

  const self = byKey.get(keyOf(kind, id));
  if (!self) return [];
  const seen = new Set([keyOf(kind, id)]);
  const out: LinkedDocument[] = [{ ...self, relation: 'This', depth: 0, covers: [] }];

  // Walk one direction breadth-first, so each document is reached by its shortest path.
  const walk = (relation: 'Base' | 'Target', next: (n: DocNode) => { node: DocNode; lines: CoveredLine[]; note?: string }[]) => {
    let frontier: DocNode[] = [self];
    for (let depth = 1; frontier.length; depth++) {
      const reached: DocNode[] = [];
      for (const from of frontier) {
        for (const { node, lines, note } of next(from)) {
          const k = keyOf(node.kind, node.id);
          if (seen.has(k)) continue;
          seen.add(k);
          reached.push(node);
          out.push({ ...node, relation, depth, via: from === self ? undefined : `${from.type} ${from.number}`, covers: lines, note });
        }
      }
      frontier = reached;
    }
  };
  walk('Base', (n) => n.bases.flatMap((b) => {
    const node = byKey.get(keyOf(b.kind, b.id));
    return node ? [{ node, lines: b.lines, note: b.note }] : [];
  }));
  walk('Target', (n) => targetsOf.get(keyOf(n.kind, n.id)) ?? []);

  // Read as a chain: oldest bases first, then this document, then targets in the order they follow.
  const rank = (d: LinkedDocument) => (d.relation === 'Base' ? -d.depth : d.relation === 'This' ? 0 : d.depth);
  return out.sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
}
