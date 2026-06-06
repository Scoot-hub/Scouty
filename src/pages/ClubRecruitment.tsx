import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFollowedClubs } from '@/hooks/use-followed-clubs';
import { usePlayers } from '@/hooks/use-players';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import DateInput from '@/components/ui/date-input';
import { toast } from 'sonner';
import {
  UserPlus, Plus, Search, Pencil, Trash2,
  MoreHorizontal, StickyNote, ExternalLink, AlertTriangle,
  ChevronDown, ChevronUp, Euro, FileText, User, Shield,
  CalendarDays, Syringe,
} from 'lucide-react';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { POSITIONS } from '@/types/player';
import { formatDate } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function normalizeClub(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(as|fc|ac|rc|sc|ss|us|aj|ogc|losc|stade|real|sporting|athletic)\s+/i, '')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

function clubsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeClub(a);
  const nb = normalizeClub(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function fmtEur(val: number | null | undefined): string {
  if (!val) return '';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
}

type RecruitmentStatus = 'proposed' | 'in_discussion' | 'accepted' | 'refused' | 'signed';
type ContractType = 'transfer' | 'loan' | 'free_agent';

interface RecruitmentItem {
  id: number;
  user_id: string;
  club_name: string;
  player_name: string;
  player_id: string | null;
  player_photo: string | null;
  position: string | null;
  status: RecruitmentStatus;
  notes: string | null;
  proposed_at: string | null;
  created_at: string;
  updated_at: string;
  // Contract fields
  contract_type: ContractType | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  salary: number | null;
  transfer_fee: number | null;
  signing_bonus: number | null;
  release_clause: number | null;
  performance_bonus: string | null;
  max_injuries: number | null;
  // Player context
  current_contract_end: string | null;
  market_value: number | null;
  nationality: string | null;
  agent_contact: string | null;
}

const STATUS_CONFIG: Record<RecruitmentStatus, { label: string; cls: string }> = {
  proposed:      { label: 'club_recruitment.status_proposed',      cls: 'bg-blue-500/15 text-blue-600 border-blue-500/20 dark:text-blue-400' },
  in_discussion: { label: 'club_recruitment.status_in_discussion', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/20 dark:text-amber-400' },
  accepted:      { label: 'club_recruitment.status_accepted',      cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400' },
  refused:       { label: 'club_recruitment.status_refused',       cls: 'bg-red-500/15 text-red-600 border-red-500/20 dark:text-red-400' },
  signed:        { label: 'club_recruitment.status_signed',        cls: 'bg-violet-500/15 text-violet-600 border-violet-500/20 dark:text-violet-400' },
};

const EMPTY_FORM = {
  club_name: '', player_name: '', player_id: '', position: '',
  status: 'proposed' as RecruitmentStatus, notes: '', proposed_at: '',
  // contract
  contract_type: '' as ContractType | '',
  contract_start_date: '', contract_end_date: '',
  salary: '', transfer_fee: '', signing_bonus: '', release_clause: '',
  performance_bonus: '', max_injuries: '',
  // player ctx
  current_contract_end: '', market_value: '', nationality: '', agent_contact: '',
};

function StatusBadge({ status }: { status: RecruitmentStatus }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.proposed;
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {t(cfg.label)}
    </span>
  );
}

function ContractTypeBadge({ type }: { type: ContractType | null }) {
  const { t } = useTranslation();
  if (!type) return null;
  const cfg: Record<ContractType, string> = {
    transfer: 'bg-primary/10 text-primary border-primary/20',
    loan: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    free_agent: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg[type]}`}>
      {t(`club_recruitment.contract_type_${type}`)}
    </span>
  );
}

// ── Collapsible section wrapper ─────────────────────────────────────────────
function CollapsibleSection({
  icon: Icon, label, openLabel, open, onToggle, children,
}: {
  icon: React.ElementType; label: string; openLabel?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors',
          open ? 'bg-muted/60 text-foreground' : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{open && openLabel ? openLabel : label}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t border-border/60 bg-muted/5 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────────
function RecruitmentDialog({
  open, onOpenChange, initial, suggestedClubs, playerSuggestions, items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Partial<RecruitmentItem> & { id?: number };
  suggestedClubs: string[];
  playerSuggestions: { id: string; name: string; photo_url?: string; position?: string; club?: string }[];
  items: RecruitmentItem[];
}) {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();
  const qc = useQueryClient();
  const isEdit = !!initial.id;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [clubSugs, setClubSugs] = useState<string[]>([]);
  const [showClubSugs, setShowClubSugs] = useState(false);
  const [playerSugs, setPlayerSugs] = useState<typeof playerSuggestions>([]);
  const [showPlayerSugs, setShowPlayerSugs] = useState(false);
  const [selectedPlayerClub, setSelectedPlayerClub] = useState<string | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [showPlayerCtx, setShowPlayerCtx] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      club_name: initial.club_name ?? '',
      player_name: initial.player_name ?? '',
      player_id: initial.player_id ? String(initial.player_id) : '',
      position: initial.position ?? '',
      status: (initial.status ?? 'proposed') as RecruitmentStatus,
      notes: initial.notes ?? '',
      proposed_at: initial.proposed_at ? initial.proposed_at.split('T')[0] : '',
      contract_type: (initial.contract_type ?? '') as ContractType | '',
      contract_start_date: initial.contract_start_date ? initial.contract_start_date.split('T')[0] : '',
      contract_end_date: initial.contract_end_date ? initial.contract_end_date.split('T')[0] : '',
      salary: initial.salary != null ? String(initial.salary) : '',
      transfer_fee: initial.transfer_fee != null ? String(initial.transfer_fee) : '',
      signing_bonus: initial.signing_bonus != null ? String(initial.signing_bonus) : '',
      release_clause: initial.release_clause != null ? String(initial.release_clause) : '',
      performance_bonus: initial.performance_bonus ?? '',
      max_injuries: initial.max_injuries != null ? String(initial.max_injuries) : '',
      current_contract_end: initial.current_contract_end ? initial.current_contract_end.split('T')[0] : '',
      market_value: initial.market_value != null ? String(initial.market_value) : '',
      nationality: initial.nationality ?? '',
      agent_contact: initial.agent_contact ?? '',
    });
    // Auto-open sections if data exists
    const hasContract = !!(initial.contract_type || initial.contract_start_date || initial.contract_end_date ||
      initial.salary || initial.transfer_fee || initial.signing_bonus || initial.release_clause ||
      initial.performance_bonus || initial.max_injuries != null);
    const hasCtx = !!(initial.current_contract_end || initial.market_value || initial.nationality || initial.agent_contact);
    setShowContract(hasContract);
    setShowPlayerCtx(hasCtx);
    setSelectedPlayerClub(null);
    setClubSugs([]); setPlayerSugs([]);
    setShowClubSugs(false); setShowPlayerSugs(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedPlayerClub = selectedPlayerClub
    ?? playerSuggestions.find(p => p.name.toLowerCase() === form.player_name.trim().toLowerCase())?.club
    ?? null;

  const sameClubWarning = !!(resolvedPlayerClub && form.club_name && clubsMatch(resolvedPlayerClub, form.club_name));
  const sameClubBlocked = !isEdit && sameClubWarning;
  const dupBlocked = !isEdit && items.some(
    i => i.player_name.toLowerCase() === form.player_name.trim().toLowerCase()
      && clubsMatch(i.club_name, form.club_name)
  );

  const set = (k: keyof typeof EMPTY_FORM) => (val: string) => setForm(f => ({ ...f, [k]: val }));

  const handleClubInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; set('club_name')(val);
    const matches = suggestedClubs.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 6);
    setClubSugs(matches); setShowClubSugs(val.length >= 1 && matches.length > 0);
  };

  const handlePlayerInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; set('player_name')(val); set('player_id')(''); setSelectedPlayerClub(null);
    const matches = playerSuggestions.filter(p => p.name.toLowerCase().includes(val.toLowerCase())).slice(0, 6);
    setPlayerSugs(matches); setShowPlayerSugs(val.length >= 1 && matches.length > 0);
  };

  const save = async () => {
    if (!form.club_name.trim() || !form.player_name.trim()) { toast.error(t('club_recruitment.missing_required')); return; }
    if (sameClubBlocked) { toast.error(t('club_recruitment.error_same_club')); return; }
    if (dupBlocked) { toast.error(t('club_recruitment.error_duplicate')); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        player_id: form.player_id || null,
        proposed_at: form.proposed_at || null,
        contract_type: form.contract_type || null,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        salary: form.salary ? parseInt(form.salary, 10) : null,
        transfer_fee: form.transfer_fee ? parseInt(form.transfer_fee, 10) : null,
        signing_bonus: form.signing_bonus ? parseInt(form.signing_bonus, 10) : null,
        release_clause: form.release_clause ? parseInt(form.release_clause, 10) : null,
        performance_bonus: form.performance_bonus || null,
        max_injuries: form.max_injuries !== '' ? parseInt(form.max_injuries, 10) : null,
        current_contract_end: form.current_contract_end || null,
        market_value: form.market_value ? parseInt(form.market_value, 10) : null,
        nationality: form.nationality || null,
        agent_contact: form.agent_contact || null,
      };
      const url = isEdit ? `${API}/club-recruitment/${initial.id}` : `${API}/club-recruitment`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error === 'duplicate_recruitment' ? t('club_recruitment.error_duplicate') : t('common.error'));
        return;
      }
      qc.invalidateQueries({ queryKey: ['club-recruitment'] });
      toast.success(t('common.saved'));
      onOpenChange(false);
    } catch { toast.error(t('common.error')); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            {isEdit ? t('club_recruitment.edit_item') : t('club_recruitment.add_item')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── Champs obligatoires ── */}
          {/* Club */}
          <div className="space-y-1 relative">
            <Label className="text-xs">{t('club_recruitment.club')} *</Label>
            <Input value={form.club_name} onChange={handleClubInput}
              onBlur={() => setTimeout(() => setShowClubSugs(false), 150)}
              placeholder={t('club_recruitment.club_placeholder')} className="text-sm" />
            {showClubSugs && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                {clubSugs.map(c => (
                  <button key={c} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onMouseDown={e => { e.preventDefault(); set('club_name')(c); setShowClubSugs(false); }}>
                    <ClubBadge club={c} size="sm" />{c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Player */}
          <div className="space-y-1 relative">
            <Label className="text-xs">{t('club_recruitment.player')} *</Label>
            <Input value={form.player_name} onChange={handlePlayerInput}
              onBlur={() => setTimeout(() => setShowPlayerSugs(false), 150)}
              placeholder={t('club_recruitment.player_placeholder')} className="text-sm" />
            {showPlayerSugs && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                {playerSugs.map(p => (
                  <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onMouseDown={e => {
                      e.preventDefault();
                      set('player_name')(p.name); set('player_id')(String(p.id));
                      if (p.position) set('position')(p.position);
                      setSelectedPlayerClub(p.club ?? null); setShowPlayerSugs(false);
                    }}>
                    <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                    <span>{p.name}</span>
                    {p.position && <span className="text-muted-foreground text-xs ml-auto">{p.position}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Blocages */}
          {sameClubBlocked && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{t('club_recruitment.error_same_club')}</p>
            </div>
          )}
          {dupBlocked && !sameClubBlocked && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{t('club_recruitment.error_duplicate')}</p>
            </div>
          )}

          {/* Position + Status */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('club_recruitment.position')}</Label>
              <Select value={form.position || ''} onValueChange={v => set('position')(v)}>
                <SelectTrigger className="text-sm h-9"><SelectValue placeholder={t('club_recruitment.position_placeholder')} /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(POSITIONS) as [string, string][]).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      <span className="font-mono text-[11px] text-muted-foreground mr-2">{code}</span>{label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('club_recruitment.status')}</Label>
              <Select value={form.status} onValueChange={v => set('status')(v as RecruitmentStatus)}>
                <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_CONFIG) as RecruitmentStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{t(STATUS_CONFIG[s].label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date de proposition */}
          <div className="space-y-1">
            <Label className="text-xs">{t('club_recruitment.proposed_at')}</Label>
            <DateInput value={form.proposed_at} onChange={v => set('proposed_at')(v)} className="text-sm" />
          </div>

          {/* ── Section : Termes du contrat ── */}
          <CollapsibleSection
            icon={FileText}
            label={t('club_recruitment.show_contract')}
            openLabel={t('club_recruitment.section_contract')}
            open={showContract}
            onToggle={() => setShowContract(v => !v)}
          >
            {/* Type de recrutement */}
            <div className="space-y-1">
              <Label className="text-xs">{t('club_recruitment.contract_type')}</Label>
              <Select value={form.contract_type || ''} onValueChange={v => set('contract_type')(v as ContractType | '')}>
                <SelectTrigger className="text-sm h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">{t('club_recruitment.contract_type_transfer')}</SelectItem>
                  <SelectItem value="loan">{t('club_recruitment.contract_type_loan')}</SelectItem>
                  <SelectItem value="free_agent">{t('club_recruitment.contract_type_free_agent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dates de contrat */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.contract_start')}</Label>
                <DateInput value={form.contract_start_date} onChange={v => set('contract_start_date')(v)} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.contract_end')}</Label>
                <DateInput value={form.contract_end_date} onChange={v => set('contract_end_date')(v)} className="text-sm" />
              </div>
            </div>

            {/* Salaire + Indemnité */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Euro className="w-3 h-3" />{t('club_recruitment.salary')}
                </Label>
                <div className="relative">
                  <Input type="number" min="0" value={form.salary}
                    onChange={e => set('salary')(e.target.value)}
                    placeholder={t('club_recruitment.salary_placeholder')} className="text-sm pr-14" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€/mois</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Euro className="w-3 h-3" />{t('club_recruitment.transfer_fee')}
                </Label>
                <div className="relative">
                  <Input type="number" min="0" value={form.transfer_fee}
                    onChange={e => set('transfer_fee')(e.target.value)}
                    placeholder={t('club_recruitment.transfer_fee_placeholder')} className="text-sm pr-6" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                </div>
              </div>
            </div>

            {/* Prime à la signature + Clause libératoire */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.signing_bonus')}</Label>
                <div className="relative">
                  <Input type="number" min="0" value={form.signing_bonus}
                    onChange={e => set('signing_bonus')(e.target.value)}
                    placeholder={t('club_recruitment.signing_bonus_placeholder')} className="text-sm pr-6" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.release_clause')}</Label>
                <div className="relative">
                  <Input type="number" min="0" value={form.release_clause}
                    onChange={e => set('release_clause')(e.target.value)}
                    placeholder={t('club_recruitment.release_clause_placeholder')} className="text-sm pr-6" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                </div>
              </div>
            </div>

            {/* Primes de performance */}
            <div className="space-y-1">
              <Label className="text-xs">{t('club_recruitment.performance_bonus')}</Label>
              <Input value={form.performance_bonus} onChange={e => set('performance_bonus')(e.target.value)}
                placeholder={t('club_recruitment.performance_bonus_placeholder')} className="text-sm" />
            </div>

            {/* Blessures max */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Syringe className="w-3 h-3" />{t('club_recruitment.max_injuries')}
              </Label>
              <div className="relative max-w-[180px]">
                <Input type="number" min="0" max="99" value={form.max_injuries}
                  onChange={e => set('max_injuries')(e.target.value)}
                  placeholder={t('club_recruitment.max_injuries_placeholder')} className="text-sm pr-24" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
                  {t('club_recruitment.max_injuries_unit')}
                </span>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Section : Contexte joueur ── */}
          <CollapsibleSection
            icon={User}
            label={t('club_recruitment.show_player_ctx')}
            openLabel={t('club_recruitment.section_player_ctx')}
            open={showPlayerCtx}
            onToggle={() => setShowPlayerCtx(v => !v)}
          >
            {/* Fin de contrat actuel */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />{t('club_recruitment.current_contract_end')}
              </Label>
              <DateInput value={form.current_contract_end} onChange={v => set('current_contract_end')(v)} className="text-sm" />
            </div>

            {/* Valeur marchande + Nationalité */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.market_value')}</Label>
                <div className="relative">
                  <Input type="number" min="0" value={form.market_value}
                    onChange={e => set('market_value')(e.target.value)}
                    placeholder={t('club_recruitment.market_value_placeholder')} className="text-sm pr-8" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">k€</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('club_recruitment.nationality')}</Label>
                <Input value={form.nationality} onChange={e => set('nationality')(e.target.value)}
                  placeholder={t('club_recruitment.nationality_placeholder')} className="text-sm" />
              </div>
            </div>

            {/* Contact agent */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Shield className="w-3 h-3" />{t('club_recruitment.agent_contact')}
              </Label>
              <Input value={form.agent_contact} onChange={e => set('agent_contact')(e.target.value)}
                placeholder={t('club_recruitment.agent_contact_placeholder')} className="text-sm" />
            </div>
          </CollapsibleSection>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><StickyNote className="w-3 h-3" />{t('club_recruitment.notes')}</Label>
            <Textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
              placeholder={t('club_recruitment.notes_placeholder')}
              className="min-h-[70px] resize-none text-sm" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save} disabled={saving || sameClubBlocked || dupBlocked}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
function RecruitmentCard({ item, onEdit, onDelete }: {
  item: RecruitmentItem; onEdit: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();

  const hasContract = !!(item.contract_type || item.contract_end_date || item.salary ||
    item.transfer_fee || item.signing_bonus || item.release_clause || item.max_injuries != null);
  const hasCtx = !!(item.current_contract_end || item.market_value || item.nationality || item.agent_contact);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors group/card">
      <div className="shrink-0 relative">
        {item.player_id ? (
          <Link to={`/player/${item.player_id}`}>
            <PlayerAvatar name={item.player_name} photoUrl={item.player_photo ?? undefined} size="md" />
          </Link>
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
            {item.player_name[0]?.toUpperCase()}
          </div>
        )}
        {item.position && (
          <span className="absolute -bottom-1 -right-1 text-[9px] font-black bg-background border border-border rounded px-1 leading-4 shadow-sm">
            {item.position}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.player_id ? (
            <Link to={`/player/${item.player_id}`} className="text-sm font-semibold hover:text-primary hover:underline truncate">
              {item.player_name}
            </Link>
          ) : (
            <p className="text-sm font-semibold truncate">{item.player_name}</p>
          )}
          <StatusBadge status={item.status} />
          <ContractTypeBadge type={item.contract_type} />
          {item.nationality && (
            <span className="text-[10px] text-muted-foreground">{item.nationality}</span>
          )}
        </div>

        {/* Dates */}
        <div className="flex items-center gap-3 flex-wrap mt-0.5">
          {item.proposed_at && (
            <p className="text-[11px] text-muted-foreground">
              {t('club_recruitment.proposed_on')} {formatDate(item.proposed_at, dateFormat)}
            </p>
          )}
          {item.current_contract_end && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              Contrat actuel → {formatDate(item.current_contract_end, dateFormat)}
            </p>
          )}
        </div>

        {/* Contract terms summary */}
        {hasContract && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {item.salary && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Euro className="w-3 h-3" />{fmtEur(item.salary)}/mois
              </span>
            )}
            {item.transfer_fee && (
              <span className="text-[11px] text-muted-foreground">Transfert : {fmtEur(item.transfer_fee)}</span>
            )}
            {item.signing_bonus && (
              <span className="text-[11px] text-muted-foreground">Signature : {fmtEur(item.signing_bonus)}</span>
            )}
            {item.release_clause && (
              <span className="text-[11px] text-muted-foreground">Clause : {fmtEur(item.release_clause)}</span>
            )}
            {item.max_injuries != null && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Syringe className="w-3 h-3" />≤ {item.max_injuries} {t('club_recruitment.max_injuries_unit')}
              </span>
            )}
            {item.contract_end_date && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" />Contrat → {formatDate(item.contract_end_date, dateFormat)}
              </span>
            )}
          </div>
        )}

        {/* Market value + agent */}
        {hasCtx && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {item.market_value && (
              <span className="text-[11px] text-muted-foreground">
                Valeur : {item.market_value} k€
              </span>
            )}
            {item.agent_contact && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" />{item.agent_contact}
              </span>
            )}
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{item.notes}</p>
        )}
        {item.performance_bonus && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 italic line-clamp-1">
            Bonus : {item.performance_bonus}
          </p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} className="gap-2">
            <Pencil className="w-3.5 h-3.5" />{t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />{t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ClubRecruitment() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: followedClubs = [] } = useFollowedClubs();
  const { data: allPlayers = [] } = usePlayers();

  const suggestedClubs = useMemo(() => followedClubs.map(c => c.club_name), [followedClubs]);
  const playerSuggestions = useMemo(() => allPlayers.map(p => ({
    id: p.id, name: p.name, photo_url: p.photo_url ?? undefined,
    position: p.position ?? undefined, club: p.club ?? undefined,
  })), [allPlayers]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<RecruitmentStatus | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<RecruitmentItem> & { id?: number }>({});

  const { data, isLoading } = useQuery<{ items: RecruitmentItem[] }>({
    queryKey: ['club-recruitment'],
    queryFn: async () => {
      const res = await fetch(`${API}/club-recruitment`, { credentials: 'include' });
      if (!res.ok) throw new Error('fetch_failed');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i =>
      (filterStatus === 'all' || i.status === filterStatus) &&
      (!q || i.player_name.toLowerCase().includes(q) || i.club_name.toLowerCase().includes(q) ||
        i.position?.toLowerCase().includes(q) || i.nationality?.toLowerCase().includes(q))
    );
  }, [items, search, filterStatus]);

  const grouped = useMemo(() => {
    const map = new Map<string, RecruitmentItem[]>();
    for (const item of filtered) {
      if (!map.has(item.club_name)) map.set(item.club_name, []);
      map.get(item.club_name)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
    return counts;
  }, [items]);

  const openAdd = () => { setEditTarget({}); setDialogOpen(true); };
  const openEdit = (item: RecruitmentItem) => { setEditTarget(item); setDialogOpen(true); };

  const deleteItem = async (id: number) => {
    if (!confirm(t('club_recruitment.confirm_delete'))) return;
    try {
      await fetch(`${API}/club-recruitment/${id}`, { method: 'DELETE', credentials: 'include' });
      qc.invalidateQueries({ queryKey: ['club-recruitment'] });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <RecruitmentDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        initial={editTarget} suggestedClubs={suggestedClubs}
        playerSuggestions={playerSuggestions} items={items}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <UserPlus className="w-6 h-6 text-primary" />
            {t('club_recruitment.title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('club_recruitment.subtitle')}</p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />{t('club_recruitment.add_item')}
        </Button>
      </div>

      {/* Status filter pills */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterStatus('all')}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterStatus === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
            {t('club_recruitment.all')} ({items.length})
          </button>
          {(Object.keys(STATUS_CONFIG) as RecruitmentStatus[]).map(s => {
            const count = statusCounts[s] ?? 0;
            if (count === 0) return null;
            return (
              <button key={s} onClick={() => setFilterStatus(s === filterStatus ? 'all' : s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterStatus === s ? STATUS_CONFIG[s].cls + ' border-current' : 'border-border hover:bg-muted'}`}>
                {t(STATUS_CONFIG[s].label)} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {items.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('club_recruitment.search_placeholder')} className="pl-10" />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <UserPlus className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('club_recruitment.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">{t('club_recruitment.empty_desc')}</p>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" />{t('club_recruitment.add_item')}
          </Button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('club_recruitment.no_results')}</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([clubName, clubItems]) => (
            <Card key={clubName}>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Link to={`/club?club=${encodeURIComponent(clubName)}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors">
                    <ClubBadge club={clubName} size="sm" />
                    <span className="font-semibold">{clubName}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                  </Link>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {clubItems.length} {clubItems.length === 1 ? t('club_recruitment.player_singular') : t('club_recruitment.player_plural')}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 divide-y divide-border/40">
                {clubItems.map(item => (
                  <RecruitmentCard key={item.id} item={item}
                    onEdit={() => openEdit(item)} onDelete={() => deleteItem(item.id)} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
