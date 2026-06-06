import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { FlagIcon } from '@/components/ui/flag-icon';
import { ClubBadge } from '@/components/ui/club-badge';
import { usePositions } from '@/hooks/use-positions';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useRatesMap } from '@/hooks/use-exchange-rates';
import { convertMV, formatDateShort } from '@/lib/format-utils';
import { getPlayerAge, translateFoot, type Player } from '@/types/player';
import { getPlayerPerfStats, type PerfStats } from '@/lib/player-stats';

// Each cell carries the SAME width + responsive-visibility classes in the header
// and in every row, so columns stay aligned. Every fixed cell is `truncate`
// (overflow-hidden + ellipsis) so a long value/label can never spill over its
// neighbour. Less-critical columns collapse at smaller widths (`hidden lg/xl`)
// so the line never overflows the screen — no horizontal scroll.
const CELL = {
  select:   'w-7 shrink-0 flex items-center justify-center',
  name:     'flex-1 min-w-0 flex items-center gap-2',
  age:      'w-9 shrink-0 text-center truncate',
  pos:      'w-12 shrink-0 text-center truncate',
  level:    'w-10 shrink-0 text-center truncate',
  pot:      'w-10 shrink-0 text-center truncate',
  club:     'w-28 xl:w-36 shrink-0 min-w-0 hidden md:flex items-center gap-1.5',
  foot:     'w-16 shrink-0 text-center truncate hidden lg:block',
  height:   'w-14 shrink-0 text-center truncate hidden xl:block',
  value:    'w-24 shrink-0 text-center truncate hidden lg:block',
  contract: 'w-24 shrink-0 text-center truncate hidden xl:block',
} as const;

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

function RowImpl({ row, selected, index, onToggleSelect }: {
  row: Row;
  selected: boolean;
  index: number;
  onToggleSelect: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { positionShort: posShort } = usePositions();
  const { currency, dateFormat } = useUiPreferences();
  const rates = useRatesMap();

  const ext = (row.external_data ?? {}) as Record<string, unknown>;

  // Reveal only the first viewport's rows — beyond that it's just dead paint.
  const animation = index < 24
    ? { animation: 'reveal-up 0.4s ease both', animationDelay: `${Math.min(index * 25, 300)}ms` }
    : undefined;

  return (
    <div
      className="flex items-center gap-2 px-3 h-[52px] border-t border-border/30 hover:bg-muted/30 transition-colors cursor-pointer text-xs"
      style={animation}
      onClick={() => navigate(`/player/${row.id}`)}
    >
      <div className={CELL.select} onClick={e => { e.stopPropagation(); onToggleSelect(row.id); }}>
        <Checkbox checked={selected} />
      </div>
      <div className={CELL.name}>
        <PlayerAvatar name={row.name} photoUrl={row.photo_url} size="sm" />
        <div className="min-w-0 flex items-center gap-1.5">
          <FlagIcon nationality={row.nationality} size="sm" />
          <span className="truncate font-medium">{row.name}</span>
        </div>
      </div>
      <div className={CELL.age}>{getPlayerAge(row.generation, row.date_of_birth)}</div>
      <div className={CELL.pos}>{posShort[row.position]}</div>
      <div className={CELL.level}>
        {row.current_level > 0 ? <span className="font-bold">{row.current_level}</span> : <span className="text-muted-foreground">NA</span>}
      </div>
      <div className={CELL.pot}>
        {row.potential > 0 ? <span className="font-bold text-primary">{row.potential}</span> : <span className="text-muted-foreground">NA</span>}
      </div>
      <div className={CELL.club}>
        <ClubBadge club={row.club} size="xs" />
        <span className="truncate text-muted-foreground">{row.club}</span>
      </div>
      <div className={CELL.foot}>{translateFoot(row.foot, t)}</div>
      <div className={CELL.height}>{(ext.height as string) || '—'}</div>
      <div className={CELL.value}>{convertMV((ext.market_value as string) || row.market_value, currency, rates)}</div>
      <div className={CELL.contract}>{formatDateShort(row.contract_end, dateFormat) || '—'}</div>
    </div>
  );
}
const TableRow = memo(RowImpl);

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
  // outside the list (e.g. a search-bar change that doesn't affect this view).
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

  const estimateSize = useCallback(() => 52, []);
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

  const arrow = (key: string) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  return (
    <div ref={containerRef} className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header — labels only, sortable on the primary columns. No horizontal scroll. */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 text-muted-foreground text-[11px] font-semibold select-none">
        <div className={CELL.select}>
          <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
        </div>
        <button className={`${CELL.name} text-left hover:text-foreground`} onClick={() => onSortChange('name')}>{t('players.col_name')}{arrow('name')}</button>
        <button className={`${CELL.age} hover:text-foreground`} onClick={() => onSortChange('age')}>{t('players.age')}{arrow('age')}</button>
        <button className={`${CELL.pos} hover:text-foreground`} onClick={() => onSortChange('position')}>{t('players.col_position')}{arrow('position')}</button>
        <button className={`${CELL.level} hover:text-foreground`} onClick={() => onSortChange('level')}>{t('players.col_lvl')}{arrow('level')}</button>
        <button className={`${CELL.pot} hover:text-foreground`} onClick={() => onSortChange('potential')}>{t('players.col_pot')}{arrow('potential')}</button>
        <button className={`${CELL.club} text-left hover:text-foreground`} onClick={() => onSortChange('club')}>{t('players.col_club')}{arrow('club')}</button>
        <div className={CELL.foot}>{t('players.foot')}</div>
        <div className={CELL.height}>{t('players.height')}</div>
        <div className={CELL.value}>{t('players.value')}</div>
        <div className={CELL.contract}>{t('players.contract')}</div>
      </div>

      {paddingTop > 0 && <div style={{ height: paddingTop }} aria-hidden />}
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
      {paddingBottom > 0 && <div style={{ height: paddingBottom }} aria-hidden />}
    </div>
  );
}
