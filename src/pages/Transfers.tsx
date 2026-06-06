import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useRecentTransfers, usePlayerTransferHistory, useSyncTransfers,
  type RecentTransfer, type TransferHistoryItem,
} from '@/hooks/use-transfers';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { FlagIcon } from '@/components/ui/flag-icon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeftRight, ArrowRight, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Small club chip — uses the logo URL Transfermarkt already gave us, so we don't
// trigger ClubBadge's rate-limited per-club resolution queue.
function ClubChip({ name, logo }: { name: string | null; logo: string | null }) {
  const { t } = useTranslation();
  if (!name) return <span className="text-sm text-muted-foreground">{t('transfers.unknown_club')}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={name}>
      {logo
        ? <img src={logo} alt="" loading="lazy" className="w-5 h-5 object-contain shrink-0" />
        : <span className="w-5 h-5 shrink-0 rounded bg-muted" />}
      <span className="truncate text-sm font-medium">{name}</span>
    </span>
  );
}

function FeeLabel({ fee }: { fee: string | null }) {
  const value = fee && fee !== '-' ? fee : null;
  const isPaid = !!value && /[€$£]|mio|m\b|K\b/i.test(value);
  return (
    <span className={isPaid
      ? 'text-sm font-bold text-emerald-600 dark:text-emerald-400'
      : 'text-sm font-medium text-muted-foreground'}>
      {value ?? '—'}
    </span>
  );
}

// ── Live global feed row ("Tous" tab) ────────────────────────────────────────
function FeedRow({ transfer, tmOrigin }: { transfer: RecentTransfer; tmOrigin: string }) {
  const { t } = useTranslation();
  const nameNode = transfer.matchedPlayerId ? (
    <Link to={`/player/${transfer.matchedPlayerId}`} className="font-bold hover:text-primary transition-colors truncate">
      {transfer.playerName}
    </Link>
  ) : (
    <a href={`${tmOrigin}${transfer.playerSlug}`} target="_blank" rel="noopener noreferrer"
       className="font-bold hover:text-primary transition-colors truncate inline-flex items-center gap-1">
      {transfer.playerName}
      <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
    </a>
  );
  return (
    <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0 sm:w-[42%]">
          <PlayerAvatar name={transfer.playerName} photoUrl={transfer.playerPhoto ?? undefined} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {nameNode}
              {transfer.matchedPlayerId && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {t('transfers.tracked')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
              {transfer.nationality && <FlagIcon nationality={transfer.nationality} size="sm" />}
              {transfer.position && <span className="truncate">{transfer.position}</span>}
              {transfer.age != null && <span>· {t('transfers.years', { count: transfer.age })}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="min-w-0 flex-1"><ClubChip name={transfer.from?.name ?? null} logo={transfer.from?.logo ?? null} /></div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1"><ClubChip name={transfer.to?.name ?? null} logo={transfer.to?.logo ?? null} /></div>
        </div>
        <div className="shrink-0 text-right"><FeeLabel fee={transfer.fee} /></div>
      </div>
    </Card>
  );
}

function FeedList({ transfers, tmOrigin, emptyLabel }: { transfers: RecentTransfer[]; tmOrigin: string; emptyLabel: string }) {
  if (transfers.length === 0) {
    return <div className="text-center py-16"><p className="text-4xl mb-3">🔁</p><p className="text-sm text-muted-foreground">{emptyLabel}</p></div>;
  }
  return (
    <div className="space-y-2">
      {transfers.map((t, i) => <FeedRow key={`${t.tmPlayerId}-${t.transferId ?? i}`} transfer={t} tmOrigin={tmOrigin} />)}
    </div>
  );
}

// ── Persisted dated history row ("Mes joueurs" tab) ───────────────────────────
function HistoryRow({ item, locale }: { item: TransferHistoryItem; locale: string }) {
  const { t } = useTranslation();
  const dateLabel = useMemo(() => {
    if (!item.date) return null;
    try {
      const d = new Date(`${item.date}T00:00:00`);
      const s = d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
      return item.dateAccurate ? s : `≈ ${s}`;
    } catch { return item.date; }
  }, [item.date, item.dateAccurate, locale]);

  return (
    <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Date */}
        <div className="shrink-0 sm:w-[120px]">
          <div className="text-sm font-semibold" title={item.dateAccurate ? undefined : t('transfers.approx_date')}>
            {dateLabel ?? '—'}
          </div>
          {item.season && <div className="text-xs text-muted-foreground">{item.season}</div>}
        </div>
        {/* Player */}
        <div className="flex items-center gap-3 min-w-0 sm:w-[34%]">
          <PlayerAvatar name={item.playerName} photoUrl={item.playerPhoto ?? undefined} size="sm" />
          <div className="min-w-0">
            <Link to={`/player/${item.playerId}`} className="font-bold hover:text-primary transition-colors truncate block">
              {item.playerName}
            </Link>
            {item.upcoming && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {t('transfers.upcoming')}
              </span>
            )}
          </div>
        </div>
        {/* From → To */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="min-w-0 flex-1"><ClubChip name={item.fromClub} logo={item.fromClubLogo} /></div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1"><ClubChip name={item.toClub} logo={item.toClubLogo} /></div>
        </div>
        {/* Fee */}
        <div className="shrink-0 text-right"><FeeLabel fee={item.fee} /></div>
      </div>
    </Card>
  );
}

interface HistoryGroup { label: string; items: TransferHistoryItem[]; }

function HistoryList({ items, locale }: { items: TransferHistoryItem[]; locale: string }) {
  const { t } = useTranslation();
  // Server already sorts upcoming-first then date desc. Bucket into "upcoming"
  // then per calendar year so the user can scroll back through time.
  const groups = useMemo<HistoryGroup[]>(() => {
    const out: HistoryGroup[] = [];
    let cur: HistoryGroup | null = null;
    for (const it of items) {
      const label = it.upcoming
        ? t('transfers.upcoming_group')
        : (it.date ? it.date.slice(0, 4) : t('transfers.undated_group'));
      if (!cur || cur.label !== label) { cur = { label, items: [] }; out.push(cur); }
      cur.items.push(it);
    }
    return out;
  }, [items, t]);

  if (items.length === 0) return null;
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label} className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">{g.label}</h3>
          {g.items.map((it) => <HistoryRow key={`${it.playerId}-${it.tmTransferId}`} item={it} locale={locale} />)}
        </div>
      ))}
    </div>
  );
}

