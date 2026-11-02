import { Card } from '@jasperlepardo/sikat-design-system';
import { FieldStack } from './fields';

/** A shimmer placeholder block. Set `className` for size and shape. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-muted ${className ?? ''}`} />;
}

/** A Card-shaped section filled with shimmer label+value rows. */
export function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <Card.Header media={<SkeletonBlock className="size-6" />}>
        <SkeletonBlock className="h-4 w-32" />
      </Card.Header>
      <Card.Content>
        <FieldStack>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex gap-3">
              <SkeletonBlock className="h-4 w-24 shrink-0" />
              <SkeletonBlock className={`h-4 ${i % 3 === 2 ? 'w-3/5' : 'flex-1'}`} />
            </div>
          ))}
        </FieldStack>
      </Card.Content>
    </Card>
  );
}

/** A Card-shaped line-item table with shimmer header + row blocks. */
export function SkeletonLineTable({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <Card.Header media={<SkeletonBlock className="size-6" />}>
        <SkeletonBlock className="h-4 w-24" />
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-7 w-full" />
          {Array.from({ length: rows }, (_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

/** A row of shimmer tab pills. */
export function SkeletonTabs({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className={`h-8 rounded-full ${i === 0 ? 'w-24' : 'w-20'}`} />
      ))}
    </div>
  );
}
