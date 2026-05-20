import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { usePlayers } from '@/hooks/use-players';
import { useWyscoutStats, type WyscoutStatRow } from '@/hooks/use-wyscout-stats';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import {
  GitCompareArrows, Search, FileSpreadsheet, Crown, Loader2, Plus, X,
  Settings2, Download, Trophy, Palette, ArrowUpDown, ArrowUp, ArrowDown,
  Image as ImageIcon, GripVertical, Save, Share2, Link2, Users,
  AlertTriangle, Activity, BarChart3, Radar as RadarIcon, Scaling, ArrowLeftRight,
  Trash2, FileSpreadsheet as XlsxIcon, Star,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { Link } from 'react-router-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as XLSX from 'xlsx';
import { WyscoutCatalogSearch } from '@/components/wyscout/CatalogSearch';

// ────────────────────────────────────────────────────────────────────────────
// Stats catalog
// ────────────────────────────────────────────────────────────────────────────
type Cat = 'volume' | 'attack' | 'passing' | 'defense' | 'set' | 'gk' | 'physical';
type StatDef = {
  key: keyof WyscoutStatRow;
  label: string;
  cat: Cat;
  max: number;
  isPct?: boolean;
  decimals?: number;
  higherIsBetter?: boolean;
};
const CAT_LABEL: Record<Cat, string> = {
  volume: 'Volume', attack: 'Attaque', passing: 'Création & Passes',
  defense: 'Défense', set: 'Coups de pied arrêtés', gk: 'Gardien', physical: 'Physique',
};
const STATS: StatDef[] = [
  { key: 'matches_played', label: 'Matchs', cat: 'volume', max: 40, decimals: 0 },
  { key: 'minutes_played', label: 'Minutes', cat: 'volume', max: 3500, decimals: 0 },
  { key: 'goals', label: 'Buts (total)', cat: 'attack', max: 30, decimals: 0 },
  { key: 'goals_per90', label: 'Buts/90', cat: 'attack', max: 1 },
  { key: 'np_goals_per90', label: 'Buts hors PK/90', cat: 'attack', max: 1 },
  { key: 'xg', label: 'xG (total)', cat: 'attack', max: 25 },
  { key: 'xg_per90', label: 'xG/90', cat: 'attack', max: 1 },
  { key: 'shots_per90', label: 'Tirs/90', cat: 'attack', max: 5 },
  { key: 'shots_on_target_pct', label: '% Tirs cadrés', cat: 'attack', max: 100, isPct: true },
  { key: 'goal_conversion_pct', label: '% Conversion', cat: 'attack', max: 30, isPct: true },
  { key: 'head_goals_per90', label: 'Buts tête/90', cat: 'attack', max: 0.3 },
  { key: 'dribbles_per90', label: 'Dribbles/90', cat: 'attack', max: 8 },
  { key: 'dribbles_success_pct', label: '% Dribbles', cat: 'attack', max: 100, isPct: true },
  { key: 'touches_in_box_per90', label: 'Touches surface/90', cat: 'attack', max: 10 },
  { key: 'progressive_runs_per90', label: 'Courses prog./90', cat: 'attack', max: 6 },
  { key: 'accelerations_per90', label: 'Accélérations/90', cat: 'attack', max: 5 },
  { key: 'offensive_duels_per90', label: 'Duels off./90', cat: 'attack', max: 12 },
  { key: 'offensive_duels_won_pct', label: '% Duels off.', cat: 'attack', max: 100, isPct: true },
  { key: 'assists', label: 'Assists (total)', cat: 'passing', max: 20, decimals: 0 },
  { key: 'assists_per90', label: 'Assists/90', cat: 'passing', max: 0.6 },
  { key: 'xa_per90', label: 'xA/90', cat: 'passing', max: 0.5 },
  { key: 'passes_per90', label: 'Passes/90', cat: 'passing', max: 80 },
  { key: 'passes_accurate_pct', label: '% Passes', cat: 'passing', max: 100, isPct: true },
  { key: 'forward_passes_per90', label: 'Passes avant/90', cat: 'passing', max: 25 },
  { key: 'forward_passes_accurate_pct', label: '% Passes avant', cat: 'passing', max: 100, isPct: true },
  { key: 'long_passes_per90', label: 'Longues passes/90', cat: 'passing', max: 10 },
  { key: 'long_passes_accurate_pct', label: '% Longues passes', cat: 'passing', max: 100, isPct: true },
  { key: 'key_passes_per90', label: 'Passes clés/90', cat: 'passing', max: 3 },
  { key: 'smart_passes_per90', label: 'Smart passes/90', cat: 'passing', max: 3 },
  { key: 'smart_passes_accurate_pct', label: '% Smart passes', cat: 'passing', max: 100, isPct: true },
  { key: 'through_passes_per90', label: 'Passes traversantes/90', cat: 'passing', max: 2 },
  { key: 'through_passes_accurate_pct', label: '% Passes traversantes', cat: 'passing', max: 100, isPct: true },
  { key: 'progressive_passes_per90', label: 'Passes prog./90', cat: 'passing', max: 12 },
  { key: 'progressive_passes_accurate_pct', label: '% Passes prog.', cat: 'passing', max: 100, isPct: true },
  { key: 'crosses_per90', label: 'Centres/90', cat: 'passing', max: 8 },
  { key: 'crosses_accurate_pct', label: '% Centres', cat: 'passing', max: 100, isPct: true },
  { key: 'passes_final_third_per90', label: 'Passes 3e tiers/90', cat: 'passing', max: 25 },
  { key: 'passes_penalty_area_per90', label: 'Passes surface/90', cat: 'passing', max: 6 },
  { key: 'shot_assists_per90', label: 'Passes vers tir/90', cat: 'passing', max: 3 },
  { key: 'defensive_actions_per90', label: 'Actions déf./90', cat: 'defense', max: 12 },
  { key: 'defensive_duels_per90', label: 'Duels déf./90', cat: 'defense', max: 12 },
  { key: 'defensive_duels_won_pct', label: '% Duels déf.', cat: 'defense', max: 100, isPct: true },
  { key: 'aerial_duels_per90', label: 'Duels aériens/90', cat: 'defense', max: 10 },
  { key: 'aerial_duels_won_pct', label: '% Duels aériens', cat: 'defense', max: 100, isPct: true },
  { key: 'sliding_tackles_per90', label: 'Tacles gliss./90', cat: 'defense', max: 2 },
  { key: 'padj_sliding_tackles', label: 'Tacles ajustés', cat: 'defense', max: 2 },
  { key: 'interceptions_per90', label: 'Intercept./90', cat: 'defense', max: 8 },
  { key: 'padj_interceptions', label: 'Intercept. ajust.', cat: 'defense', max: 8 },
  { key: 'shots_blocked_per90', label: 'Tirs bloqués/90', cat: 'defense', max: 1.5 },
  { key: 'fouls_per90', label: 'Fautes/90', cat: 'defense', max: 3, higherIsBetter: false },
  { key: 'duels_per90', label: 'Duels totaux/90', cat: 'defense', max: 25 },
  { key: 'duels_won_pct', label: '% Duels totaux', cat: 'defense', max: 100, isPct: true },
  { key: 'free_kicks_per90', label: 'CF/90', cat: 'set', max: 5 },
  { key: 'direct_free_kicks_per90', label: 'CF directs/90', cat: 'set', max: 1.5 },
  { key: 'direct_free_kicks_on_target_pct', label: '% CF cadrés', cat: 'set', max: 100, isPct: true },
  { key: 'corners_per90', label: 'Corners/90', cat: 'set', max: 5 },
  { key: 'penalty_conversion_pct', label: '% Pénos', cat: 'set', max: 100, isPct: true },
  { key: 'conceded_goals_per90', label: 'Buts encaissés/90', cat: 'gk', max: 2, higherIsBetter: false },
  { key: 'shots_against_per90', label: 'Tirs contre/90', cat: 'gk', max: 6 },
  { key: 'save_rate_pct', label: '% Arrêts', cat: 'gk', max: 100, isPct: true },
  { key: 'xg_against_per90', label: 'xG contre/90', cat: 'gk', max: 2, higherIsBetter: false },
  { key: 'prevented_goals_per90', label: 'Buts évités/90', cat: 'gk', max: 1 },
  { key: 'gk_exits_per90', label: 'Sorties/90', cat: 'gk', max: 1.5 },
  { key: 'gk_aerial_duels_per90', label: 'Aériens GK/90', cat: 'gk', max: 1.5 },
  { key: 'total_distance_per90', label: 'Distance/90 (m)', cat: 'physical', max: 12000, decimals: 0 },
  { key: 'hsr_distance_per90', label: 'Course rapide/90 (m)', cat: 'physical', max: 1000, decimals: 0 },
  { key: 'sprint_distance_per90', label: 'Sprint/90 (m)', cat: 'physical', max: 400, decimals: 0 },
  { key: 'hi_distance_per90', label: 'Haute intensité/90 (m)', cat: 'physical', max: 1500, decimals: 0 },
  { key: 'max_speed', label: 'Vitesse max (km/h)', cat: 'physical', max: 40 },
  { key: 'high_accel_per90', label: 'Accél. fortes/90', cat: 'physical', max: 25 },
  { key: 'high_decel_per90', label: 'Décel. fortes/90', cat: 'physical', max: 25 },
  { key: 'sprint_count_per90', label: 'Sprints/90', cat: 'physical', max: 30 },
];
const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(STATS.map(s => [s.key as string, s]));

const DEFAULT_STATS = [
  'goals_per90', 'xg_per90', 'shots_per90', 'key_passes_per90',
  'progressive_passes_per90', 'dribbles_success_pct', 'passes_accurate_pct',
  'interceptions_per90', 'defensive_duels_won_pct', 'aerial_duels_won_pct',
];
const COLOR_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#6366f1', '#a855f7',
  '#f43f5e', '#84cc16', '#0ea5e9', '#64748b',
  // Extended palette — darker / desaturated variants for large squads
  '#1e40af', '#5b21b6', '#9d174d', '#991b1b', '#9a3412', '#854d0e',
  '#166534', '#065f46', '#115e59', '#155e75', '#3730a3', '#6b21a8',
  '#9f1239', '#3f6212', '#0c4a6e', '#1e293b',
];
const MUTED_COLOR = '#94a3b8'; // slate-400 — used when spotlight is active and entry isn't spotlighted

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};
const fmtVal = (v: number | null, def: StatDef): string => {
  if (v == null) return '—';
  if (def.isPct) return `${Math.round(v * 10) / 10}%`;
  if (def.decimals === 0) return String(Math.round(v));
  const d = def.decimals ?? 2;
  return Number.isInteger(v) && d <= 0 ? String(v) : v.toFixed(d);
};
function buildSeasonLabel(row: WyscoutStatRow): string {
  const parts: string[] = [];
  if (row.season) parts.push(row.season);
  if (row.division) parts.push(row.division);
  if (row.team) parts.push(row.team);
  return parts.join(' — ') || 'Saison';
}
const uid = () => Math.random().toString(36).slice(2, 10);

