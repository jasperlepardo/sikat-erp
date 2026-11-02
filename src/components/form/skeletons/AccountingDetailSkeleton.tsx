import { Panel, PanelHeader } from '@jasperlepardo/sikat-design-system';
import { SkeletonBlock, SkeletonCard, SkeletonLineTable, SkeletonTabs } from '../skeletons';

/**
 * Skeleton for accounting detail pages (journal entries, voucher entries).
 * These use a flat Panel.Body — header cards then a full-width line table.
 */
export function AccountingDetailSkeleton() {
  return (
    <Panel className="min-h-0 flex-1">
      <PanelHeader
        variant="plain"
        leading={<SkeletonBlock className="size-8 rounded-md" />}
        title={<SkeletonBlock className="h-5 w-48" />}
        tabs={<SkeletonTabs count={2} />}
        actions={
          <div className="flex gap-2">
            <SkeletonBlock className="size-8 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-28 rounded-full" />
          </div>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <SkeletonCard rows={4} />
        <SkeletonLineTable rows={5} />
        <SkeletonCard rows={2} />
      </Panel.Body>
    </Panel>
  );
}
