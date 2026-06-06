import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChampionships, getAvailableSeasons } from '@/hooks/use-championships';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Search, ArrowRight, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChampionshipCalendar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: championships = [], isLoading } = useChampionships();
  const seasons = useMemo(() => getAvailableSeasons(6), []);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [season, setSeason] = useState<string>('current');

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return championships.slice(0, 12);
    return championships
      .filter(c => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, championships]);

  const selectedChamp = championships.find(c => c.name === selected) ?? null;

  function handleGo() {
    if (!selected) return;
    const params = new URLSearchParams({ search: selected, tab: 'calendar' });
    if (season && season !== 'current') params.set('season', season);
    navigate(`/championships?${params}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('champ_calendar.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('champ_calendar.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            {t('champ_calendar.select_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Championship search */}
          <div className="space-y-2">
            <Label>{t('champ_calendar.championship_label')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 rounded-xl"
                placeholder={t('champ_calendar.search_placeholder')}
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
              />
            </div>

            {/* Results grid */}
            {!isLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {results.map(c => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => { setSelected(c.name); setSearch(c.name); }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors',
                      selected === c.name
                        ? 'border-primary bg-primary/8 font-semibold text-primary'
                        : 'border-border/60 hover:bg-muted/60 text-foreground',
                    )}
                  >
                    <LeagueLogo league={c.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-xs">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.country}</p>
                    </div>
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="col-span-3 text-sm text-center text-muted-foreground py-4">
                    {t('champ_calendar.no_results')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Season selector */}
          <div className="space-y-2">
            <Label>{t('champ_calendar.season_label')}</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t('champ_calendar.season_current')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">{t('champ_calendar.season_current')}</SelectItem>
                {seasons.map(s => (
                  <SelectItem key={s.year} value={String(s.year)}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected summary */}
          {selectedChamp && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <LeagueLogo league={selectedChamp.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{selectedChamp.name}</p>
                <p className="text-xs text-muted-foreground">{selectedChamp.country} · {season !== 'current' ? seasons.find(s => String(s.year) === season)?.label : t('champ_calendar.season_current')}</p>
              </div>
            </div>
          )}

          {/* CTA */}
          <Button
            className="w-full rounded-xl gap-2"
            size="lg"
            disabled={!selected}
            onClick={handleGo}
          >
            <CalendarDays className="w-4 h-4" />
            {t('champ_calendar.go_btn')}
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
