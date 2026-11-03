import { Panel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../PageHeader';
import { SkeletonBlock, SkeletonCard, SkeletonLineTable } from '../skeletons';

/**
 * Skeleton for inventory operation pages (transfers, transfer requests, stock counts, postings).
 * These use a simple Panel.Body without DetailColumns — header cards + a line table.
 */
export function InventoryDocSkeleton() {
  return (
    <Panel className="min-h-0 flex-1">
      <PageHeader
        variant="plain"
        leading={<SkeletonBlock className="size-8 rounded-md" />}
        title={<SkeletonBlock className="h-5 w-48" />}
        actions={
          <div className="flex gap-2">
            <SkeletonBlock className="size-8 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-28 rounded-full" />
          </div>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
        </div>
        <SkeletonLineTable rows={4} />
        <SkeletonCard rows={2} />
      </Panel.Body>
    </Panel>
  );
}
