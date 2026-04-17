import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useImportPlayers, usePlayers } from '@/hooks/use-players';
import { useOperationBanner } from '@/contexts/OperationBannerContext';
import { supabase } from '@/integrations/supabase/client';
import { NATIONALITIES, type Position, type Zone, type Foot } from '@/types/player';
import { Building2, Loader2, Sparkles, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TmClubPlayer {
  tmId: string;
  tmProfilePath: string;
  name: string;
  photoUrl: string | null;
  position: string | null;
  dateOfBirth: string | null;
  generation: number | null;
  nationality: string | null;
  marketValue: string | null;
  contractEnd: string | null;
}

function resolveNationality(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.split(/\s{2,}/)[0].trim();
  if (NATIONALITIES.includes(trimmed)) return trimmed;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return NATIONALITIES.find(n => norm(n) === norm(trimmed)) || trimmed;
}

function mapTmPosition(raw: string): Position | '' {
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('gardien')) return 'GK';
  if (s.includes('lateral droit') || s.includes('arriere droit')) return 'LD';
  if (s.includes('lateral gauche') || s.includes('arriere gauche')) return 'LG';
  if (s.includes('defenseur central') || s.includes('stopper')) return 'DC';
  if (s.includes('milieu defensif') || s.includes('sentinelle')) return 'MDef';
  if (s.includes('milieu offensif') || s.includes('meneur')) return 'MO';
  if (s.includes('ailier droit') || s.includes('extremite droite')) return 'AD';
  if (s.includes('ailier gauche') || s.includes('extremite gauche')) return 'AG';
  if (s.includes('avant-centre') || s.includes('avant centre') || s.includes('attaquant') || s.includes('buteur') || s.includes('second attaquant')) return 'ATT';
  if (s.includes('milieu central') || s.includes('milieu de terrain') || s.includes('milieu')) return 'MC';
  return '';
}

const POSITION_TO_ZONE: Record<Position, Zone> = {
  GK: 'Gardien',
  DC: 'Défenseur', LD: 'Défenseur', LG: 'Défenseur',
  MDef: 'Milieu', MC: 'Milieu', MO: 'Milieu',
  AD: 'Attaquant', AG: 'Attaquant', ATT: 'Attaquant',
};

