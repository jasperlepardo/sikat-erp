import { Panel, PanelHeader } from '@jasperlepardo/sikat-design-system';
import { DetailColumns } from '../DetailColumns';
import { SkeletonBlock, SkeletonCard, SkeletonTabs } from '../skeletons';

/** Skeleton for the Item master detail page — tabs in main, identity + group cards in aside. */
export function ItemDetailSkeleton() {
  return (
    <Panel className="min-h-0 flex-1">
      <PanelHeader
        variant="plain"
        leading={<SkeletonBlock className="size-8 rounded-md" />}
        title={<SkeletonBlock className="h-5 w-48" />}
        tabs={<SkeletonTabs count={5} />}
        actions={
          <div className="flex gap-2">
            <SkeletonBlock className="size-8 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-28 rounded-full" />
          </div>
        }
      />
      <DetailColumns
        main={
          <>
            <SkeletonTabs count={5} />
            <SkeletonCard rows={5} />
            <SkeletonCard rows={4} />
          </>
        }
        aside={
          <>
            <SkeletonCard rows={6} />
            <SkeletonCard rows={3} />
            <SkeletonCard rows={2} />
          </>
        }
      />
    </Panel>
  );
}
