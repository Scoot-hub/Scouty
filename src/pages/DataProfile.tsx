import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crosshair, Loader2, ArrowLeft, X, Sliders, Trophy, Settings2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_PROFILES, scoreAgainstTemplate, type RoleResult } from '@/lib/wyscout-analysis';
import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';
import { StatPickerDialog } from '@/components/wyscout/StatPickerDialog';
import {
  POSITION_GROUPS, POSITION_LABELS, percentileColor, useMetricLabel, API_BASE,
} from '@/lib/wyscout-metrics';

const MINUTES_OPTIONS = [0, 300, 600, 900, 1200, 1500];

function useSeasons() {
  return useQuery<{ seasons: { season: string; count: number }[] }>({
    queryKey: ['wyscout-seasons'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/seasons`, { credentials: 'include' });
      if (!res.ok) return { seasons: [] };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

function SeasonSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data } = useSeasons();
  return (
    <Select value={value || '__all__'} onValueChange={v => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__" className="text-xs">{t('data.all_seasons', 'Toutes saisons')}</SelectItem>
        {(data?.seasons ?? []).map(s => <SelectItem key={s.season} value={s.season} className="text-xs">{s.season}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function PlayerCell({ id, name, position, club }: { id: string; name: string; position: string | null; club: string | null }) {
  return (
    <Link to={`/data/player/${id}`} className="flex items-center gap-2 min-w-0 hover:underline">
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[180px]">{name}</p>
        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{POSITION_LABELS[position || ''] || position || '—'} · {club || '—'}</p>
      </div>
    </Link>
  );
}

// ── Role Ranks tab ────────────────────────────────────────────────────────
function RoleRanksTab() {
  const { t } = useTranslation();
  const { label: mLabel } = useMetricLabel();
  const [roleKey, setRoleKey] = useState(ROLE_PROFILES[0].key);
  const [minMinutes, setMinMinutes] = useState(900);
  const [season, setSeason] = useState('');

  const role = useMemo(() => ROLE_PROFILES.find(r => r.key === roleKey) || ROLE_PROFILES[0], [roleKey]);
  const positions = role.positions.join(',');
  const roleLabel = (k: string, fb: string) => t(`data_roles.${k}.label`, { defaultValue: fb });
  const roleDesc = t(`data_roles.${role.key}.desc`, { defaultValue: '' });

  const { data, isFetching } = useQuery<{ rows: WyscoutStatRow[] }>({
    queryKey: ['wyscout-cohort-role', positions, minMinutes, season],
    queryFn: async () => {
      const params = new URLSearchParams({ positions, minMinutes: String(minMinutes), limit: '4000' });
      if (season) params.set('season', season);
      const res = await fetch(`${API_BASE}/wyscout/cohort?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('cohort failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const ranked = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows
      .map(r => ({ r, res: scoreAgainstTemplate(r as WyscoutStatRow, role) }))
      .filter((x): x is { r: WyscoutStatRow & Record<string, unknown>; res: RoleResult } => x.res !== null)
      .sort((a, b) => b.res.score - a.res.score)
      .slice(0, 40);
  }, [data, role]);

  // Criteria of this role (translated), for the explanation
  const criteria = role.template.map(s => s.db as string);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.role', 'Rôle')}</label>
          <Select value={roleKey} onValueChange={setRoleKey}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_PROFILES.map(r => (
                <SelectItem key={r.key} value={r.key} className="text-xs">
                  {roleLabel(r.key, r.label)} <span className="text-muted-foreground">· {r.positions.map(p => POSITION_LABELS[p] || p).join('/')}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.season', 'Saison')}</label>
          <SeasonSelect value={season} onChange={setSeason} />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.min_minutes', 'Minutes min')}</label>
          <Select value={String(minMinutes)} onValueChange={v => setMinMinutes(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MINUTES_OPTIONS.map(m => <SelectItem key={m} value={String(m)} className="text-xs">≥ {m}'</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Role explanation */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{roleLabel(role.key, role.label)}</p>
            {roleDesc && <p className="text-xs text-muted-foreground mt-0.5">{roleDesc}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {criteria.map(db => (
            <Badge key={db} variant="secondary" className="text-[9px] font-normal">{mLabel(db)}</Badge>
          ))}
        </div>
      </div>

      {isFetching ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">{t('data.no_results', 'Aucun joueur ne correspond.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                <th className="text-left px-3 py-2 font-semibold">{t('data.player', 'Joueur')}</th>
                <th className="text-left px-2 py-2 font-semibold">{t('data.season', 'Saison')}</th>
                <th className="text-left px-3 py-2 font-semibold w-40">{t('data.fit', 'Adéquation')}</th>
                <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">{t('data.signature', 'Points forts')}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ r, res }, i) => {
                const rec = r as Record<string, unknown>;
                return (
                  <tr key={rec.player_id as string} className="border-t border-border/30 hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2"><PlayerCell id={rec.player_id as string} name={rec.name as string} position={rec.player_position as string} club={rec.club as string} /></td>
                    <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{(rec.season as string) || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full', res.score >= 80 ? 'bg-emerald-500' : res.score >= 65 ? 'bg-lime-500' : res.score >= 50 ? 'bg-amber-500' : 'bg-orange-500')} style={{ width: `${res.score}%` }} />
                        </div>
                        <span className="font-semibold tabular-nums w-8">{res.score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {res.signature.slice(0, 3).map(s => (
                          <Badge key={s.db as string} variant="secondary" className="text-[9px] font-normal">{mLabel(s.db as string)}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Custom role (weighted) tab ────────────────────────────────────────────
interface RankResult {
  player_id: string; name: string; position: string | null; club: string | null;
  league: string | null; age: number | null; minutes_played: number | null; season?: string | null;
  fit: number; percentiles: Record<string, number | null>;
}

const DEFAULT_CUSTOM = ['goals_per90', 'xg_per90', 'key_passes_per90'];

function CustomRoleTab() {
  const { t } = useTranslation();
  const { label: mLabel } = useMetricLabel();
  const [group, setGroup] = useState('ATT');
  const [minMinutes, setMinMinutes] = useState(900);
  const [season, setSeason] = useState('');
  const [metrics, setMetrics] = useState<string[]>(DEFAULT_CUSTOM);
  const [weights, setWeights] = useState<Record<string, number>>({ goals_per90: 2, xg_per90: 1, key_passes_per90: 1 });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [run, setRun] = useState(0);

  const onPick = (stats: string[]) => {
    setMetrics(stats);
    setWeights(w => {
      const next: Record<string, number> = {};
      for (const m of stats) next[m] = w[m] ?? 1;
      return next;
    });
  };

  const activeMetrics = useMemo(() => metrics.filter(m => (weights[m] ?? 0) !== 0), [metrics, weights]);

  const body = useMemo(() => ({
    group, minMinutes, season: season || undefined,
    weights: Object.fromEntries(activeMetrics.map(m => [m, weights[m]])),
    limit: 30,
  }), [group, minMinutes, season, activeMetrics, weights]);

  const { data, isFetching } = useQuery<{ cohortSize: number; results: RankResult[] }>({
    queryKey: ['wyscout-profile-rank', JSON.stringify(body), run],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/profile-rank`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('rank failed');
      return res.json();
    },
    enabled: activeMetrics.length > 0,
    staleTime: 60 * 1000,
  });

  const results = data?.results ?? [];

  return (
    <div className="space-y-3">
      {/* Explanation */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          {t('data.custom_explain', 'Créez votre propre rôle : choisissez des critères et leur importance. Chaque stat est standardisée par poste (z-score), puis la base est classée. Un poids négatif pénalise (ex. fautes).')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.position', 'Poste')}</label>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{POSITION_GROUPS.map(g => <SelectItem key={g.key} value={g.key} className="text-xs">{g.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.season', 'Saison')}</label>
          <SeasonSelect value={season} onChange={setSeason} />
        </div>
        <div>
          <label className="text-[10px] uppercase text-muted-foreground">{t('data.min_minutes', 'Minutes min')}</label>
          <Select value={String(minMinutes)} onValueChange={v => setMinMinutes(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MINUTES_OPTIONS.map(m => <SelectItem key={m} value={String(m)} className="text-xs">≥ {m}'</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={() => setRun(x => x + 1)} disabled={activeMetrics.length === 0}>
            <Sliders className="w-3.5 h-3.5" /> {t('data.rank', 'Classer')}
          </Button>
        </div>
      </div>

      {/* Criteria + weights */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">{t('data.weights', 'Critères pondérés')} ({metrics.length})</span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => setPickerOpen(true)}>
            <Settings2 className="w-3 h-3" /> {t('data.choose_stats', 'Choisir les critères')}
          </Button>
        </div>
        {metrics.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">{t('data.add_weights', 'Ajoutez au moins un critère.')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {metrics.map(m => (
              <div key={m} className="flex items-center gap-2 px-2 py-1 rounded border border-border/60 bg-card">
                <span className="text-[11px] flex-1 truncate" title={mLabel(m)}>{mLabel(m)}</span>
                <input type="range" min={-3} max={3} step={1} value={weights[m] ?? 1}
                  onChange={e => setWeights(w => ({ ...w, [m]: Number(e.target.value) }))} className="w-24 accent-violet-500" />
                <span className={cn('text-xs font-semibold tabular-nums w-6 text-center', (weights[m] ?? 1) < 0 ? 'text-red-500' : (weights[m] ?? 1) > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                  {(weights[m] ?? 1) > 0 ? `+${weights[m] ?? 1}` : (weights[m] ?? 1)}
                </span>
                <button onClick={() => onPick(metrics.filter(x => x !== m))} className="w-6 h-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {activeMetrics.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t('data.add_weights', 'Ajoutez au moins un critère pondéré.')}</p>
      ) : isFetching ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t('data.no_results', 'Aucun résultat.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                <th className="text-left px-3 py-2 font-semibold">{t('data.player', 'Joueur')}</th>
                <th className="text-center px-2 py-2 font-semibold">{t('data.age', 'Âge')}</th>
                <th className="text-left px-3 py-2 font-semibold w-32">{t('data.fit', 'Adéquation')}</th>
                {activeMetrics.map(m => <th key={m} className="text-center px-2 py-2 font-semibold"><span className="truncate inline-block max-w-[80px]">{mLabel(m)}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.player_id} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2"><PlayerCell id={r.player_id} name={r.name} position={r.position} club={r.club} /></td>
                  <td className="text-center px-2 py-2 tabular-nums">{r.age ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full', percentileColor(r.fit))} style={{ width: `${r.fit}%` }} />
                      </div>
                      <span className="font-semibold tabular-nums w-7">{r.fit}</span>
                    </div>
                  </td>
                  {activeMetrics.map(m => {
                    const pct = r.percentiles?.[m];
                    return (
                      <td key={m} className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full', percentileColor(pct))} style={{ width: pct == null ? '0%' : `${pct}%` }} />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground w-5">{pct ?? '—'}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StatPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} selected={metrics} onChange={onPick} title={t('data.choose_criteria', 'Choisir les critères du rôle')} />
    </div>
  );
}

export default function DataProfile() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'roles' | 'custom'>('roles');

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/data"><ArrowLeft className="w-4 h-4" /> {t('data.back_hub', 'Data')}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Crosshair className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{t('data.profile_title', 'Profils & rôles')}</h1>
            <p className="text-xs text-muted-foreground">{t('data.profile_subtitle', 'Classez la base par rôle ou par vos propres critères.')}</p>
          </div>
        </div>
      </div>

      <Card className="card-warm">
        <CardHeader className="pb-2">
          <Tabs value={tab} onValueChange={v => setTab(v as 'roles' | 'custom')}>
            <TabsList className="h-8">
              <TabsTrigger value="roles" className="text-xs gap-1.5 h-7"><Trophy className="w-3 h-3" /> {t('data.tab_roles', 'Rôles prédéfinis')}</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs gap-1.5 h-7"><Sliders className="w-3 h-3" /> {t('data.tab_custom', 'Rôle personnalisé')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {tab === 'roles' ? <RoleRanksTab /> : <CustomRoleTab />}
        </CardContent>
      </Card>
    </div>
  );
}