function isFresh(row: WyscoutStatRow | null): { fresh: boolean; ageMonths: number } {
  if (!row?.year_end) return { fresh: false, ageMonths: 999 };
  const now = new Date();
  const ageYears = now.getFullYear() - (row.year_end ?? now.getFullYear());
  const ageMonths = ageYears * 12;
  return { fresh: ageMonths <= 18, ageMonths };
}

// ────────────────────────────────────────────────────────────────────────────
// Entry types — discriminated union, allows duplicates of same player
// ────────────────────────────────────────────────────────────────────────────
type CompareEntry =
  | {
      entryId: string; kind: 'player';
      player: Player; rowId: string; stats: WyscoutStatRow | null; color: string;
      minutesMin: number;
    }
  | {
      entryId: string; kind: 'benchmark';
      label: string;
      position: string; club: string; league: string;
      minutesMin: number;
      stats: WyscoutStatRow | null; color: string;
    };

type BenchmarkFilters = { position?: string; club?: string; league?: string; minutesMin?: number };

type ChartMode = 'radar' | 'bars' | 'scatter' | 'diverging';

// ────────────────────────────────────────────────────────────────────────────
// Sortable row wrapper
// ────────────────────────────────────────────────────────────────────────────
function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        {...attributes}
        {...listeners}
        className="px-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing flex items-center"
        title="Glisser pour réordonner"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Player entry card
