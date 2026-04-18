import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayers } from '@/hooks/use-players';
import {
  useShadowTeams,
  useShadowTeamPlayers,
  useCreateShadowTeam,
  useUpdateShadowTeam,
  useDeleteShadowTeam,
  useCloneShadowTeam,
  useAssignPlayer,
  useRemovePlayerFromSlot,
  useReorderSlot,
  useRemapFormation,
  type ShadowTeam as ShadowTeamType,
  type ShadowTeamPlayer,
} from '@/hooks/use-shadow-teams';
import { getPlayerAge, translateCountry, type Player, type Position, type Foot } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { FlagIcon } from '@/components/ui/flag-icon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
  DropdownMenuCheckboxItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as SliderPrimitive from '@radix-ui/react-slider';
import {
  Plus, Pencil, Trash2, ArrowLeft, Users, X, Search, UserPlus, Shield, PlusCircle, GripVertical,
  Eye, Download, Copy, Scale, Filter, BarChart3, MoreVertical, Armchair, ChevronDown,
  Calendar, FileText, Globe, Minus, Building2, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { toPng } from 'html-to-image';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ── Formation definitions ── */
interface FormationSlot {
  id: string;
  label: string;
  position: Position;
  x: number;
  y: number;
}

type FormationKey = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '3-4-3' | '5-3-2' | '4-1-4-1';

const FORMATIONS: Record<FormationKey, FormationSlot[]> = {
  '4-3-3': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'LB', label: 'LG', position: 'LG', x: 12, y: 72 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 35, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 65, y: 76 },
    { id: 'RB', label: 'LD', position: 'LD', x: 88, y: 72 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 28, y: 52 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 50, y: 48 },
    { id: 'CM3', label: 'MC', position: 'MC', x: 72, y: 52 },
    { id: 'LW', label: 'AG', position: 'AG', x: 15, y: 25 },
    { id: 'ST', label: 'ATT', position: 'ATT', x: 50, y: 18 },
    { id: 'RW', label: 'AD', position: 'AD', x: 85, y: 25 },
  ],
  '4-4-2': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'LB', label: 'LG', position: 'LG', x: 12, y: 72 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 35, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 65, y: 76 },
    { id: 'RB', label: 'LD', position: 'LD', x: 88, y: 72 },
    { id: 'LM', label: 'AG', position: 'AG', x: 12, y: 48 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 38, y: 50 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 62, y: 50 },
    { id: 'RM', label: 'AD', position: 'AD', x: 88, y: 48 },
    { id: 'ST1', label: 'ATT', position: 'ATT', x: 38, y: 20 },
    { id: 'ST2', label: 'ATT', position: 'ATT', x: 62, y: 20 },
  ],
  '4-2-3-1': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'LB', label: 'LG', position: 'LG', x: 12, y: 72 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 35, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 65, y: 76 },
    { id: 'RB', label: 'LD', position: 'LD', x: 88, y: 72 },
    { id: 'CDM1', label: 'MDef', position: 'MDef', x: 38, y: 58 },
    { id: 'CDM2', label: 'MDef', position: 'MDef', x: 62, y: 58 },
    { id: 'LAM', label: 'AG', position: 'AG', x: 18, y: 38 },
    { id: 'CAM', label: 'MO', position: 'MO', x: 50, y: 35 },
    { id: 'RAM', label: 'AD', position: 'AD', x: 82, y: 38 },
    { id: 'ST', label: 'ATT', position: 'ATT', x: 50, y: 18 },
  ],
  '3-5-2': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 25, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 50, y: 78 },
    { id: 'CB3', label: 'DC', position: 'DC', x: 75, y: 76 },
    { id: 'LWB', label: 'LG', position: 'LG', x: 8, y: 50 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 30, y: 52 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 50, y: 48 },
    { id: 'CM3', label: 'MC', position: 'MC', x: 70, y: 52 },
    { id: 'RWB', label: 'LD', position: 'LD', x: 92, y: 50 },
    { id: 'ST1', label: 'ATT', position: 'ATT', x: 38, y: 20 },
    { id: 'ST2', label: 'ATT', position: 'ATT', x: 62, y: 20 },
  ],
  '3-4-3': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 25, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 50, y: 78 },
    { id: 'CB3', label: 'DC', position: 'DC', x: 75, y: 76 },
    { id: 'LM', label: 'AG', position: 'AG', x: 12, y: 50 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 38, y: 52 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 62, y: 52 },
    { id: 'RM', label: 'AD', position: 'AD', x: 88, y: 50 },
    { id: 'LW', label: 'AG', position: 'AG', x: 18, y: 25 },
    { id: 'ST', label: 'ATT', position: 'ATT', x: 50, y: 18 },
    { id: 'RW', label: 'AD', position: 'AD', x: 82, y: 25 },
  ],
  '5-3-2': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'LWB', label: 'LG', position: 'LG', x: 8, y: 68 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 28, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 50, y: 78 },
    { id: 'CB3', label: 'DC', position: 'DC', x: 72, y: 76 },
    { id: 'RWB', label: 'LD', position: 'LD', x: 92, y: 68 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 28, y: 50 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 50, y: 48 },
    { id: 'CM3', label: 'MC', position: 'MC', x: 72, y: 50 },
    { id: 'ST1', label: 'ATT', position: 'ATT', x: 38, y: 20 },
    { id: 'ST2', label: 'ATT', position: 'ATT', x: 62, y: 20 },
  ],
  '4-1-4-1': [
    { id: 'GK', label: 'GK', position: 'GK', x: 50, y: 90 },
    { id: 'LB', label: 'LG', position: 'LG', x: 12, y: 72 },
    { id: 'CB1', label: 'DC', position: 'DC', x: 35, y: 76 },
    { id: 'CB2', label: 'DC', position: 'DC', x: 65, y: 76 },
    { id: 'RB', label: 'LD', position: 'LD', x: 88, y: 72 },
    { id: 'CDM', label: 'MDef', position: 'MDef', x: 50, y: 58 },
    { id: 'LM', label: 'AG', position: 'AG', x: 12, y: 40 },
    { id: 'CM1', label: 'MC', position: 'MC', x: 38, y: 42 },
    { id: 'CM2', label: 'MC', position: 'MC', x: 62, y: 42 },
    { id: 'RM', label: 'AD', position: 'AD', x: 88, y: 40 },
    { id: 'ST', label: 'ATT', position: 'ATT', x: 50, y: 18 },
  ],
};

const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

/* ── Bench ── */
const BENCH_SLOT_IDS = ['BENCH1', 'BENCH2', 'BENCH3', 'BENCH4', 'BENCH5', 'BENCH6', 'BENCH7'] as const;
const isBenchSlot = (id: string): boolean => id.startsWith('BENCH');

/* ── Pitch coordinates ──
   Source slot coords: x ∈ [8..92] (side), y ∈ [18..90] (depth: attacker→defender).
   Target CSS %: left maps depth so GK is near left edge, attackers near right edge.
   We use wide bounds + a dynamic transform anchor so the slot block never overflows
   the rounded pitch edges (left slots anchor from their left edge, right slots
   anchor from their right edge, middle slots stay centered). */
const PITCH_LEFT_MIN = 3;   // GK (y=90)
const PITCH_LEFT_MAX = 93;  // Attackers (y=18)
const PITCH_TOP_MIN = 6;    // Left flank (x≈8)
const PITCH_TOP_MAX = 88;   // Right flank (x≈92)
function slotToPitchStyle(slot: { x: number; y: number }): {
  left: string;
  top: string;
  transform: string;
} {
  const leftRaw = PITCH_LEFT_MIN + (90 - slot.y) * ((PITCH_LEFT_MAX - PITCH_LEFT_MIN) / 72);
  const topRaw = PITCH_TOP_MIN + (slot.x - 8) * ((PITCH_TOP_MAX - PITCH_TOP_MIN) / 84);
  const normalized = Math.max(0, Math.min(1, (leftRaw - PITCH_LEFT_MIN) / (PITCH_LEFT_MAX - PITCH_LEFT_MIN)));
  const anchorX = normalized * 100;
  return {
    left: `${leftRaw}%`,
    top: `${topRaw}%`,
    transform: `translate(-${anchorX}%, -50%)`,
  };
}

