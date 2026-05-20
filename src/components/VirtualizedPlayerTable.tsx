import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { usePositions } from '@/hooks/use-positions';
import { getPlayerAge, type Player } from '@/types/player';
import { getPlayerPerfStats, type PerfStats } from '@/lib/player-stats';

const COLUMNS = [
  { key: 'name', labelKey: 'players.col_name', align: 'left' },
  { key: 'age', labelKey: 'players.age', align: 'center' },
  { key: 'position', labelKey: 'players.col_position', align: 'center' },
  { key: 'club', labelKey: 'players.col_club', align: 'left' },
  { key: 'rating', labelKey: null, label: 'Rating', align: 'center' },
  { key: 'goals', labelKey: 'players.stat_goals', align: 'center' },
  { key: 'assists', labelKey: 'players.stat_assists', align: 'center' },
  { key: 'xg', labelKey: null, label: 'xG', align: 'center' },
  { key: 'xa', labelKey: null, label: 'xA', align: 'center' },
  { key: 'minutes', labelKey: null, label: 'Min', align: 'center' },
  { key: 'pass_accuracy', labelKey: null, label: 'Pass%', align: 'center' },
  { key: 'duels_won_pct', labelKey: null, label: 'Duels%', align: 'center' },
  { key: 'level', labelKey: 'players.level', align: 'center' },
  { key: 'potential', labelKey: 'players.potential', align: 'center' },
] as const;

export interface VirtualizedPlayerTableProps {
  players: Player[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  selectedIds: Set<string>;
  allSelected: boolean;
  onSortChange: (key: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

type Row = Player & { perf: PerfStats };

function TableRowImpl({ row, selected, index, onToggleSelect }: {
  row: Row;
  selected: boolean;
  index: number;
  onToggleSelect: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { positionShort: posShort } = usePositions();
  const ratingColor = (row.perf.rating ?? 0) >= 7.5
    ? 'text-emerald-600 dark:text-emerald-400'
    : (row.perf.rating ?? 0) >= 7.0
      ? 'text-blue-600 dark:text-blue-400'
      : (row.perf.rating ?? 0) >= 6.5
        ? 'text-amber-600 dark:text-amber-400'
        : '';
  // Cap reveal animation to the first viewport — beyond that it's just dead paint.
  const animation = index < 24
    ? { animation: 'reveal-up 0.4s ease both', animationDelay: `${Math.min(index * 30, 300)}ms` }
    : undefined;
  return (
    <tr
      className="border-t border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
      style={animation}
      onClick={() => navigate(`/player/${row.id}`)}
    >
      <td className="px-2 py-2" onClick={e => { e.stopPropagation(); onToggleSelect(row.id); }}>
        <Checkbox checked={selected} />
      </td>
      <td className="px-2 py-2 font-medium">
        <div className="flex items-center gap-2">
          <PlayerAvatar name={row.name} photoUrl={row.photo_url} size="sm" />
          <span className="truncate max-w-[140px]">{row.name}</span>
        </div>
      </td>
      <td className="text-center px-2 py-2">{getPlayerAge(row.generation, row.date_of_birth)}</td>
      <td className="text-center px-2 py-2">{posShort[row.position]}</td>
      <td className="px-2 py-2"><span className="truncate block max-w-[120px]">{row.club}</span></td>
      <td className={`text-center px-2 py-2 font-bold ${ratingColor}`}>{row.perf.rating?.toFixed(2) ?? '—'}</td>
      <td className="text-center px-2 py-2 font-bold">{row.perf.goals ?? '—'}</td>
      <td className="text-center px-2 py-2 font-bold">{row.perf.assists ?? '—'}</td>
      <td className="text-center px-2 py-2">{row.perf.xg?.toFixed(1) ?? '—'}</td>
      <td className="text-center px-2 py-2">{row.perf.xa?.toFixed(1) ?? '—'}</td>
      <td className="text-center px-2 py-2">{row.perf.minutes ?? '—'}</td>
      <td className="text-center px-2 py-2">{row.perf.pass_accuracy != null ? `${Math.round(row.perf.pass_accuracy)}%` : '—'}</td>
      <td className="text-center px-2 py-2">{row.perf.duels_won_pct != null ? `${row.perf.duels_won_pct}%` : '—'}</td>
      <td className="text-center px-2 py-2 font-bold">{row.current_level > 0 ? row.current_level : <span className="text-muted-foreground font-normal">NA</span>}</td>
      <td className="text-center px-2 py-2 font-bold text-primary">{row.potential > 0 ? row.potential : <span className="text-muted-foreground font-normal">NA</span>}</td>
    </tr>
  );
}
const TableRow = memo(TableRowImpl);

export function VirtualizedPlayerTable({
  players,
  sortKey,
  sortDir,
  selectedIds,
  allSelected,
  onSortChange,
  onToggleSelect,
  onToggleSelectAll,
}: VirtualizedPlayerTableProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Memoize the enriched + sorted rows so we don't recompute on every keystroke
  // outside the table (e.g. a search-bar change that doesn't affect this list).
  const sortedRows: Row[] = useMemo(() => {
    const rows: Row[] = players.map(p => Object.assign({}, p, { perf: getPlayerPerfStats(p) }));
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
      if (sortKey === 'age') return dir * (getPlayerAge(a.generation, a.date_of_birth) - getPlayerAge(b.generation, b.date_of_birth));
      if (sortKey === 'position') return dir * a.position.localeCompare(b.position);
      if (sortKey === 'club') return dir * a.club.localeCompare(b.club);
      if (sortKey === 'level') return dir * (a.current_level - b.current_level);
      if (sortKey === 'potential') return dir * (a.potential - b.potential);
      const aVal = a.perf[sortKey as keyof PerfStats] ?? -Infinity;
      const bVal = b.perf[sortKey as keyof PerfStats] ?? -Infinity;
      return dir * ((aVal as number) - (bVal as number));
    });
    return rows;
  }, [players, sortKey, sortDir]);

  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const estimateSize = useCallback(() => 44, []);
  const rowVirtualizer = useWindowVirtualizer({
    count: sortedRows.length,
    estimateSize,
    overscan: 8,
    scrollMargin,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start - scrollMargin : 0;
  const paddingBottom = virtualItems.length > 0
    ? totalSize - (virtualItems[virtualItems.length - 1].end - scrollMargin)
    : 0;

  return (
    <div ref={containerRef} className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="px-2 py-2 w-8">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
            </th>
            {COLUMNS.map(col => {
              const label = col.labelKey ? t(col.labelKey) : col.label;
              return (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                  onClick={() => onSortChange(col.key)}
                >
                  {label} {sortKey === col.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr style={{ height: paddingTop }} aria-hidden />}
          {virtualItems.map((vi) => {
            const row = sortedRows[vi.index];
            if (!row) return null;
            return (
              <TableRow
                key={row.id}
                row={row}
                index={vi.index}
                selected={selectedIds.has(row.id)}
                onToggleSelect={onToggleSelect}
              />
            );
          })}
          {paddingBottom > 0 && <tr style={{ height: paddingBottom }} aria-hidden />}
        </tbody>
      </table>
    </div>
  );
}
