import { Panel, PanelHeader } from '@jasperlepardo/sikat-design-system';
import { DetailColumns } from '../DetailColumns';
import { SkeletonBlock, SkeletonCard, SkeletonLineTable } from '../skeletons';

function SkeletonActions() {
  return (
    <div className="flex gap-2">
      <SkeletonBlock className="size-8 rounded-full" />
      <SkeletonBlock className="h-8 w-20 rounded-full" />
      <SkeletonBlock className="h-8 w-28 rounded-full" />
    </div>
  );
}

/**
 * Skeleton for purchasing and sales document detail pages — PageHeader + DetailColumns
 * with a line table in the main column and info cards in the aside.
 */
export function DocumentDetailSkeleton() {
  return (
    <Panel className="min-h-0 flex-1">
      <PanelHeader
        variant="plain"
        leading={<SkeletonBlock className="size-8 rounded-md" />}
        title={<SkeletonBlock className="h-5 w-48" />}
        actions={<SkeletonActions />}
      />
      <DetailColumns
        main={
          <>
            <SkeletonLineTable rows={4} />
            <SkeletonCard rows={3} />
          </>
        }
        aside={
          <>
            <SkeletonCard rows={5} />
            <SkeletonCard rows={4} />
            <SkeletonCard rows={3} />
          </>
        }
      />
    </Panel>
  );
}