export default function Transfers() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';

  const feed = useRecentTransfers();
  const history = usePlayerTransferHistory();
  const sync = useSyncTransfers();

  const feedTransfers = useMemo(() => feed.data?.transfers ?? [], [feed.data?.transfers]);
  const historyItems = useMemo(() => history.data?.transfers ?? [], [history.data?.transfers]);

  const tmOrigin = useMemo(() => {
    try { return feed.data?.tmUrl ? new URL(feed.data.tmUrl).origin : 'https://www.transfermarkt.fr'; }
    catch { return 'https://www.transfermarkt.fr'; }
  }, [feed.data?.tmUrl]);

  // Auto-sync once per mount when the base is empty or stale (>24h) and the user
  // has players with a Transfermarkt id to sync.
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (autoTriggered.current || !history.data) return;
    const { playersWithTm, lastSyncedAt } = history.data;
    if (!playersWithTm) return;
    const stale = !lastSyncedAt || (Date.now() - new Date(lastSyncedAt).getTime() > 24 * 60 * 60 * 1000);
    if (stale && !sync.isPending) {
      autoTriggered.current = true;
      sync.mutate();
    }
  }, [history.data, sync]);

  const runSync = () => {
    sync.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(t('transfers.sync_done', { n: r.transfers, players: r.playersSynced }));
        if (r.capped) toast.info(t('transfers.sync_capped', { n: r.playersSynced }));
      },
      onError: () => toast.error(t('transfers.sync_error')),
    });
  };

  const syncing = sync.isPending;
  const noTmPlayers = !!history.data && history.data.playersWithTm === 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('transfers.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('transfers.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={runSync} disabled={syncing || noTmPlayers}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-1.5">{syncing ? t('transfers.syncing') : t('transfers.sync')}</span>
          </Button>
          <a href={tmOrigin + '/statistik/neuestetransfers'} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="rounded-xl">
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline ml-1.5">Transfermarkt</span>
            </Button>
          </a>
        </div>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">{t('transfers.tab_mine', { count: historyItems.length })}</TabsTrigger>
          <TabsTrigger value="all">{t('transfers.tab_all', { count: feedTransfers.length })}</TabsTrigger>
        </TabsList>

        {/* Mes joueurs — persisted dated history */}
        <TabsContent value="mine">
          {history.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[68px] rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : history.isError ? (
            <div className="text-center py-16">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">{t('transfers.error')}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => history.refetch()}>{t('transfers.retry')}</Button>
            </div>
          ) : noTmPlayers ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔗</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">{t('transfers.no_tm_players')}</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🗓️</p>
              <p className="text-sm text-muted-foreground mb-4">{syncing ? t('transfers.syncing_first') : t('transfers.empty_history')}</p>
              {!syncing && <Button variant="outline" className="rounded-xl" onClick={runSync}>{t('transfers.sync')}</Button>}
            </div>
          ) : (
            <HistoryList items={historyItems} locale={locale} />
          )}
        </TabsContent>

        {/* Tous — live global feed */}
        <TabsContent value="all">
          {feed.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[68px] rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : feed.isError ? (
            <div className="text-center py-16">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">{t('transfers.error')}</p>
              <Button variant="outline" className="rounded-xl" onClick={() => feed.refetch()}>{t('transfers.retry')}</Button>
            </div>
          ) : (
            <FeedList transfers={feedTransfers} tmOrigin={tmOrigin} emptyLabel={t('transfers.empty_all')} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
