import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { ExchangeRate } from '../../../mocks/currencies';
import { formatDate } from '../../../services/dates';

type Range = '1M' | '3M' | 'All';
const RANGE_DAYS: Record<Range, number> = { '1M': 31, '3M': 92, All: Infinity };

interface Point {
  date: string;
  rate: number;
  source: ExchangeRate['source'];
  /** Change from the previous rate day ('' for the first). */
  change?: number;
}

const fmtRate = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 6 });

/** The rate days of one currency, oldest first, with day-on-day change. */
function pointsFor(code: string, days: ExchangeRate[]): Point[] {
  const pts = days
    .filter((d) => d.rates[code] > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, rate: d.rates[code], source: d.source }) as Point);
  pts.forEach((p, i) => {
    if (i) p.change = p.rate - pts[i - 1].rate;
  });
  return pts;
}

/** Clean y-axis ticks (1, 2 or 5 × 10^n steps) covering [min, max]. */
function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { lo, hi, ticks, step };
}

/**
 * A currency's rate history: PHP per 1 unit by bulletin day — a line chart (crosshair
 * tooltip, 1M / 3M / All) over the same data as a table, newest first.
 */
export function CurrencyRateHistory({ code, days }: { code: string; days: ExchangeRate[] }) {
  const all = useMemo(() => pointsFor(code, days), [code, days]);
  const [range, setRange] = useState<Range>('3M');
  const pts = useMemo(() => {
    if (!all.length || range === 'All') return all;
    const last = new Date(`${all.at(-1)!.date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - RANGE_DAYS[range]);
    const from = last.toISOString().slice(0, 10); // date arithmetic, UTC throughout
    return all.filter((p) => p.date >= from);
  }, [all, range]);

  if (!all.length) {
    return (
      <Text variant="small" tone="muted">
        No {code} rates yet. Import a BSP bulletin or add a day on the Exchange rates tab.
      </Text>
    );
  }

  const first = pts[0];
  const last = pts.at(-1)!;
  const delta = last.rate - first.rate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Text weight="semibold" tone="heading">
            {code} rate history
          </Text>
          <Text variant="small" tone="muted">
            PHP per 1 {code}, by BSP bulletin day. {formatDate(first.date)} – {formatDate(last.date)}: {fmtRate(first.rate)} →{' '}
            {fmtRate(last.rate)} ({delta >= 0 ? '+' : '−'}
            {fmtRate(Math.abs(delta))}, {delta >= 0 ? '+' : '−'}
            {Math.abs((delta / first.rate) * 100).toFixed(2)}%).
          </Text>
        </div>
        <Button.ToggleGroup value={range} onValueChange={(v) => setRange(v as Range)} size="small">
          <Button.Toggle value="1M">1M</Button.Toggle>
          <Button.Toggle value="3M">3M</Button.Toggle>
          <Button.Toggle value="All">All</Button.Toggle>
        </Button.ToggleGroup>
      </div>

      <RateChart code={code} points={pts} />

      <DataTable
        icon="table_rows"
        title={`${code} rates`}
        description="Every bulletin day in the range, newest first. Change is from the previous bulletin day."
        rows={[...pts].reverse()}
        getRowId={(p) => p.date}
        pageSize={25}
        columns={[
          { key: 'date', header: 'Date', cell: (p) => formatDate(p.date) },
          { key: 'rate', header: `PHP per ${code}`, cell: (p) => fmtRate(p.rate) },
          {
            key: 'change',
            header: 'Change',
            cell: (p) =>
              p.change === undefined ? (
                <span className="text-muted">—</span>
              ) : (
                <span>
                  {p.change > 0 ? '▲ +' : p.change < 0 ? '▼ −' : ''}
                  {fmtRate(Math.abs(p.change))}{' '}
                  <span className="text-muted">
                    ({((p.change / (p.rate - p.change)) * 100).toFixed(2)}%)
                  </span>
                </span>
              ),
          },
          { key: 'source', header: 'Source', cell: (p) => (p.source === 'BSP RERB' ? 'BSP bulletin' : 'Manual') },
        ]}
        sortValue={(p, key) => (key === 'date' ? p.date : key === 'rate' ? p.rate : key === 'change' ? (p.change ?? 0) : p.source)}
        empty={<Text variant="small" tone="muted">No rates in this range.</Text>}
      />
    </div>
  );
}

const H = 220;
/** More days than this between bulletins (long weekends, holidays) means missing data. */
const GAP_DAYS = 10;
const PAD = { top: 16, right: 72, bottom: 28, left: 56 };

/** Single-series line: 2px line, end dot + direct label, hairline grid, crosshair tooltip. */
function RateChart({ code, points }: { code: string; points: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rates = points.map((p) => p.rate);
  const { lo, hi, ticks } = niceTicks(Math.min(...rates), Math.max(...rates));
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (date: string) => PAD.left + (t1 === t0 ? plotW / 2 : ((Date.parse(date) - t0) / (t1 - t0)) * plotW);
  const y = (rate: number) => PAD.top + (hi === lo ? plotH / 2 : (1 - (rate - lo) / (hi - lo)) * plotH);
  // Break the line over gaps with no bulletin (more than GAP_DAYS between days), so it
  // never draws rates that aren't there; a point alone between gaps gets a dot.
  const gapBefore = (i: number) => i > 0 && Date.parse(points[i].date) - Date.parse(points[i - 1].date) > GAP_DAYS * 86_400_000;
  const path = points.map((p, i) => `${i === 0 || gapBefore(i) ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.rate).toFixed(1)}`).join('');
  const isolated = points.filter((_, i) => (i === 0 || gapBefore(i)) && (i === points.length - 1 || gapBefore(i + 1)));

  // X labels: first of each month in range (or the endpoints for a short range).
  const months = points.filter((p, i) => i === 0 || p.date.slice(0, 7) !== points[i - 1].date.slice(0, 7));
  const xLabels = months.length >= 2 ? months : [points[0], points.at(-1)!];
  const xLabel = (d: string) => (months.length >= 2 ? formatDate(d).split(' ').slice(1).join(' ') : formatDate(d));

  const tickDecimals = Math.max(0, ...ticks.map((t) => (String(t).split('.')[1] ?? '').length));
  const end = points.at(-1)!;
  const hp = hover === null ? null : points[hover];

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setHover(best);
  };

  return (
    <div ref={box} className="relative w-full">
      <svg width={width} height={H} role="img" aria-label={`${code} rate in pesos, ${formatDate(points[0].date)} to ${formatDate(end.date)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-border-default)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-text-muted)">
              {t.toLocaleString('en-PH', { minimumFractionDigits: tickDecimals, maximumFractionDigits: tickDecimals })}
            </text>
          </g>
        ))}
        {xLabels.map((p) => (
          <text key={p.date} x={x(p.date)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
            {xLabel(p.date)}
          </text>
        ))}

        <path d={path} fill="none" stroke="var(--color-fg-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {isolated.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.rate)} r={4} fill="var(--color-fg-primary)" stroke="var(--color-bg-default)" strokeWidth={2} />
        ))}

        {/* End dot + direct label: the latest value. */}
        <circle cx={x(end.date)} cy={y(end.rate)} r={4} fill="var(--color-fg-primary)" stroke="var(--color-bg-default)" strokeWidth={2} />
        <text x={x(end.date) + 8} y={y(end.rate)} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--color-text-heading)">
          {fmtRate(end.rate)}
        </text>

        {hp ? (
          <g pointerEvents="none">
            <line x1={x(hp.date)} x2={x(hp.date)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth={1} />
            <circle cx={x(hp.date)} cy={y(hp.rate)} r={4} fill="var(--color-fg-primary)" stroke="var(--color-bg-default)" strokeWidth={2} />
          </g>
        ) : null}

        {/* Hit area: the crosshair snaps to the nearest bulletin day. */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hp ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(x(hp.date) + 12, width - 168),
            top: PAD.top,
            background: 'var(--color-bg-default)',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-body)',
          }}
        >
          <div className="font-semibold" style={{ color: 'var(--color-text-heading)' }}>
            {formatDate(hp.date)}
          </div>
          <div>
            PHP {fmtRate(hp.rate)} per {code}
          </div>
          {hp.change !== undefined ? (
            <div style={{ color: 'var(--color-text-muted)' }}>
              {hp.change >= 0 ? '+' : '−'}
              {fmtRate(Math.abs(hp.change))} from previous day
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
