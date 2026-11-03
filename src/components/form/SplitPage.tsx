import { createContext, useContext, useDeferredValue } from 'react';
import { useParams } from 'react-router';
import type { ComponentType } from 'react';

const InSplitDetail = createContext(false);

/** True inside the detail column of a split page, where the header closes the record instead of going back. */
export const useInSplitDetail = () => useContext(InSplitDetail);

interface SplitPageProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list: ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: ComponentType<any>;
  /** Extra props forwarded to the list (e.g. `{ draftsOnly: true }`, `{ scope: 'customer' }`). */
  listProps?: Record<string, unknown>;
  /** Extra props forwarded to the detail (e.g. `{ scope: 'customer' }`). */
  detailProps?: Record<string, unknown>;
}

/**
 * Renders the list full-width when no record is selected, or a 3/9 split
 * (compact list left, detail right) when `/:id` is in the URL.
 *
 * Usage in the router:
 *   { path: 'area/items', element: <SplitPage list={ItemList} detail={ItemDetail} /> }
 *   { path: 'area/items/:id/:tab?', element: <SplitPage list={ItemList} detail={ItemDetail} /> }
 */
export function SplitPage({ list: List, detail: Detail, listProps, detailProps }: SplitPageProps) {
  const { id } = useParams();
  // Keep showing the previous record while the new one loads — only swap when ready.
  const deferredId = useDeferredValue(id);
  const isStale = id !== deferredId;

  if (!id) return <List {...(listProps ?? {})} />;

  return (
    <div className="grid grid-cols-12 grid-rows-1 gap-2 flex-1 min-h-0 overflow-hidden">
      <div className="col-span-3 flex flex-col min-h-0 overflow-hidden">
        <List compact selectedId={id} {...(listProps ?? {})} />
      </div>
      <div
        className="col-span-9 flex flex-col min-h-0 overflow-hidden *:min-h-0"
        style={{ opacity: isStale ? 0.5 : 1, transition: 'opacity 150ms' }}
      >
        <InSplitDetail.Provider value>
          <Detail key={deferredId} {...(detailProps ?? {})} />
        </InSplitDetail.Provider>
      </div>
    </div>
  );
}
