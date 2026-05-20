import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { FlagIcon } from '@/components/ui/flag-icon';
import { ShareWithOrgPopover } from '@/components/ShareWithOrgPopover';
import { usePositions } from '@/hooks/use-positions';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useRatesMap } from '@/hooks/use-exchange-rates';
import { convertMV, formatDate, formatDateShort, type DateFormat } from '@/lib/format-utils';
import { getPlayerAge, getTaskBgClass, getTaskEmoji, getTaskTranslationKey, translateFoot, type PlayerTask, type Player } from '@/types/player';
import { getPlayerPerfStats } from '@/lib/player-stats';

function computeCompletionPct(player: Player): number {
  const ext = (player.external_data ?? {}) as Record<string, unknown>;
  const checks = [
    !!player.photo_url,
    !!player.date_of_birth,
    !!player.contract_end,
    !!(ext.market_value || player.market_value),
    !!ext.height,
    !!ext.agent,
    !!(player.notes?.trim()),
    !!player.general_opinion,
    !!ext.performance_stats,
    !!(player.transfermarkt_id || ext.transfermarkt_id),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function completionColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400';
  if (pct >= 50) return 'text-amber-600 bg-amber-500/10 dark:text-amber-400';
  return 'text-rose-600 bg-rose-500/10 dark:text-rose-400';
}

function formatEnrichDate(
  isoDate: string,
  dateFormat: DateFormat,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const d = new Date(isoDate);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 30) return t('common.days_ago', { count: days });
  return formatDate(d, dateFormat);
}

export interface PlayerCardProps {
  player: Player;
  viewMode: 'compact' | 'detailed';
  selected: boolean;
  hasOrg: boolean;
  /** Position in the visible list. Used to cap reveal animations to the first viewport. */
  index: number;
  onToggleSelect: (id: string) => void;
  onDismissNews: (id: string) => void;
}