export function ImportTmClubDialog({ externalOpen, onExternalOpenChange }: { externalOpen?: boolean; onExternalOpenChange?: (v: boolean) => void } = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importPlayers = useImportPlayers();
  const { data: existingPlayers = [] } = usePlayers();
  const { addOperation, updateOperation, completeOperation } = useOperationBanner();

  const controlled = externalOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlled ? externalOpen : internalOpen;
  const setOpen = controlled ? (v: boolean) => onExternalOpenChange?.(v) : setInternalOpen;
  const [tmUrl, setTmUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clubName, setClubName] = useState('');
  const [clubLogo, setClubLogo] = useState('');
  const [league, setLeague] = useState('');
  const [players, setPlayers] = useState<TmClubPlayer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPlayers) {
      set.add(p.name.toLowerCase().trim());
    }
    return set;
  }, [existingPlayers]);

  const filteredPlayers = useMemo(() => {
    if (!search) return players;
    const s = search.toLowerCase();
    return players.filter(p => p.name.toLowerCase().includes(s) || (p.position && p.position.toLowerCase().includes(s)));
  }, [players, search]);

  const reset = () => {
    setTmUrl('');
    setPlayers([]);
    setSelected(new Set());
    setClubName('');
    setClubLogo('');
    setLeague('');
    setSearch('');
    setLoading(false);
    setImporting(false);
  };

  const handleLoadSquad = async () => {
    const url = tmUrl.trim();
    if (!url) return;
    if (!url.includes('transfermarkt') || !url.includes('/verein/')) {
      toast({ title: t('common.error'), description: t('player_form.tm_club_url_invalid'), variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-tm-club', {
        body: { tmUrl: url },
      });

      if (error || !data?.success) {
        toast({ title: t('common.error'), description: t('player_form.tm_club_load_failed'), variant: 'destructive' });
        return;
      }

      setClubName(data.clubName || '');
      setClubLogo(data.clubLogo || '');
      setLeague(data.league || '');
      setPlayers(data.players || []);
      // Auto-select all new players (not already in DB)
      const autoSelected = new Set<string>();
      for (const p of (data.players || [])) {
        if (!existingNames.has(p.name.toLowerCase().trim())) {
          autoSelected.add(p.tmId);
        }
      }
      setSelected(autoSelected);

      if (!data.players?.length) {
        toast({ title: t('player_form.tm_club_no_players'), variant: 'destructive' });
      }
    } catch (err: unknown) {
      toast({ title: t('common.error'), description: err instanceof Error ? err.message : t('player_form.tm_club_load_failed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (tmId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tmId)) next.delete(tmId);
      else next.add(tmId);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filteredPlayers.map(p => p.tmId)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleImport = async () => {
    const toImport = players.filter(p => selected.has(p.tmId));
    if (toImport.length === 0) return;

    setImporting(true);
    const opId = `tm-club-import-${Date.now()}`;
    addOperation({ id: opId, type: 'import', label: t('banner.import_label', { count: toImport.length }), current: 0, total: toImport.length });

    try {
      const result = await importPlayers.mutateAsync(
        toImport.map(p => {
          const pos = p.position ? mapTmPosition(p.position) : '';
          const zone = pos ? (POSITION_TO_ZONE[pos] || '') : '';
          const nationality = p.nationality ? resolveNationality(p.nationality) : '';
          return {
            player: {
              name: p.name,
              photo_url: p.photoUrl || undefined,
              generation: p.generation || 2000,
              nationality,
              foot: '' as Foot,
              club: clubName,
              league,
              zone,
              position: (pos || 'MC') as Position,
              current_level: 0,
              potential: 0,
              general_opinion: 'À revoir' as const,
              date_of_birth: p.dateOfBirth || undefined,
              contract_end: p.contractEnd || undefined,
              ts_report_published: false,
              transfermarkt_id: p.tmId || undefined,
            },
            reports: [],
          };
        })
      );

      completeOperation(opId, {
        newCount: result.importedCount,
        updatedCount: result.updatedCount,
        errorCount: result.skippedCount || undefined,
      });

      // Background enrichment with TM URLs for each player
      if (result.enrichQueue?.length) {
        const enrichOpId = `enrich-tm-club-${Date.now()}`;
        const queue = result.enrichQueue;
        addOperation({ id: enrichOpId, type: 'enrichment', label: t('banner.enrichment_label', { count: queue.length }), current: 0, total: queue.length });

        (async () => {
          let success = 0;
          let errors = 0;
          for (const p of queue) {
            const tmPlayer = toImport.find(tp => tp.name === p.name);
            const tmUrl = tmPlayer ? `https://www.transfermarkt.fr${tmPlayer.tmProfilePath}` : undefined;
            try {
              await supabase.functions.invoke('enrich-player', {
                body: { playerName: p.name, club: p.club, playerId: p.id, nationality: p.nationality, generation: p.generation, tmUrl },
              });
              success++;
            } catch (e) {
              console.error('Background enrich failed for', p.name, e);
              errors++;
            }
            updateOperation(enrichOpId, { current: success + errors });
          }
          completeOperation(enrichOpId, { newCount: success, errorCount: errors > 0 ? errors : undefined });
          queryClient.invalidateQueries({ queryKey: ['players'] });
        })();
      }

      toast({
        title: t('player_form.tm_club_import_success', { count: result.importedCount + result.updatedCount, club: clubName }),
      });
      setOpen(false);
      reset();
    } catch (err) {
      console.error('TM club import error:', err);
      completeOperation(opId, { errorCount: toImport.length });
      toast({ title: t('common.error'), description: (err as Error)?.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
            <Building2 className="w-4 h-4" />
            {t('player_form.tm_club_import_title')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t('player_form.tm_club_import_title')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t('player_form.tm_club_import_desc')}</p>
        </DialogHeader>

        {/* URL input */}
        <div className="flex gap-2">
          <Input
            value={tmUrl}
            onChange={e => setTmUrl(e.target.value)}
            placeholder="https://www.transfermarkt.fr/club/kader/verein/123"
            className="flex-1 text-sm"
            disabled={loading || importing}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLoadSquad(); } }}
          />
          <Button
            size="sm"
            onClick={handleLoadSquad}
            disabled={loading || !tmUrl.trim() || importing}
            className="shrink-0 gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
            {loading ? t('player_form.tm_club_loading') : t('player_form.tm_club_import_btn')}
          </Button>
        </div>

        {/* Squad list */}
        {players.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Club header */}
            <div className="flex items-center gap-3">
              {clubLogo && <img src={clubLogo} alt="" className="w-8 h-8 object-contain" />}
              <div>
                <p className="font-semibold">{clubName}</p>
                {league && <p className="text-xs text-muted-foreground">{league}</p>}
              </div>
              <Badge variant="secondary" className="ml-auto">
                {t('player_form.tm_club_players_found', { count: players.length })}
              </Badge>
            </div>

            {/* Search + select all */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={selected.size === filteredPlayers.length ? deselectAll : selectAll}>
                {selected.size === filteredPlayers.length ? t('player_form.tm_club_deselect_all') : t('player_form.tm_club_select_all')}
              </Button>
            </div>

            {/* Player list */}
            <ScrollArea className="border rounded-lg max-h-[50vh]">
              <div className="divide-y">
                {filteredPlayers.map(p => {
                  const alreadyExists = existingNames.has(p.name.toLowerCase().trim());
                  return (
                    <label
                      key={p.tmId}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${alreadyExists ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        checked={selected.has(p.tmId)}
                        onCheckedChange={() => toggleSelect(p.tmId)}
                      />
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-muted" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{p.name}</span>
                          {alreadyExists && (
                            <Badge variant="outline" className="text-[10px] shrink-0">{t('player_form.tm_club_already_exists')}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {p.position && <span>{p.position}</span>}
                          {p.generation && <span>{p.generation}</span>}
                          {p.nationality && <span>{p.nationality}</span>}
                        </div>
                      </div>
                      {p.marketValue && (
                        <span className="text-xs font-medium text-muted-foreground shrink-0">{p.marketValue}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Import button */}
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="w-full gap-2"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {importing
                ? t('player_form.tm_club_importing')
                : t('player_form.tm_club_import_selected', { count: selected.size })
              }
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
