import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIsAdmin, useMyPermissions } from '@/hooks/use-admin';
import { type Player, type CoachCareerEntry, COACHING_LICENSES, NATIONALITIES, getFlag } from '@/types/player';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DateInput from '@/components/ui/date-input';
import { Badge } from '@/components/ui/badge';
import { DragDropPhotoUpload } from '@/components/ui/drag-drop-photo-upload';
import { toast } from 'sonner';
import {
  Award, Search, Loader2, RefreshCw, GraduationCap, Swords,
  CalendarRange, Trophy, ChevronRight, User, X, ExternalLink,
  PencilLine, Check, AlertTriangle, Edit2, Save, Calendar,
  Building2, Euro,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TmCoachResult {
  coachId: string;
  slug: string;
  name: string;
  nationality: string | null;
  currentClub: string | null;
}

// ── License badge ─────────────────────────────────────────────────────────────

function LicenseBadge({ license }: { license: string }) {
  const color =
    license.includes('Pro') ? 'bg-yellow-500/15 text-yellow-700 border-yellow-300' :
    license.includes(' A') ? 'bg-blue-500/15 text-blue-700 border-blue-300' :
    license.includes(' B') ? 'bg-green-500/15 text-green-700 border-green-300' :
    'bg-muted text-muted-foreground border-border';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border', color)}>
      <GraduationCap className="w-3 h-3" /> {license}
    </span>
  );
}

// ── Career timeline ───────────────────────────────────────────────────────────