function PlayerCardImpl({ player, viewMode, selected, hasOrg, index, onToggleSelect, onDismissNews }: PlayerCardProps) {
  const { t } = useTranslation();
  const { positionShort: posShort } = usePositions();
  const { currency, dateFormat } = useUiPreferences();
  const rates = useRatesMap();

  const ext = (player.external_data ?? {}) as Record<string, unknown>;
  // Memoize per-player derived data — recomputed only when the player object changes.
  const completionPct = useMemo(() => computeCompletionPct(player), [player]);
  const perf = useMemo(
    () => viewMode === 'detailed' ? getPlayerPerfStats(player) : null,
    [player, viewMode],
  );
  const colorClass = completionColor(completionPct);

  // Reveal animation only on the first viewport's worth of cards to keep paint cost manageable.
  const animation = index < 24
    ? { animation: 'reveal-scale 0.35s ease both', animationDelay: `${(index % 6) * 55}ms` }
    : undefined;

  return (
    <div className="relative" style={animation}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {hasOrg && (
          <div className="relative">
            <ShareWithOrgPopover playerId={player.id} compact />
          </div>
        )}
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(player.id)} />
      </div>
      <Card className={`card-warm overflow-hidden hover:scale-[1.015] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group ${player.has_news ? 'ring-2 ring-amber-400 dark:ring-amber-500 shadow-amber-400/10' : ''}`}>
        <Link to={`/player/${player.id}`} className="block" onClick={() => player.has_news && onDismissNews(player.id)}>
          <div className="p-3 sm:p-4">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
              <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h3 className="font-bold text-sm sm:text-base truncate max-w-[140px] sm:max-w-none group-hover:text-primary transition-colors duration-200">{player.name}</h3>
                  {player.task && (
                    <span className={`shrink-0 flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide ${getTaskBgClass(player.task as PlayerTask)}`}>
                      {getTaskEmoji(player.task as PlayerTask)} <span className="hidden sm:inline">{t(getTaskTranslationKey(player.task as PlayerTask))}</span>
                    </span>
                  )}
                  {player.has_news && (
                    <span className="shrink-0 relative flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide">
                      <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping opacity-75" />
                      <Sparkles className="w-3 h-3 relative" />
                      <span className="hidden sm:inline relative">{t('players.new_badge')}: {t(`players.news_${player.has_news}`)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <ClubBadge club={player.club} size="sm" />
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm text-muted-foreground block truncate">{player.club}</span>
                    {ext.on_loan && ext.parent_club ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t('profile.on_loan')}</span>
                        <ClubBadge club={ext.parent_club as string} size="xs" />
                        <span className="text-[10px] text-muted-foreground truncate">{ext.parent_club as string}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <FlagIcon nationality={player.nationality} size="sm" />
              <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium">{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
              <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium">{posShort[player.position]}</span>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2 text-sm font-bold font-mono">
                <span title={t('players.level')} className={player.current_level > 0 ? '' : 'text-muted-foreground font-normal'}>
                  {player.current_level > 0 ? player.current_level : 'NA'}
                </span>
                <span className="text-muted-foreground font-normal">/</span>
                <span className={player.potential > 0 ? 'text-primary' : 'text-muted-foreground font-normal'} title={t('players.potential')}>
                  {player.potential > 0 ? player.potential : 'NA'}
                </span>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-[34px] shrink-0">{t('players.level')}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-all duration-700 ease-out group-hover:bg-primary"
                    style={{ width: `${(player.current_level / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground w-[34px] shrink-0">{t('players.potential')}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/60 transition-all duration-700 ease-out delay-75 group-hover:bg-emerald-500"
                    style={{ width: `${(player.potential / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] text-muted-foreground w-[34px] shrink-0">{t('players.completion')}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out delay-100 ${completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <span className={`text-[9px] font-bold tabular-nums rounded px-1 py-0.5 shrink-0 ${colorClass}`}>{completionPct}%</span>
              </div>
              {player.external_data_fetched_at ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Zap className="w-2.5 h-2.5 text-sky-500 shrink-0" />
                  <span className="text-[9px] text-sky-600 dark:text-sky-400">
                    {t('players.enriched_on', { date: formatEnrichDate(player.external_data_fetched_at, dateFormat, t) })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-0.5">
                  <Zap className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                  <span className="text-[9px] text-muted-foreground/50">{t('players.not_enriched')}</span>
                </div>
              )}
            </div>
            {viewMode === 'detailed' && (
              <>
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/30">
                  <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.foot')}</p>
                    <p className="text-xs font-semibold">{translateFoot(player.foot, t)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.height')}</p>
                    <p className="text-xs font-semibold">{(ext.height as string) || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.value')}</p>
                    <p className="text-xs font-semibold truncate">{convertMV((ext.market_value as string) || player.market_value, currency, rates)}</p>
                  </div>
                  <div className={`rounded-lg py-2 px-1 text-center ${ext.on_loan ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-muted/50'}`}>
                    <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.contract')}</p>
                    <p className={`text-xs font-semibold ${player.contract_end && (new Date(player.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 180 ? 'text-destructive' : ''}`}>
                      {formatDateShort(player.contract_end, dateFormat)}
                    </p>
                    {ext.on_loan ? (
                      <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{t('profile.on_loan_short')}</p>
                    ) : null}
                  </div>
                </div>
                {perf && (perf.rating != null || perf.goals != null) ? (() => {
                  const ratingColor = (perf.rating ?? 0) >= 7.5 ? 'text-emerald-600 dark:text-emerald-400' : (perf.rating ?? 0) >= 7.0 ? 'text-blue-600 dark:text-blue-400' : (perf.rating ?? 0) >= 6.5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
                  return (
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                        <p className="text-[9px] text-muted-foreground mb-0.5">Rating</p>
                        <p className={`text-xs font-bold ${ratingColor}`}>{perf.rating != null ? perf.rating.toFixed(1) : '—'}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                        <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_goals')}</p>
                        <p className="text-xs font-bold">{perf.goals ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                        <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_assists')}</p>
                        <p className="text-xs font-bold">{perf.assists ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                        <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_apps')}</p>
                        <p className="text-xs font-bold">{perf.appearances ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                        <p className="text-[9px] text-muted-foreground mb-0.5">Min.</p>
                        <p className="text-xs font-bold">{perf.minutes != null ? (perf.minutes > 999 ? `${(perf.minutes / 1000).toFixed(1)}k` : perf.minutes) : '—'}</p>
                      </div>
                    </div>
                  );
                })() : null}
              </>
            )}
          </div>
        </Link>
      </Card>
    </div>
  );
}

// React.memo with default shallow comparison: parent passes stable callbacks
// (useCallback) and a player ref that only changes when the row actually changes,
// so a search-bar keystroke or a sibling card's selection toggle no longer forces
// every card in the grid to re-render.
export const PlayerCard = memo(PlayerCardImpl);
