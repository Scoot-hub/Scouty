import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Zap, Clock, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

// ── Lightweight tooltip wrapper — shows after 700ms hover (feels intentional) ──
function Tip({ label, children, side = 'top' }: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  if (!label) return <>{children}</>;
  return (
    <Tooltip delayDuration={700}>
      <TooltipTrigger asChild>{children as React.ReactElement}</TooltipTrigger>
      <TooltipContent side={side} className="text-xs max-w-[220px] text-center leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

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

function completionMissingList(player: Player, t: (k: string) => string): string {
  const ext = (player.external_data ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (!player.photo_url) missing.push(t('players.tip_missing_photo'));
  if (!player.date_of_birth) missing.push(t('players.tip_missing_dob'));
  if (!player.contract_end) missing.push(t('players.tip_missing_contract'));
  if (!(ext.market_value || player.market_value)) missing.push(t('players.tip_missing_value'));
  if (!ext.height) missing.push(t('players.tip_missing_height'));
  if (!ext.agent) missing.push(t('players.tip_missing_agent'));
  if (!player.notes?.trim()) missing.push(t('players.tip_missing_notes'));
  if (!player.general_opinion) missing.push(t('players.tip_missing_opinion'));
  if (!ext.performance_stats) missing.push(t('players.tip_missing_stats'));
  if (!(player.transfermarkt_id || ext.transfermarkt_id)) missing.push('Transfermarkt');
  if (missing.length === 0) return t('players.tip_completion_full');
  return `${t('players.tip_missing')} : ${missing.join(', ')}`;
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

function formatUpdatedAt(
  isoDate: string,
  dateFormat: DateFormat,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const d = new Date(isoDate);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 7) return t('common.days_ago', { count: days });
  return formatDate(d, dateFormat);
}

export interface PlayerCardProps {
  player: Player;
  viewMode: 'compact' | 'detailed';
  selected: boolean;
  /** True while this specific player's enrichment API call is in flight. */
  isEnriching?: boolean;
  hasOrg: boolean;
  /** Position in the visible list. Used to cap reveal animations to the first viewport. */
  index: number;
  onToggleSelect: (id: string) => void;
  onDismissNews: (id: string) => void;
}

function PlayerCardImpl({ player, viewMode, selected, isEnriching = false, hasOrg, index, onToggleSelect, onDismissNews }: PlayerCardProps) {
  const { t } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();
  const { currency, dateFormat, showPlayerPhotos, showPlayerClub, showPlayerLeague, showPlayerLevel, showPlayerPotential, showPlayerCompletion, animationsEnabled } = useUiPreferences();
  const rates = useRatesMap();

  const ext = (player.external_data ?? {}) as Record<string, unknown>;
  const completionPct = useMemo(() => computeCompletionPct(player), [player]);
  const perf = useMemo(
    () => viewMode === 'detailed' ? getPlayerPerfStats(player) : null,
    [player, viewMode],
  );
  const colorClass = completionColor(completionPct);

  // Tooltip labels derived once per render
  const tipNationality = player.nationality
    ? `${t('players.tip_nationality')} : ${player.nationality}`
    : '';
  const tipAge = player.date_of_birth
    ? `${t('players.tip_born')} : ${formatDate(new Date(player.date_of_birth), dateFormat)}`
    : `${t('players.tip_generation')} : ${player.generation}`;
  const tipPosition = player.position
    ? `${t('players.tip_position')} : ${posLabels[player.position] ?? player.position}`
    : '';
  const tipLevel = `${t('players.level')} : ${player.current_level > 0 ? `${player.current_level} / 10` : t('players.not_evaluated')}`;
  const tipPotential = `${t('players.potential')} : ${player.potential > 0 ? `${player.potential} / 10` : t('players.not_evaluated')}`;
  const tipClub = player.club ? `${t('players.tip_current_club')} : ${player.club}` : '';
  const tipContract = player.contract_end
    ? `${t('players.tip_contract_until')} : ${formatDate(new Date(player.contract_end), dateFormat)}`
    : t('players.tip_no_contract');
  const tipValue = (ext.market_value || player.market_value)
    ? `${t('players.tip_market_value')} : ${convertMV((ext.market_value as string) || player.market_value, currency, rates)}`
    : t('players.tip_no_value');
  const tipFoot = player.foot ? `${t('players.tip_foot')} : ${translateFoot(player.foot, t)}` : '';
  const tipHeight = ext.height ? `${t('players.tip_height')} : ${ext.height} cm` : '';
  const tipEnrich = player.external_data_fetched_at
    ? `${t('players.tip_last_sync')} : ${formatDate(new Date(player.external_data_fetched_at), dateFormat)}`
    : t('players.tip_not_synced');
  const tipUpdated = player.updated_at
    ? `${t('players.tip_last_modified')} : ${formatDate(new Date(player.updated_at), dateFormat)}`
    : '';
  const tipCompletion = completionMissingList(player, t);

  // Reveal animation only on the first viewport's worth of cards, and only if animations are enabled
  const animation = animationsEnabled && index < 24
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
      <Card className={`card-warm overflow-hidden hover:scale-[1.015] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group ${isEnriching ? 'ring-2 ring-primary/60 shadow-primary/10' : player.has_news ? 'ring-2 ring-amber-400 dark:ring-amber-500 shadow-amber-400/10' : ''}`}>
        {/* Enrichment overlay — shows while API call is in flight */}
        {isEnriching && (
          <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-[inherit]">
            {/* Shimmer sweep */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/8 to-transparent -translate-x-full animate-[enrich-shimmer_1.4s_ease-in-out_infinite]" />
            {/* Top progress bar */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20">
              <div className="h-full bg-primary animate-[enrich-bar_1.4s_ease-in-out_infinite]" />
            </div>
            {/* Spinning icon badge bottom-right */}
            <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <RefreshCw className="w-3 h-3 text-primary-foreground animate-spin" />
            </div>
          </div>
        )}
        <Link to={`/player/${player.id}`} className="block" onClick={() => player.has_news && onDismissNews(player.id)}>
          <div className="p-3 sm:p-4">
            {/* ── Header: avatar + name + club ── */}
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
              {showPlayerPhotos && <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="lg" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h3 className="font-bold text-sm sm:text-base truncate max-w-[140px] sm:max-w-none group-hover:text-primary transition-colors duration-200">{player.name}</h3>
                  {player.task && (
                    <Tip label={t(getTaskTranslationKey(player.task as PlayerTask))}>
                      <span className={`shrink-0 flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide ${getTaskBgClass(player.task as PlayerTask)}`}>
                        {getTaskEmoji(player.task as PlayerTask)} <span className="hidden sm:inline">{t(getTaskTranslationKey(player.task as PlayerTask))}</span>
                      </span>
                    </Tip>
                  )}
                  {player.has_news && (
                    <span className="shrink-0 relative flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide">
                      {animationsEnabled && <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping opacity-75" />}
                      <Sparkles className="w-3 h-3 relative" />
                      <span className="hidden sm:inline relative">{t('players.enriched_badge')}: {t(`players.news_${player.has_news}`)}</span>
                    </span>
                  )}
                </div>
                {(showPlayerClub || showPlayerLeague) && (
                <div className="flex items-center justify-between gap-1.5 mt-0.5 min-w-0">
                  {showPlayerClub && (
                    <Tip label={tipClub} side="bottom">
                      <span className="flex items-center gap-1.5 min-w-0 cursor-default">
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
                      </span>
                    </Tip>
                  )}
                  {showPlayerLeague && player.league ? (
                    <Tip label={`${t('players.tip_league')} : ${player.league}`} side="bottom">
                      <span className="text-[10px] text-muted-foreground/70 shrink-0 truncate max-w-[90px] text-right cursor-default">
                        {player.league}
                      </span>
                    </Tip>
                  ) : null}
                </div>
                )}
              </div>
            </div>

            {/* ── Flag + age + position + level/potential ── */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Tip label={tipNationality} side="bottom">
                <span className="cursor-default">
                  <FlagIcon nationality={player.nationality} size="sm" />
                </span>
              </Tip>
              <Tip label={tipAge} side="bottom">
                <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium cursor-default">
                  {getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}
                </span>
              </Tip>
              <Tip label={tipPosition} side="bottom">
                <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium cursor-default">
                  {posShort[player.position]}
                </span>
              </Tip>
              {(showPlayerLevel || showPlayerPotential) && (
                <div className="ml-auto flex items-center gap-1 text-sm font-bold font-mono">
                  {showPlayerLevel && (
                    <Tip label={tipLevel} side="top">
                      <span className={`cursor-default ${player.current_level > 0 ? '' : 'text-muted-foreground font-normal'}`}>
                        {player.current_level > 0 ? player.current_level : 'NA'}
                      </span>
                    </Tip>
                  )}
                  {showPlayerLevel && showPlayerPotential && <span className="text-muted-foreground font-normal text-xs">/</span>}
                  {showPlayerPotential && (
                    <Tip label={tipPotential} side="top">
                      <span className={`cursor-default ${player.potential > 0 ? 'text-primary' : 'text-muted-foreground font-normal'}`}>
                        {player.potential > 0 ? player.potential : 'NA'}
                      </span>
                    </Tip>
                  )}
                </div>
              )}
            </div>

            {/* ── Barres + enrichi/modifié sur la même ligne ── */}
            {/* Layout : [barre flex-1] [info fixe w-14] */}
            {(showPlayerLevel || showPlayerPotential || showPlayerCompletion) && (
            <div className="mt-1.5 space-y-0.5">
              {/* Barre niveau + date enrichissement */}
              {showPlayerLevel && (
                <div className="flex items-center gap-1.5">
                  <Tip label={tipLevel} side="left">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden cursor-default">
                      <div className="h-full rounded-full bg-primary/70 transition-all duration-700 ease-out group-hover:bg-primary" style={{ width: `${(player.current_level / 10) * 100}%` }} />
                    </div>
                  </Tip>
                  <Tip label={tipEnrich} side="top">
                    <span className="flex items-center gap-0.5 w-14 shrink-0 cursor-default">
                      <Zap className={`w-2.5 h-2.5 shrink-0 ${player.external_data_fetched_at ? 'text-sky-500' : 'text-muted-foreground/25'}`} />
                      <span className={`text-[9px] tabular-nums truncate ${player.external_data_fetched_at ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground/35'}`}>
                        {player.external_data_fetched_at ? formatEnrichDate(player.external_data_fetched_at, dateFormat, t) : '—'}
                      </span>
                    </span>
                  </Tip>
                </div>
              )}

              {/* Barre potentiel + date modification */}
              {showPlayerPotential && (
                <div className="flex items-center gap-1.5">
                  <Tip label={tipPotential} side="left">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden cursor-default">
                      <div className="h-full rounded-full bg-emerald-500/60 transition-all duration-700 ease-out delay-75 group-hover:bg-emerald-500" style={{ width: `${(player.potential / 10) * 100}%` }} />
                    </div>
                  </Tip>
                  <Tip label={tipUpdated} side="bottom">
                    <span className="flex items-center gap-0.5 w-14 shrink-0 cursor-default">
                      <Clock className="w-2.5 h-2.5 text-muted-foreground/35 shrink-0" />
                      <span className="text-[9px] text-muted-foreground/50 tabular-nums truncate">
                        {player.updated_at ? formatUpdatedAt(player.updated_at, dateFormat, t) : '—'}
                      </span>
                    </span>
                  </Tip>
                </div>
              )}

              {/* Barre complétion + % */}
              {showPlayerCompletion && (
                <Tip label={tipCompletion} side="right">
                  <div className="flex items-center gap-1.5 cursor-default">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ease-out delay-100 ${completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${completionPct}%` }} />
                    </div>
                    <span className={`text-[9px] font-bold tabular-nums rounded px-1 py-0.5 w-14 text-center shrink-0 ${colorClass}`}>{completionPct}%</span>
                  </div>
                </Tip>
              )}
            </div>
            )}

            {/* ── Detailed mode: stats grid ── */}
            {viewMode === 'detailed' && (
              <>
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/30">
                  <Tip label={tipFoot} side="top">
                    <div className="rounded-lg bg-muted/50 py-2 px-1 text-center cursor-default">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.foot')}</p>
                      <p className="text-xs font-semibold">{translateFoot(player.foot, t)}</p>
                    </div>
                  </Tip>
                  <Tip label={tipHeight} side="top">
                    <div className="rounded-lg bg-muted/50 py-2 px-1 text-center cursor-default">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.height')}</p>
                      <p className="text-xs font-semibold">{(ext.height as string) || '—'}</p>
                    </div>
                  </Tip>
                  <Tip label={tipValue} side="top">
                    <div className="rounded-lg bg-muted/50 py-2 px-1 text-center cursor-default">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.value')}</p>
                      <p className="text-xs font-semibold truncate">{convertMV((ext.market_value as string) || player.market_value, currency, rates)}</p>
                    </div>
                  </Tip>
                  <Tip label={tipContract} side="top">
                    <div className={`rounded-lg py-2 px-1 text-center cursor-default ${ext.on_loan ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-muted/50'}`}>
                      <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.contract')}</p>
                      <p className={`text-xs font-semibold ${player.contract_end && (new Date(player.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 180 ? 'text-destructive' : ''}`}>
                        {formatDateShort(player.contract_end, dateFormat)}
                      </p>
                      {ext.on_loan ? (
                        <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{t('profile.on_loan_short')}</p>
                      ) : null}
                    </div>
                  </Tip>
                </div>
                {perf && (perf.rating != null || perf.goals != null) ? (() => {
                  const ratingColor = (perf.rating ?? 0) >= 7.5 ? 'text-emerald-600 dark:text-emerald-400' : (perf.rating ?? 0) >= 7.0 ? 'text-blue-600 dark:text-blue-400' : (perf.rating ?? 0) >= 6.5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
                  return (
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      <Tip label={t('players.tip_stat_rating')} side="top">
                        <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center cursor-default">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Rating</p>
                          <p className={`text-xs font-bold ${ratingColor}`}>{perf.rating != null ? perf.rating.toFixed(1) : '—'}</p>
                        </div>
                      </Tip>
                      <Tip label={t('players.tip_stat_goals')} side="top">
                        <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center cursor-default">
                          <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_goals')}</p>
                          <p className="text-xs font-bold">{perf.goals ?? '—'}</p>
                        </div>
                      </Tip>
                      <Tip label={t('players.tip_stat_assists')} side="top">
                        <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center cursor-default">
                          <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_assists')}</p>
                          <p className="text-xs font-bold">{perf.assists ?? '—'}</p>
                        </div>
                      </Tip>
                      <Tip label={t('players.tip_stat_apps')} side="top">
                        <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center cursor-default">
                          <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_apps')}</p>
                          <p className="text-xs font-bold">{perf.appearances ?? '—'}</p>
                        </div>
                      </Tip>
                      <Tip label={t('players.tip_stat_minutes')} side="top">
                        <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center cursor-default">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Min.</p>
                          <p className="text-xs font-bold">{perf.minutes != null ? (perf.minutes > 999 ? `${(perf.minutes / 1000).toFixed(1)}k` : perf.minutes) : '—'}</p>
                        </div>
                      </Tip>
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

export const PlayerCard = memo(PlayerCardImpl);
