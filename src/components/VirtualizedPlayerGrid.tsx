import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { PlayerCard } from '@/components/PlayerCard';
import type { Player } from '@/types/player';

function useColumns(): number {
  // Match the Tailwind grid-cols breakpoints used by the page: 1 / md:2 / xl:3.
  // md = 768px, xl = 1280px (Tailwind defaults). Recomputed on resize.
  const compute = () => {
    if (typeof window === 'undefined') return 1;
    if (window.innerWidth >= 1280) return 3;
    if (window.innerWidth >= 768) return 2;
    return 1;
  };
  const [cols, setCols] = useState(compute);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCols(compute()));
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return cols;
}

export interface VirtualizedPlayerGridProps {
  players: Player[];
  viewMode: 'compact' | 'detailed';
  selectedIds: Set<string>;
  enrichingIds?: Set<string>;
  hasOrg: boolean;
  onToggleSelect: (id: string) => void;
  onDismissNews: (id: string) => void;
}

export function VirtualizedPlayerGrid({
  players,
  viewMode,
  selectedIds,
  enrichingIds,
  hasOrg,
  onToggleSelect,
  onDismissNews,
}: VirtualizedPlayerGridProps) {
  const columns = useColumns();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowCount = Math.ceil(players.length / columns);

  // Rough heights; the virtualizer self-corrects via measureElement once rows mount.
  const estimateSize = useCallback(
    () => (viewMode === 'detailed' ? 400 : 190) + 12,
    [viewMode],
  );

  // Scroll margin: distance from the start of the scroll container (the window) to
  // the start of our virtual list. Without this, rows above our element get
  // counted as virtual and the list paints in the wrong slots.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize,
    overscan: 4,
    scrollMargin,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div ref={containerRef} style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
      {virtualRows.map((vrow) => {
        const start = vrow.index * columns;
        const slice = players.slice(start, start + columns);
        return (
          <div
            key={vrow.key}
            data-index={vrow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vrow.start - rowVirtualizer.options.scrollMargin}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: '0.75rem',
              paddingBottom: '0.75rem',
            }}
          >
            {slice.map((player, colIdx) => (
              <PlayerCard
                key={player.id}
                player={player}
                viewMode={viewMode}
                selected={selectedIds.has(player.id)}
                isEnriching={enrichingIds?.has(player.id) ?? false}
                hasOrg={hasOrg}
                index={start + colIdx}
                onToggleSelect={onToggleSelect}
                onDismissNews={onDismissNews}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