function CareerTimeline({ career }: { career: CoachCareerEntry[] }) {
  if (!career.length) return null;
  return (
    <div className="relative pl-5">
      <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
      <div className="space-y-3">
        {career.map((entry, i) => (
          <div key={i} className="relative flex gap-3 items-start">
            <div className={cn(
              'absolute -left-3.5 top-1.5 w-3 h-3 rounded-full border-2 bg-background',
              entry.to === 'présent' ? 'border-primary' : 'border-muted-foreground/40',
            )} />
            <div className="shrink-0 w-7 h-7 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
              {entry.club_logo ? (
                <img src={entry.club_logo} alt={entry.club} className="w-full h-full object-contain p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">{entry.club.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium truncate', entry.to === 'présent' && 'text-primary')}>{entry.club}</p>
              <p className="text-xs text-muted-foreground">
                {entry.from}{entry.to ? ` → ${entry.to}` : ''}
                {entry.role && <span className="ml-1.5 opacity-70">· {entry.role}</span>}
              </p>
              {(entry.games !== null && entry.games !== undefined) && (
                <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{entry.games} MJ</span>
                  {entry.wins !== null && <span className="text-green-600 font-medium">{entry.wins}V</span>}
                  {entry.draws !== null && <span className="text-amber-600 font-medium">{entry.draws}N</span>}
                  {entry.losses !== null && <span className="text-red-500 font-medium">{entry.losses}D</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Career editor ─────────────────────────────────────────────────────────────

function CareerEditor({ career, onSave, onCancel }: {
  career: CoachCareerEntry[];
  onSave: (c: CoachCareerEntry[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<(CoachCareerEntry & { key: string })[]>(
    career.map(e => ({ ...e, key: Math.random().toString(36).slice(2) }))
  );
  const update = (i: number, field: keyof CoachCareerEntry, val: any) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow = () => setRows(prev => [...prev, { key: Math.random().toString(36).slice(2), club: '', from: '', to: 'présent', role: 'Entraîneur principal', games: null, wins: null, draws: null, losses: null }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {rows.map((row, i) => (
          <div key={row.key} className="grid grid-cols-[1fr_80px_80px_28px] gap-1.5 items-center">
            <Input value={row.club} onChange={e => update(i, 'club', e.target.value)} placeholder="Club" className="h-7 text-xs" />
            <Input value={row.from} onChange={e => update(i, 'from', e.target.value)} placeholder="Début" className="h-7 text-xs" />
            <Input value={row.to} onChange={e => update(i, 'to', e.target.value)} placeholder="Fin" className="h-7 text-xs" />
            <button onClick={() => removeRow(i)} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">+ Ajouter un club</button>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onSave(rows.map(({ key, ...e }) => e))}>Enregistrer</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

// ── TM search modal ───────────────────────────────────────────────────────────

function TmSearchModal({ player, onClose, onImported }: { player: Player; onClose: () => void; onImported: () => void }) {
  const [query, setQuery] = useState(player.name);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TmCoachResult[]>([]);
  const [selected, setSelected] = useState<TmCoachResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setError(null); setResults([]); setSelected(null);
    try {
      const res = await fetch(`${API}/tm/coach-search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TmCoachResult[] = await res.json();
      setResults(data);
      if (!data.length) setError('Aucun entraîneur trouvé sur Transfermarkt.');
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const importCoach = async (r: TmCoachResult) => {
    setSelected(r); setImporting(true); setError(null);
    try {
      const res = await fetch(`${API}/admin/enrich-coach/${player.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tmCoachId: r.coachId, tmCoachSlug: r.slug }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      setImported(true);
      toast.success('Profil importé depuis Transfermarkt');
      setTimeout(() => { onImported(); onClose(); }, 700);
    } catch (e: any) { setError(e.message); setSelected(null); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-bold flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> Importer depuis Transfermarkt</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Photo, carrière, licence, nationalité — automatiquement</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 border-b space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Nom de l'entraîneur…" className="flex-1" />
            <Button onClick={search} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.length > 0 ? (
            <ul className="p-3 space-y-1.5">
              {results.map(r => (
                <li key={r.coachId}>
                  <button onClick={() => importCoach(r)} disabled={importing}
                    className={cn('w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      selected?.coachId === r.coachId
                        ? (imported ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'border-primary bg-primary/5')
                        : 'hover:bg-muted/50 hover:border-primary/30')}>
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.nationality && <span>{r.nationality} · </span>}
                        {r.currentClub ? `Club : ${r.currentClub}` : `ID TM : ${r.coachId}`}
                      </p>
                    </div>
                    {selected?.coachId === r.coachId
                      ? (importing ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /> : imported ? <Check className="w-4 h-4 text-green-600 shrink-0" /> : null)
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !searching && !error && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Recherchez par nom complet pour importer le profil automatiquement.
              </div>
            )
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>Données fournies par Transfermarkt</span>
          <a href="https://www.transfermarkt.fr" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">transfermarkt.fr <ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>
    </div>
  );
}

// ── Edit profile modal ────────────────────────────────────────────────────────

interface EditProfileModalProps {
  player: Player;
  onClose: () => void;
  onSaved: (updated: Partial<Player>) => Promise<void>;
}

function EditProfileModal({ player, onClose, onSaved }: EditProfileModalProps) {
  const [photoUrl, setPhotoUrl] = useState(player.photo_url ?? '');
  const [name, setName] = useState(player.name);
  const [nationality, setNationality] = useState(player.nationality ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(player.date_of_birth ?? '');
  const [club, setClub] = useState(player.club ?? '');
  const [league, setLeague] = useState(player.league ?? '');
  const [contractStart, setContractStart] = useState(player.contract_start ?? '');
  const [contractEnd, setContractEnd] = useState(player.contract_end ?? '');
  const [marketValue, setMarketValue] = useState(player.market_value ?? '');
  const [license, setLicense] = useState(player.coaching_license ?? '');
  const [formation, setFormation] = useState(player.coaching_preferred_formation ?? '');
  const [style, setStyle] = useState(player.coaching_style ?? '');
  const [notes, setNotes] = useState(player.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const natOptions = NATIONALITIES.slice().sort((a, b) => a.localeCompare(b));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaved({
        photo_url: photoUrl || undefined,
        name,
        nationality,
        date_of_birth: dateOfBirth || undefined,
        club,
        league,
        contract_start: contractStart || undefined,
        contract_end: contractEnd || undefined,
        market_value: marketValue || undefined,
        coaching_license: license || null,
        coaching_preferred_formation: formation || null,
        coaching_style: style || null,
        notes: notes || undefined,
      });
      setSaved(true);
      toast.success('Profil entraîneur mis à jour');
      setTimeout(onClose, 600);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" /> Modifier le profil entraîneur
            </h3>
            <p className="text-xs text-muted-foreground">{player.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Photo */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Photo</p>
            <DragDropPhotoUpload
              currentUrl={photoUrl}
              onPhotoChange={url => { setPhotoUrl(url); }}
              size="lg"
              rounded="circle"
            />
          </div>

          {/* Identité */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identité</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Nom complet *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom Nom" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Nationalité</label>
                <select
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Sélectionner —</option>
                  {natOptions.map(n => (
                    <option key={n} value={n}>{getFlag(n)} {n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Date de naissance</label>
                <DateInput value={dateOfBirth} onChange={setDateOfBirth} />
              </div>
            </div>
          </div>

          {/* Club */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Club & contrat</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><Building2 className="w-3 h-3" /> Club actuel</label>
                <Input value={club} onChange={e => setClub(e.target.value)} placeholder="Nom du club" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Championnat</label>
                <Input value={league} onChange={e => setLeague(e.target.value)} placeholder="Ex : Ligue 1" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><Calendar className="w-3 h-3" /> Début de contrat</label>
                <DateInput value={contractStart} onChange={setContractStart} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><Calendar className="w-3 h-3" /> Fin de contrat</label>
                <DateInput value={contractEnd} onChange={setContractEnd} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><Euro className="w-3 h-3" /> Valeur marchande</label>
                <Input value={marketValue} onChange={e => setMarketValue(e.target.value)} placeholder="Ex : 500 000 €" />
              </div>
            </div>
          </div>

          {/* Expertise */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Expertise coaching</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Licence UEFA</label>
                <select
                  value={license}
                  onChange={e => setLicense(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Non renseignée —</option>
                  {COACHING_LICENSES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block flex items-center gap-1"><Swords className="w-3 h-3" /> Formation préférée</label>
                <Input value={formation} onChange={e => setFormation(e.target.value)} placeholder="ex : 4-3-3, 4-2-3-1…" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium mb-1 block">Style de jeu & philosophie</label>
              <textarea
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="Décrivez le style de jeu, la philosophie, les valeurs de cet entraîneur…"
                rows={4}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>

          {/* Notes internes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notes internes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations, contexte, informations complémentaires…"
              rows={3}
              className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className={cn(saved && 'bg-green-600 hover:bg-green-700')}>
            {saved ? <><Check className="w-4 h-4 mr-1.5" />Sauvegardé</> : saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Sauvegarde…</> : <><Save className="w-4 h-4 mr-1.5" />Enregistrer</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main CoachPanel ───────────────────────────────────────────────────────────

interface CoachPanelProps {
  player: Player;
  onUpdate: (fields: Partial<Player>) => Promise<void>;
}

export function CoachPanel({ player, onUpdate }: CoachPanelProps) {
  const { data: isAdmin } = useIsAdmin();
  const { data: permsData } = useMyPermissions();
  const canManage = isAdmin || permsData?.roles?.some(r => r.toLowerCase().includes('mod'));

  const [tmModalOpen, setTmModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCareer, setEditingCareer] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const career: CoachCareerEntry[] = Array.isArray(player.coaching_career)
    ? player.coaching_career
    : (player.coaching_career ? JSON.parse(player.coaching_career as unknown as string) : []);

  const save = async (fields: Partial<Player>) => {
    setSaving(true);
    try {
      await onUpdate(fields);
      queryClient.invalidateQueries({ queryKey: ['player', player.id] });
    } finally {
      setSaving(false);
    }
  };

  const currentClub = career.find(e => e.to === 'présent' || e.to === 'present');

  // Format contract dates for display
  const fmtDate = (d?: string) => {
    if (!d) return null;
    try { return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(d)); }
    catch { return d; }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" /> Profil Entraîneur
        </h3>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => setEditModalOpen(true)} className="gap-1.5 text-xs h-7">
              <Edit2 className="w-3 h-3" /> Modifier le profil
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTmModalOpen(true)} className="gap-1.5 text-xs h-7">
              <RefreshCw className="w-3 h-3" /> Importer TM
            </Button>
          </div>
        )}
      </div>

      {/* Current club */}
      {(currentClub || player.club) && (
        <div className="flex items-center gap-3 rounded-xl border bg-primary/5 p-3">
          <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center overflow-hidden">
            {currentClub?.club_logo
              ? <img src={currentClub.club_logo} alt={player.club} className="w-full h-full object-contain p-0.5" />
              : <Trophy className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Club actuel</p>
            <p className="font-semibold text-sm">{currentClub?.club || player.club}</p>
            {player.league && <p className="text-xs text-muted-foreground">{player.league}</p>}
          </div>
          <Badge className="ml-auto text-[10px]" variant="outline">En poste</Badge>
        </div>
      )}

      {/* Key info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* License */}
        <div className="rounded-xl border p-3 space-y-1 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Licence</p>
          {player.coaching_license
            ? <LicenseBadge license={player.coaching_license} />
            : <span className="text-xs text-muted-foreground/60 italic">Non renseignée</span>}
        </div>

        {/* Formation */}
        <div className="rounded-xl border p-3 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Swords className="w-3 h-3" /> Formation</p>
          {player.coaching_preferred_formation
            ? <span className="text-sm font-bold font-mono">{player.coaching_preferred_formation}</span>
            : <span className="text-xs text-muted-foreground/60 italic">—</span>}
        </div>

        {/* Contract */}
        <div className="rounded-xl border p-3 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Contrat</p>
          {(player.contract_start || player.contract_end) ? (
            <div className="text-xs">
              {fmtDate(player.contract_start) && <p><span className="text-muted-foreground">Début :</span> {fmtDate(player.contract_start)}</p>}
              {fmtDate(player.contract_end) && <p><span className="text-muted-foreground">Fin :</span> {fmtDate(player.contract_end)}</p>}
            </div>
          ) : <span className="text-xs text-muted-foreground/60 italic">—</span>}
        </div>

        {/* Experience */}
        <div className="rounded-xl border p-3 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarRange className="w-3 h-3" /> Expérience</p>
          {career.length > 0
            ? <span className="text-sm font-semibold">{career.length} club{career.length > 1 ? 's' : ''}</span>
            : <span className="text-xs text-muted-foreground/60 italic">—</span>}
        </div>
      </div>

      {/* Market value */}
      {player.market_value && (
        <div className="rounded-xl border p-3 flex items-center gap-2">
          <Euro className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Valeur marchande :</span>
          <span className="text-sm font-semibold">{player.market_value}</span>
        </div>
      )}

      {/* Style de jeu */}
      <div className="rounded-xl border p-3 space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium">Style de jeu & philosophie</p>
        {player.coaching_style
          ? <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{player.coaching_style}</p>
          : <p className="text-xs text-muted-foreground/60 italic">Aucune description.{canManage && ' Cliquez sur "Modifier le profil" pour en ajouter une.'}</p>}
      </div>

      {/* Career timeline */}
      <div className="rounded-xl border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" /> Carrière d'entraîneur
          </p>
          {canManage && !editingCareer && (
            <button onClick={() => setEditingCareer(true)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              <PencilLine className="w-3 h-3" /> Modifier
            </button>
          )}
        </div>
        {editingCareer ? (
          <CareerEditor
            career={career}
            onSave={async entries => { await save({ coaching_career: entries }); setEditingCareer(false); }}
            onCancel={() => setEditingCareer(false)}
          />
        ) : career.length > 0 ? (
          <CareerTimeline career={career} />
        ) : (
          <p className="text-xs text-muted-foreground/60 italic text-center py-4">
            Aucune carrière renseignée.{canManage && ' Importez depuis Transfermarkt ou modifiez manuellement.'}
          </p>
        )}
      </div>

      {/* Modals */}
      {editModalOpen && (
        <EditProfileModal
          player={player}
          onClose={() => setEditModalOpen(false)}
          onSaved={async fields => {
            await save(fields);
            queryClient.invalidateQueries({ queryKey: ['player', player.id] });
          }}
        />
      )}
      {tmModalOpen && (
        <TmSearchModal
          player={player}
          onClose={() => setTmModalOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: ['player', player.id] })}
        />
      )}
    </div>
  );
}