/* ── Display helpers ── */
// "Alexander Vandepoel" → "A. Vandepoel", "Pelé" → "Pelé", "Anouar Ait El Hadj" → "A. Ait El Hadj"
function formatShortName(fullName: string): string {
  const trimmed = fullName.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return trimmed;
  const first = trimmed.slice(0, spaceIdx);
  const rest = trimmed.slice(spaceIdx + 1).trim();
  if (!rest) return trimmed;
  return `${first.charAt(0).toUpperCase()}. ${rest}`;
}

/* ── Smart position remapping for formation changes ── */
const POS_COORDS: Record<Position, { side: number; line: number }> = {
  GK:   { side: 0,  line: 0 },
  DC:   { side: 0,  line: 1 },
  LG:   { side: -1, line: 1 },
  LD:   { side: 1,  line: 1 },
  MDef: { side: 0,  line: 2 },
  MC:   { side: 0,  line: 3 },
  MO:   { side: 0,  line: 4 },
  AG:   { side: -1, line: 5 },
  AD:   { side: 1,  line: 5 },
  ATT:  { side: 0,  line: 5 },
};

function posDistance(a: Position, b: Position): number {
  const ca = POS_COORDS[a];
  const cb = POS_COORDS[b];
  return Math.abs(ca.side - cb.side) * 2 + Math.abs(ca.line - cb.line);
}

function resolveSlotInfo(slotId: string): { position: Position; x: number; y: number } {
  for (const slots of Object.values(FORMATIONS)) {
    const found = slots.find(s => s.id === slotId);
    if (found) return { position: found.position, x: found.x, y: found.y };
  }
  return { position: 'MC', x: 50, y: 50 };
}

