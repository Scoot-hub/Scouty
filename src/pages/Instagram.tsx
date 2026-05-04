import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExternalLink, Settings2, Search, Hash, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';

const IG_CONFIG_KEY = 'scouthub-ig-config';

const DEFAULT_ACCOUNTS = ['lequipe', 'fabrizio_romano', 'transfermarkt', 'skysports'];
const DEFAULT_HASHTAGS = ['football', 'mercato', 'scouting'];

interface IgConfig { accounts: string[]; hashtags: string[] }

function loadIgConfig(): IgConfig {
  try {
    const raw = localStorage.getItem(IG_CONFIG_KEY);
    if (!raw) return { accounts: DEFAULT_ACCOUNTS, hashtags: DEFAULT_HASHTAGS };
    return { ...{ accounts: DEFAULT_ACCOUNTS, hashtags: DEFAULT_HASHTAGS }, ...JSON.parse(raw) };
  } catch { return { accounts: DEFAULT_ACCOUNTS, hashtags: DEFAULT_HASHTAGS }; }
}

function saveIgConfig(cfg: IgConfig) {
  localStorage.setItem(IG_CONFIG_KEY, JSON.stringify(cfg));
}

function IgIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

const IG_GRADIENT = 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)';

function openIG(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildIgUrl(target: string): string {
  const t = target.trim();
  if (!t) return 'https://www.instagram.com/';
  if (t.startsWith('#')) return `https://www.instagram.com/explore/tags/${t.slice(1).replace(/^#/, '')}/`;
  return `https://www.instagram.com/${t.replace(/^@/, '')}/`;
}

function IgConfigPanel({ config, onSave }: { config: IgConfig; onSave: (c: IgConfig) => void }) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState(config.accounts.join(', '));
  const [hashtags, setHashtags] = useState(config.hashtags.join(', '));

  const handleSave = () => {
    const a = accounts.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
    const h = hashtags.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    onSave({ accounts: a, hashtags: h });
  };

  return (
    <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-pink-600 flex items-center gap-1.5">
        <Settings2 className="w-3.5 h-3.5" /> {t('instagram.config_title')}
      </p>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">{t('instagram.accounts_label')}</label>
        <Input value={accounts} onChange={e => setAccounts(e.target.value)} placeholder={t('instagram.accounts_placeholder')} className="h-8 text-xs" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">{t('instagram.hashtags_label')}</label>
        <Input value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder={t('instagram.hashtags_placeholder')} className="h-8 text-xs" />
      </div>
      <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave}>
        {t('instagram.save_config')}
      </Button>
    </div>
  );
}

export default function Instagram() {
  const { t } = useTranslation();

  const [igConfig, setIgConfig] = useState<IgConfig>(loadIgConfig);
  const [showConfig, setShowConfig] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const handleSaveConfig = useCallback((c: IgConfig) => {
    setIgConfig(c);
    saveIgConfig(c);
    setShowConfig(false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      openIG('https://www.instagram.com/');
      return;
    }
    openIG(buildIgUrl(searchInput));
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: IG_GRADIENT }}>
            <IgIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('instagram.title')}</h1>
            <p className="text-xs text-muted-foreground">{t('instagram.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(v => !v)} className="rounded-xl gap-1.5 text-xs">
          <Settings2 className="w-3.5 h-3.5" /> Config
        </Button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="mb-5">
          <IgConfigPanel config={igConfig} onSave={handleSaveConfig} />
        </div>
      )}

      {/* Hero CTA */}
      <div className="rounded-2xl border overflow-hidden mb-6"
        style={{ background: 'linear-gradient(135deg, #f0943315 0%, #dc274315 50%, #bc188815 100%)' }}>
        <div className="p-8 flex flex-col items-center text-center gap-5">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg" style={{ background: IG_GRADIENT }}>
            <IgIcon className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">{t('instagram.cta_title')}</h2>
            <p className="text-sm text-muted-foreground max-w-md">{t('instagram.cta_desc')}</p>
          </div>
          <a href="https://www.instagram.com/accounts/login/" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="rounded-xl gap-2 px-8 text-white font-semibold shadow-lg"
              style={{ background: IG_GRADIENT, border: 'none' }}>
              <IgIcon className="w-5 h-5 text-white" />
              {t('instagram.cta_login')}
              <ExternalLink className="w-4 h-4 ml-1 opacity-80" />
            </Button>
          </a>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={t('instagram.search_placeholder')}
            className="pl-9 rounded-xl h-10 text-sm"
          />
        </div>
        <Button type="submit" className="rounded-xl gap-1.5 text-white"
          style={{ background: IG_GRADIENT, border: 'none' }}>
          <ExternalLink className="w-3.5 h-3.5" />
          {t('instagram.open_tab')}
        </Button>
      </form>

      {/* Quick links */}
      {(igConfig.accounts.length > 0 || igConfig.hashtags.length > 0) && (
        <div className="space-y-4">
          {igConfig.accounts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <AtSign className="w-3 h-3" /> {t('instagram.quick_accounts')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {igConfig.accounts.map(a => (
                  <a key={a} href={`https://www.instagram.com/${a}/`} target="_blank" rel="noopener noreferrer"
                    className="group flex items-center gap-2.5 p-3 rounded-xl border border-border/60 bg-card hover:border-pink-400/40 hover:bg-pink-500/5 transition-all">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
                      style={{ background: IG_GRADIENT }}>
                      {a.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">@{a}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-pink-500 transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {igConfig.hashtags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> {t('instagram.quick_hashtags')}
              </p>
              <div className="flex flex-wrap gap-2">
                {igConfig.hashtags.map(h => (
                  <a key={h} href={`https://www.instagram.com/explore/tags/${h}/`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-card text-sm text-muted-foreground hover:border-pink-400/40 hover:text-foreground hover:bg-pink-500/5 transition-all">
                    <Hash className="w-3 h-3" />{h}
                    <ExternalLink className="w-2.5 h-2.5 opacity-40" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
