import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CustomFieldsForm } from '@/components/CustomFieldsDisplay';
import { useCustomFields, useCustomFieldValues, useBulkUpsertCustomFieldValues } from '@/hooks/use-custom-fields';
import { usePlayer, useUpsertPlayer } from '@/hooks/use-players';
import { parseScoutingNotes, serializeScoutingNotes } from '@/lib/scouting-notes';
import { LEAGUES, CLUBS, NATIONALITIES, ZONES, POTENTIAL_SCALE, PLAYER_TASKS, getTaskTranslationKey, getFootTranslationKey, resolveLeagueName, translateCountry, type Position, type Foot, type PlayerTask } from '@/types/player';
import { useMergedClubsAndLeagues, useResolveClubLeague } from '@/hooks/use-club-directory';
import { usePositions } from '@/hooks/use-positions';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    if (!search) return normalized.slice(0, 50);
    const s = search.toLowerCase();
    return normalized.filter(o => o.label.toLowerCase().includes(s)).slice(0, 50);
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
        <ScrollArea className="h-[200px]">
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

export default function EditPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { positions: posLabels } = usePositions();
  const { data: player, isLoading } = usePlayer(id);
  const upsertPlayer = useUpsertPlayer();
  const { data: customFields = [] } = useCustomFields();
  const { data: cfValues = [] } = useCustomFieldValues(id);
  const bulkUpsertCF = useBulkUpsertCustomFieldValues();
  const { clubs: mergedClubs, leagues: mergedLeagues, clubToLeague } = useMergedClubsAndLeagues(CLUBS, LEAGUES);
  const resolveClubLeague = useResolveClubLeague();
  const nationalityOptions = useMemo(() =>
    NATIONALITIES.map(n => ({ label: translateCountry(n, i18n.language), value: n }))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    [i18n.language]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
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
  const [task, setTask] = useState<PlayerTask | ''>('');
  const [notes, setNotes] = useState('');
  const [rawNotesJson, setRawNotesJson] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (player && !initialized) {
    setName(player.name);
    setPhotoUrl(player.photo_url ?? '');
    setGeneration(String(player.generation));
    setNationality(player.nationality);
    setClub(player.club);
    setLeague(resolveLeagueName(player.club, player.league));
    setZone(player.zone);
    setPosition(player.position);
    setPositionSecondaire((player.position_secondaire as Position) || '');
    setRole(player.role ?? '');
    setFoot(player.foot);
    setLevel([player.current_level]);
    setPotential([player.potential]);
    setContractEnd(player.contract_end ?? '');
    setTask((player.task as PlayerTask) ?? '');
    // Parse structured notes — only show personnelles in the textarea
    const parsed = parseScoutingNotes(player.notes);
    setNotes(parsed.personnelles);
    setRawNotesJson(player.notes ?? null);
    // Init custom field values
    const cfv: Record<string, string> = {};
    cfValues.forEach(v => { cfv[v.custom_field_id] = v.value ?? ''; });
    setCustomFieldValues(cfv);
    setInitialized(true);
  }

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">{t('common.loading')}</p></div>;

  if (!player) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <p className="text-xl font-semibold text-muted-foreground">{t('common.not_found')}</p>
      <Button asChild variant="outline" className="mt-4 rounded-xl">
        <Link to="/players"><ArrowLeft className="w-4 h-4 mr-2" />{t('common.back')}</Link>
      </Button>
    </div>
  );

  const getPotentialLabel = (val: number) => {
    const keys = Object.keys(POTENTIAL_SCALE).map(Number).sort((a, b) => b - a);
    for (const key of keys) { if (val >= key) return POTENTIAL_SCALE[key]; }
    return '';
  };

  const handleSave = async () => {
    try {
      // Preserve scouting zone notes, only update personnelles
      const existing = parseScoutingNotes(rawNotesJson);
      existing.personnelles = notes;
      const serializedNotes = serializeScoutingNotes(existing);

      await upsertPlayer.mutateAsync({
        id: player.id, name, photo_url: photoUrl || undefined, generation: parseInt(generation),
        nationality, club, league, zone, position: position as Position,
        position_secondaire: positionSecondaire || undefined, role: role || undefined,
        foot, current_level: level[0], potential: potential[0],
        general_opinion: player.general_opinion, contract_end: contractEnd || undefined,
        task: task || null,
        notes: serializedNotes || undefined, ts_report_published: player.ts_report_published,
      });
      // Save custom field values
      if (Object.keys(customFieldValues).length > 0) {
        await bulkUpsertCF.mutateAsync(
          Object.entries(customFieldValues)
            .filter(([, v]) => v !== undefined)
            .map(([cfId, v]) => ({ customFieldId: cfId, playerId: player.id, value: v || null }))
        );
      }
      toast({ title: t('player_form.player_saved'), description: `${name} ${t('player_form.player_saved_desc')}` });
      navigate(`/player/${id}`);
    } catch {
      toast({ title: t('common.error'), description: t('player_form.error_save'), variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm mb-6">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">{t('sidebar.dashboard')}</Link>
        <span className="text-muted-foreground">›</span>
        <Link to="/players" className="text-muted-foreground hover:text-foreground transition-colors">{t('profile.players_breadcrumb')}</Link>
        <span className="text-muted-foreground">›</span>
        <Link to={`/player/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">{player.name}</Link>
        <span className="text-muted-foreground">›</span>
        <span className="font-semibold">{t('common.edit')}</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-6">{t('player_form.edit_title', { name: player.name })}</h1>

      <div className="space-y-6">
        <Card className="border-none card-warm">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('player_form.basic_info_label')}</h2>
            <PhotoUpload currentUrl={photoUrl} onPhotoChange={setPhotoUrl} label={t('player_form.photo')} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t('player_form.name')}</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
              <div><Label>{t('player_form.birth_year')}</Label><Input type="number" min={1990} max={2010} value={generation} onChange={e => setGeneration(e.target.value)} className="mt-1" /></div>
              <div><Label>{t('player_form.nationality')}</Label>
                <SearchableSelect value={nationality} onValueChange={setNationality} options={nationalityOptions} placeholder={t('player_form.select_placeholder')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none card-warm">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('player_form.sport_info_label')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{t('player_form.club')}</Label>
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
              </div>
              <div><Label>{t('player_form.league')}</Label>
                <SearchableSelect value={league} onValueChange={setLeague} options={mergedLeagues} placeholder={t('player_form.select_placeholder')} />
              </div>
              <div><Label>{t('player_form.zone')}</Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t('player_form.position_main')}</Label>
                <Select value={position} onValueChange={(v) => setPosition(v as Position)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(posLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t('player_form.position_secondary')}</Label>
                <Select value={positionSecondaire} onValueChange={(v) => setPositionSecondaire(v === 'none' ? '' as any : v as Position)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={t('player_form.position_none')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('player_form.position_none')}</SelectItem>
                    {Object.entries(posLabels).filter(([k]) => k !== position).map(([k, v]) => <SelectItem key={k} value={k}>{v} ({k})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t('player_form.role')}</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder={t('player_form.role_placeholder')} className="mt-1" /></div>
              <div><Label>{t('player_form.strong_foot')}</Label><div className="flex gap-2 mt-1">{(['Gaucher', 'Droitier', 'Ambidextre'] as Foot[]).map(f => (<Button key={f} type="button" variant={foot === f ? 'default' : 'outline'} size="sm" onClick={() => setFoot(f)}>{t(getFootTranslationKey(f)!)}</Button>))}</div></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none card-warm">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('player_form.eval_label')}</h2>
            <div><Label>{t('player_form.current_level')} <span className="font-mono font-bold">{level[0]}</span>/10</Label><Slider value={level} onValueChange={setLevel} min={0} max={10} step={0.5} className="mt-3" /></div>
            <div><Label>{t('player_form.potential')} <span className="font-mono font-bold">{potential[0]}</span>/10</Label><Slider value={potential} onValueChange={setPotential} min={0} max={10} step={0.5} className="mt-3" /><p className="text-xs text-muted-foreground mt-2 italic">{getPotentialLabel(potential[0])}</p></div>
            <div><Label>{t('player_form.contract_end')}</Label><Input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)} className="mt-1" /></div>
            <div><Label>{t('player_form.task')}</Label><div className="flex gap-3 mt-1">
              <Button type="button" variant={task === '' ? 'default' : 'outline'} size="sm" onClick={() => setTask('')}>{t('player_form.task_none')}</Button>
              {PLAYER_TASKS.map(tk => (<Button key={tk} type="button" variant={task === tk ? 'default' : 'outline'} size="sm" onClick={() => setTask(tk)}>{t(getTaskTranslationKey(tk))}</Button>))}
            </div></div>
          </CardContent>
        </Card>

        <Card className="border-none card-warm">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('player_form.notes_label')}</h2>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('player_form.notes_placeholder')} className="min-h-[120px]" />
            <CustomFieldsForm values={customFieldValues} onChange={setCustomFieldValues} />
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" asChild className="rounded-xl"><Link to={`/player/${id}`}><ArrowLeft className="w-4 h-4 mr-2" />{t('common.cancel')}</Link></Button>
          <Button onClick={handleSave} className="rounded-xl" disabled={!name.trim() || upsertPlayer.isPending}>
            <Save className="w-4 h-4 mr-2" />{upsertPlayer.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