function computeSlotRemap(
  _oldFormation: FormationKey,
  newFormation: FormationKey,
  assignments: ShadowTeamPlayer[],
): { id: string; newSlot: string }[] {
  const newSlots = FORMATIONS[newFormation] ?? [];
  const newSlotIds = new Set(newSlots.map(s => s.id));

  const needsRemap: ShadowTeamPlayer[] = [];
  const occupiedNewSlots = new Set<string>();
  for (const a of assignments) {
    // Bench slots survive formation changes untouched
    if (isBenchSlot(a.position_slot)) continue;
    if (newSlotIds.has(a.position_slot)) {
      occupiedNewSlots.add(a.position_slot);
    } else {
      needsRemap.push(a);
    }
  }
  if (needsRemap.length === 0) return [];

  const available = newSlots
    .filter(s => !occupiedNewSlots.has(s.id))
    .map(s => ({ ...s, taken: false }));

  const orphansBySlot = new Map<string, ShadowTeamPlayer[]>();
  for (const a of needsRemap) {
    const list = orphansBySlot.get(a.position_slot) ?? [];
    list.push(a);
    orphansBySlot.set(a.position_slot, list);
  }

  type Candidate = { slotId: string; availIdx: number; dist: number };
  const candidates: Candidate[] = [];
  for (const [slotId] of orphansBySlot) {
    const info = resolveSlotInfo(slotId);
    for (let i = 0; i < available.length; i++) {
      if (available[i].taken) continue;
      const typeDist = posDistance(info.position, available[i].position);
      const dx = info.x - available[i].x;
      const dy = info.y - available[i].y;
      candidates.push({ slotId, availIdx: i, dist: typeDist * 100000 + dx * dx + dy * dy });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const remaps: { id: string; newSlot: string }[] = [];
  const matchedSlots = new Set<string>();
  for (const c of candidates) {
    if (matchedSlots.has(c.slotId) || available[c.availIdx].taken) continue;
    for (const a of (orphansBySlot.get(c.slotId) ?? [])) {
      remaps.push({ id: a.id, newSlot: available[c.availIdx].id });
    }
    matchedSlots.add(c.slotId);
    available[c.availIdx].taken = true;
  }

  for (const [slotId, players] of orphansBySlot) {
    if (matchedSlots.has(slotId)) continue;
    const fallback = available.find(s => !s.taken);
    const targetSlot = fallback ? fallback.id : newSlots[0].id;
    if (fallback) fallback.taken = true;
    for (const a of players) {
      remaps.push({ id: a.id, newSlot: targetSlot });
    }
  }

  return remaps;
}

/* ── Main page ── */
export default function ShadowTeam() {
  const { t } = useTranslation();
  const { data: shadowTeams = [], isLoading } = useShadowTeams();
  const { data: allPlayers = [] } = usePlayers();
  const [selected, setSelected] = useState<ShadowTeamType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comparePickOpen, setComparePickOpen] = useState(false);
  const [compareWith, setCompareWith] = useState<ShadowTeamType | null>(null);
  const [formName, setFormName] = useState('');
  const [formFormation, setFormFormation] = useState<FormationKey>('4-3-3');
  const [formLogo, setFormLogo] = useState('');

  const createTeam = useCreateShadowTeam();
  const deleteTeam = useDeleteShadowTeam();
  const cloneTeam = useCloneShadowTeam();

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      const created = await createTeam.mutateAsync({
        name: formName.trim(),
        formation: formFormation,
        logo_url: formLogo.trim() || undefined,
      });
      toast.success(t('shadow_team.created'));
      setCreateOpen(false);
      setFormName('');
      setFormFormation('4-3-3');
      setFormLogo('');
      setSelected(created);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    try {
      await deleteTeam.mutateAsync(selected.id);
      toast.success(t('shadow_team.deleted'));
      setSelected(null);
      setDeleteOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleClone = async (team: ShadowTeamType) => {
    try {
      const suffix = t('shadow_team.duplicate_suffix');
      const newName = `${team.name} (${suffix})`;
      const created = await cloneTeam.mutateAsync({ source: team, newName });
      toast.success(t('shadow_team.duplicated'));
      setSelected(created);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleStartCompare = (against: ShadowTeamType) => {
    setCompareWith(against);
    setComparePickOpen(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  // Comparison overlay takes over
  if (selected && compareWith) {
    return (
      <ComparisonView
        teamA={selected}
        teamB={compareWith}
        allPlayers={allPlayers}
        onExit={() => setCompareWith(null)}
      />
    );
  }

  if (selected) {
    return (
      <ShadowTeamDetail
        team={selected}
        allPlayers={allPlayers}
        onBack={() => setSelected(null)}
        onDelete={() => setDeleteOpen(true)}
        onClone={() => handleClone(selected)}
        onCompareRequest={() => setComparePickOpen(true)}
        onTeamUpdated={(updated) => setSelected(updated)}
        availableForCompare={shadowTeams.filter(st => st.id !== selected.id)}
        comparePickOpen={comparePickOpen}
        onComparePickClose={() => setComparePickOpen(false)}
        onCompareWith={handleStartCompare}
        deleteDialog={
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('shadow_team.delete_confirm', { name: selected.name })}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t('shadow_team.delete_desc')}</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteTeam.isPending} className="rounded-xl">{t('common.delete')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('shadow_team.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {shadowTeams.length > 1
                ? t('shadow_team.count_plural', { count: shadowTeams.length })
                : t('shadow_team.count', { count: shadowTeams.length })}
            </p>
          </div>
        </div>
        <Button
          className="rounded-xl"
          onClick={() => { setFormName(''); setFormFormation('4-3-3'); setFormLogo(''); setCreateOpen(true); }}
          aria-label={t('shadow_team.create')}
        >
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
          {t('shadow_team.create')}
        </Button>
      </div>

      {shadowTeams.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" aria-hidden="true" />
          </div>
          <p className="text-lg font-semibold text-muted-foreground">{t('shadow_team.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('shadow_team.empty_desc')}</p>
          <Button className="mt-4 rounded-xl" onClick={() => { setFormName(''); setFormFormation('4-3-3'); setFormLogo(''); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t('shadow_team.create')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {shadowTeams.map(st => (
            <ShadowTeamCard
              key={st.id}
              team={st}
              allPlayers={allPlayers}
              onClick={() => setSelected(st)}
              onClone={() => handleClone(st)}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('shadow_team.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              placeholder={t('shadow_team.name_placeholder')}
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="rounded-xl"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              aria-label={t('shadow_team.name_placeholder')}
            />
            <PhotoUpload currentUrl={formLogo} onPhotoChange={setFormLogo} label={t('shadow_team.logo')} />
            <FormationSelect value={formFormation} onChange={setFormFormation} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={!formName.trim() || createTeam.isPending} className="rounded-xl">{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Formation select ── */
function FormationSelect({ value, onChange }: { value: FormationKey; onChange: (v: FormationKey) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1.5 block" id="formation-label">
        {t('shadow_team.formation')}
      </label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="formation-label">
        {FORMATION_KEYS.map(f => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={value === f}
            onClick={() => onChange(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
              value === f
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Card on overview ── */
function ShadowTeamCard({
  team, allPlayers, onClick, onClone,
}: {
  team: ShadowTeamType;
  allPlayers: Player[];
  onClick: () => void;
  onClone: () => void;
}) {
  const { t } = useTranslation();
  const { data: assignments = [] } = useShadowTeamPlayers(team.id);
  const pitchSlots = FORMATIONS[team.formation as FormationKey] ?? FORMATIONS['4-3-3'];
  const totalSlots = pitchSlots.length;
  const pitchAssignments = assignments.filter(a => !isBenchSlot(a.position_slot));
  const filledSlots = new Set(pitchAssignments.map(a => a.position_slot)).size;
  const totalPlayers = assignments.length;

  const assignedPlayers = useMemo(() => {
    const ids = new Set(assignments.map(a => a.player_id));
    return allPlayers.filter(p => ids.has(p.id));
  }, [assignments, allPlayers]);

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className="card-warm hover:scale-[1.02] transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label={`${team.name}, ${team.formation}, ${filledSlots}/${totalSlots}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {team.logo_url ? (
              <img src={team.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-base truncate">{team.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{team.formation}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              <Users className="w-3 h-3" aria-hidden="true" />
              {filledSlots}/{totalSlots} · {totalPlayers}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={e => e.stopPropagation()}
                  className="p-1 rounded-lg hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('common.edit')}
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onClone()}>
                  <Copy className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('shadow_team.duplicate')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(filledSlots / totalSlots) * 100}%` }}
          />
        </div>

        {assignedPlayers.length > 0 && (
          <div className="flex items-center -space-x-2">
            {assignedPlayers.slice(0, 6).map(p => (
              <div key={p.id} className="w-7 h-7 rounded-full border-2 border-card overflow-hidden">
                <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
              </div>
            ))}
            {assignedPlayers.length > 6 && (
              <span className="ml-2 text-xs text-muted-foreground font-medium">+{assignedPlayers.length - 6}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Pitch overlay views ── */
type PitchView = 'default' | 'age' | 'contract' | 'nationality' | 'club';

const PITCH_VIEW_KEYS: { key: PitchView; labelKey: string; Icon: LucideIcon }[] = [
  { key: 'default',     labelKey: 'shadow_team.view_default',     Icon: Minus },
  { key: 'age',         labelKey: 'shadow_team.view_age',         Icon: Calendar },
  { key: 'contract',    labelKey: 'shadow_team.view_contract',    Icon: FileText },
  { key: 'nationality', labelKey: 'shadow_team.view_nationality', Icon: Globe },
  { key: 'club',        labelKey: 'shadow_team.view_club',        Icon: Building2 },
];

function getViewBadge(player: Player, view: PitchView, t: (k: string, opts?: Record<string, unknown>) => string, lang: string): { text: string; bg: string } | null {
  if (view === 'default') return null;

  switch (view) {
    case 'age': {
      const age = getPlayerAge(player.generation, player.date_of_birth);
      let bg = '#16a34a';
      if (age >= 31) bg = '#dc2626';
      else if (age >= 28) bg = '#ea580c';
      else if (age >= 25) bg = '#ca8a04';
      return { text: t('shadow_team.view_age_value', { age }), bg };
    }
    case 'contract': {
      if (!player.contract_end) return { text: '?', bg: '#525252' };
      const end = new Date(player.contract_end);
      const now = new Date();
      const monthsLeft = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
      let bg = '#16a34a';
      if (monthsLeft <= 12) bg = '#dc2626';
      else if (monthsLeft <= 24) bg = '#ea580c';
      else if (monthsLeft <= 36) bg = '#ca8a04';
      return { text: `${end.getFullYear()}`, bg };
    }
    case 'nationality':
      return { text: translateCountry(player.nationality, lang), bg: '#1e3a5f' };
    case 'club':
      return { text: player.club, bg: '#1e3a5f' };
    default:
      return null;
  }
}

/* ── Filter types ── */
const AGE_MIN = 15;
const AGE_MAX = 45;
type PickerFilters = {
  ageRange: [number, number];
  feet: Foot[];
  contractShort: boolean;
  positions: Position[];
};
const EMPTY_FILTERS: PickerFilters = {
  ageRange: [AGE_MIN, AGE_MAX],
  feet: [],
  contractShort: false,
  positions: [],
};
const POSITION_CHIPS: Position[] = ['GK', 'DC', 'LD', 'LG', 'MDef', 'MC', 'MO', 'AG', 'AD', 'ATT'];
const FOOT_OPTIONS: Foot[] = ['Gaucher', 'Droitier', 'Ambidextre'];
const isAgeFilterActive = (r: [number, number]) => r[0] > AGE_MIN || r[1] < AGE_MAX;

/* ── Detail view with pitch ── */
function ShadowTeamDetail({
  team, allPlayers, onBack, onDelete, onClone, onCompareRequest, onTeamUpdated,
  deleteDialog, availableForCompare, comparePickOpen, onComparePickClose, onCompareWith,
}: {
  team: ShadowTeamType;
  allPlayers: Player[];
  onBack: () => void;
  onDelete: () => void;
  onClone: () => void;
  onCompareRequest: () => void;
  onTeamUpdated: (t: ShadowTeamType) => void;
  deleteDialog: React.ReactNode;
  availableForCompare: ShadowTeamType[];
  comparePickOpen: boolean;
  onComparePickClose: () => void;
  onCompareWith: (t: ShadowTeamType) => void;
}) {
  const { t, i18n } = useTranslation();
  const { positionShort: posShort, positions: posLong } = usePositions();
  const { data: assignments = [] } = useShadowTeamPlayers(team.id);
  const assignPlayer = useAssignPlayer();
  const removePlayer = useRemovePlayerFromSlot();
  const reorderSlot = useReorderSlot();
  const remapFormation = useRemapFormation();
  const updateTeamMut = useUpdateShadowTeam();
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [pickingSlot, setPickingSlot] = useState<FormationSlot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerFilters, setPickerFilters] = useState<PickerFilters>(EMPTY_FILTERS);
  const [activeView, setActiveView] = useState<PitchView>('default');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editFormation, setEditFormation] = useState<FormationKey>(team.formation as FormationKey || '4-3-3');
  const [editLogo, setEditLogo] = useState(team.logo_url ?? '');
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<'stats' | 'bench'>('stats');
  const pitchRef = useRef<HTMLDivElement>(null);
  const dedupedTeams = useRef<Set<string>>(new Set());

  // One-shot cleanup of pre-existing duplicates (a player in multiple slots).
  // Keeps the lowest-rank occurrence and deletes the rest. Runs once per team per mount.
  useEffect(() => {
    if (dedupedTeams.current.has(team.id)) return;
    if (assignments.length === 0) return;

    const byPlayer = new Map<string, ShadowTeamPlayer[]>();
    for (const a of assignments) {
      const list = byPlayer.get(a.player_id) ?? [];
      list.push(a);
      byPlayer.set(a.player_id, list);
    }
    const toDelete: ShadowTeamPlayer[] = [];
    for (const [, list] of byPlayer) {
      if (list.length > 1) {
        list.sort((x, y) => x.rank - y.rank);
        toDelete.push(...list.slice(1));
      }
    }

    dedupedTeams.current.add(team.id);
    if (toDelete.length === 0) return;

    (async () => {
      for (const dup of toDelete) {
        try {
          await removePlayer.mutateAsync({
            shadowTeamId: team.id,
            positionSlot: dup.position_slot,
            playerId: dup.player_id,
          });
        } catch (err) {
          console.error('Dedup error:', err);
        }
      }
      toast.info(`${toDelete.length} ${toDelete.length > 1 ? 'doublons supprimés' : 'doublon supprimé'}`);
    })();
  }, [team.id, assignments, removePlayer]);

  const handleDownloadImage = useCallback(async () => {
    if (!pitchRef.current) return;
    try {
      const imgs = Array.from(pitchRef.current.querySelectorAll('img'));
      imgs.forEach(img => { img.loading = 'eager'; img.setAttribute('crossorigin', 'anonymous'); });
      await Promise.all(
        imgs.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); })
        ),
      );

      let dataUrl = '';
      for (let i = 0; i < 3; i++) {
        dataUrl = await toPng(pitchRef.current, {
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: true,
          filter: (node: HTMLElement) => {
            if (node.tagName === 'IMG' && (node as HTMLImageElement).naturalWidth === 0) return false;
            return true;
          },
        });
      }

      const link = document.createElement('a');
      link.download = `${team.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(t('shadow_team.download_success'));
    } catch (err) {
      console.error('Download image error:', err);
      toast.error(t('common.error'));
    }
  }, [team.name, t]);

  const formation = (team.formation as FormationKey) || '4-3-3';
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];

  const slotAssignmentsMap = useMemo(() => {
    const map = new Map<string, ShadowTeamPlayer[]>();
    assignments.forEach(a => {
      const list = map.get(a.position_slot) ?? [];
      list.push(a);
      map.set(a.position_slot, list);
    });
    for (const [, list] of map) list.sort((a, b) => a.rank - b.rank);
    return map;
  }, [assignments]);

  const slotPlayersMap = useMemo(() => {
    const map = new Map<string, Player[]>();
    for (const [slot, assigns] of slotAssignmentsMap) {
      const players: Player[] = [];
      assigns.forEach(a => {
        const p = allPlayers.find(pl => pl.id === a.player_id);
        if (p) players.push(p);
      });
      if (players.length) map.set(slot, players);
    }
    return map;
  }, [slotAssignmentsMap, allPlayers]);

  // Block any player already assigned anywhere in this shadow team (no duplicates)
  const teamAssignedIds = useMemo(() => {
    return new Set(assignments.map(a => a.player_id));
  }, [assignments]);

  const filteredPlayers = useMemo(() => {
    if (!pickingSlot) return [];
    let list = allPlayers.filter(p => !teamAssignedIds.has(p.id));

    const matchPos = pickingSlot.position;

    if (pickerFilters.positions.length > 0) {
      const wanted = new Set<string>(pickerFilters.positions);
      list = list.filter(p => wanted.has(p.position) || (p.position_secondaire && wanted.has(p.position_secondaire)));
    }
    if (isAgeFilterActive(pickerFilters.ageRange)) {
      const [min, max] = pickerFilters.ageRange;
      list = list.filter(p => {
        const age = getPlayerAge(p.generation, p.date_of_birth);
        return age >= min && age <= max;
      });
    }
    if (pickerFilters.feet.length > 0) {
      const wanted = new Set<string>(pickerFilters.feet);
      list = list.filter(p => wanted.has(p.foot));
    }
    if (pickerFilters.contractShort) {
      const now = new Date();
      list = list.filter(p => {
        if (!p.contract_end) return false;
        const end = new Date(p.contract_end);
        const monthsLeft = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
        return monthsLeft <= 12;
      });
    }

    list.sort((a, b) => {
      const aDist = Math.min(
        posDistance(a.position, matchPos),
        a.position_secondaire ? posDistance(a.position_secondaire as Position, matchPos) : 99,
      );
      const bDist = Math.min(
        posDistance(b.position, matchPos),
        b.position_secondaire ? posDistance(b.position_secondaire as Position, matchPos) : 99,
      );
      return aDist - bDist;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.club.toLowerCase().includes(q) ||
        p.league.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pickingSlot, allPlayers, teamAssignedIds, searchQuery, pickerFilters]);

  const handleAssign = async (player: Player) => {
    if (!pickingSlot) return;
    // Safety: reject if already in team (picker filter should have blocked this)
    if (teamAssignedIds.has(player.id)) {
      toast.error(t('common.error'));
      return;
    }
    try {
      const currentSlotPlayers = slotAssignmentsMap.get(pickingSlot.id) ?? [];
      await assignPlayer.mutateAsync({
        shadowTeamId: team.id,
        playerId: player.id,
        positionSlot: pickingSlot.id,
        currentSlotPlayers,
      });
      toast.success(t('shadow_team.player_assigned', {
        name: player.name,
        slot: isBenchSlot(pickingSlot.id) ? t('shadow_team.bench_slot') : posShort[pickingSlot.position],
      }));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!pickingSlot) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const slotAssigns = slotAssignmentsMap.get(pickingSlot.id) ?? [];
    const oldIndex = slotAssigns.findIndex(a => a.id === active.id);
    const newIndex = slotAssigns.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(slotAssigns, oldIndex, newIndex);
    try {
      await reorderSlot.mutateAsync({ shadowTeamId: team.id, orderedAssignments: reordered });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return;
    try {
      if (editFormation !== formation) {
        const remaps = computeSlotRemap(formation, editFormation, assignments);
        if (remaps.length > 0) {
          await remapFormation.mutateAsync({ shadowTeamId: team.id, remaps });
        }
      }
      const logoValue = editLogo.trim() || null;
      const updated = await updateTeamMut.mutateAsync({
        id: team.id,
        name: editName.trim(),
        formation: editFormation,
        logo_url: logoValue,
      });
      await queryClient.refetchQueries({ queryKey: ['shadow_team_players', team.id] });
      await queryClient.refetchQueries({ queryKey: ['shadow_teams'] });
      onTeamUpdated({ ...team, name: updated.name, formation: updated.formation, logo_url: logoValue });
      toast.success(t('shadow_team.updated'));
      setEditOpen(false);
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('common.error'));
    }
  };

  const handleRemove = async (slotId: string, playerId: string) => {
    try {
      await removePlayer.mutateAsync({ shadowTeamId: team.id, positionSlot: slotId, playerId });
      toast.success(t('shadow_team.player_removed'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleSlotSwap = async (fromSlot: string, toSlot: string) => {
    const fromAssigns = slotAssignmentsMap.get(fromSlot) ?? [];
    const toAssigns = slotAssignmentsMap.get(toSlot) ?? [];
    const remaps = [
      ...fromAssigns.map(a => ({ id: a.id, newSlot: toSlot })),
      ...toAssigns.map(a => ({ id: a.id, newSlot: fromSlot })),
    ];
    if (remaps.length === 0) return;
    try {
      await remapFormation.mutateAsync({ shadowTeamId: team.id, remaps });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handlePitchDragEnd = (event: DragEndEvent) => {
    setDraggedSlotId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    handleSlotSwap(active.id as string, over.id as string);
  };

  const filledSlotCount = Array.from(slotPlayersMap.keys()).filter(id => !isBenchSlot(id)).length;
  const totalPlayerCount = assignments.length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('shadow_team.edit')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder={t('shadow_team.name_placeholder')} value={editName} onChange={e => setEditName(e.target.value)} className="rounded-xl" autoFocus />
            <PhotoUpload currentUrl={editLogo} onPhotoChange={setEditLogo} label={t('shadow_team.logo')} />
            <FormationSelect value={editFormation} onChange={setEditFormation} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
              <Button onClick={handleEditSave} disabled={!editName.trim() || updateTeamMut.isPending} className="rounded-xl">{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {deleteDialog}

      {/* Compare picker */}
      <Dialog open={comparePickOpen} onOpenChange={(o) => !o && onComparePickClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('shadow_team.compare_pick')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto mt-2">
            {availableForCompare.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t('shadow_team.no_players_available')}</p>
            ) : availableForCompare.map(st => (
              <button
                key={st.id}
                onClick={() => onCompareWith(st)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-accent/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {st.logo_url ? (
                  <img src={st.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{st.name}</p>
                  <p className="text-xs text-muted-foreground">{st.formation}</p>
                </div>
                <Scale className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticky glass header */}
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-2.5 mb-3 bg-background/75 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t('common.cancel')}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            {team.logo_url ? (
              <img src={team.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0 ring-1 ring-border" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-border">
                <Shield className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight leading-none truncate">{team.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary tracking-wide">{formation}</span>
                <span className="text-[11px] text-muted-foreground">{filledSlotCount}/11 · {totalPlayerCount} {t('shadow_team.filled')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeView !== 'default' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-xl h-8 text-xs gap-1.5"
                  aria-label={t('shadow_team.views')}
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {activeView !== 'default'
                      ? t(PITCH_VIEW_KEYS.find(v => v.key === activeView)?.labelKey ?? '')
                      : t('shadow_team.views')}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[170px]">
                {PITCH_VIEW_KEYS.map(v => (
                  <DropdownMenuItem
                    key={v.key}
                    onClick={() => setActiveView(v.key)}
                    className={activeView === v.key ? 'bg-accent font-semibold' : ''}
                  >
                    <v.Icon className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                    {t(v.labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl h-8 w-8 p-0" aria-label={t('common.edit')}>
                  <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[190px]">
                <DropdownMenuItem onClick={() => { setEditName(team.name); setEditFormation(formation); setEditLogo(team.logo_url ?? ''); setEditOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onClone}>
                  <Copy className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('shadow_team.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCompareRequest} disabled={availableForCompare.length === 0}>
                  <Scale className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('shadow_team.compare')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadImage}>
                  <Download className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('shadow_team.download')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Screen-reader instructions for drag-and-drop */}
      <div className="sr-only" aria-live="polite">{t('shadow_team.drag_instructions')}</div>

      {/* Main grid: pitch + side panel */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Pitch */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setDraggedSlotId(e.active.id as string)}
          onDragEnd={handlePitchDragEnd}
          onDragCancel={() => setDraggedSlotId(null)}
        >
          <div
            ref={pitchRef}
            className="relative w-full rounded-2xl overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/10"
            style={{
              aspectRatio: '3 / 2',
              maxHeight: 'calc(100vh - 8rem)',
              background: 'linear-gradient(180deg, #1f6b2e 0%, #2d7a3a 30%, #35893f 60%, #2d7a3a 100%)',
            }}
            role="application"
            aria-label={`${team.name} - ${formation}`}
          >
            {/* Grass stripes overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 8.33%, transparent 8.33% 16.66%)',
              }}
            />
            {/* Vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)',
              }}
            />
            {/* Pitch markings — landscape */}
            <svg viewBox="0 0 150 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
              <rect x="5" y="5" width="140" height="90" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <line x1="75" y1="5" x2="75" y2="95" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <circle cx="75" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <circle cx="75" cy="50" r="0.8" fill="rgba(255,255,255,0.4)" />
              <rect x="5" y="20" width="22" height="60" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="5" y="32" width="8" height="36" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="123" y="20" width="22" height="60" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="137" y="32" width="8" height="36" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <path d="M 27 35 Q 34 50 27 65" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <path d="M 123 35 Q 116 50 123 65" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <circle cx="16" cy="50" r="0.6" fill="rgba(255,255,255,0.4)" />
              <circle cx="134" cy="50" r="0.6" fill="rgba(255,255,255,0.4)" />
            </svg>

            {/* Player slots */}
            {slots.map(slot => {
              const players = slotPlayersMap.get(slot.id) ?? [];
              const mainPlayer = players[0];
              const altPlayers = players.slice(1);

              const posStyle = slotToPitchStyle(slot);

              return (
                <div
                  key={slot.id}
                  className="absolute"
                  style={posStyle}
                >
                  <DraggablePitchSlot id={slot.id} disabled={!mainPlayer} slotLabel={posShort[slot.position]}>
                    {mainPlayer ? (
                      <div className="flex flex-col">
                        <PlayerOnPitch
                          player={mainPlayer}
                          slot={slot}
                          activeView={activeView}
                          lang={i18n.language}
                          onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                          onRemove={(e) => { e.stopPropagation(); handleRemove(slot.id, mainPlayer.id); }}
                        />
                        <AltAvatarRow
                          alts={altPlayers}
                          lang={i18n.language}
                          onOpenPicker={() => { setPickingSlot(slot); setSearchQuery(''); }}
                        />
                      </div>
                    ) : (
                      <EmptySlotButton
                        label={posShort[slot.position]}
                        title={posLong[slot.position]}
                        onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                        ariaLabel={t('shadow_team.slot_empty_sr', { pos: posLong[slot.position] })}
                      />
                    )}
                  </DraggablePitchSlot>
                </div>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {draggedSlotId && (() => {
              const players = slotPlayersMap.get(draggedSlotId) ?? [];
              const main = players[0];
              if (!main) return null;
              return (
                <div className="flex items-center gap-1.5 bg-card/95 backdrop-blur-sm px-2.5 py-1.5 rounded-xl shadow-2xl border border-border">
                  <PlayerAvatar name={main.name} photoUrl={main.photo_url} size="sm" className="!w-8 !h-8 !rounded-full" />
                  <div>
                    <p className="text-xs font-bold">{formatShortName(main.name)}</p>
                    {players.length > 1 && <p className="text-[10px] text-muted-foreground">+{players.length - 1}</p>}
                  </div>
                </div>
              );
            })()}
          </DragOverlay>
        </DndContext>

        {/* Side panel — tabs Stats | Bench */}
        <aside className="lg:max-h-[calc(100vh-8rem)] min-w-0">
          <Tabs value={sidePanel} onValueChange={(v) => setSidePanel(v as 'stats' | 'bench')} className="h-full flex flex-col">
            <TabsList className="w-full grid grid-cols-2 h-9 bg-muted/60 rounded-xl p-1">
              <TabsTrigger value="stats" className="rounded-lg gap-1.5 data-[state=active]:shadow-sm">
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('shadow_team.stats_title')}</span>
              </TabsTrigger>
              <TabsTrigger value="bench" className="rounded-lg gap-1.5 data-[state=active]:shadow-sm">
                <Armchair className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('shadow_team.bench')}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="stats" className="flex-1 overflow-y-auto mt-3">
              <StatsPanel players={allPlayers} assignments={assignments} />
            </TabsContent>
            <TabsContent value="bench" className="flex-1 overflow-y-auto mt-3">
              <BenchPanel
                assignments={assignments}
                allPlayers={allPlayers}
                onPickSlot={(slotId) => {
                  setPickingSlot({ id: slotId, label: t('shadow_team.bench_slot'), position: 'MC', x: 0, y: 0 });
                  setSearchQuery('');
                }}
                onRemove={(slotId, playerId) => handleRemove(slotId, playerId)}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Player picker dialog — 2-column layout */}
      <Dialog
        open={!!pickingSlot}
        onOpenChange={() => { setPickingSlot(null); setSearchQuery(''); setPickerFilters(EMPTY_FILTERS); }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <span>{t('shadow_team.pick_player')}</span>
              {pickingSlot && (
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold">
                  {isBenchSlot(pickingSlot.id) ? t('shadow_team.bench_slot') : posShort[pickingSlot.position]}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 grid md:grid-cols-[340px_1fr] min-h-0 overflow-hidden">
            {/* Left column: selected + filters + new player */}
            <div className="flex flex-col border-r border-border bg-muted/20 min-h-0">
              {/* Top: selected players */}
              <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
                <div className="flex items-center gap-1.5 mb-3">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('shadow_team.current_order')}</h3>
                </div>
                {pickingSlot && (slotAssignmentsMap.get(pickingSlot.id) ?? []).length > 0 ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={(slotAssignmentsMap.get(pickingSlot.id) ?? []).map(a => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {(slotAssignmentsMap.get(pickingSlot.id) ?? []).map((assignment, idx) => {
                          const player = allPlayers.find(p => p.id === assignment.player_id);
                          if (!player) return null;
                          return (
                            <SortablePlayerItem
                              key={assignment.id}
                              assignment={assignment}
                              player={player}
                              rank={idx + 1}
                              onRemove={() => handleRemove(pickingSlot.id, player.id)}
                            />
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="text-center py-8 px-2">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-2">
                      <UserPlus className="w-5 h-5 text-muted-foreground/50" aria-hidden="true" />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('shadow_team.no_players_available')}</p>
                  </div>
                )}
              </div>

              {/* Bottom: filters */}
              {pickingSlot && !isBenchSlot(pickingSlot.id) && (
                <div className="border-t border-border px-4 py-3 bg-background/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('shadow_team.filters')}</h3>
                  </div>
                  <PickerFilterChips filters={pickerFilters} onChange={setPickerFilters} />
                </div>
              )}

              {/* Add new player link */}
              <div className="border-t border-border px-4 py-3">
                <Link
                  to="/player/new"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <PlusCircle className="w-4 h-4" aria-hidden="true" />
                  {t('shadow_team.add_new_player')}
                </Link>
              </div>
            </div>

            {/* Right column: search + player list */}
            <div className="flex flex-col min-h-0">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    placeholder={t('shadow_team.search_placeholder')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 rounded-xl h-10"
                    autoFocus
                    aria-label={t('shadow_team.search_placeholder')}
                  />
                </div>
                {filteredPlayers.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {filteredPlayers.length > 50
                      ? `50 / ${t('shadow_team.stats_count', { count: filteredPlayers.length })}`
                      : t('shadow_team.stats_count', { count: filteredPlayers.length })}
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                {filteredPlayers.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">{t('shadow_team.no_players_available')}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredPlayers.slice(0, 50).map(player => {
                      const isMatchingPos = pickingSlot && !isBenchSlot(pickingSlot.id) &&
                        (player.position === pickingSlot.position || player.position_secondaire === pickingSlot.position);
                      return (
                        <button
                          key={player.id}
                          onClick={() => handleAssign(player)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isMatchingPos ? 'bg-primary/5 ring-1 ring-primary/20' : ''
                          }`}
                        >
                          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{player.name}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <ClubBadge club={player.club} size="sm" />
                              <span className="truncate">{player.club}</span>
                              <span aria-hidden="true">·</span>
                              <span>{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <FlagIcon nationality={player.nationality} size="sm" />
                            <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${isMatchingPos ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                              {posShort[player.position]}
                            </span>
                            <span className="text-sm font-bold font-mono">
                              {player.current_level}
                              <span className="text-muted-foreground font-normal">/</span>
                              <span className="text-primary">{player.potential}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Player rendered on pitch (main) ── */
function PlayerOnPitch({
  player, slot, activeView, lang, onClick, onRemove,
}: {
  player: Player;
  slot: FormationSlot;
  activeView: PitchView;
  lang: string;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const badge = getViewBadge(player, activeView, t, lang);
  return (
    <HoverCard openDelay={200} closeDelay={50}>
      <HoverCardTrigger asChild>
        <div
          className="flex items-center gap-1.5 group cursor-pointer relative focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-md"
          onClick={onClick}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
          role="button"
          tabIndex={0}
          aria-label={t('shadow_team.slot_filled_sr', { pos: slot.position, name: player.name })}
        >
          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" className="!w-8 !h-8 !rounded-full border-2 border-white/80" />
          <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] max-w-[96px] truncate">
            {formatShortName(player.name)}
          </span>
          {badge && (
            <span
              className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap text-white shadow-md"
              style={{ backgroundColor: badge.bg }}
            >
              {badge.text}
            </span>
          )}
          <span
            onClick={onRemove}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label={t('shadow_team.player_removed')}
            role="button"
          >
            <X className="w-2.5 h-2.5" aria-hidden="true" />
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-64" side="top">
        <PlayerHoverCardContent player={player} lang={lang} />
      </HoverCardContent>
    </HoverCard>
  );
}

/* ── Compact row of alt avatars ── */
const MAX_VISIBLE_ALTS = 4;
function AltAvatarRow({
  alts, lang, onOpenPicker,
}: {
  alts: Player[];
  lang: string;
  onOpenPicker: () => void;
}) {
  const { t } = useTranslation();
  const visible = alts.slice(0, MAX_VISIBLE_ALTS);
  const hidden = Math.max(0, alts.length - MAX_VISIBLE_ALTS);

  return (
    <div className="flex items-center gap-0.5 mt-1 pl-0.5">
      <div className="flex -space-x-1.5">
        {visible.map(p => (
          <HoverCard key={p.id} openDelay={150}>
            <HoverCardTrigger asChild>
              <button
                onClick={onOpenPicker}
                className="w-[18px] h-[18px] rounded-full overflow-hidden border border-white/70 ring-1 ring-black/20 shadow shrink-0 hover:z-10 hover:scale-125 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={p.name}
              >
                <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" className="!w-full !h-full !rounded-full" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-64" side="top">
              <PlayerHoverCardContent player={p} lang={lang} />
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={onOpenPicker}
          className="ml-1 px-1 h-[16px] rounded-full bg-black/40 backdrop-blur-sm text-white text-[9px] font-bold hover:bg-black/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`+${hidden}`}
        >
          +{hidden}
        </button>
      )}
      <button
        onClick={onOpenPicker}
        className="ml-1 w-[16px] h-[16px] rounded-full border border-dashed border-white/50 flex items-center justify-center hover:bg-white/20 hover:border-white/80 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label={t('shadow_team.pick_player')}
      >
        <Plus className="w-2 h-2 text-white/60" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ── Empty slot button ── */
function EmptySlotButton({
  label, title, onClick, ariaLabel,
}: {
  label: string;
  title: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
      aria-label={ariaLabel}
      title={title}
    >
      <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/50 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all group-hover:border-white/80">
        <UserPlus className="w-4 h-4 text-white/60 group-hover:text-white/90 transition-colors" aria-hidden="true" />
      </div>
      <span className="text-[11px] font-bold text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
        {label}
      </span>
    </button>
  );
}

/* ── Player hover card body ── */
function PlayerHoverCardContent({ player, lang }: { player: Player; lang: string }) {
  const { t } = useTranslation();
  const { positionShort } = usePositions();
  const age = getPlayerAge(player.generation, player.date_of_birth);
  const contractYear = player.contract_end ? new Date(player.contract_end).getFullYear() : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="md" />
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{player.name}</p>
          <p className="text-xs text-muted-foreground truncate">{player.club}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <FlagIcon nationality={player.nationality} size="sm" />
        <span>{translateCountry(player.nationality, lang)}</span>
        <span aria-hidden="true">·</span>
        <span>{age} {t('common.year')}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="px-2 py-0.5 rounded-md bg-muted font-bold">{positionShort[player.position]}</span>
        <span className="font-mono font-bold">
          {player.current_level}<span className="text-muted-foreground font-normal">/</span><span className="text-primary">{player.potential}</span>
        </span>
      </div>
      {contractYear && (
        <p className="text-xs text-muted-foreground">
          {t('shadow_team.tooltip_contract_ends', { year: contractYear })}
        </p>
      )}
      <Link
        to={`/player/${player.id}`}
        className="block text-center text-xs font-semibold text-primary hover:underline pt-1"
      >
        {t('shadow_team.tooltip_view_profile')} →
      </Link>
    </div>
  );
}

/* ── Filter dropdowns in picker ── */
function PickerFilterChips({
  filters, onChange,
}: {
  filters: PickerFilters;
  onChange: (f: PickerFilters) => void;
}) {
  const { t } = useTranslation();
  const { positionShort: posShort } = usePositions();

  const ageActive = isAgeFilterActive(filters.ageRange);
  const hasAny =
    ageActive || filters.feet.length > 0 ||
    filters.contractShort || filters.positions.length > 0;

  const togglePos = (p: Position) => {
    const next = filters.positions.includes(p)
      ? filters.positions.filter(x => x !== p)
      : [...filters.positions, p];
    onChange({ ...filters, positions: next });
  };
  const toggleFoot = (f: Foot) => {
    const next = filters.feet.includes(f)
      ? filters.feet.filter(x => x !== f)
      : [...filters.feet, f];
    onChange({ ...filters, feet: next });
  };

  const footLabel: Record<Foot, string> = {
    Gaucher: t('shadow_team.foot_left'),
    Droitier: t('shadow_team.foot_right'),
    Ambidextre: t('shadow_team.foot_both'),
  };

  const posSummary = filters.positions.length === 0
    ? t('shadow_team.filter_position')
    : filters.positions.length <= 2
      ? filters.positions.map(p => posShort[p]).join(', ')
      : `${posShort[filters.positions[0]]} +${filters.positions.length - 1}`;

  const footSummary = filters.feet.length === 0
    ? t('shadow_team.filter_foot')
    : filters.feet.length === 1
      ? footLabel[filters.feet[0]]
      : `${filters.feet.length} ${t('shadow_team.filter_foot').toLowerCase()}`;

  const ageSummary = !ageActive
    ? t('shadow_team.filter_age')
    : `${filters.ageRange[0]} – ${filters.ageRange[1]}`;

  const contractSummary = filters.contractShort
    ? t('shadow_team.filter_contract_short')
    : t('shadow_team.filter_contract_short');

  return (
    <div className="space-y-2" role="group" aria-label={t('shadow_team.filters')}>
      <div className="grid grid-cols-2 gap-2">
        {/* Position */}
        <FilterDropdown
          label={posSummary}
          active={filters.positions.length > 0}
          count={filters.positions.length}
        >
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('shadow_team.filter_position')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="max-h-64 overflow-y-auto">
            {POSITION_CHIPS.map(p => (
              <DropdownMenuCheckboxItem
                key={p}
                checked={filters.positions.includes(p)}
                onCheckedChange={() => togglePos(p)}
                onSelect={(e) => e.preventDefault()}
              >
                <span className="font-semibold">{posShort[p]}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
          {filters.positions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onChange({ ...filters, positions: [] })}
                className="text-xs text-muted-foreground"
              >
                {t('shadow_team.filter_clear')}
              </DropdownMenuItem>
            </>
          )}
        </FilterDropdown>

        {/* Foot */}
        <FilterDropdown
          label={footSummary}
          active={filters.feet.length > 0}
          count={filters.feet.length}
        >
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('shadow_team.filter_foot')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FOOT_OPTIONS.map(f => (
            <DropdownMenuCheckboxItem
              key={f}
              checked={filters.feet.includes(f)}
              onCheckedChange={() => toggleFoot(f)}
              onSelect={(e) => e.preventDefault()}
            >
              {footLabel[f]}
            </DropdownMenuCheckboxItem>
          ))}
          {filters.feet.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onChange({ ...filters, feet: [] })}
                className="text-xs text-muted-foreground"
              >
                {t('shadow_team.filter_clear')}
              </DropdownMenuItem>
            </>
          )}
        </FilterDropdown>

        {/* Age range */}
        <FilterDropdown
          label={ageSummary}
          active={ageActive}
        >
          <div className="px-3 py-2.5 w-[240px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                {t('shadow_team.filter_age')}
              </span>
              <span className="text-xs font-bold tabular-nums">
                {filters.ageRange[0]} – {filters.ageRange[1]} {t('common.year')}
              </span>
            </div>
            <SliderPrimitive.Root
              value={filters.ageRange}
              onValueChange={(v) => {
                if (v.length === 2) onChange({ ...filters, ageRange: [v[0], v[1]] });
              }}
              min={AGE_MIN}
              max={AGE_MAX}
              step={1}
              minStepsBetweenThumbs={0}
              className="relative flex w-full touch-none select-none items-center py-2"
              aria-label={t('shadow_team.filter_age')}
            >
              <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
                <SliderPrimitive.Range className="absolute h-full bg-primary" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Min"
              />
              <SliderPrimitive.Thumb
                className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Max"
              />
            </SliderPrimitive.Root>
            <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground tabular-nums">
              <span>{AGE_MIN}</span>
              <span>{AGE_MAX}</span>
            </div>
            {ageActive && (
              <button
                onClick={() => onChange({ ...filters, ageRange: [AGE_MIN, AGE_MAX] })}
                className="w-full mt-2 text-[11px] font-semibold text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded py-1"
              >
                {t('shadow_team.filter_clear')}
              </button>
            )}
          </div>
        </FilterDropdown>

        {/* Contract */}
        <FilterDropdown
          label={contractSummary}
          active={filters.contractShort}
        >
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('shadow_team.filter_contract_short')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filters.contractShort}
            onCheckedChange={(v) => onChange({ ...filters, contractShort: !!v })}
            onSelect={(e) => e.preventDefault()}
          >
            {t('shadow_team.filter_contract_short')}
          </DropdownMenuCheckboxItem>
        </FilterDropdown>
      </div>

      {hasAny && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="w-full text-[11px] font-semibold text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded py-1"
        >
          {t('shadow_team.filter_clear')}
        </button>
      )}
    </div>
  );
}

function FilterDropdown({
  label, active, count, children,
}: {
  label: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`h-9 w-full flex items-center justify-between gap-1.5 px-3 rounded-xl border text-[12px] font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            active
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'bg-background border-border hover:border-border/80 text-foreground'
          }`}
          aria-haspopup="menu"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{label}</span>
            {count !== undefined && count > 1 && (
              <span className="shrink-0 px-1 rounded bg-primary text-primary-foreground text-[10px] tabular-nums">
                {count}
              </span>
            )}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px] max-h-[320px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Stats panel (vertical, in side tab) ── */
function StatsPanel({
  players, assignments,
}: {
  players: Player[];
  assignments: ShadowTeamPlayer[];
}) {
  const { t, i18n } = useTranslation();

  const stats = useMemo(() => {
    // Every unique player assigned anywhere in the team (pitch + bench + alts)
    const allAssignedIds = new Set(assignments.map(a => a.player_id));
    const teamPlayers = players.filter(p => allAssignedIds.has(p.id));

    const n = teamPlayers.length;
    if (n === 0) return null;

    const avgAge = teamPlayers.reduce((s, p) => s + getPlayerAge(p.generation, p.date_of_birth), 0) / n;

    // Averages exclude players with 0/unset level or potential (likely "not yet rated")
    const levelRated = teamPlayers.filter(p => (p.current_level ?? 0) > 0);
    const potentialRated = teamPlayers.filter(p => (p.potential ?? 0) > 0);
    const avgLevel = levelRated.length > 0
      ? levelRated.reduce((s, p) => s + p.current_level, 0) / levelRated.length
      : null;
    const avgPotential = potentialRated.length > 0
      ? potentialRated.reduce((s, p) => s + p.potential, 0) / potentialRated.length
      : null;

    const footCount: Record<Foot, number> = { Gaucher: 0, Droitier: 0, Ambidextre: 0 };
    let footUnknown = 0;
    for (const p of teamPlayers) {
      if (p.foot && footCount[p.foot] !== undefined) footCount[p.foot]++;
      else footUnknown++;
    }

    const natCount = new Map<string, number>();
    for (const p of teamPlayers) {
      natCount.set(p.nationality, (natCount.get(p.nationality) ?? 0) + 1);
    }
    const topNats = Array.from(natCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const now = new Date();
    const endingSoon = teamPlayers.filter(p => {
      if (!p.contract_end) return false;
      const end = new Date(p.contract_end);
      const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
      return months >= 0 && months <= 12;
    }).length;

    return { n, avgAge, avgPotential, avgLevel, footCount, footUnknown, topNats, endingSoon };
  }, [players, assignments]);

  if (!stats) {
    return (
      <div className="rounded-2xl bg-muted/30 border border-dashed border-border py-10 px-4 text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm font-semibold text-muted-foreground">{t('shadow_team.stats_none')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('shadow_team.empty_desc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Team size badge */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
        <Users className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        <span className="text-xs font-bold text-primary">
          {t('shadow_team.stats_count', { count: stats.n })}
        </span>
      </div>

      {/* Hero row: level + potential */}
      <div className="grid grid-cols-2 gap-2">
        <BigStatCard
          label={t('shadow_team.stats_avg_level')}
          value={stats.avgLevel === null ? '—' : stats.avgLevel.toFixed(1)}
          accent="from-primary/20 to-primary/5"
        />
        <BigStatCard
          label={t('shadow_team.stats_avg_potential')}
          value={stats.avgPotential === null ? '—' : stats.avgPotential.toFixed(1)}
          accent="from-violet-500/20 to-violet-500/5"
        />
      </div>

      {/* Age + contracts */}
      <div className="grid grid-cols-2 gap-2">
        <InlineStatCard
          label={t('shadow_team.stats_avg_age')}
          value={`${stats.avgAge.toFixed(1)} ${t('common.year')}`}
          tone={stats.avgAge >= 30 ? 'warn' : stats.avgAge >= 27 ? 'neutral-accent' : 'neutral'}
        />
        <InlineStatCard
          label={t('shadow_team.stats_contracts_ending')}
          value={String(stats.endingSoon)}
          tone={stats.endingSoon > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* Foot breakdown */}
      <div className="rounded-xl border border-border bg-card/50 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {t('shadow_team.stats_foot')}
        </div>
        <div className="space-y-1.5">
          <FootBar label={t('shadow_team.foot_left')} count={stats.footCount.Gaucher} total={stats.n} color="#3b82f6" />
          <FootBar label={t('shadow_team.foot_right')} count={stats.footCount.Droitier} total={stats.n} color="#10b981" />
          {stats.footCount.Ambidextre > 0 && (
            <FootBar label={t('shadow_team.foot_both')} count={stats.footCount.Ambidextre} total={stats.n} color="#a855f7" />
          )}
          {stats.footUnknown > 0 && (
            <FootBar label={t('shadow_team.foot_unknown')} count={stats.footUnknown} total={stats.n} color="#9ca3af" />
          )}
        </div>
      </div>

      {/* Top nationalities */}
      {stats.topNats.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {t('shadow_team.stats_top_nationalities')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.topNats.map(([nat, count]) => (
              <span
                key={nat}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted text-xs font-semibold"
              >
                <FlagIcon nationality={nat} size="sm" />
                <span className="truncate max-w-[100px]">{translateCountry(nat, i18n.language)}</span>
                <span className="text-muted-foreground">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BigStatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`rounded-xl border border-border bg-gradient-to-br ${accent} p-3`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate block mb-1">{label}</span>
      <p className="text-2xl font-black tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function InlineStatCard({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'neutral-accent' | 'warn';
}) {
  const toneClass =
    tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10'
    : tone === 'neutral-accent' ? 'border-yellow-500/20 bg-yellow-500/5'
    : 'border-border bg-card/50';
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 truncate">{label}</div>
      <p className="text-base font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function FootBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 font-semibold truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-6 text-right font-bold tabular-nums">{count}</span>
    </div>
  );
}

/* ── Bench panel (vertical, in side tab) ── */
function BenchPanel({
  assignments, allPlayers, onPickSlot, onRemove,
}: {
  assignments: ShadowTeamPlayer[];
  allPlayers: Player[];
  onPickSlot: (slotId: string) => void;
  onRemove: (slotId: string, playerId: string) => void;
}) {
  const { t } = useTranslation();
  const benchBySlot = new Map<string, ShadowTeamPlayer[]>();
  for (const a of assignments) {
    if (!isBenchSlot(a.position_slot)) continue;
    const list = benchBySlot.get(a.position_slot) ?? [];
    list.push(a);
    benchBySlot.set(a.position_slot, list);
  }
  for (const [, list] of benchBySlot) list.sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-1.5">
      {BENCH_SLOT_IDS.map((slotId, i) => {
        const assigns = benchBySlot.get(slotId) ?? [];
        const mainAssign = assigns[0];
        const player = mainAssign ? allPlayers.find(p => p.id === mainAssign.player_id) : null;
        return (
          <div
            key={slotId}
            className="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all"
          >
            <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
              {i + 1}
            </span>
            {player ? (
              <>
                <button
                  onClick={() => onPickSlot(slotId)}
                  className="flex-1 flex items-center gap-2 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
                  aria-label={`${t('shadow_team.bench_slot')} ${i + 1}: ${player.name}`}
                >
                  <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" className="!w-8 !h-8 !rounded-full shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{player.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{player.club}</p>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(slotId, player.id); }}
                  className="w-6 h-6 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:opacity-100"
                  aria-label={t('shadow_team.player_removed')}
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                onClick={() => onPickSlot(slotId)}
                className="flex-1 flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
                aria-label={`${t('shadow_team.bench_slot')} ${i + 1} ${t('shadow_team.bench_empty')}`}
              >
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" />
                </div>
                <span className="text-xs text-muted-foreground">{t('shadow_team.bench_slot')} {i + 1}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Comparison view ── */
function ComparisonView({
  teamA, teamB, allPlayers, onExit,
}: {
  teamA: ShadowTeamType;
  teamB: ShadowTeamType;
  allPlayers: Player[];
  onExit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-extrabold tracking-tight">{t('shadow_team.compare_title')}</h1>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl" onClick={onExit} aria-label={t('shadow_team.compare_exit')}>
          <X className="w-4 h-4 mr-1" aria-hidden="true" />
          {t('shadow_team.compare_exit')}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComparisonPitch team={teamA} allPlayers={allPlayers} />
        <ComparisonPitch team={teamB} allPlayers={allPlayers} />
      </div>
    </div>
  );
}

function ComparisonPitch({ team, allPlayers }: { team: ShadowTeamType; allPlayers: Player[] }) {
  const { data: assignments = [] } = useShadowTeamPlayers(team.id);
  const { positionShort: posShort } = usePositions();
  const formation = (team.formation as FormationKey) || '4-3-3';
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];

  const slotPlayersMap = useMemo(() => {
    const grouped = new Map<string, ShadowTeamPlayer[]>();
    assignments.forEach(a => {
      const list = grouped.get(a.position_slot) ?? [];
      list.push(a);
      grouped.set(a.position_slot, list);
    });
    for (const [, list] of grouped) list.sort((a, b) => a.rank - b.rank);
    const map = new Map<string, Player | undefined>();
    for (const [slotId, list] of grouped) {
      const p = allPlayers.find(pl => pl.id === list[0].player_id);
      map.set(slotId, p);
    }
    return map;
  }, [assignments, allPlayers]);

  return (
    <div className="rounded-2xl overflow-hidden border border-border">
      <div className="px-4 py-2 bg-muted/40 flex items-center gap-2 border-b border-border">
        {team.logo_url ? (
          <img src={team.logo_url} alt="" className="w-6 h-6 rounded-md object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          </div>
        )}
        <h2 className="font-bold text-sm truncate flex-1">{team.name}</h2>
        <span className="text-xs text-muted-foreground">{team.formation}</span>
      </div>
      <div
        className="relative w-full"
        style={{
          aspectRatio: '3 / 2',
          background: 'linear-gradient(90deg, #2d7a3a 0%, #35893f 20%, #2d7a3a 40%, #35893f 60%, #2d7a3a 80%, #35893f 100%)',
        }}
      >
        <svg viewBox="0 0 150 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
          <rect x="5" y="5" width="140" height="90" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
          <line x1="75" y1="5" x2="75" y2="95" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
          <circle cx="75" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
        </svg>
        {slots.map(slot => {
          const player = slotPlayersMap.get(slot.id);
          return (
            <div
              key={slot.id}
              className="absolute"
              style={slotToPitchStyle(slot)}
            >
              {player ? (
                <div className="flex items-center gap-1">
                  <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" className="!w-7 !h-7 !rounded-full border-2 border-white/80" />
                  <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] max-w-[80px] truncate">
                    {formatShortName(player.name)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-white/40 bg-white/5" />
                  <span className="text-[10px] font-bold text-white/60 drop-shadow">{posShort[slot.position]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Draggable pitch slot (drag-and-swap between positions) ── */
function DraggablePitchSlot({
  id, disabled, slotLabel, children,
}: {
  id: string;
  disabled?: boolean;
  slotLabel: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, disabled });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={(node: HTMLDivElement | null) => { setDragRef(node); setDropRef(node); }}
      {...attributes}
      {...listeners}
      aria-label={slotLabel}
      className={`relative touch-none transition-all duration-150 ${
        isDragging ? 'opacity-25 scale-90' : ''
      } ${isOver && !isDragging ? 'scale-105' : ''}`}
      style={{ cursor: disabled ? undefined : 'grab' }}
    >
      {isOver && !isDragging && (
        <div className="absolute -inset-2 rounded-xl border-2 border-white/70 bg-white/15 pointer-events-none animate-pulse" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

/* ── Sortable player item for drag & drop in picker ── */
function SortablePlayerItem({
  assignment, player, onRemove, rank,
}: {
  assignment: ShadowTeamPlayer;
  player: Player;
  onRemove: () => void;
  rank?: number;
}) {
  const { t } = useTranslation();
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: assignment.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  const isStarter = rank === 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-2 py-2 rounded-xl border transition-all ${
        isDragging
          ? 'shadow-lg ring-2 ring-primary/40 bg-card'
          : isStarter
            ? 'bg-primary/5 border-primary/30'
            : 'bg-card/60 border-border hover:border-border/80'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        aria-label={t('shadow_team.current_order')}
      >
        <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {rank !== undefined && (
        <span
          className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
            isStarter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
          aria-hidden="true"
        >
          {rank}
        </span>
      )}
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border">
        <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{player.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">{player.club}</p>
      </div>
      <span className="text-[10px] font-bold font-mono shrink-0">
        {player.current_level}<span className="text-muted-foreground font-normal">/</span><span className="text-primary">{player.potential}</span>
      </span>
      <button
        onClick={onRemove}
        className="w-6 h-6 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive shrink-0"
        aria-label={t('shadow_team.player_removed')}
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </button>
    </div>
  );
}
