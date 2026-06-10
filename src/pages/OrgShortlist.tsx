import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Plus, Search, Trash2, StickyNote, ChevronDown, User, ListChecks, ArrowUpDown, Download, ExternalLink } from 'lucide-react';
import * as XLSX from 'xlsx';
import OrgTabBar from '@/components/OrgTabBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useCurrentOrg } from '@/hooks/use-organization';
import {
  useOrgShortlist, useAddToShortlist, useUpdateShortlistEntry, useRemoveFromShortlist,
  type ShortlistEntry,
} from '@/hooks/use-org-shortlist';
import { useQuery } from '@tanstack/react-query';

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

const STATUS_META = {
  en_veille:     { label: 'En veille',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  a_observer:    { label: 'À observer',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  en_discussion: { label: 'En discussion', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approche:      { label: 'Approché',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
} as const;

const STATUS_ORDER = ['en_veille', 'a_observer', 'en_discussion', 'approche'] as const;

interface Player { id: string; full_name: string; club: string | null; position: string | null; photo_url: string | null; }

function useOrgPlayerSearch(orgId: string, q: string) {
  return useQuery({
    queryKey: ['org-player-search', orgId, q],
    enabled: q.length >= 2 && !!orgId,
    queryFn: async (): Promise<{ players: Player[] }> => {
      const res = await fetch(`/api/organizations/${orgId}/players/search?q=${encodeURIComponent(q)}`, authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30_000,
  });
}

function AddPlayerDialog({
  orgId, open, onClose, existingIds,
}: { orgId: string; open: boolean; onClose: () => void; existingIds: Set<string>; }) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useOrgPlayerSearch(orgId, q);
  const addMutation = useAddToShortlist(orgId);

  const handleAdd = (player: Player) => {
    addMutation.mutate({ player_id: player.id }, {
      onSuccess: () => {
        toast.success(`${player.full_name} ajouté à la shortlist`);
        onClose();
        setQ('');
      },
      onError: (err: unknown) => {
        const msg = (err as { error?: string })?.error ?? 'Erreur';
        toast.error(msg === 'Ce joueur est déjà dans la shortlist' ? msg : 'Impossible d\'ajouter ce joueur');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setQ(''); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un joueur à la shortlist</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un joueur…"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {isFetching && <p className="text-sm text-muted-foreground text-center py-4">Recherche…</p>}
          {!isFetching && q.length >= 2 && !data?.players?.length && (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun joueur trouvé dans l'organisation</p>
          )}
          {q.length < 2 && (
            <p className="text-xs text-muted-foreground text-center py-3">Tapez au moins 2 caractères pour rechercher parmi les joueurs de l'organisation.</p>
          )}
          {data?.players?.map(player => {
            const already = existingIds.has(player.id);
            return (
              <button
                key={player.id}
                disabled={already || addMutation.isPending}
                onClick={() => !already && handleAdd(player)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={player.photo_url ?? undefined} />
                  <AvatarFallback className="text-xs"><User className="w-3 h-3" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{player.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{[player.position, player.club].filter(Boolean).join(' · ')}</p>
                </div>
                {already && <Badge variant="secondary" className="text-xs shrink-0">Déjà ajouté</Badge>}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryCard({ entry, orgId }: { entry: ShortlistEntry; orgId: string }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const updateMutation = useUpdateShortlistEntry(orgId);
  const removeMutation = useRemoveFromShortlist(orgId);
  const meta = STATUS_META[entry.status];

  const handleStatusChange = (status: string) => {
    updateMutation.mutate({ entryId: entry.id, status }, {
      onError: () => toast.error('Impossible de mettre à jour le statut'),
    });
  };

  const handleSaveNotes = () => {
    updateMutation.mutate({ entryId: entry.id, notes }, {
      onSuccess: () => { setEditingNotes(false); toast.success('Notes enregistrées'); },
      onError: () => toast.error('Erreur lors de l\'enregistrement'),
    });
  };

  const handleRemove = () => {
    removeMutation.mutate(entry.id, {
      onSuccess: () => toast.success(`${entry.full_name} retiré de la shortlist`),
      onError: () => toast.error('Erreur lors de la suppression'),
    });
  };

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={entry.photo_url ?? undefined} />
            <AvatarFallback className="text-sm"><User className="w-4 h-4" /></AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{entry.full_name}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color} hover:opacity-80 transition-opacity`}>
                    {meta.label}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_ORDER.map(s => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={entry.status === s ? 'font-semibold' : ''}
                    >
                      {STATUS_META[s].label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[entry.position, entry.club].filter(Boolean).join(' · ')}
            </p>
            {entry.notes && !editingNotes && (
              <p className="text-xs text-muted-foreground/80 mt-1.5 italic line-clamp-2 bg-muted/30 rounded px-2 py-1">
                {entry.notes}
              </p>
            )}
            {editingNotes && (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notes sur ce joueur…"
                  className="text-xs min-h-[60px] resize-none"
                  maxLength={500}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes} disabled={updateMutation.isPending}>
                    Enregistrer
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingNotes(false); setNotes(entry.notes ?? ''); }}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditingNotes(v => !v)} title="Modifier les notes">
              <StickyNote className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 hover:text-destructive" onClick={handleRemove} disabled={removeMutation.isPending}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-muted-foreground/50">Ajouté par {entry.added_by_name}</p>
          <Link
            to={`player/${entry.player_id}`}
            onClick={e => e.stopPropagation()}
            className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-0.5 transition-colors"
          >
            Voir profil <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrgShortlist() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: org } = useCurrentOrg();
  const orgId = org?.id as string | undefined;

  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'status'>('date');

  const { data, isLoading } = useOrgShortlist(orgId);
  const entries = data?.entries ?? [];

  const positions = useMemo(() => {
    const set = new Set(entries.map(e => e.position).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [entries]);

  const existingIds = useMemo(() => new Set<string>(entries.map(e => e.player_id)), [entries]);

  const filtered = useMemo(() => {
    let result = entries.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (filterPosition !== 'all' && e.position !== filterPosition) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.full_name?.toLowerCase().includes(q) || e.club?.toLowerCase().includes(q) || e.position?.toLowerCase().includes(q);
      }
      return true;
    });
    if (sortBy === 'name') result = [...result].sort((a, b) => a.full_name.localeCompare(b.full_name));
    else if (sortBy === 'status') result = [...result].sort((a, b) => STATUS_ORDER.indexOf(a.status as any) - STATUS_ORDER.indexOf(b.status as any));
    return result;
  }, [entries, filterStatus, filterPosition, search, sortBy]);

  if (!org && !isLoading) return null;

  const handleExport = () => {
    if (!filtered.length) return;
    const rows = filtered.map(e => ({
      Joueur: e.full_name,
      Poste: e.position ?? '',
      Club: e.club ?? '',
      Statut: STATUS_META[e.status]?.label ?? e.status,
      Notes: e.notes ?? '',
      'Ajouté par': e.added_by_name,
      'Date ajout': new Date(e.added_at).toLocaleDateString('fr-FR'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shortlist');
    XLSX.writeFile(wb, `shortlist-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <OrgTabBar orgName={orgSlug ?? ''} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Shortlist collective</h2>
          <p className="text-sm text-muted-foreground">{entries.length} joueur{entries.length !== 1 ? 's' : ''} suivis</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un joueur
        </Button>
      </div>

      {/* Filters row 1: search + sort + export */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer…"
            className="pl-9 w-52"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortBy === 'date' ? 'Date' : sortBy === 'name' ? 'Nom' : 'Statut'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSortBy('date')} className={sortBy === 'date' ? 'font-semibold' : ''}>Date d'ajout</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')} className={sortBy === 'name' ? 'font-semibold' : ''}>Nom</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('status')} className={sortBy === 'status' ? 'font-semibold' : ''}>Statut</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 ml-auto" onClick={handleExport} disabled={!filtered.length}>
          <Download className="w-3.5 h-3.5" />
          Exporter
        </Button>
      </div>

      {/* Filters row 2: status chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {[{ key: 'all', label: 'Tous les statuts' }, ...STATUS_ORDER.map(s => ({ key: s, label: STATUS_META[s].label }))].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {label}
            {key !== 'all' && (
              <span className="ml-1 opacity-60">{entries.filter(e => e.status === key).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters row 3: position chips (only if > 1 position exists) */}
      {positions.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterPosition('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterPosition === 'all' ? 'bg-secondary text-secondary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted/80'}`}
          >
            Tous les postes
          </button>
          {positions.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPosition(pos === filterPosition ? 'all' : pos)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterPosition === pos ? 'bg-secondary text-secondary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted/80'}`}
            >
              {pos}
              <span className="ml-1 opacity-60">{entries.filter(e => e.position === pos).length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Pipeline summary */}
      {entries.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {STATUS_ORDER.map(s => {
            const count = entries.filter(e => e.status === s).length;
            const pct = entries.length ? (count / entries.length) * 100 : 0;
            return (
              <div key={s} className="text-center space-y-1">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{STATUS_META[s].label}</p>
                <p className="text-sm font-bold">{count}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Player grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{entries.length === 0 ? 'Aucun joueur dans la shortlist' : 'Aucun résultat'}</p>
          {entries.length === 0 && (
            <p className="text-sm mt-1">Cliquez sur « Ajouter un joueur » pour commencer.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(entry => (
            <EntryCard key={entry.id} entry={entry} orgId={orgId!} />
          ))}
        </div>
      )}

      {orgId && (
        <AddPlayerDialog
          orgId={orgId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          existingIds={existingIds}
        />
      )}
    </div>
  );
}
