import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CustomFieldsForm } from '@/components/CustomFieldsDisplay';
import { useBulkUpsertCustomFieldValues } from '@/hooks/use-custom-fields';
import { LEAGUES, CLUBS, NATIONALITIES, ZONES, POTENTIAL_SCALE, PLAYER_TASKS, translateCountry, type Position, type Foot, type Zone, type PlayerTask } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { useMergedClubsAndLeagues, useResolveClubLeague } from '@/hooks/use-club-directory';
import { useUpsertPlayer, useAddReport } from '@/hooks/use-players';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Check, Search, LinkIcon, Loader2, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Opinion } from '@/types/player';

// ── TM data helpers ──────────────────────────────────────────────────────────
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

function mapTmFoot(raw: string): Foot {
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('gauche')) return 'Gaucher';
  if (s.includes('deux') || s.includes('ambidextre')) return 'Ambidextre';
  return 'Droitier';
}

type SelectOption = string | { label: string; value: string };

function SearchableSelect({ value, onValueChange, options, placeholder }: {
  value: string; onValueChange: (v: string) => void; options: SelectOption[]; placeholder: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalized = useMemo(() =>
    options.map(o => typeof o === 'string' ? { label: o, value: o } : o),
    [options]);
  const displayValue = useMemo(() =>
    normalized.find(o => o.value === value)?.label ?? value,
    [normalized, value]);
  const filtered = useMemo(() => {
    if (!search) return normalized;
    const s = search.toLowerCase();
    return normalized.filter(o => o.label.toLowerCase().includes(s));
  }, [normalized, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
          {displayValue || placeholder}
          <Search className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-50 bg-popover border shadow-md" align="start">
        <div className="p-2 border-b">
          <Input placeholder={t('player_form.search_placeholder')} value={search} onChange={e => setSearch(e.target.value)} className="h-8" />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {filtered.map(o => (
              <button key={o.value} className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors ${value === o.value ? 'bg-accent font-medium' : ''}`}
                onClick={() => { onValueChange(o.value); setOpen(false); setSearch(''); }}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground p-3 text-center">{t('player_form.no_results')}</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function AddPlayer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const createAsArchived = searchParams.get('archived') === 'true';
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { positions: posLabels } = usePositions();
  const upsertPlayer = useUpsertPlayer();
  const addReport = useAddReport();
  const bulkUpsertCF = useBulkUpsertCustomFieldValues();
  const { clubs: mergedClubs, leagues: mergedLeagues, clubToLeague } = useMergedClubsAndLeagues(CLUBS, LEAGUES);
  const resolveClubLeague = useResolveClubLeague();
  const nationalityOptions = useMemo(() =>
    NATIONALITIES.map(n => ({ label: translateCountry(n, i18n.language), value: n }))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    [i18n.language]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [generation, setGeneration] = useState('2004');
  const [nationality, setNationality] = useState('');
  const [club, setClub] = useState('');
  const [league, setLeague] = useState('');
  const [zone, setZone] = useState('');
  const [position, setPosition] = useState<Position | ''>('');
  const [positionSecondaire, setPositionSecondaire] = useState<Position | ''>('');
  const [role, setRole] = useState('');
  const [foot, setFoot] = useState<Foot>('Droitier');
  const [level, setLevel] = useState([6]);
  const [potential, setPotential] = useState([7]);
  const [contractEnd, setContractEnd] = useState('');
  const [addReportFlag, setAddReportFlag] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportOpinion, setReportOpinion] = useState<Opinion>('À revoir');
  const [driveLink, setDriveLink] = useState('');
  const [tsPublished, setTsPublished] = useState(false);
  const [notes, setNotes] = useState('');
  const [task, setTask] = useState<PlayerTask | ''>('');
  const [videoUrl, setVideoUrl] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Transfermarkt import
  const [tmUrl, setTmUrl] = useState('');
  const [tmLoading, setTmLoading] = useState(false);
  const [tmImported, setTmImported] = useState(false);
  const [tmEnrichmentUrl, setTmEnrichmentUrl] = useState('');

  const handleTmImport = async () => {
    const url = tmUrl.trim();
    if (!url) return;
    if (!url.includes('transfermarkt') || !url.includes('/spieler/')) {
      toast({ title: t('common.error'), description: t('player_form.tm_url_invalid'), variant: 'destructive' });
      return;
    }

    setTmLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-tm-profile', {
        body: { tmUrl: url },
      });

      if (error || !data?.success) {
        toast({ title: t('common.error'), description: t('player_form.tm_import_failed'), variant: 'destructive' });
        return;
      }

      // Pre-fill basic info
      if (data.name) setName(data.name);
      if (data.photoUrl) setPhotoUrl(data.photoUrl);
      if (data.generation) setGeneration(String(data.generation));
      if (data.dateOfBirth) {
        setDateOfBirth(data.dateOfBirth);
        // Ensure generation matches date_of_birth
        if (!data.generation) {
          const year = parseInt(data.dateOfBirth.slice(0, 4), 10);
          if (year) setGeneration(String(year));
        }
      }

      // Nationality
      if (data.nationality) {
        const nat = resolveNationality(data.nationality);
        if (nat) setNationality(nat);
      }

      // Club + auto-resolve league
      if (data.club) {
        setClub(data.club);
        const autoLeague = clubToLeague.get(data.club);
        if (autoLeague) {
          setLeague(autoLeague);
        } else {
          resolveClubLeague.mutate(data.club, {
            onSuccess: (res) => { if (res.league) setLeague(res.league); },
          });
        }
      }

      // Position + auto-set zone
      if (data.position) {
        const pos = mapTmPosition(data.position);
        if (pos) {
          setPosition(pos);
          setZone(POSITION_TO_ZONE[pos] || '');
        }
      }

      // Secondary position
      if (data.secondaryPosition) {
        const secPos = mapTmPosition(data.secondaryPosition);
        if (secPos) setPositionSecondaire(secPos);
      }

      // Foot
      if (data.foot) setFoot(mapTmFoot(data.foot));

      // Contract end date
      if (data.contract) setContractEnd(data.contract);

      // Store TM URL so enrich-player can be called after save
      setTmEnrichmentUrl(url);
      setTmImported(true);
      // Auto-advance to evaluation step (steps 0-1 are auto-filled)
      setStep(2);
      toast({ title: t('player_form.tm_import_success'), description: data.name || '' });
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message || t('player_form.tm_import_failed'), variant: 'destructive' });
    } finally {
      setTmLoading(false);
    }
  };

  const STEPS = [
    t('player_form.step_basic'),
    t('player_form.step_sport'),
    t('player_form.step_eval'),
    t('player_form.step_report'),
    t('player_form.step_notes'),
  ];

  const canNext = () => {
    if (tmImported) return true;
    if (step === 0) return name.trim().length > 0 && nationality !== '';
    if (step === 1) return position !== '';
    return true;
  };

  const handleSave = async () => {
    try {
      const result = await upsertPlayer.mutateAsync({
        name, photo_url: photoUrl || undefined, generation: parseInt(generation),
        nationality, club, league, zone, position: position as Position,
        position_secondaire: positionSecondaire || undefined,
        role: role || undefined,
        foot, current_level: level[0], potential: potential[0],
        general_opinion: 'À revoir', contract_end: contractEnd || undefined,
        date_of_birth: dateOfBirth || undefined,
        task: task || null,
        notes: notes || undefined, ts_report_published: tsPublished,
        ...(createAsArchived ? { is_archived: true } : {}),
      } as any);
      if (addReportFlag && result?.id) {
        await addReport.mutateAsync({ player_id: result.id, report_date: reportDate, opinion: reportOpinion, drive_link: driveLink || undefined });
      }
      // Save custom field values
      if (result?.id && Object.keys(customFieldValues).length > 0) {
        await bulkUpsertCF.mutateAsync(
          Object.entries(customFieldValues)
            .filter(([, v]) => v)
            .map(([cfId, v]) => ({ customFieldId: cfId, playerId: result.id, value: v }))
        );
      }
      // Fire TM enrichment in background (stores market_value, external_data, date_of_birth, agent, etc.)
      if (tmEnrichmentUrl && result?.id) {
        supabase.functions.invoke('enrich-player', {
          body: { playerName: name, club, playerId: result.id, tmUrl: tmEnrichmentUrl },
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['players'] });
          queryClient.invalidateQueries({ queryKey: ['player', result.id] });
        }).catch((e: any) => console.warn('[enrich] background enrich failed:', e));
      }
      toast({ title: t('player_form.player_added'), description: `${name} ${t('player_form.player_added_desc')}` });
      navigate(createAsArchived ? '/players?view=archived' : '/players');
    } catch {
      toast({ title: t('common.error'), description: t('player_form.error_create'), variant: 'destructive' });
    }
  };

  const getPotentialLabel = (val: number) => {
    const keys = Object.keys(POTENTIAL_SCALE).map(Number).sort((a, b) => b - a);
    for (const key of keys) { if (val >= key) return POTENTIAL_SCALE[key]; }
    return '';
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6">{t('player_form.add_title')}</h1>

      {/* Progress */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-colors ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 rounded transition-colors ${i < step ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      <p className="text-sm font-semibold text-primary mb-4">{STEPS[step]}</p>

      <Card className="border-none shadow-sm">
        <CardContent className="p-6 space-y-5">
          {step === 0 && (<>
            {/* Transfermarkt import */}
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{t('player_form.tm_import_title')}</span>
                {tmImported && <Badge variant="secondary" className="text-[10px] gap-1"><Check className="w-3 h-3" /> {t('player_form.tm_imported')}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{t('player_form.tm_import_desc')}</p>
              <div className="flex gap-2">
                <Input
                  value={tmUrl}
                  onChange={e => setTmUrl(e.target.value)}
                  placeholder="https://www.transfermarkt.fr/joueur/profil/spieler/123456"
                  className="flex-1 text-sm"
                  disabled={tmLoading}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTmImport(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleTmImport}
                  disabled={tmLoading || !tmUrl.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {tmLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {tmLoading ? t('player_form.tm_loading') : t('player_form.tm_import_btn')}
                </Button>
              </div>
            </div>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{t('player_form.or_manual')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div><Label>{t('player_form.name')} *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={t('player_form.name_placeholder')} className="mt-1" disabled={tmImported} /></div>
            <PhotoUpload currentUrl={photoUrl} onPhotoChange={setPhotoUrl} label={t('player_form.photo')} />
            <div><Label>{t('player_form.birth_year')} *</Label><Input type="number" min={1990} max={2010} value={generation} onChange={e => setGeneration(e.target.value)} className="mt-1" disabled={tmImported} /></div>
            <div><Label>{t('player_form.nationality')} *</Label>
              {tmImported ? (
                <Input value={nationalityOptions.find(o => o.value === nationality)?.label ?? nationality} disabled className="mt-1" />
              ) : (
                <SearchableSelect value={nationality} onValueChange={setNationality} options={nationalityOptions} placeholder={t('player_form.nationality_placeholder')} />
              )}
            </div>
          </>)}
          {step === 1 && (<>
            <div><Label>{t('player_form.club')}</Label>
              {tmImported ? (
                <Input value={club} disabled className="mt-1" />
              ) : (
                <SearchableSelect value={club} onValueChange={(v) => {
                  setClub(v);
                  const autoLeague = clubToLeague.get(v);
                  if (autoLeague) {
                    setLeague(autoLeague);
                  } else if (v) {
                    resolveClubLeague.mutate(v, {
                      onSuccess: (result) => {
                        if (result.league) setLeague(result.league);
                      },
                    });
                  }
                }} options={mergedClubs} placeholder={t('player_form.club_placeholder')} />
              )}
            </div>
            <div><Label>{t('player_form.league')}</Label>
              {tmImported ? (
                <Input value={league} disabled className="mt-1" />
              ) : (
                <SearchableSelect value={league} onValueChange={setLeague} options={mergedLeagues} placeholder={t('player_form.league_placeholder')} />
              )}
            </div>
            <div><Label>{t('player_form.zone')}</Label>
              <Select value={zone} onValueChange={setZone} disabled={tmImported}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('player_form.select_placeholder')} /></SelectTrigger>
                <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('player_form.position_main')} *</Label>
              <Select value={position} onValueChange={(v) => setPosition(v as Position)} disabled={tmImported}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('player_form.select_placeholder')} /></SelectTrigger>
                <SelectContent>{Object.entries(posLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('player_form.position_secondary')}</Label>
              <Select value={positionSecondaire} onValueChange={(v) => setPositionSecondaire(v as Position)} disabled={tmImported}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('player_form.position_none')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('player_form.position_none')}</SelectItem>
                  {Object.entries(posLabels).filter(([k]) => k !== position).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('player_form.role')}</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder={t('player_form.role_placeholder')} className="mt-1" /></div>
            <div><Label>{t('player_form.strong_foot')}</Label><div className="flex gap-3 mt-1">{(['Gaucher', 'Droitier', 'Ambidextre'] as Foot[]).map(f => (<Button key={f} type="button" variant={foot === f ? 'default' : 'outline'} size="sm" onClick={() => setFoot(f)} disabled={tmImported}>{f}</Button>))}</div></div>
            <div><Label>{t('player_form.contract_end')}</Label><Input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)} className="mt-1" disabled={tmImported && !!contractEnd} /></div>
          </>)}
          {step === 2 && (<>
            <div><Label>{t('player_form.current_level')} <span className="font-mono font-bold">{level[0]}</span>/10</Label><Slider value={level} onValueChange={setLevel} min={0} max={10} step={0.5} className="mt-3" /></div>
            <div><Label>{t('player_form.potential')} <span className="font-mono font-bold">{potential[0]}</span>/10</Label><Slider value={potential} onValueChange={setPotential} min={0} max={10} step={0.5} className="mt-3" /><p className="text-xs text-muted-foreground mt-2 italic">{getPotentialLabel(potential[0])}</p></div>
            <div><Label>{t('player_form.task')}</Label><div className="flex gap-3 mt-1">
              <Button type="button" variant={task === '' ? 'default' : 'outline'} size="sm" onClick={() => setTask('')}>{t('player_form.task_none')}</Button>
              {PLAYER_TASKS.map(tk => (<Button key={tk} type="button" variant={task === tk ? 'default' : 'outline'} size="sm" onClick={() => setTask(tk)}>{tk}</Button>))}
            </div></div>
          </>)}
          {step === 3 && (<>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={addReportFlag} onCheckedChange={(v) => setAddReportFlag(!!v)} /><span className="text-sm font-medium">{t('player_form.add_report')}</span></label>
            {addReportFlag && (
              <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                <div><Label>{t('player_form.report_date')}</Label><Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="mt-1" /></div>
                <div><Label>{t('player_form.report_opinion')}</Label><div className="flex gap-3 mt-1">{(['À suivre', 'À revoir', 'Défavorable'] as Opinion[]).map(o => (<Button key={o} type="button" variant={reportOpinion === o ? 'default' : 'outline'} size="sm" onClick={() => setReportOpinion(o)}>{o}</Button>))}</div></div>
                <div><Label>{t('player_form.drive_link')}</Label><Input value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder={t('player_form.drive_placeholder')} className="mt-1" /></div>
                <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={tsPublished} onCheckedChange={(v) => setTsPublished(!!v)} /><span className="text-sm">{t('player_form.ts_published')}</span></label>
              </div>
            )}
          </>)}
          {step === 4 && (<>
            <div><Label>{t('player_form.notes')}</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('player_form.notes_placeholder')} className="mt-1 min-h-[120px]" /></div>
            <div><Label>{t('player_form.video_url')}</Label><Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder={t('player_form.video_placeholder')} className="mt-1" /></div>
            <CustomFieldsForm values={customFieldValues} onChange={setCustomFieldValues} />
          </>)}
        </CardContent>
      </Card>

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={() => step === 0 ? navigate(-1) : setStep(step - 1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />{step === 0 ? t('common.cancel') : t('common.previous')}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>{t('common.next')}<ArrowRight className="w-4 h-4 ml-2" /></Button>
        ) : (
          <Button onClick={handleSave} disabled={upsertPlayer.isPending}>
            <Check className="w-4 h-4 mr-2" />{upsertPlayer.isPending ? t('common.saving') : t('common.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