// ────────────────────────────────────────────────────────────────────────────
function PlayerEntryCard({
  entry, isSpotlight, onColorChange, onRowChange, onRemove, onDuplicate, onMinutesChange, onToggleSpotlight,
}: {
  entry: Extract<CompareEntry, { kind: 'player' }>;
  isSpotlight: boolean;
  onColorChange: (color: string) => void;
  onRowChange: (rowId: string, stats: WyscoutStatRow | null) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMinutesChange: (mins: number) => void;
  onToggleSpotlight: () => void;
}) {
  const { data: rows = [], isLoading } = useWyscoutStats(entry.player.id);

  // Apply min-minutes filter on the picker only (for safety: still let an existing row stay even if it falls under the threshold)
  const visibleRows = useMemo(
    () => rows.filter(r => (num(r.minutes_played) ?? 0) >= entry.minutesMin),
    [rows, entry.minutesMin]
  );

  // Auto-pick most recent (filtered) season once
  useEffect(() => {
    if (rows.length && !entry.stats) {
      const first = visibleRows[0] ?? rows[0];
      if (first) onRowChange(first.id, first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, visibleRows.length]);

  const initials = entry.player.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const freshness = isFresh(entry.stats);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card">
      {/* Color swatch / avatar */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shadow-sm hover:scale-105 transition-transform shrink-0 overflow-hidden border-2"
            style={{ backgroundColor: entry.color, borderColor: entry.color }}
            title="Changer la couleur"
          >
            {entry.player.photo_url ? (
              <img src={entry.player.photo_url} alt="" className="w-full h-full object-cover" />
            ) : initials}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex items-center gap-1 mb-2 text-xs font-medium text-muted-foreground">
            <Palette className="w-3 h-3" /> Couleur
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {COLOR_PALETTE.map(c => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                className={cn(
                  'w-6 h-6 rounded-md hover:scale-110 transition-transform',
                  entry.color === c && 'ring-2 ring-offset-1 ring-foreground'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Player + season */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate">{entry.player.name}</p>
          {!freshness.fresh && entry.stats && (
            <span title={`Données âgées de ~${freshness.ageMonths} mois`}>
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{entry.player.club} · {entry.player.position}</p>
      </div>

      {/* Min minutes filter */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="text-[10px] px-1.5 py-1 rounded border border-border hover:bg-muted text-muted-foreground shrink-0"
            title="Minutes minimum par saison"
          >
            ≥{entry.minutesMin}'
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" align="end">
          <p className="text-[10px] font-semibold mb-2 text-muted-foreground uppercase">Minutes min/saison</p>
          <div className="grid grid-cols-4 gap-1">
            {[0, 300, 600, 900, 1200, 1500, 1800, 2400].map(m => (
              <button
                key={m}
                onClick={() => onMinutesChange(m)}
                className={cn(
                  'text-[10px] py-1 rounded border',
                  entry.minutesMin === m
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:bg-muted'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Season picker */}
      <div className="w-44 shrink-0">
        {isLoading ? (
          <p className="text-[10px] text-muted-foreground italic">Chargement…</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
            <FileSpreadsheet className="w-3 h-3" /> {rows.length === 0 ? 'Aucune donnée' : 'Aucune saison ≥ filtre'}
          </p>
        ) : (
          <Select
            value={entry.rowId || visibleRows[0]?.id}
            onValueChange={val => {
              const found = visibleRows.find(r => r.id === val) ?? null;
              onRowChange(val, found);
            }}
          >
            <SelectTrigger className="h-7 text-[10px] rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleRows.map(r => (
                <SelectItem key={r.id} value={r.id} className="text-[10px]">{buildSeasonLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Spotlight */}
      <button
        onClick={onToggleSpotlight}
        className={cn(
          'w-7 h-7 rounded-md transition-colors flex items-center justify-center shrink-0',
          isSpotlight
            ? 'bg-amber-500/15 text-amber-500'
            : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
        )}
        title={isSpotlight ? 'Retirer la mise en avant' : 'Mettre en avant cette entrée'}
      >
        <Star className={cn('w-3.5 h-3.5', isSpotlight && 'fill-current')} />
      </button>
      {/* Duplicate */}
      <button
        onClick={onDuplicate}
        className="w-7 h-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0"
        title="Dupliquer (ajouter une autre saison)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onRemove}
        className="w-7 h-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center shrink-0"
        title="Retirer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Benchmark entry card — virtual "average for position"
// ────────────────────────────────────────────────────────────────────────────
function BenchmarkEntryCard({
  entry, isSpotlight, allPlayers, onUpdate, onRemove, onColorChange, onToggleSpotlight,
}: {
  entry: Extract<CompareEntry, { kind: 'benchmark' }>;
  isSpotlight: boolean;
  allPlayers: Player[];
  onUpdate: (patch: Partial<Extract<CompareEntry, { kind: 'benchmark' }>>) => void;
  onRemove: () => void;
  onColorChange: (color: string) => void;
  onToggleSpotlight: () => void;
}) {
  const { data: summaries = [], isLoading } = useQuery<WyscoutStatRow[]>({
    queryKey: ['players-wyscout-summary'],
    queryFn: async () => {
      const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
      const res = await fetch(`${API}/players-wyscout-summary`, { credentials: 'include' });
      return res.ok ? res.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Compute aggregated row whenever inputs change
  useEffect(() => {
    if (!summaries.length || !allPlayers.length) return;
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    const filtered = summaries.filter(s => {
      const p = playerById.get(s.player_id);
      if (!p) return false;
      if (entry.position && p.position !== entry.position) return false;
      if (entry.club && p.club !== entry.club) return false;
      if (entry.league && p.league !== entry.league) return false;
      if ((num(s.minutes_played) ?? 0) < entry.minutesMin) return false;
      return true;
    });
    if (filtered.length === 0) {
      onUpdate({ stats: null });
      return;
    }
    const avgRow = { ...filtered[0] } as Record<string, unknown>;
    const keys = Object.keys(filtered[0]);
    for (const k of keys) {
      const vals = filtered.map(r => num((r as Record<string, unknown>)[k])).filter((v): v is number => v != null);
      if (vals.length > 0 && typeof (filtered[0] as Record<string, unknown>)[k] !== 'string') {
        avgRow[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }
    avgRow.id = `bench-${entry.entryId}`;
    avgRow.season = `Moyenne (${filtered.length} joueurs)`;
    avgRow.division = [entry.club, entry.league, entry.position].filter(Boolean).join(' · ') || 'Tous joueurs';
    avgRow.team = '—';
    onUpdate({ stats: avgRow as unknown as WyscoutStatRow });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, allPlayers, entry.position, entry.club, entry.league, entry.minutesMin]);

  const positions = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach(p => p.position && set.add(p.position));
    return Array.from(set).sort();
  }, [allPlayers]);
  const clubs = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach(p => p.club && set.add(p.club));
    return Array.from(set).sort();
  }, [allPlayers]);
  const leagues = useMemo(() => {
    const set = new Set<string>();
    allPlayers.forEach(p => p.league && set.add(p.league));
    return Array.from(set).sort();
  }, [allPlayers]);

  const labelParts = [entry.club, entry.league, entry.position].filter(Boolean);
  const titleLabel = labelParts.length ? `Moy. ${labelParts.join(' · ')}` : 'Moy. tous joueurs';

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border/80 bg-muted/20">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border-2"
            style={{ backgroundColor: entry.color, borderColor: entry.color }}
            title="Changer la couleur"
          >
            <Users className="w-4 h-4 text-white" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex items-center gap-1 mb-2 text-xs font-medium text-muted-foreground"><Palette className="w-3 h-3" /> Couleur</div>
          <div className="grid grid-cols-8 gap-1.5">
            {COLOR_PALETTE.map(c => (
              <button key={c} onClick={() => onColorChange(c)}
                className={cn('w-6 h-6 rounded-md hover:scale-110 transition-transform', entry.color === c && 'ring-2 ring-offset-1 ring-foreground')}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{titleLabel}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {isLoading ? 'Calcul…' : entry.stats ? entry.stats.season : 'Aucun joueur trouvé'}
        </p>
      </div>

      <Select value={entry.club || '__all__'} onValueChange={v => onUpdate({ club: v === '__all__' ? '' : v })}>
        <SelectTrigger className="w-28 h-7 text-[10px] rounded-md" title="Filtrer par club"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-[10px]">Tous clubs</SelectItem>
          {clubs.map(c => <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={entry.league || '__all__'} onValueChange={v => onUpdate({ league: v === '__all__' ? '' : v })}>
        <SelectTrigger className="w-28 h-7 text-[10px] rounded-md" title="Filtrer par championnat"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-[10px]">Tous champ.</SelectItem>
          {leagues.map(l => <SelectItem key={l} value={l} className="text-[10px]">{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={entry.position || '__all__'} onValueChange={v => onUpdate({ position: v === '__all__' ? '' : v })}>
        <SelectTrigger className="w-24 h-7 text-[10px] rounded-md" title="Filtrer par poste"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-[10px]">Tous postes</SelectItem>
          {positions.map(p => <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>)}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <button className="text-[10px] px-1.5 py-1 rounded border border-border hover:bg-muted text-muted-foreground shrink-0"
            title="Minutes minimum">≥{entry.minutesMin}'</button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" align="end">
          <p className="text-[10px] font-semibold mb-2 text-muted-foreground uppercase">Minutes min</p>
          <div className="grid grid-cols-4 gap-1">
            {[0, 300, 600, 900, 1200, 1500, 1800, 2400].map(m => (
              <button key={m} onClick={() => onUpdate({ minutesMin: m })}
                className={cn('text-[10px] py-1 rounded border',
                  entry.minutesMin === m ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-muted')}>
                {m}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        onClick={onToggleSpotlight}
        className={cn(
          'w-7 h-7 rounded-md transition-colors flex items-center justify-center shrink-0',
          isSpotlight ? 'bg-amber-500/15 text-amber-500' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
        )}
        title={isSpotlight ? 'Retirer la mise en avant' : 'Mettre en avant cette entrée'}
      >
        <Star className={cn('w-3.5 h-3.5', isSpotlight && 'fill-current')} />
      </button>
      <button onClick={onRemove}
        className="w-7 h-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center shrink-0"
        title="Retirer"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add-player popover — tabs: Joueur / Club / Championnat / Poste
// ────────────────────────────────────────────────────────────────────────────
type AddMode = 'player' | 'club' | 'league' | 'position';

function AddPlayerPopover({
  players, isLoading, onAdd, onAddMany, onAddBenchmark,
}: {
  players: Player[]; isLoading: boolean;
  onAdd: (p: Player) => void;
  onAddMany: (ps: Player[]) => void;
  onAddBenchmark: (filters: BenchmarkFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AddMode>('player');
  const [q, setQ] = useState('');
  const [selectedClub, setSelectedClub] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');

  // Derived option lists
  const { clubs, leagues, positions } = useMemo(() => {
    const c = new Set<string>(), l = new Set<string>(), p = new Set<string>();
    players.forEach(pl => {
      if (pl.club) c.add(pl.club);
      if (pl.league) l.add(pl.league);
      if (pl.position) p.add(pl.position);
    });
    return {
      clubs: Array.from(c).sort(),
      leagues: Array.from(l).sort(),
      positions: Array.from(p).sort(),
    };
  }, [players]);

  // Player tab: text search
  const filteredPlayers = useMemo(() => {
    const s = q.toLowerCase();
    return players
      .filter(p =>
        !s || p.name.toLowerCase().includes(s) ||
        (p.club || '').toLowerCase().includes(s) ||
        (p.position || '').toLowerCase().includes(s)
      )
      .slice(0, 50);
  }, [players, q]);

  // Group tab: matching players
  const matchingPlayers = useMemo(() => {
    if (mode === 'club' && selectedClub) return players.filter(p => p.club === selectedClub);
    if (mode === 'league' && selectedLeague) return players.filter(p => p.league === selectedLeague);
    if (mode === 'position' && selectedPosition) return players.filter(p => p.position === selectedPosition);
    return [];
  }, [mode, players, selectedClub, selectedLeague, selectedPosition]);

  const close = () => { setOpen(false); setQ(''); };

  const groupOptions: { value: string; setter: (v: string) => void; list: string[]; placeholder: string; label: string } = (() => {
    if (mode === 'club') return { value: selectedClub, setter: setSelectedClub, list: clubs, placeholder: 'Choisir un club…', label: 'Club' };
    if (mode === 'league') return { value: selectedLeague, setter: setSelectedLeague, list: leagues, placeholder: 'Choisir un championnat…', label: 'Championnat' };
    return { value: selectedPosition, setter: setSelectedPosition, list: positions, placeholder: 'Choisir un poste…', label: 'Poste' };
  })();

  const benchmarkFiltersForMode = (): BenchmarkFilters => {
    if (mode === 'club') return { club: selectedClub };
    if (mode === 'league') return { league: selectedLeague };
    if (mode === 'position') return { position: selectedPosition };
    return {};
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 h-8">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="end">
        <Tabs value={mode} onValueChange={v => setMode(v as AddMode)} className="w-full">
          <TabsList className="grid grid-cols-4 h-8 mb-2">
            <TabsTrigger value="player" className="text-[10px] gap-1 h-6"><Search className="w-3 h-3" /> Joueur</TabsTrigger>
            <TabsTrigger value="club" className="text-[10px] gap-1 h-6"><Users className="w-3 h-3" /> Club</TabsTrigger>
            <TabsTrigger value="league" className="text-[10px] gap-1 h-6"><Trophy className="w-3 h-3" /> Champ.</TabsTrigger>
            <TabsTrigger value="position" className="text-[10px] gap-1 h-6"><Activity className="w-3 h-3" /> Poste</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Player tab */}
        {mode === 'player' && (
          <>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={isLoading ? 'Chargement…' : 'Rechercher un joueur…'}
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => { onAddBenchmark({}); close(); }}
              className="w-full text-left px-2 py-2 mb-1 rounded border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center gap-2 text-xs"
            >
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">Ajouter « Moyenne tous joueurs »</span>
            </button>
            <div className="max-h-64 overflow-y-auto overscroll-contain pr-1">
              {filteredPlayers.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Aucun joueur</p>
              ) : (
                <div className="space-y-0.5">
                  {filteredPlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { onAdd(p); close(); }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">
                          {p.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{p.club} · {p.position}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Group tabs (club / league / position) */}
        {mode !== 'player' && (
          <>
            <div className="mb-2">
              <Select value={groupOptions.value} onValueChange={groupOptions.setter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={groupOptions.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.list.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">Aucun {groupOptions.label.toLowerCase()}</div>
                  ) : groupOptions.list.map(opt => (
                    <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {groupOptions.value && (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    onClick={() => { onAddMany(matchingPlayers); close(); }}
                    disabled={matchingPlayers.length === 0}
                    className="text-[11px] px-2 py-2 rounded border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-0.5"
                  >
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">Tous ({matchingPlayers.length})</span>
                    <span className="text-[9px] text-muted-foreground">individuellement</span>
                  </button>
                  <button
                    onClick={() => { onAddBenchmark(benchmarkFiltersForMode()); close(); }}
                    className="text-[11px] px-2 py-2 rounded border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center gap-0.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">Moyenne</span>
                    <span className="text-[9px] text-muted-foreground">une seule entrée</span>
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1 px-1">Aperçu</p>
                <div className="max-h-52 overflow-y-auto overscroll-contain pr-1">
                  {matchingPlayers.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground text-center">Aucun joueur</p>
                  ) : (
                    <div className="space-y-0.5">
                      {matchingPlayers.slice(0, 30).map(p => (
                        <button
                          key={p.id}
                          onClick={() => { onAdd(p); close(); }}
                          className="w-full text-left px-2 py-1 rounded hover:bg-muted transition-colors flex items-center gap-2"
                          title="Ajouter ce joueur seul"
                        >
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">
                              {p.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate">{p.name}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{p.club} · {p.position}</p>
                          </div>
                        </button>
                      ))}
                      {matchingPlayers.length > 30 && (
                        <p className="text-[10px] text-muted-foreground text-center py-1">+ {matchingPlayers.length - 30} autres</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {!groupOptions.value && (
              <p className="text-xs text-muted-foreground text-center py-6">Sélectionnez {groupOptions.label.toLowerCase() === 'club' ? 'un club' : groupOptions.label.toLowerCase() === 'championnat' ? 'un championnat' : 'un poste'} pour voir les options</p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stat picker dialog
// ────────────────────────────────────────────────────────────────────────────
function StatPickerDialog({
  open, onOpenChange, selected, onChange,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  selected: string[]; onChange: (s: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => { if (open) setDraft(selected); }, [open, selected]);

  const grouped = useMemo(() => {
    const out: Record<Cat, StatDef[]> = { volume: [], attack: [], passing: [], defense: [], set: [], gk: [], physical: [] };
    for (const s of STATS) out[s.cat].push(s);
    return out;
  }, []);

  const toggle = (key: string) => setDraft(d => d.includes(key) ? d.filter(k => k !== key) : [...d, key]);
  const toggleCat = (cat: Cat) => {
    const keys = grouped[cat].map(s => s.key as string);
    const allOn = keys.every(k => draft.includes(k));
    setDraft(d => {
      if (allOn) return d.filter(k => !keys.includes(k));
      const seen: Record<string, boolean> = {};
      const merged: string[] = [];
      [...d, ...keys].forEach(k => { if (!seen[k]) { seen[k] = true; merged.push(k); } });
      return merged;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> Choisir les statistiques à comparer</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <button onClick={() => setDraft([])}
            className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive transition-colors font-medium">
            Tout effacer
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain -mx-1 px-1 min-h-0">
          <div className="space-y-3">
            {(Object.keys(grouped) as Cat[]).map(cat => {
              const items = grouped[cat];
              const allKeys = items.map(s => s.key as string);
              const allOn = allKeys.every(k => draft.includes(k));
              const someOn = !allOn && allKeys.some(k => draft.includes(k));
              return (
                <div key={cat}>
                  <button onClick={() => toggleCat(cat)}
                    className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground py-1 hover:text-foreground">
                    <span>{CAT_LABEL[cat]}</span>
                    <span className="text-[10px] font-normal">{someOn ? '— partiel —' : allOn ? '— tout sélectionné —' : '— tout sélectionner —'}</span>
                  </button>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {items.map(s => (
                      <label key={s.key as string}
                        className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-pointer transition-colors text-xs',
                          draft.includes(s.key as string) ? 'bg-primary/10 border-primary/40' : 'border-border hover:bg-muted/50')}>
                        <Checkbox checked={draft.includes(s.key as string)} onCheckedChange={() => toggle(s.key as string)} />
                        <span className="truncate">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">{draft.length} stats sélectionnées</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button size="sm" onClick={() => { onChange(draft); onOpenChange(false); }}>Appliquer</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Saved views — localStorage
// ────────────────────────────────────────────────────────────────────────────
interface SerializedEntry {
  kind: 'player' | 'benchmark';
  playerId?: string;
  rowId?: string;
  position?: string;
  club?: string;
  league?: string;
  color: string;
  minutesMin: number;
}
interface SerializedState {
  entries: SerializedEntry[];
  stats: string[];
  chartMode: ChartMode;
  scatterX: string;
  spotlightIdx?: number;
  scatterY: string;
  highlightWinner: boolean;
  heatmap: boolean;
}
interface SavedView { name: string; payload: SerializedState; createdAt: number; }

const SAVED_VIEWS_KEY = 'compare-saved-views';
const CURRENT_VIEW_KEY = 'compare-current-view';

const loadSavedViews = (): SavedView[] => {
  try { return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]'); }
  catch { return []; }
};
const persistSavedViews = (v: SavedView[]) => {
  try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
};

const encodeState = (s: SerializedState): string => {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
  catch { return ''; }
};
const decodeState = (str: string): SerializedState | null => {
  try { return JSON.parse(decodeURIComponent(escape(atob(str)))); }
  catch { return null; }
};

// ────────────────────────────────────────────────────────────────────────────
// Heatmap color helper
// ────────────────────────────────────────────────────────────────────────────
function heatmapColor(v: number | null, min: number, max: number, higherIsBetter: boolean): string {
  if (v == null || min === max) return '';
  let pct = (v - min) / (max - min);
  if (!higherIsBetter) pct = 1 - pct;
  // 0 → rose-100, 0.5 → amber-100, 1 → emerald-100
  if (pct >= 0.66) return `rgba(16, 185, 129, ${0.10 + pct * 0.18})`;  // emerald
  if (pct >= 0.33) return `rgba(234, 179, 8, ${0.10 + pct * 0.10})`;   // amber
  return `rgba(239, 68, 68, ${0.10 + (1 - pct) * 0.16})`;              // rose
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────
export default function PlayerCompare() {
  const { t: _t } = useTranslation();
  const { toast } = useToast();
  const { data: players = [], isLoading: playersLoading } = usePlayers();
  const { data: isAdmin } = useIsAdmin();
  const radarRef = useRef<HTMLDivElement | null>(null);

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('check-subscription');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const isPremium = !!(subData?.subscribed) || !!isAdmin;

  // ── Hydrate state from URL hash, then localStorage, else defaults ──
  const initialState = useMemo<SerializedState>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#v=')) {
        const decoded = decodeState(hash.slice(3));
        if (decoded) return decoded;
      }
      const cur = localStorage.getItem(CURRENT_VIEW_KEY);
      if (cur) {
        try { return JSON.parse(cur); } catch { /* ignore */ }
      }
    }
    return {
      entries: [], stats: DEFAULT_STATS, chartMode: 'radar',
      scatterX: 'xg_per90', scatterY: 'xa_per90',
      highlightWinner: true, heatmap: false,
    };
  }, []);

  // ── State ──
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [selectedStats, setSelectedStats] = useState<string[]>(initialState.stats);
  const [chartMode, setChartMode] = useState<ChartMode>(initialState.chartMode);
  const [scatterX, setScatterX] = useState<string>(initialState.scatterX);
  const [scatterY, setScatterY] = useState<string>(initialState.scatterY);
  const [highlightWinner, setHighlightWinner] = useState(initialState.highlightWinner);
  const [heatmap, setHeatmap] = useState(initialState.heatmap);
  const [statPickerOpen, setStatPickerOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [spotlightEntryId, setSpotlightEntryId] = useState<string | null>(null);
  const toggleSpotlight = (entryId: string) =>
    setSpotlightEntryId(curr => curr === entryId ? null : entryId);
  const isMuted = (entryId: string) => spotlightEntryId !== null && spotlightEntryId !== entryId;
  const effectiveColor = (e: CompareEntry) => isMuted(e.entryId) ? MUTED_COLOR : e.color;
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  // ── Hydrate entries from initial state once players are loaded ──
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || players.length === 0) return;
    hydratedRef.current = true;
    if (initialState.entries?.length) {
      const playerById = new Map(players.map(p => [p.id, p]));
      const restored: CompareEntry[] = [];
      for (const e of initialState.entries) {
        if (e.kind === 'player' && e.playerId) {
          const p = playerById.get(e.playerId);
          if (p) {
            restored.push({
              entryId: uid(), kind: 'player',
              player: p, rowId: e.rowId || '', stats: null,
              color: e.color, minutesMin: e.minutesMin ?? 0,
            });
          }
        } else if (e.kind === 'benchmark') {
          restored.push({
            entryId: uid(), kind: 'benchmark',
            label: 'Moyenne du poste',
            position: e.position || '',
            club: e.club || '',
            league: e.league || '',
            minutesMin: e.minutesMin ?? 0,
            stats: null, color: e.color,
          });
        }
      }
      setEntries(restored);
      const idx = initialState.spotlightIdx;
      if (idx != null && idx >= 0 && idx < restored.length) {
        setSpotlightEntryId(restored[idx].entryId);
      }
    }
  }, [players, initialState]);

  // ── Persist current view + URL hash on every change ──
  useEffect(() => {
    const serialized: SerializedState = {
      entries: entries.map(e => e.kind === 'player' ? {
        kind: 'player' as const, playerId: e.player.id, rowId: e.rowId,
        color: e.color, minutesMin: e.minutesMin,
      } : {
        kind: 'benchmark' as const,
        position: e.position, club: e.club, league: e.league,
        color: e.color, minutesMin: e.minutesMin,
      }),
      stats: selectedStats, chartMode, scatterX, scatterY,
      highlightWinner, heatmap,
      spotlightIdx: spotlightEntryId ? entries.findIndex(e => e.entryId === spotlightEntryId) : -1,
    };
    try { localStorage.setItem(CURRENT_VIEW_KEY, JSON.stringify(serialized)); } catch { /* ignore */ }
  }, [entries, selectedStats, chartMode, scatterX, scatterY, highlightWinner, heatmap, spotlightEntryId]);

  // ── Add / remove / update / reorder ──
  const pickColor = (used: Set<string>, fallbackIdx = 0) =>
    COLOR_PALETTE.find(c => !used.has(c)) ?? COLOR_PALETTE[fallbackIdx % COLOR_PALETTE.length];

  const addPlayer = useCallback((p: Player) => {
    setEntries(prev => {
      const used = new Set(prev.map(e => e.color));
      return [...prev, {
        entryId: uid(), kind: 'player', player: p, rowId: '', stats: null,
        color: pickColor(used, prev.length), minutesMin: 0,
      }];
    });
  }, []);

  const addPlayers = useCallback((ps: Player[]) => {
    if (!ps.length) return;
    if (ps.length > 15) {
      toast({ title: `${ps.length} joueurs ajoutés`, description: 'Le radar peut être chargé. Pensez à utiliser une « Moyenne » pour synthétiser.' });
    }
    setEntries(prev => {
      const used = new Set(prev.map(e => e.color));
      const next: CompareEntry[] = [...prev];
      ps.forEach((p, i) => {
        const color = pickColor(used, prev.length + i);
        used.add(color);
        next.push({
          entryId: uid(), kind: 'player', player: p, rowId: '', stats: null,
          color, minutesMin: 0,
        });
      });
      return next;
    });
  }, [toast]);

  const addBenchmark = useCallback((filters: BenchmarkFilters = {}) => {
    setEntries(prev => {
      const used = new Set(prev.map(e => e.color));
      return [...prev, {
        entryId: uid(), kind: 'benchmark', label: 'Moyenne du poste',
        position: filters.position ?? '',
        club: filters.club ?? '',
        league: filters.league ?? '',
        minutesMin: filters.minutesMin ?? 600,
        stats: null,
        color: pickColor(used, prev.length),
      }];
    });
  }, []);
  const duplicatePlayer = (entryId: string) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.entryId === entryId);
      if (idx === -1) return prev;
      const orig = prev[idx];
      if (orig.kind !== 'player') return prev;
      const usedColors = new Set(prev.map(e => e.color));
      const color = COLOR_PALETTE.find(c => !usedColors.has(c)) ?? COLOR_PALETTE[prev.length % COLOR_PALETTE.length];
      const copy: CompareEntry = { ...orig, entryId: uid(), color, rowId: '', stats: null };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const removeEntry = (entryId: string) => setEntries(prev => prev.filter(e => e.entryId !== entryId));
  const updateEntry = (entryId: string, patch: Partial<CompareEntry>) =>
    setEntries(prev => prev.map(e => e.entryId === entryId ? ({ ...e, ...patch } as CompareEntry) : e));

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEntries(prev => {
        const oldIndex = prev.findIndex(e => e.entryId === active.id);
        const newIndex = prev.findIndex(e => e.entryId === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // ── Active entries (with stats loaded) ──
  const activeEntries = entries.filter(e => e.stats);
  const entryLabel = (e: CompareEntry, withSeason = true) => {
    if (e.kind === 'benchmark') return `Moy. ${e.position || 'tous'}`;
    const base = e.player.name;
    if (!withSeason || !e.stats?.season) return base;
    return `${base} (${e.stats.season})`;
  };

  // ── Radar data ──
  const radarData = useMemo(() => {
    if (!activeEntries.length || !selectedStats.length) return [];
    return selectedStats
      .map(k => STAT_BY_KEY[k])
      .filter(Boolean)
      .map(def => {
        const row: Record<string, number | string> = { axis: def.label };
        activeEntries.forEach(e => {
          const raw = num(e.stats![def.key]) ?? 0;
          row[entryLabel(e)] = Math.min(100, Math.round((raw / def.max) * 100));
        });
        return row;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries, selectedStats]);

  // ── Bar chart data (one bar per entry per stat) ──
  const barData = useMemo(() => {
    return selectedStats
      .map(k => STAT_BY_KEY[k])
      .filter(Boolean)
      .map(def => {
        const row: Record<string, number | string> = { stat: def.label };
        activeEntries.forEach(e => {
          row[entryLabel(e)] = num(e.stats![def.key]) ?? 0;
        });
        return row;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries, selectedStats]);

  // ── Diverging data (only for 2 entries) ──
  const divergingData = useMemo(() => {
    if (activeEntries.length !== 2) return [];
    const [a, b] = activeEntries;
    return selectedStats
      .map(k => STAT_BY_KEY[k])
      .filter(Boolean)
      .map(def => {
        const av = num(a.stats![def.key]) ?? 0;
        const bv = num(b.stats![def.key]) ?? 0;
        return {
          stat: def.label,
          [entryLabel(a)]: -av,
          [entryLabel(b)]: bv,
          aRaw: av, bRaw: bv,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries, selectedStats]);

  // ── Scatter data ──
  const scatterDef = STAT_BY_KEY[scatterX];
  const scatterDefY = STAT_BY_KEY[scatterY];
  const scatterPoints = useMemo(() => {
    const pts = activeEntries.map(e => {
      const muted = isMuted(e.entryId);
      const focused = spotlightEntryId === e.entryId;
      return {
        entryId: e.entryId,
        name: entryLabel(e),
        color: muted ? MUTED_COLOR : e.color,
        opacity: muted ? 0.5 : 1,
        size: focused ? 220 : muted ? 70 : 130,
        x: num(e.stats![scatterX as keyof WyscoutStatRow]) ?? 0,
        y: num(e.stats![scatterY as keyof WyscoutStatRow]) ?? 0,
      };
    });
    // Spotlighted point drawn last so it sits on top
    if (spotlightEntryId) {
      pts.sort((a, b) => (a.entryId === spotlightEntryId ? 1 : 0) - (b.entryId === spotlightEntryId ? 1 : 0));
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries, scatterX, scatterY, spotlightEntryId]);

  // ── Table rows ──
  const tableRows = useMemo(() => {
    const rows = selectedStats
      .map(k => STAT_BY_KEY[k])
      .filter(Boolean)
      .map(def => {
        const values = activeEntries.map(e => num(e.stats![def.key]));
        const valid = values.filter((v): v is number => v != null);
        const best = valid.length > 0
          ? (def.higherIsBetter === false ? Math.min(...valid) : Math.max(...valid))
          : null;
        const worst = valid.length > 0
          ? (def.higherIsBetter === false ? Math.max(...valid) : Math.min(...valid))
          : null;
        return { def, values, best, worst };
      });
    if (!sortKey) return rows;
    const sortIdx = activeEntries.findIndex(e => e.entryId === sortKey);
    if (sortIdx === -1) return rows;
    return [...rows].sort((a, b) => {
      const av = a.values[sortIdx] ?? -Infinity;
      const bv = b.values[sortIdx] ?? -Infinity;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [selectedStats, activeEntries, sortKey, sortDir]);

  // ── Saved views API ──
  const saveCurrentView = (name: string) => {
    if (!name.trim()) return;
    const payload: SerializedState = {
      entries: entries.map(e => e.kind === 'player' ? {
        kind: 'player', playerId: e.player.id, rowId: e.rowId, color: e.color, minutesMin: e.minutesMin,
      } : {
        kind: 'benchmark', position: e.position, club: e.club, league: e.league,
        color: e.color, minutesMin: e.minutesMin,
      }),
      stats: selectedStats, chartMode, scatterX, scatterY, highlightWinner, heatmap,
      spotlightIdx: spotlightEntryId ? entries.findIndex(e => e.entryId === spotlightEntryId) : -1,
    };
    const next = [...savedViews.filter(v => v.name !== name), { name, payload, createdAt: Date.now() }];
    setSavedViews(next);
    persistSavedViews(next);
    toast({ title: 'Vue enregistrée', description: `« ${name} » est disponible dans le menu Vues.` });
    setSaveDialogOpen(false);
    setNewViewName('');
  };
  const loadView = (v: SavedView) => {
    const playerById = new Map(players.map(p => [p.id, p]));
    const restored: CompareEntry[] = [];
    for (const e of v.payload.entries) {
      if (e.kind === 'player' && e.playerId) {
        const p = playerById.get(e.playerId);
        if (p) restored.push({
          entryId: uid(), kind: 'player', player: p, rowId: e.rowId || '', stats: null,
          color: e.color, minutesMin: e.minutesMin ?? 0,
        });
      } else if (e.kind === 'benchmark') {
        restored.push({
          entryId: uid(), kind: 'benchmark', label: 'Moyenne du poste',
          position: e.position || '',
          club: e.club || '',
          league: e.league || '',
          minutesMin: e.minutesMin ?? 0,
          stats: null, color: e.color,
        });
      }
    }
    setEntries(restored);
    setSelectedStats(v.payload.stats);
    setChartMode(v.payload.chartMode);
    setScatterX(v.payload.scatterX);
    setScatterY(v.payload.scatterY);
    setHighlightWinner(v.payload.highlightWinner);
    setHeatmap(v.payload.heatmap);
    const idx = v.payload.spotlightIdx;
    setSpotlightEntryId(idx != null && idx >= 0 && idx < restored.length ? restored[idx].entryId : null);
    toast({ title: 'Vue chargée', description: `« ${v.name} »` });
  };
  const deleteView = (name: string) => {
    const next = savedViews.filter(v => v.name !== name);
    setSavedViews(next);
    persistSavedViews(next);
  };
  const copyShareLink = async () => {
    const payload: SerializedState = {
      entries: entries.map(e => e.kind === 'player' ? {
        kind: 'player', playerId: e.player.id, rowId: e.rowId, color: e.color, minutesMin: e.minutesMin,
      } : {
        kind: 'benchmark', position: e.position, club: e.club, league: e.league,
        color: e.color, minutesMin: e.minutesMin,
      }),
      stats: selectedStats, chartMode, scatterX, scatterY, highlightWinner, heatmap,
      spotlightIdx: spotlightEntryId ? entries.findIndex(e => e.entryId === spotlightEntryId) : -1,
    };
    const url = `${window.location.origin}${window.location.pathname}#v=${encodeState(payload)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Lien copié', description: 'Le lien de partage est dans votre presse-papier.' });
    } catch {
      window.prompt('Copiez le lien :', url);
    }
  };

  // ── PNG export (radar) ──
  const downloadRadarPng = async () => {
    const svg = radarRef.current?.querySelector('svg');
    if (!svg) {
      toast({ title: 'Erreur', description: 'Graphique introuvable', variant: 'destructive' });
      return;
    }
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.querySelectorAll('text').forEach(t => t.setAttribute('fill', '#0f172a'));
      clone.querySelectorAll('line, path').forEach(el => {
        if (el.getAttribute('stroke') === 'hsl(var(--border))') el.setAttribute('stroke', '#cbd5e1');
      });
      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const radarImg = new Image();
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      const loadImg = (img: HTMLImageElement, src: string) => new Promise<HTMLImageElement | null>(resolve => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
      const [radarLoaded, logoLoaded] = await Promise.all([
        loadImg(radarImg, svgUrl), loadImg(logoImg, '/logo.png'),
      ]);
      if (!radarLoaded) {
        URL.revokeObjectURL(svgUrl);
        toast({ title: 'Erreur', description: 'Impossible de générer l\'image', variant: 'destructive' });
        return;
      }
      const scale = 2, padding = 30 * scale;
      const cw = w * scale + padding * 2;
      const ch = h * scale + padding * 2 + 60 * scale;
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${18 * scale}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Comparaison de joueurs', padding, padding / 2);
      ctx.font = `${11 * scale}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(activeEntries.map(e => entryLabel(e, false)).join(' · '), padding, padding / 2 + 24 * scale);
      ctx.drawImage(radarImg, padding, padding + 35 * scale, w * scale, h * scale);
      const wmY = ch - 25 * scale;
      const wmText = 'Scouty';
      ctx.font = `bold ${16 * scale}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      const textW = ctx.measureText(wmText).width;
      if (logoLoaded) {
        const logoSize = 24 * scale, gap = 6 * scale;
        const logoX = cw - padding - textW - gap - logoSize;
        ctx.drawImage(logoImg, logoX, wmY - logoSize / 2, logoSize, logoSize);
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillText(wmText, cw - padding, wmY);
      ctx.font = `${10 * scale}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), cw - padding, wmY + 14 * scale);
      canvas.toBlob(blob => {
        if (!blob) return;
        const dl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dl;
        a.download = `comparaison-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(dl); URL.revokeObjectURL(svgUrl);
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast({ title: 'Erreur', description: 'Impossible d\'exporter le graphique', variant: 'destructive' });
    }
  };

  // ── CSV / Excel export ──
  const buildExportRows = () =>
    [['Stat', ...activeEntries.map(e => entryLabel(e))],
      ...tableRows.map(r => [r.def.label, ...r.values.map(v => v == null ? '' : v)])];
  const exportCsv = () => {
    const data = buildExportRows();
    const csv = data.map(row => row.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `comparaison-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  const exportXlsx = () => {
    const data = buildExportRows();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparaison');
    XLSX.writeFile(wb, `comparaison-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Premium gate ──
  if (subLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!isPremium) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center"><Crown className="w-8 h-8 text-amber-500" /></div>
        <div>
          <h2 className="text-xl font-bold">Fonctionnalité Premium</h2>
          <p className="text-sm text-muted-foreground mt-2">Le comparateur de joueurs est réservé aux abonnés Premium.</p>
        </div>
        <Link to="/pricing"><Button className="gap-2"><Crown className="w-4 h-4" /> Passer à Premium</Button></Link>
        <Link to="/players" className="text-xs text-muted-foreground hover:underline">Retour aux joueurs</Link>
      </div>
    );
  }

  const canCompare = activeEntries.length >= 1 && selectedStats.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <GitCompareArrows className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Data</h1>
          <p className="text-sm text-muted-foreground">Base WyScout partagée — recherche, fiche joueur, comparaison</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] gap-1"><FileSpreadsheet className="w-3 h-3 text-emerald-500" /> WyScout</Badge>
          <Badge variant="outline" className="text-[10px]">{entries.length} entrée{entries.length > 1 ? 's' : ''}</Badge>

          {/* Saved views menu */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Save className="w-3.5 h-3.5" /> Vues
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes vues</p>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={() => setSaveDialogOpen(true)}>
                  <Plus className="w-3 h-3" /> Enregistrer
                </Button>
              </div>
              {savedViews.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Aucune vue enregistrée</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {savedViews.map(v => (
                    <div key={v.name} className="flex items-center group rounded hover:bg-muted">
                      <button
                        onClick={() => loadView(v)}
                        className="flex-1 text-left px-2 py-1.5 text-xs"
                      >
                        <p className="font-medium truncate">{v.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {v.payload.entries.length} entrée{v.payload.entries.length > 1 ? 's' : ''} · {v.payload.stats.length} stats
                        </p>
                      </button>
                      <button
                        onClick={() => deleteView(v.name)}
                        className="opacity-0 group-hover:opacity-100 mr-1 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-2 mt-2">
                <Button size="sm" variant="outline" className="w-full h-7 gap-1.5 text-[11px]" onClick={copyShareLink}>
                  <Link2 className="w-3 h-3" /> Copier un lien de partage
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* WyScout shared catalogue search */}
      <WyscoutCatalogSearch />

      {/* Players panel */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Joueurs à comparer</CardTitle>
            <AddPlayerPopover
              players={players}
              isLoading={playersLoading}
              onAdd={addPlayer}
              onAddMany={addPlayers}
              onAddBenchmark={addBenchmark}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <GitCompareArrows className="w-10 h-10 mx-auto mb-2 text-muted-foreground/15" />
              <p className="text-sm text-muted-foreground">Aucun joueur sélectionné</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Cliquez sur « Ajouter » pour commencer · même joueur ajoutable plusieurs fois pour comparer ses saisons</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map(e => e.entryId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {entries.map(e => (
                    <SortableRow key={e.entryId} id={e.entryId}>
                      {e.kind === 'player' ? (
                        <PlayerEntryCard
                          entry={e}
                          isSpotlight={spotlightEntryId === e.entryId}
                          onColorChange={c => updateEntry(e.entryId, { color: c })}
                          onRowChange={(rowId, stats) => updateEntry(e.entryId, { rowId, stats } as Partial<CompareEntry>)}
                          onRemove={() => removeEntry(e.entryId)}
                          onDuplicate={() => duplicatePlayer(e.entryId)}
                          onMinutesChange={mins => updateEntry(e.entryId, { minutesMin: mins } as Partial<CompareEntry>)}
                          onToggleSpotlight={() => toggleSpotlight(e.entryId)}
                        />
                      ) : (
                        <BenchmarkEntryCard
                          entry={e}
                          isSpotlight={spotlightEntryId === e.entryId}
                          allPlayers={players}
                          onUpdate={patch => updateEntry(e.entryId, patch as Partial<CompareEntry>)}
                          onRemove={() => removeEntry(e.entryId)}
                          onColorChange={c => updateEntry(e.entryId, { color: c })}
                          onToggleSpotlight={() => toggleSpotlight(e.entryId)}
                        />
                      )}
                    </SortableRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Stats config bar */}
      {entries.length > 0 && (
        <Card className="card-warm">
          <CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setStatPickerOpen(true)}>
                <Settings2 className="w-3.5 h-3.5" /> Stats ({selectedStats.length})
              </Button>
              {spotlightEntryId && (() => {
                const sp = entries.find(e => e.entryId === spotlightEntryId);
                if (!sp) return null;
                return (
                  <button
                    onClick={() => setSpotlightEntryId(null)}
                    className="text-[10px] px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                    title="Retirer la mise en avant"
                  >
                    <Star className="w-3 h-3 fill-current" /> {entryLabel(sp, false)} <X className="w-3 h-3 ml-0.5" />
                  </button>
                );
              })()}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                <Checkbox checked={highlightWinner} onCheckedChange={v => setHighlightWinner(!!v)} />
                <Trophy className="w-3 h-3 text-amber-500" /> Meilleur
              </label>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                <Checkbox checked={heatmap} onCheckedChange={v => setHeatmap(!!v)} />
                <Scaling className="w-3 h-3 text-violet-500" /> Heatmap
              </label>
              {activeEntries.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1" align="end">
                    <button onClick={exportCsv} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2">
                      <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button onClick={exportXlsx} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2">
                      <XlsxIcon className="w-3.5 h-3.5 text-emerald-500" /> Excel (.xlsx)
                    </button>
                    <button onClick={downloadRadarPng} className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-violet-500" /> Graphique (PNG)
                    </button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison area */}
      {canCompare ? (
        <>
          {/* Chart card with mode tabs */}
          <Card className="card-warm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Tabs value={chartMode} onValueChange={v => setChartMode(v as ChartMode)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="radar" className="text-xs gap-1 h-6"><RadarIcon className="w-3 h-3" /> Radar</TabsTrigger>
                    <TabsTrigger value="bars" className="text-xs gap-1 h-6"><BarChart3 className="w-3 h-3" /> Barres</TabsTrigger>
                    <TabsTrigger value="scatter" className="text-xs gap-1 h-6"><Activity className="w-3 h-3" /> Scatter</TabsTrigger>
                    <TabsTrigger value="diverging" disabled={activeEntries.length !== 2} className="text-xs gap-1 h-6">
                      <ArrowLeftRight className="w-3 h-3" /> Divergent
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {chartMode === 'radar' && selectedStats.length >= 3 && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={downloadRadarPng}>
                    <ImageIcon className="w-3.5 h-3.5" /> PNG
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div ref={radarRef}>
                {chartMode === 'radar' && (
                  selectedStats.length < 3 ? (
                    <p className="text-xs text-muted-foreground text-center py-12">Sélectionnez au moins 3 stats pour le radar</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        {activeEntries.map(e => {
                          const muted = isMuted(e.entryId);
                          const focused = spotlightEntryId === e.entryId;
                          return (
                            <Radar
                              key={e.entryId}
                              name={entryLabel(e)}
                              dataKey={entryLabel(e)}
                              stroke={effectiveColor(e)}
                              fill={effectiveColor(e)}
                              fillOpacity={focused ? 0.28 : muted ? 0.04 : 0.15}
                              strokeWidth={focused ? 3 : muted ? 1 : 2}
                              strokeOpacity={muted ? 0.45 : 1}
                              strokeDasharray={e.kind === 'benchmark' ? '4 3' : undefined}
                            />
                          );
                        })}
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  )
                )}
                {chartMode === 'bars' && (
                  <ResponsiveContainer width="100%" height={Math.max(300, selectedStats.length * 32 + 80)}>
                    <BarChart data={barData} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 120 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis type="category" dataKey="stat" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={120} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      {activeEntries.map(e => (
                        <Bar
                          key={e.entryId}
                          dataKey={entryLabel(e)}
                          fill={effectiveColor(e)}
                          fillOpacity={isMuted(e.entryId) ? 0.5 : 1}
                          radius={[0, 3, 3, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {chartMode === 'scatter' && (
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-3 px-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">Axes :</span>
                      <Select value={scatterX} onValueChange={setScatterX}>
                        <SelectTrigger className="h-7 w-48 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATS.map(s => <SelectItem key={s.key as string} value={s.key as string} className="text-[11px]">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">×</span>
                      <Select value={scatterY} onValueChange={setScatterY}>
                        <SelectTrigger className="h-7 w-48 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATS.map(s => <SelectItem key={s.key as string} value={s.key as string} className="text-[11px]">{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <ResponsiveContainer width="100%" height={400}>
                      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 30 }}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <XAxis type="number" dataKey="x" name={scatterDef?.label}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: scatterDef?.label, position: 'insideBottom', offset: -10, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis type="number" dataKey="y" name={scatterDefY?.label}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: scatterDefY?.label, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <ZAxis type="number" dataKey="size" range={[60, 240]} />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as { name: string; color: string; x: number; y: number };
                            return (
                              <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
                                <div className="flex items-center gap-1.5 font-semibold mb-1">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                                  {p.name}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {scatterDef?.label}: <span className="text-foreground font-medium tabular-nums">{scatterDef ? fmtVal(p.x, scatterDef) : p.x}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {scatterDefY?.label}: <span className="text-foreground font-medium tabular-nums">{scatterDefY ? fmtVal(p.y, scatterDefY) : p.y}</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        {scatterPoints.map((pt) => (
                          <Scatter
                            key={pt.entryId}
                            name={pt.name}
                            data={[pt]}
                            fill={pt.color}
                            fillOpacity={pt.opacity}
                            shape="circle"
                          />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 justify-center mt-2">
                      {scatterPoints.map(pt => (
                        <div key={pt.entryId} className="flex items-center gap-1 text-[10px]" style={{ opacity: pt.opacity }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pt.color }} />
                          <span className={spotlightEntryId === pt.entryId ? 'font-semibold text-foreground' : ''}>{pt.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {chartMode === 'diverging' && activeEntries.length === 2 && (
                  <ResponsiveContainer width="100%" height={Math.max(300, selectedStats.length * 32 + 80)}>
                    <BarChart data={divergingData} layout="vertical" stackOffset="sign" margin={{ top: 10, right: 20, bottom: 10, left: 120 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={v => Math.abs(v).toString()} />
                      <YAxis type="category" dataKey="stat" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={120} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
                        formatter={(value: number) => Math.abs(value).toFixed(2)}
                      />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Bar
                        dataKey={entryLabel(activeEntries[0])}
                        fill={effectiveColor(activeEntries[0])}
                        fillOpacity={isMuted(activeEntries[0].entryId) ? 0.5 : 1}
                        radius={[3, 0, 0, 3]}
                      />
                      <Bar
                        dataKey={entryLabel(activeEntries[1])}
                        fill={effectiveColor(activeEntries[1])}
                        fillOpacity={isMuted(activeEntries[1].entryId) ? 0.5 : 1}
                        radius={[0, 3, 3, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground/50 text-center mt-2">
                {chartMode === 'radar' && '100% = max de référence de la catégorie'}
                {chartMode === 'bars' && 'Valeurs absolues — comparaison directe par stat'}
                {chartMode === 'scatter' && 'Chaque point = une entrée, position = (X, Y)'}
                {chartMode === 'diverging' && 'Barres opposées — gauche / droite à partir de zéro'}
              </p>
            </CardContent>
          </Card>

          {/* Detail table */}
          <Card className="card-warm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Statistiques détaillées</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground sticky top-0">
                      <th className="text-left px-3 py-2 font-semibold">Stat</th>
                      {activeEntries.map(e => {
                        const isSorted = sortKey === e.entryId;
                        const muted = isMuted(e.entryId);
                        const focused = spotlightEntryId === e.entryId;
                        return (
                          <th
                            key={e.entryId}
                            className={cn(
                              'text-center px-2 py-2 font-semibold cursor-pointer hover:text-foreground select-none transition-colors',
                              focused && 'bg-amber-500/10',
                              muted && 'opacity-50'
                            )}
                            onClick={() => {
                              if (isSorted) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                              else { setSortKey(e.entryId); setSortDir('desc'); }
                            }}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: effectiveColor(e) }} />
                              <span className={cn('truncate max-w-[100px]', focused && 'font-bold')}>{entryLabel(e, false)}</span>
                              {focused && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                              {isSorted ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ def, values, best, worst }) => (
                      <tr key={def.key as string} className="border-t border-border/30">
                        <td className="px-3 py-2 font-medium">
                          <span className={cn(
                            'inline-block w-1.5 h-1.5 rounded-full mr-2',
                            def.cat === 'attack' && 'bg-rose-400',
                            def.cat === 'passing' && 'bg-sky-400',
                            def.cat === 'defense' && 'bg-emerald-400',
                            def.cat === 'volume' && 'bg-slate-400',
                            def.cat === 'set' && 'bg-amber-400',
                            def.cat === 'gk' && 'bg-indigo-400',
                            def.cat === 'physical' && 'bg-fuchsia-400',
                          )} />
                          {def.label}
                        </td>
                        {values.map((v, i) => {
                          const colEntry = activeEntries[i];
                          const focused = colEntry && spotlightEntryId === colEntry.entryId;
                          const muted = colEntry && isMuted(colEntry.entryId);
                          const isWinner = highlightWinner && best != null && v === best && values.filter(x => x != null).length > 1;
                          const heatBg = heatmap && best != null && worst != null
                            ? heatmapColor(v, Math.min(best, worst), Math.max(best, worst), def.higherIsBetter !== false)
                            : '';
                          // Spotlight column tint takes priority over heatmap; otherwise use heatmap
                          const bg = focused ? 'rgba(245, 158, 11, 0.08)' : heatBg;
                          return (
                            <td
                              key={i}
                              className={cn(
                                'text-center px-2 py-2 tabular-nums transition-colors',
                                isWinner ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                                focused && 'font-semibold',
                                muted && 'opacity-50'
                              )}
                              style={bg ? { backgroundColor: bg } : undefined}
                            >
                              {fmtVal(v, def)}
                              {isWinner && <Trophy className="inline w-3 h-3 ml-1 text-amber-500" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : entries.length > 0 ? (
        <Card className="card-warm">
          <CardContent className="py-12 text-center">
            <GitCompareArrows className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {selectedStats.length === 0
                ? 'Sélectionnez au moins une statistique pour comparer'
                : 'En attente de données WyScout pour les entrées sélectionnées'}
            </p>
            {entries.some(e => e.kind === 'player' && !e.stats) && (
              <Link to="/data-import">
                <Button size="sm" variant="outline" className="mt-3 gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Importer des données WyScout
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : null}

      <StatPickerDialog open={statPickerOpen} onOpenChange={setStatPickerOpen} selected={selectedStats} onChange={setSelectedStats} />

      {/* Save view dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer la vue actuelle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              autoFocus
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(newViewName); }}
              placeholder="ex. Latéraux droits Ligue 2"
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)}>Annuler</Button>
              <Button size="sm" onClick={() => saveCurrentView(newViewName)} disabled={!newViewName.trim()}>
                <Save className="w-3.5 h-3.5 mr-1" /> Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-[10px] text-muted-foreground/50 text-center flex items-center justify-center gap-1">
        <Share2 className="w-2.5 h-2.5" /> Source : fichiers Excel WyScout importés
      </p>
    </div>
  );
}
