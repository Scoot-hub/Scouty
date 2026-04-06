import { useMemo, useState, useCallback, useRef } from 'react';
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
  useAssignPlayer,
  useRemovePlayerFromSlot,
  useReorderSlot,
  useRemapFormation,
  type ShadowTeam as ShadowTeamType,
  type ShadowTeamPlayer,
} from '@/hooks/use-shadow-teams';
import { getPlayerAge, translateCountry, type Player, type Position } from '@/types/player';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, Pencil, Trash2, ArrowLeft, Users, X, Search, UserPlus, Shield, PlusCircle, GripVertical, Eye, Download,
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
  x: number; // % from left
  y: number; // % from top (0 = attacking end)
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

/* ── Smart position remapping for formation changes ──
   Each position has coordinates: side (left/center/right) + line (GK→attack).
   When slots disappear in a new formation, unmatched players are reassigned
   using optimal matching: minimize total distance (side + line).
   This preserves side logic (AG→LG not AD), line logic (MDef→DC not ATT),
   and global fit (AG+MDef with 1 DC + 1 ATT → AG→ATT, MDef→DC). */

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

/* Resolve a slot's position/coordinates by searching ALL formations.
   Handles cases where a player is in a slot from a different formation
   (e.g. "LWB" while current formation is 4-3-3 which doesn't have LWB). */
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

  // Split: assignments already in a valid new-formation slot vs. need remap
  const needsRemap: ShadowTeamPlayer[] = [];
  const occupiedNewSlots = new Set<string>();
  for (const a of assignments) {
    if (newSlotIds.has(a.position_slot)) {
      occupiedNewSlots.add(a.position_slot);
    } else {
      needsRemap.push(a);
    }
  }
  if (needsRemap.length === 0) return [];

  // Available targets = new-formation slots without any player
  const available = newSlots
    .filter(s => !occupiedNewSlots.has(s.id))
    .map(s => ({ ...s, taken: false }));

  // Group orphans by their current (invalid) slot for batch remap
  const orphansBySlot = new Map<string, ShadowTeamPlayer[]>();
  for (const a of needsRemap) {
    const list = orphansBySlot.get(a.position_slot) ?? [];
    list.push(a);
    orphansBySlot.set(a.position_slot, list);
  }

  // Build candidates: hybrid distance (position-type × 100000 + spatial)
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

  // SAFETY NET: any orphan that wasn't matched → force into remaining slot or first slot
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
  const [formName, setFormName] = useState('');
  const [formFormation, setFormFormation] = useState<FormationKey>('4-3-3');
  const [formLogo, setFormLogo] = useState('');

  const createTeam = useCreateShadowTeam();
  const deleteTeam = useDeleteShadowTeam();

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

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (selected) {
    return (
      <ShadowTeamDetail
        team={selected}
        allPlayers={allPlayers}
        onBack={() => setSelected(null)}
        onDelete={() => setDeleteOpen(true)}
        onTeamUpdated={(updated) => setSelected(updated)}
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
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
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
        <Button className="rounded-xl" onClick={() => { setFormName(''); setFormFormation('4-3-3'); setFormLogo(''); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('shadow_team.create')}
        </Button>
      </div>

      {shadowTeams.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🏟️</p>
          <p className="text-lg font-semibold text-muted-foreground">{t('shadow_team.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('shadow_team.empty_desc')}</p>
          <Button className="mt-4 rounded-xl" onClick={() => { setFormName(''); setFormFormation('4-3-3'); setFormLogo(''); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t('shadow_team.create')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {shadowTeams.map(st => (
            <ShadowTeamCard key={st.id} team={st} allPlayers={allPlayers} onClick={() => setSelected(st)} />
          ))}
        </div>
      )}

      {/* Create dialog */}
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
      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t('shadow_team.formation')}</label>
      <div className="flex flex-wrap gap-2">
        {FORMATION_KEYS.map(f => (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
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
function ShadowTeamCard({ team, allPlayers, onClick }: { team: ShadowTeamType; allPlayers: Player[]; onClick: () => void }) {
  const { t } = useTranslation();
  const { data: assignments = [] } = useShadowTeamPlayers(team.id);
  const totalSlots = FORMATIONS[team.formation as FormationKey]?.length ?? 11;
  const filledSlots = new Set(assignments.map(a => a.position_slot)).size;
  const totalPlayers = assignments.length;

  const assignedPlayers = useMemo(() => {
    const ids = new Set(assignments.map(a => a.player_id));
    return allPlayers.filter(p => ids.has(p.id));
  }, [assignments, allPlayers]);

  return (
    <Card className="card-warm hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {team.logo_url ? (
              <img src={team.logo_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-base">{team.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{team.formation}</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
            <Users className="w-3 h-3" />
            {filledSlots}/{totalSlots} · {totalPlayers}
          </span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
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

const PITCH_VIEW_KEYS: { key: PitchView; labelKey: string; icon: string }[] = [
  { key: 'default',     labelKey: 'shadow_team.view_default',     icon: '—' },
  { key: 'age',         labelKey: 'shadow_team.view_age',         icon: '🎂' },
  { key: 'contract',    labelKey: 'shadow_team.view_contract',    icon: '📄' },
  { key: 'nationality', labelKey: 'shadow_team.view_nationality', icon: '🌍' },
  { key: 'club',        labelKey: 'shadow_team.view_club',        icon: '🏟' },
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

/* ── Detail view with pitch ── */
const DEFAULT_VISIBLE_PLAYERS = 3;

function ShadowTeamDetail({
  team, allPlayers, onBack, onDelete, onTeamUpdated, deleteDialog,
}: {
  team: ShadowTeamType;
  allPlayers: Player[];
  onBack: () => void;
  onDelete: () => void;
  onTeamUpdated: (t: ShadowTeamType) => void;
  deleteDialog: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { positionShort: posShort } = usePositions();
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
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<PitchView>('default');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editFormation, setEditFormation] = useState<FormationKey>(team.formation as FormationKey || '4-3-3');
  const [editLogo, setEditLogo] = useState(team.logo_url ?? '');
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);

  const handleDownloadImage = useCallback(async () => {
    if (!pitchRef.current) return;
    try {
      // 1. Force lazy images to load
      const imgs = Array.from(pitchRef.current.querySelectorAll('img'));
      imgs.forEach(img => { img.loading = 'eager'; img.setAttribute('crossorigin', 'anonymous'); });
      await Promise.all(
        imgs.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); })
        ),
      );

      // 2. Capture — call toPng multiple times (html-to-image known workaround for fonts/images)
      let dataUrl = '';
      for (let i = 0; i < 3; i++) {
        dataUrl = await toPng(pitchRef.current, {
          pixelRatio: 2,
          cacheBust: true,
          skipFonts: true,
          filter: (node: HTMLElement) => {
            // Skip broken images to prevent failures
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

  // Map slot → assignments sorted by rank
  const slotAssignmentsMap = useMemo(() => {
    const map = new Map<string, ShadowTeamPlayer[]>();
    assignments.forEach(a => {
      const list = map.get(a.position_slot) ?? [];
      list.push(a);
      map.set(a.position_slot, list);
    });
    // Sort each by rank
    for (const [, list] of map) list.sort((a, b) => a.rank - b.rank);
    return map;
  }, [assignments]);

  // Map slot → players ordered by rank
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

  // Players already assigned in current slot (for filtering)
  const slotAssignedIds = useMemo(() => {
    if (!pickingSlot) return new Set<string>();
    return new Set(
      assignments
        .filter(a => a.position_slot === pickingSlot.id)
        .map(a => a.player_id)
    );
  }, [assignments, pickingSlot]);

  // Filter players for slot picker
  const filteredPlayers = useMemo(() => {
    if (!pickingSlot) return [];
    let list = allPlayers.filter(p => !slotAssignedIds.has(p.id));

    // Sort by position proximity: exact match first, then by distance
    const matchPos = pickingSlot.position;
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
  }, [pickingSlot, allPlayers, slotAssignedIds, searchQuery]);

  const handleAssign = async (player: Player) => {
    if (!pickingSlot) return;
    try {
      const currentSlotPlayers = slotAssignmentsMap.get(pickingSlot.id) ?? [];
      await assignPlayer.mutateAsync({
        shadowTeamId: team.id,
        playerId: player.id,
        positionSlot: pickingSlot.id,
        currentSlotPlayers,
      });
      toast.success(t('shadow_team.player_assigned', { name: player.name, slot: posShort[pickingSlot.position] }));
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
      // Remap slots if formation changed
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

  const filledSlotCount = slotPlayersMap.size;
  const totalPlayerCount = assignments.length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Edit dialog — managed here to access assignments for remap */}
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

      {/* Header — compact single line */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          {team.logo_url ? (
            <img src={team.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
          )}
          <h1 className="text-lg font-extrabold tracking-tight">{team.name}</h1>
          <span className="text-xs text-muted-foreground">{formation} · {filledSlotCount}/11 · {totalPlayerCount} {t('shadow_team.filled')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={activeView !== 'default' ? 'default' : 'outline'} size="sm" className="rounded-xl h-7 text-xs">
                <Eye className="w-3 h-3 mr-1" />
                {activeView !== 'default'
                  ? t(PITCH_VIEW_KEYS.find(v => v.key === activeView)?.labelKey ?? '')
                  : t('shadow_team.views')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {PITCH_VIEW_KEYS.map(v => (
                <DropdownMenuItem
                  key={v.key}
                  onClick={() => setActiveView(v.key)}
                  className={activeView === v.key ? 'bg-accent font-semibold' : ''}
                >
                  <span className="mr-2 text-sm">{v.icon}</span>
                  {t(v.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="rounded-xl h-7 text-xs" onClick={handleDownloadImage}>
            <Download className="w-3 h-3 mr-1" /> {t('shadow_team.download')}
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl h-7 text-xs" onClick={() => { setEditName(team.name); setEditFormation(formation); setEditLogo(team.logo_url ?? ''); setEditOpen(true); }}>
            <Pencil className="w-3 h-3 mr-1" /> {t('common.edit')}
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl h-7 text-destructive hover:bg-destructive/10" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Pitch — horizontal layout with drag-and-swap */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setDraggedSlotId(e.active.id as string)}
        onDragEnd={handlePitchDragEnd}
        onDragCancel={() => setDraggedSlotId(null)}
      >
        <div
          ref={pitchRef}
          className="relative w-full mx-auto rounded-2xl overflow-hidden"
          style={{
            aspectRatio: '3 / 2',
            maxHeight: 'calc(100vh - 5rem)',
            background: 'linear-gradient(90deg, #2d7a3a 0%, #35893f 20%, #2d7a3a 40%, #35893f 60%, #2d7a3a 80%, #35893f 100%)',
          }}
        >
          {/* Pitch markings — landscape */}
          <svg viewBox="0 0 150 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <rect x="5" y="5" width="140" height="90" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
            <line x1="75" y1="5" x2="75" y2="95" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <circle cx="75" cy="50" r="12" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <circle cx="75" cy="50" r="0.8" fill="rgba(255,255,255,0.35)" />
            <rect x="5" y="20" width="22" height="60" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <rect x="5" y="32" width="8" height="36" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <rect x="123" y="20" width="22" height="60" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <rect x="137" y="32" width="8" height="36" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <path d="M 27 35 Q 34 50 27 65" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
            <path d="M 123 35 Q 116 50 123 65" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
          </svg>

          {/* Player slots — draggable + droppable for swap */}
          {slots.map(slot => {
            const players = slotPlayersMap.get(slot.id) ?? [];
            const mainPlayer = players[0];
            const altPlayers = players.slice(1);

            return (
              <div
                key={slot.id}
                className="absolute"
                style={{
                  left: `${6 + (100 - slot.y) * 0.88}%`,
                  top: `${8 + slot.x * 0.84}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <DraggablePitchSlot id={slot.id} disabled={!mainPlayer}>
                  {mainPlayer ? (
                    <div className="flex flex-col">
                      {/* Main player */}
                      <div
                        className="flex items-center gap-1.5 group cursor-pointer relative"
                        onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                      >
                        <PlayerAvatar name={mainPlayer.name} photoUrl={mainPlayer.photo_url} size="sm" className="!w-8 !h-8 !rounded-full border-2 border-white/80" />
                        <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] max-w-[110px] truncate">
                          {mainPlayer.name}
                        </span>
                        {(() => {
                          const badge = getViewBadge(mainPlayer, activeView, t, i18n.language);
                          if (!badge) return null;
                          return (
                            <span
                              className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap text-white shadow-md"
                              style={{ backgroundColor: badge.bg }}
                            >
                              {badge.text}
                            </span>
                          );
                        })()}
                        <span
                          onClick={e => { e.stopPropagation(); handleRemove(slot.id, mainPlayer.id); }}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      </div>

                      {/* Alt players */}
                      {altPlayers.map(player => (
                        <div
                          key={player.id}
                          className="flex items-center gap-1 group/alt cursor-pointer relative mt-0.5 pl-1"
                          onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                        >
                          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" className="!w-5 !h-5 !rounded-full border border-white/60" />
                          <span className="text-[9px] font-semibold text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] max-w-[95px] truncate">
                            {player.name}
                          </span>
                          {(() => {
                            const badge = getViewBadge(player, activeView, t, i18n.language);
                            if (!badge) return null;
                            return (
                              <span
                                className="ml-0.5 px-1 py-px rounded text-[8px] font-bold whitespace-nowrap text-white shadow"
                                style={{ backgroundColor: badge.bg }}
                              >
                                {badge.text}
                              </span>
                            );
                          })()}
                          <span
                            onClick={e => { e.stopPropagation(); handleRemove(slot.id, player.id); }}
                            className="absolute -top-0.5 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/alt:opacity-100 transition-opacity cursor-pointer"
                          >
                            <X className="w-2 h-2" />
                          </span>
                        </div>
                      ))}

                      {/* Add */}
                      <button
                        onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                        className="mt-0.5 ml-1 w-[18px] h-[18px] rounded-full border border-dashed border-white/30 flex items-center justify-center hover:bg-white/20 hover:border-white/60 transition-all"
                      >
                        <Plus className="w-2.5 h-2.5 text-white/40" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setPickingSlot(slot); setSearchQuery(''); }}
                      className="flex items-center gap-1.5 group"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/50 flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all group-hover:border-white/80">
                        <UserPlus className="w-4 h-4 text-white/60 group-hover:text-white/90 transition-colors" />
                      </div>
                      <span className="text-[11px] font-bold text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                        {posShort[slot.position]}
                      </span>
                    </button>
                  )}
                </DraggablePitchSlot>
              </div>
            );
          })}
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {draggedSlotId && (() => {
            const players = slotPlayersMap.get(draggedSlotId) ?? [];
            const main = players[0];
            if (!main) return null;
            return (
              <div className="flex items-center gap-1.5 bg-card/95 backdrop-blur-sm px-2.5 py-1.5 rounded-xl shadow-2xl border border-border">
                <PlayerAvatar name={main.name} photoUrl={main.photo_url} size="sm" className="!w-8 !h-8 !rounded-full" />
                <div>
                  <p className="text-xs font-bold">{main.name}</p>
                  {players.length > 1 && <p className="text-[10px] text-muted-foreground">+{players.length - 1}</p>}
                </div>
              </div>
            );
          })()}
        </DragOverlay>
      </DndContext>

      {/* Player picker dialog */}
      <Dialog open={!!pickingSlot} onOpenChange={() => { setPickingSlot(null); setSearchQuery(''); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t('shadow_team.pick_player')} — {pickingSlot ? posShort[pickingSlot.position] : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Current players in slot — drag & drop reorder */}
          {pickingSlot && (slotAssignmentsMap.get(pickingSlot.id) ?? []).length > 0 && (
            <div className="pb-3 border-b border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('shadow_team.current_order')}</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={(slotAssignmentsMap.get(pickingSlot.id) ?? []).map(a => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {(slotAssignmentsMap.get(pickingSlot.id) ?? []).map(assignment => {
                      const player = allPlayers.find(p => p.id === assignment.player_id);
                      if (!player) return null;
                      return (
                        <SortablePlayerItem
                          key={assignment.id}
                          assignment={assignment}
                          player={player}
                          onRemove={() => handleRemove(pickingSlot.id, player.id)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Search to add */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('shadow_team.search_placeholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 mt-2 min-h-0 max-h-[40vh]">
            {filteredPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('shadow_team.no_players_available')}</p>
            ) : (
              filteredPlayers.slice(0, 50).map(player => {
                const isMatchingPos = player.position === pickingSlot?.position || player.position_secondaire === pickingSlot?.position;
                return (
                  <button
                    key={player.id}
                    onClick={() => handleAssign(player)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:bg-accent/50 ${
                      isMatchingPos ? 'bg-primary/5 border border-primary/20' : ''
                    }`}
                  >
                    <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{player.name}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ClubBadge club={player.club} size="sm" />
                        <span className="truncate">{player.club}</span>
                        <span>·</span>
                        <span>{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <FlagIcon nationality={player.nationality} size="sm" />
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${isMatchingPos ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                        {posShort[player.position]}
                      </span>
                      <span className="text-sm font-bold font-mono">{player.current_level}<span className="text-muted-foreground font-normal">/</span><span className="text-primary">{player.potential}</span></span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Add new player link */}
          <div className="pt-3 border-t border-border">
            <Link
              to="/player/new"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              {t('shadow_team.add_new_player')}
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Draggable pitch slot (drag-and-swap between positions) ── */
function DraggablePitchSlot({ id, disabled, children }: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, disabled });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={(node: HTMLDivElement | null) => { setDragRef(node); setDropRef(node); }}
      {...attributes}
      {...listeners}
      className={`relative touch-none transition-all duration-150 ${
        isDragging ? 'opacity-25 scale-90' : ''
      } ${isOver && !isDragging ? 'scale-105' : ''}`}
      style={{ cursor: disabled ? undefined : 'grab' }}
    >
      {isOver && !isDragging && (
        <div className="absolute -inset-2 rounded-xl border-2 border-white/70 bg-white/15 pointer-events-none animate-pulse" />
      )}
      {children}
    </div>
  );
}

/* ── Sortable player item for drag & drop ── */
function SortablePlayerItem({ assignment, player, onRemove }: {
  assignment: ShadowTeamPlayer;
  player: Player;
  onRemove: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: assignment.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-xl bg-muted/50 ${isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground touch-none">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border">
        <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="sm" />
      </div>
      <p className="flex-1 text-sm font-semibold truncate">{player.name}</p>
      <button onClick={onRemove} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
