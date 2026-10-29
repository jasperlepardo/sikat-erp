/**
 * Source-launched line picker for "Create {target}" hops. Launched from a source document's ⋯ menu,
 * it shows that document's open lines (via a CopyHop entry), lets the user tick lines and set
 * quantities, then navigates to the target /new carrying the picks in location.state. The target's
 * existing prefill effect reads `state.picks` and builds its lines. Generic over the hop, so it's
 * shared by purchasing and sales alike.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { CopyPanel, type CopySourceType } from './CopyPanel';
import type { CopyHop } from './copyHops';
import type { Item } from '../../../mocks/items';
import type { MoreMenuItem } from '../../../components/form/MoreMenu';

export function CreateFromPanel<Source extends { id: string }>({
  source,
  hop,
  items,
  partyCard,
  onClose,
}: {
  source: Source;
  hop: CopyHop<Source>;
  items: readonly Item[];
  /** The source document's own vendor/customer card (read-only) — shown so the panel reads like the next document. */
  partyCard: ReactNode;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const doc = hop.sourceToCopyDoc(source, items);
  if (!doc) return null;
  const sources: CopySourceType<string>[] = [
    { key: hop.id, label: hop.sourceLabel, totalHeader: hop.totalHeader, qtyHeader: hop.qtyHeader, hint: hop.hint, docs: [doc] },
  ];
  return createPortal(
    <CopyPanel
      sources={sources}
      taken={new Set()}
      title={`Create ${hop.targetNoun}`}
      icon={hop.icon}
      partyCard={partyCard}
      onCancel={onClose}
      onCopy={(_type, _docId, picks) => {
        onClose();
        navigate(hop.targetNewPath, { state: { [hop.stateKey]: source.id, picks, ...hop.extraState } });
      }}
    />,
    document.body,
  );
}

/** Build the ⋯ "Create {target}…" items for a source, gated by hasOpenLines. Returns [] when none apply. */
export function createHopMenuItems<Source extends { id: string }>(
  source: Source,
  items: readonly Item[],
  hops: CopyHop<Source>[],
  open: (hop: CopyHop<Source>) => void,
): MoreMenuItem[] {
  return hops
    .filter((h) => h.hasOpenLines(source, items))
    .map((h) => ({ label: `Create ${h.targetNoun}…`, icon: h.icon, onSelect: () => open(h) }));
}
