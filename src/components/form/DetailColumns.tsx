import { Panel } from '@jasperlepardo/sikat-design-system';
import type { ReactNode } from 'react';

interface DetailColumnsProps {
  /** Fixed content above the columns (alerts, reject box) — stays put while the columns scroll. */
  header?: ReactNode;
  /** Left column (col-span-8) — the document's main content. Scrolls on its own at lg. */
  main: ReactNode;
  /** Right column (col-span-4) — details / identity cards. Scrolls on its own at lg. */
  aside: ReactNode;
}

/**
 * The shared two-column detail body used by every item, purchasing and sales document.
 *
 * Each column scrolls independently at lg: the body clips (`lg:overflow-hidden`), the grid
 * fills the clipped body (`lg:flex-1 lg:min-h-0 lg:grid-rows-1` so the single row stretches to
 * the body height and may shrink), and each column scrolls within its share (`lg:overflow-y-auto
 * lg:min-h-0`). Stacked (below lg) it's a single flowing column and the body scrolls as one.
 *
 * Shadow room: a scroll container with `overflow-y: auto` forces `overflow-x` to compute to
 * `auto` too, so it clips on both axes — slicing the cards' drop shadow at the column edge. Each
 * column adds `p-1` (room for the shadow inside the clip) paired with `-m-1` (pulls the box back
 * out so content isn't inset); the 4px overshoot lands inside the panel body's own 16px padding,
 * so even the outermost shadows survive. (Don't add padding to the body here — a utility would
 * override the design system's `.sikat-panel__body` padding and push the content flush to the edge.)
 */
export function DetailColumns({ header, main, aside }: DetailColumnsProps) {
  return (
    <Panel.Body className="flex flex-col gap-2 lg:overflow-hidden!">
      {header}
      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-1">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8 lg:min-h-0 lg:overflow-y-auto lg:p-1 lg:-m-1">
          {main}
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4 lg:min-h-0 lg:overflow-y-auto lg:p-1 lg:-m-1">
          {aside}
        </div>
      </div>
    </Panel.Body>
  );
}
