import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import type { MarketValueEntry } from '@/hooks/use-player-market-value';

interface MarketValueChartProps {
  history: MarketValueEntry[];
  locale?: string;
  valueLabel: string;
  clubLabel: string;
  ageLabel: string;
}

interface TooltipRow {
  ts: number;
  value: number;
  club: string | null;
  age: number | null;
  valueLabel: string | null;
  date: string | null;
}

const formatCompact = (value: number, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value) + ' €';
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M €`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)} K €`;
    return `${value} €`;
  }
};

const formatDate = (ts: number, locale: string) => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
};

export default function MarketValueChart({ history, locale = 'fr', valueLabel, clubLabel, ageLabel }: MarketValueChartProps) {
  const data = history.map(e => ({
    ts: e.timestamp,
    value: e.value,
    club: e.club,
    age: e.age,
    valueLabel: e.valueLabel,
    date: e.date,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="mvGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={(v) => formatDate(Number(v), locale)}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={(v) => formatCompact(Number(v), locale)}
          width={70}
        />
        <Tooltip
          cursor={{ stroke: 'hsl(var(--border))' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as TooltipRow;
            return (
              <div className="rounded-xl border bg-card text-card-foreground shadow-sm px-3 py-2 text-xs space-y-1">
                <div className="font-semibold">{row.date || formatDate(row.ts, locale)}</div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{valueLabel}</span>
                  <span className="font-bold">{row.valueLabel || formatCompact(row.value, locale)}</span>
                </div>
                {row.club && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{clubLabel}</span>
                    <span>{row.club}</span>
                  </div>
                )}
                {row.age !== null && row.age !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{ageLabel}</span>
                    <span>{row.age}</span>
                  </div>
                )}
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          fill="url(#mvGradient)"
          dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
          name={valueLabel}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
