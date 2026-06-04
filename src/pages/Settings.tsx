import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, INACTIVITY_TIMEOUT_KEY } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomFieldsManager } from '@/components/CustomFieldsManager';
import { useCustomFields, useDeleteCustomField } from '@/hooks/use-custom-fields';
import { useIsPremium } from '@/hooks/use-admin';
import { useIntegrations, useSaveIntegration, useDeleteIntegration, useTestIntegration } from '@/hooks/use-integrations';
import { useNotificationPrefs, useSaveNotificationPrefs } from '@/hooks/use-notification-prefs';
import {
  Settings2, Globe, Pencil, Trash2, Eye, EyeOff, BellOff, MessageSquareOff, BookOpen,
  Type, Hash, ListOrdered, Link2, ToggleLeft, User, CalendarDays, Trophy,
  Plus, GripVertical, ShieldAlert, Plug, CheckCircle2, XCircle, Loader2,
  KeyRound, ExternalLink, Crown, Bell, Mail, BellRing, Clock, Ruler, X,
  Euro, FileText, AlertTriangle,
  AlignLeft, ListChecks, Banknote, Phone, Lock, Minus, Info,
  Image, Building2, TrendingUp, BarChart3, LayoutGrid, Sparkles,
} from 'lucide-react';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Switch } from '@/components/ui/switch';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { CURRENCIES } from '@/lib/format-utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Integration modules definition ──────────────────────────────────────────

interface ModuleDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  docUrl: string;
  keyPlaceholder: string;
  keyLabel: string;
  color: string;
  logo: string;
  enriches: string[];
}

const INTEGRATION_MODULES: ModuleDef[] = [
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    tagline: 'Recherche IA en temps réel',
    description: "Interroge le web en temps réel pour trouver les actualités récentes, statistiques, transferts et blessures du joueur. Résultats stockés dans les données externes.",
    docUrl: 'https://docs.perplexity.ai/api-reference/chat-completions',
    keyPlaceholder: 'pplx-xxxxxxxxxxxxxxxxxxxxxxxx',
    keyLabel: 'Clé API Perplexity',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
    logo: '🔍',
    enriches: ['Résumé actualités', 'Infos contrat', 'Transferts récents'],
  },
  {
    id: 'pappers',
    name: 'Pappers',
    tagline: 'Données légales des clubs',
    description: "Récupère les informations légales du club du joueur depuis le registre officiel français : SIRET, dirigeants, capital social, date de création.",
    docUrl: 'https://www.pappers.fr/api',
    keyPlaceholder: 'votre-token-pappers',
    keyLabel: 'Token API Pappers',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
    logo: '🏢',
    enriches: ['SIRET du club', 'Dirigeants', 'Informations légales'],
  },
  {
    id: 'dropcontact',
    name: 'Drop Contact',
    tagline: 'Enrichissement de contacts',
    description: "Trouve l'email professionnel associé au nom du joueur ou de son entourage. Utile pour retrouver les coordonnées d'agents ou de représentants.",
    docUrl: 'https://developer.dropcontact.com/',
    keyPlaceholder: 'votre-cle-dropcontact',
    keyLabel: 'Clé API Drop Contact',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
    logo: '📧',
    enriches: ['Email professionnel', 'Téléphone', 'Score de confiance'],
  },
  {
    id: 'socialdata',
    name: 'SocialData X Feed',
    tagline: 'Veille football sur X (Twitter)',
    description: "Intègre un fil de posts X (Twitter) dans la page Réseau. Suivez vos comptes football préférés et des mots-clés de veille en temps réel. Clé disponible sur socialdata.tools.",
    docUrl: 'https://socialdata.tools',
    keyPlaceholder: 'votre-cle-socialdata',
    keyLabel: 'Clé API SocialData',
    color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
    logo: '𝕏',
    enriches: ['Posts X en temps réel', 'Likes & retweets', 'Comptes & mots-clés configurables'],
  },
];

// ── Field type icons ─────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  separator:    { icon: Minus,        color: 'text-muted-foreground bg-muted/60',      label: 'Séparateur' },
  text:         { icon: Type,         color: 'text-blue-500 bg-blue-500/10',           label: 'Texte court' },
  textarea:     { icon: AlignLeft,    color: 'text-blue-400 bg-blue-400/10',           label: 'Texte long' },
  number:       { icon: Hash,         color: 'text-violet-500 bg-violet-500/10',       label: 'Nombre' },
  price:        { icon: Banknote,     color: 'text-emerald-600 bg-emerald-600/10',     label: 'Prix' },
  date:         { icon: CalendarDays, color: 'text-rose-500 bg-rose-500/10',           label: 'Date' },
  datetime:     { icon: Clock,        color: 'text-orange-400 bg-orange-400/10',       label: 'Date & heure' },
  select:       { icon: ListOrdered,  color: 'text-amber-500 bg-amber-500/10',         label: 'Choix unique' },
  multiselect:  { icon: ListChecks,   color: 'text-amber-600 bg-amber-600/10',         label: 'Choix multiple' },
  boolean:      { icon: ToggleLeft,   color: 'text-emerald-500 bg-emerald-500/10',     label: 'Oui / Non' },
  link:         { icon: Link2,        color: 'text-sky-500 bg-sky-500/10',             label: 'Lien URL' },
  phone:        { icon: Phone,        color: 'text-teal-500 bg-teal-500/10',           label: 'Téléphone' },
  email:        { icon: Mail,         color: 'text-indigo-500 bg-indigo-500/10',       label: 'Email' },
  password:     { icon: Lock,         color: 'text-gray-500 bg-gray-500/10',           label: 'Mot de passe' },
  player:       { icon: User,         color: 'text-primary bg-primary/10',             label: 'Lien vers un joueur' },
  match:        { icon: CalendarDays, color: 'text-orange-500 bg-orange-500/10',       label: 'Lien vers un match' },
  championship: { icon: Trophy,       color: 'text-yellow-500 bg-yellow-500/10',       label: 'Lien vers un championnat' },
};

// ── Notification toggle row ──────────────────────────────────────────────────

function NotifRow({
  icon: Icon,
  title,
  desc,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 mt-0.5" disabled={disabled} />
    </div>
  );
}

// ── Timezone utilities ─────────────────────────────────────────────────────────

function getTimezoneOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz, timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const offset = parts.find(p => p.type === 'timeZoneName')?.value ?? 'UTC';
    return offset === 'GMT' ? 'UTC+0' : offset.replace('GMT', 'UTC');
  } catch { return ''; }
}

function getAllTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.('timeZone');
    if (supported?.length) return supported;
  } catch {}
  // Curated fallback list
  return [
    'UTC',
    'Africa/Abidjan','Africa/Algiers','Africa/Cairo','Africa/Casablanca','Africa/Johannesburg',
    'Africa/Lagos','Africa/Nairobi','Africa/Tunis',
    'America/Bogota','America/Buenos_Aires','America/Chicago','America/Denver',
    'America/Lima','America/Los_Angeles','America/Mexico_City','America/New_York',
    'America/Sao_Paulo','America/Toronto','America/Vancouver',
    'Asia/Bangkok','Asia/Colombo','Asia/Dubai','Asia/Jakarta','Asia/Karachi',
    'Asia/Kolkata','Asia/Seoul','Asia/Shanghai','Asia/Singapore','Asia/Tokyo',
    'Atlantic/Reykjavik',
    'Australia/Melbourne','Australia/Sydney',
    'Europe/Amsterdam','Europe/Athens','Europe/Belgrade','Europe/Berlin',
    'Europe/Brussels','Europe/Budapest','Europe/Copenhagen','Europe/Dublin',
    'Europe/Helsinki','Europe/Istanbul','Europe/Kyiv','Europe/Lisbon',
    'Europe/London','Europe/Luxembourg','Europe/Madrid','Europe/Moscow',
    'Europe/Oslo','Europe/Paris','Europe/Prague','Europe/Rome',
    'Europe/Stockholm','Europe/Vienna','Europe/Warsaw','Europe/Zurich',
    'Indian/Mauritius','Indian/Reunion',
    'Pacific/Auckland','Pacific/Fiji','Pacific/Honolulu',
  ];
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allTz = getAllTimezones();
  const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } })();

  const filtered = query.trim()
    ? allTz.filter(tz => tz.toLowerCase().includes(query.toLowerCase())).slice(0, 60)
    : allTz.slice(0, 80);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayValue = value ? `${value.split('/').pop()?.replace(/_/g, ' ')} (${getTimezoneOffset(value)})` : '';

  return (
    <div className="relative" ref={ref}>
      <div className="relative flex items-center">
        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={open ? query : displayValue}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onBlur={() => { if (!open) setQuery(''); }}
          placeholder="Europe/Paris"
          autoComplete="off"
          className="w-full h-9 pl-9 pr-8 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {query && open && (
          <button
            type="button"
            onClick={() => { setQuery(''); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-popover shadow-xl">
          <div className="p-1 space-y-0.5">
            {/* Browser timezone shortcut */}
            {!query && browserTz !== value && (
              <button
                type="button"
                onClick={() => { onChange(browserTz); setOpen(false); setQuery(''); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left hover:bg-muted transition-colors text-primary"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate font-medium">{browserTz.split('/').pop()?.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground shrink-0">{getTimezoneOffset(browserTz)} · navigateur</span>
              </button>
            )}
            {filtered.map(tz => {
              const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
              const region = tz.includes('/') ? tz.split('/')[0] : '';
              const offset = getTimezoneOffset(tz);
              return (
                <button
                  key={tz}
                  type="button"
                  onClick={() => { onChange(tz); setOpen(false); setQuery(''); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left hover:bg-muted transition-colors ${value === tz ? 'bg-primary/10 text-primary font-medium' : ''}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{city}</span>
                    {region && <span className="text-[11px] text-muted-foreground">{region}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">{offset}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation();
  const { data: fields = [] } = useCustomFields();
  const deleteField = useDeleteCustomField();
  const {
    reducedVisionMode,
    showNotifications,
    showChatbot,
    hideRestrictedElements,
    autoShowGuide,
    weekStartDay,
    distanceUnit,
    timezone,
    currency,
    dateFormat,
    timeFormat,
    showPlayerPhotos,
    showPlayerClub,
    showPlayerLeague,
    showPlayerLevel,
    showPlayerPotential,
    showPlayerCompletion,
    animationsEnabled,
    setAnimationsEnabled,
    setReducedVisionMode,
    setShowNotifications,
    setShowChatbot,
    setHideRestrictedElements,
    setAutoShowGuide,
    setWeekStartDay,
    setDistanceUnit,
    setTimezone,
    setCurrency,
    setDateFormat,
    setTimeFormat,
    setShowPlayerPhotos,
    setShowPlayerClub,
    setShowPlayerLeague,
    setShowPlayerLevel,
    setShowPlayerPotential,
    setShowPlayerCompletion,
  } = useUiPreferences();

  const { data: isPremium } = useIsPremium();
  const { data: integrations = [] } = useIntegrations();
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testIntegration = useTestIntegration();

  const { data: notifPrefs } = useNotificationPrefs();
  const saveNotifPrefs = useSaveNotificationPrefs();

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const getStatus = (serviceId: string) =>
    integrations.find(i => i.service === serviceId);

  const handleSaveKey = (serviceId: string) => {
    const key = apiKeys[serviceId]?.trim();
    if (!key) return;
    saveIntegration.mutate({ service: serviceId, api_key: key, enabled: true });
    setApiKeys(prev => ({ ...prev, [serviceId]: '' }));
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<typeof fields[0] | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState<string>(
    () => localStorage.getItem(INACTIVITY_TIMEOUT_KEY) ?? '0'
  );

  const handleTimeoutChange = (value: string) => {
    setSessionTimeout(value);
    localStorage.setItem(INACTIVITY_TIMEOUT_KEY, value);
    const label = value === '0' ? t('settings.session_timeout_disabled') : t(`settings.session_timeout_${value}m`);
    toast.success(t('settings.session_timeout_saved', { label }));
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteField.mutateAsync(deletingId);
      toast.success(t('custom_fields.deleted'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (f: typeof fields[0]) => {
    setEditingField(f);
    setManagerOpen(true);
  };
  const openCreate = () => {
    setEditingField(null);
    setManagerOpen(true);
  };

  const handleNotifToggle = (key: string, value: boolean) => {
    saveNotifPrefs.mutate(
      { ...notifPrefs, [key]: value },
      { onSuccess: () => toast.success(t('settings.notif_saved')) }
    );
  };

  // Browser push permission state
  const pushPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast.success(t('settings.notif_push_granted'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
      </div>

      <Tabs defaultValue="preferences" className="space-y-6">
        <TabsList className="h-auto flex flex-wrap gap-1 p-1 rounded-xl bg-muted w-full sm:w-auto">
          <TabsTrigger value="preferences" className="flex items-center gap-1.5 rounded-lg text-sm px-3 py-2">
            <Globe className="w-4 h-4" />
            {t('settings.tab_preferences')}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 rounded-lg text-sm px-3 py-2">
            <Bell className="w-4 h-4" />
            {t('settings.tab_notifications')}
          </TabsTrigger>
          <TabsTrigger value="fields" className="flex items-center gap-1.5 rounded-lg text-sm px-3 py-2">
            <Settings2 className="w-4 h-4" />
            {t('settings.tab_fields')}
            {fields.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">{fields.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1.5 rounded-lg text-sm px-3 py-2">
            <Plug className="w-4 h-4" />
            {t('settings.tab_integrations')}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Préférences ── */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Language + Theme */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="w-4 h-4 text-primary" />
                  {t('settings.tab_preferences')}
                </CardTitle>
                <CardDescription>{t('settings.preferences_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    {t('settings.language')}
                  </label>
                  <LanguageSwitcher variant="outline" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    {t('settings.theme')}
                  </label>
                  <ThemeSwitcher variant="outline" />
                </div>
              </CardContent>
            </Card>

            {/* Régionalisation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  {t('settings.regional_title')}
                </CardTitle>
                <CardDescription>{t('settings.regional_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                    {t('settings.timezone')}
                  </label>
                  <TimezoneSelect
                    value={timezone}
                    onChange={(v) => { setTimezone(v); toast.success(t('settings.saved')); }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{t('settings.timezone_desc')}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                      {t('settings.week_start')}
                    </label>
                    <Select
                      value={String(weekStartDay)}
                      onValueChange={(v) => { setWeekStartDay(Number(v) as 0 | 1); toast.success(t('settings.saved')); }}
                    >
                      <SelectTrigger className="w-full rounded-xl h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{t('settings.week_start_monday')}</SelectItem>
                        <SelectItem value="0">{t('settings.week_start_sunday')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                      <Ruler className="w-3.5 h-3.5 text-primary shrink-0" />
                      {t('settings.distance_unit')}
                    </label>
                    <Select
                      value={distanceUnit}
                      onValueChange={(v) => { setDistanceUnit(v as 'km' | 'mi'); toast.success(t('settings.saved')); }}
                    >
                      <SelectTrigger className="w-full rounded-xl h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="km">{t('settings.distance_km')}</SelectItem>
                        <SelectItem value="mi">{t('settings.distance_mi')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* Affichage — devise, format de date, format d'heure */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Euro className="w-4 h-4 text-primary" />
                  {t('settings.display_title')}
                </CardTitle>
                <CardDescription>{t('settings.display_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                    <Euro className="w-3.5 h-3.5 text-primary shrink-0" />
                    {t('settings.currency')}
                  </label>
                  <Select value={currency} onValueChange={(v) => { setCurrency(v); toast.success(t('settings.saved')); }}>
                    <SelectTrigger className="w-full rounded-xl h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="font-mono text-xs mr-2 text-muted-foreground">{c.symbol}</span>
                          {c.name} <span className="text-muted-foreground">({c.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">{t('settings.currency_desc')}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                      {t('settings.date_format')}
                    </label>
                    <Select value={dateFormat} onValueChange={(v) => { setDateFormat(v as 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'); toast.success(t('settings.saved')); }}>
                      <SelectTrigger className="w-full rounded-xl h-9 font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      {dateFormat === 'DD/MM/YYYY' ? '08/05/2026'
                        : dateFormat === 'MM/DD/YYYY' ? '05/08/2026'
                        : '2026-05-08'}
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                      <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                      {t('settings.time_format')}
                    </label>
                    <Select value={timeFormat} onValueChange={(v) => { setTimeFormat(v as '24h' | '12h'); toast.success(t('settings.saved')); }}>
                      <SelectTrigger className="w-full rounded-xl h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24h</SelectItem>
                        <SelectItem value="12h">12h AM/PM</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      {timeFormat === '24h' ? 'ex: 14:30' : 'ex: 2:30 PM'}
                    </p>
                  </div>
                </div>

              </CardContent>
            </Card>

            {/* UI Toggles */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('settings.ui_toggles_title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  { key: 'vision',    icon: Eye,              title: t('settings.reduced_vision_title'),       desc: t('settings.reduced_vision_desc'),        checked: reducedVisionMode,      onCheckedChange: setReducedVisionMode },
                  { key: 'notif',     icon: BellOff,          title: t('settings.notifications_toggle_title'), desc: t('settings.notifications_toggle_desc'),  checked: showNotifications,      onCheckedChange: setShowNotifications },
                  { key: 'chatbot',   icon: MessageSquareOff, title: t('settings.chatbot_toggle_title'),       desc: t('settings.chatbot_toggle_desc'),        checked: showChatbot,            onCheckedChange: setShowChatbot },
                  { key: 'guide',     icon: BookOpen,         title: t('settings.guide_auto_show_title'),      desc: t('settings.guide_auto_show_desc'),       checked: autoShowGuide,          onCheckedChange: setAutoShowGuide },
                  { key: 'hideperm',  icon: EyeOff,           title: t('settings.hide_restricted_title'),      desc: t('settings.hide_restricted_desc'),       checked: hideRestrictedElements, onCheckedChange: setHideRestrictedElements },
                  { key: 'animations', icon: Sparkles,         title: t('settings.animations_enabled', 'Animations'), desc: t('settings.animations_enabled_desc', 'Active les animations visuelles (clignotement, apparition des cartes…). Désactivez pour une interface épurée.'), checked: animationsEnabled, onCheckedChange: setAnimationsEnabled },
                ] as const).map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ItemIcon className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                      <Switch checked={item.checked} onCheckedChange={item.onCheckedChange} className="shrink-0 mt-0.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Player card display */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="w-4 h-4 text-primary" />
                  {t('settings.player_display_title', 'Affichage des joueurs')}
                </CardTitle>
                <CardDescription>{t('settings.player_display_desc', 'Choisissez les informations affichées sur chaque carte joueur.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  { key: 'photos',     icon: Image,       title: t('settings.player_show_photos',     'Photos des joueurs'),     desc: t('settings.player_show_photos_desc',     'Affiche la photo ou l\'avatar de chaque joueur.'),    checked: showPlayerPhotos,     onCheckedChange: setShowPlayerPhotos },
                  { key: 'club',       icon: Building2,   title: t('settings.player_show_club',       'Club'),                   desc: t('settings.player_show_club_desc',       'Affiche le nom et le logo du club.'),                 checked: showPlayerClub,       onCheckedChange: setShowPlayerClub },
                  { key: 'league',     icon: Trophy,      title: t('settings.player_show_league',     'Division / Championnat'), desc: t('settings.player_show_league_desc',     'Affiche le championnat du joueur.'),                  checked: showPlayerLeague,     onCheckedChange: setShowPlayerLeague },
                  { key: 'level',      icon: Hash,        title: t('settings.player_show_level',      'Niveau'),                 desc: t('settings.player_show_level_desc',      'Affiche le niveau actuel et sa barre de progression.'),checked: showPlayerLevel,      onCheckedChange: setShowPlayerLevel },
                  { key: 'potential',  icon: TrendingUp,  title: t('settings.player_show_potential',  'Potentiel'),              desc: t('settings.player_show_potential_desc',  'Affiche le potentiel et sa barre de progression.'),  checked: showPlayerPotential,  onCheckedChange: setShowPlayerPotential },
                  { key: 'completion', icon: BarChart3,   title: t('settings.player_show_completion', 'Évaluation de la fiche'), desc: t('settings.player_show_completion_desc', 'Affiche le pourcentage de complétion de la fiche.'),  checked: showPlayerCompletion, onCheckedChange: setShowPlayerCompletion },
                ] as const).map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <ItemIcon className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                      <Switch checked={item.checked} onCheckedChange={item.onCheckedChange} className="shrink-0 mt-0.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Session security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  {t('settings.session_security_title')}
                </CardTitle>
                <CardDescription>{t('settings.session_security_desc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  {t('settings.session_timeout_label')}
                </label>
                <Select value={sessionTimeout} onValueChange={handleTimeoutChange}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('settings.session_timeout_disabled')}</SelectItem>
                    <SelectItem value="10">{t('settings.session_timeout_10m')}</SelectItem>
                    <SelectItem value="15">{t('settings.session_timeout_15m')}</SelectItem>
                    <SelectItem value="30">{t('settings.session_timeout_30m')}</SelectItem>
                    <SelectItem value="60">{t('settings.session_timeout_60m')}</SelectItem>
                    <SelectItem value="120">{t('settings.session_timeout_120m')}</SelectItem>
                  </SelectContent>
                </Select>
                {sessionTimeout !== '0' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('settings.session_timeout_hint', { minutes: sessionTimeout })}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB: Notifications ── */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="w-4 h-4 text-primary" />
                  {t('settings.notif_email_title')}
                </CardTitle>
                <CardDescription>{t('settings.notif_email_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <NotifRow
                  icon={CalendarDays}
                  title={t('settings.notif_email_match_assigned')}
                  desc={t('settings.notif_email_match_assigned_desc')}
                  checked={notifPrefs?.email_match_assigned ?? true}
                  onCheckedChange={v => handleNotifToggle('email_match_assigned', v)}
                />
                <NotifRow
                  icon={User}
                  title={t('settings.notif_email_org_invite')}
                  desc={t('settings.notif_email_org_invite_desc')}
                  checked={notifPrefs?.email_org_invite ?? true}
                  onCheckedChange={v => handleNotifToggle('email_org_invite', v)}
                />
                <NotifRow
                  icon={MessageSquareOff}
                  title={t('settings.notif_email_community')}
                  desc={t('settings.notif_email_community_desc')}
                  checked={notifPrefs?.email_community ?? true}
                  onCheckedChange={v => handleNotifToggle('email_community', v)}
                />
                <NotifRow
                  icon={Trophy}
                  title={t('settings.notif_email_weekly')}
                  desc={t('settings.notif_email_weekly_desc')}
                  checked={notifPrefs?.email_weekly ?? false}
                  onCheckedChange={v => handleNotifToggle('email_weekly', v)}
                />
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* In-app (bell) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="w-4 h-4 text-primary" />
                    {t('settings.notif_web_title')}
                  </CardTitle>
                  <CardDescription>{t('settings.notif_web_desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <NotifRow
                    icon={BellOff}
                    title={t('settings.notif_web_bell')}
                    desc={t('settings.notif_web_bell_desc')}
                    checked={showNotifications}
                    onCheckedChange={setShowNotifications}
                  />
                </CardContent>
              </Card>

              {/* Browser push */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BellRing className="w-4 h-4 text-primary" />
                    {t('settings.notif_push_title')}
                  </CardTitle>
                  <CardDescription>{t('settings.notif_push_desc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {pushPermission === 'granted' ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {t('settings.notif_push_granted')}
                    </div>
                  ) : pushPermission === 'denied' ? (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <XCircle className="w-4 h-4 shrink-0" />
                      {t('settings.notif_push_denied')}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-xl"
                      onClick={requestPushPermission}
                    >
                      <BellRing className="w-4 h-4" />
                      {t('settings.notif_push_enable')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Alertes & Rappels ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                  {t('settings.alerts_title')}
                </CardTitle>
                <CardDescription>{t('settings.alerts_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">

                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    {t('settings.alert_no_report')}
                  </label>
                  <Select
                    value={String(notifPrefs?.alert_no_report_days ?? 30)}
                    onValueChange={(v) => {
                      saveNotifPrefs.mutate({ ...notifPrefs, alert_no_report_days: Number(v) as 0 | 7 | 30 });
                      toast.success(t('settings.saved'));
                    }}
                  >
                    <SelectTrigger className="w-full rounded-xl h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('settings.alert_never')}</SelectItem>
                      <SelectItem value="7">{t('settings.alert_7d')}</SelectItem>
                      <SelectItem value="30">{t('settings.alert_30d')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">{t('settings.alert_no_report_desc')}</p>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
                    {t('settings.alert_contract')}
                  </label>
                  <Select
                    value={String(notifPrefs?.alert_contract_months ?? 3)}
                    onValueChange={(v) => {
                      saveNotifPrefs.mutate({ ...notifPrefs, alert_contract_months: Number(v) as 0 | 3 | 6 | 12 });
                      toast.success(t('settings.saved'));
                    }}
                  >
                    <SelectTrigger className="w-full rounded-xl h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('settings.alert_never')}</SelectItem>
                      <SelectItem value="3">{t('settings.alert_3m')}</SelectItem>
                      <SelectItem value="6">{t('settings.alert_6m')}</SelectItem>
                      <SelectItem value="12">{t('settings.alert_12m')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">{t('settings.alert_contract_desc')}</p>
                </div>

              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ── TAB: Champs personnalisés ── */}
        <TabsContent value="fields">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="w-4 h-4 text-primary" />
                    {t('custom_fields.title')}
                  </CardTitle>
                  <CardDescription className="mt-0.5">{t('custom_fields.manage_desc')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="tabular-nums">{fields.length}</Badge>
                  <Button size="sm" className="rounded-xl gap-2" onClick={openCreate}>
                    <Plus className="w-4 h-4" />
                    {t('custom_fields.add_field')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                    <Settings2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('settings.no_fields')}</p>
                  <Button size="sm" variant="outline" className="gap-2 mt-1" onClick={openCreate}>
                    <Plus className="w-4 h-4" />
                    {t('custom_fields.add_field')}
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {fields.map((f, i) => {
                    const meta = TYPE_META[f.field_type] ?? TYPE_META.text;
                    const Icon = meta.icon;
                    const opts = f.field_options ?? [];
                    const isOptionType = f.field_type === 'select' || f.field_type === 'multiselect';
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />

                        {/* Type icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Name + type label */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold truncate">{f.field_name}</p>
                            {f.field_hint && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="shrink-0 cursor-default">
                                    <Info className="w-3.5 h-3.5 text-primary/60 hover:text-primary transition-colors" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px] text-xs">
                                  {f.field_hint}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{t(`custom_fields.type_${f.field_type}`)}</p>
                        </div>

                        {/* Right-side contextual info — uniforme pour tous les types */}
                        <div className="hidden sm:flex items-center gap-1.5 flex-wrap max-w-[240px] justify-end">
                          {/* Chip [ICONE] Label — présent pour tous les types */}
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.color} border-current/20`}>
                            <Icon className="w-3 h-3 shrink-0" />
                            {meta.label}
                          </span>

                          {/* Options en plus pour select / multiselect */}
                          {isOptionType && opts.length > 0 && (
                            <>
                              {opts.slice(0, 2).map((opt, oi) => (
                                <span key={oi} className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]">{String(opt)}</span>
                              ))}
                              {opts.length > 2 && (
                                <span className="text-[11px] text-muted-foreground">+{opts.length - 2}</span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(f)}
                            className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingId(f.id)}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Intégrations ── */}
        <TabsContent value="integrations">
          <Card className={!isPremium ? 'opacity-80' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plug className="w-4 h-4 text-primary" />
                    {t('settings.modules_title')}
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold ml-1">
                      <Crown className="w-3 h-3" />Pro
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-0.5">{t('settings.modules_desc')}</CardDescription>
                </div>
                {!isPremium && (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-primary border-primary/30" onClick={() => window.location.href = '/pricing'}>
                    <Crown className="w-3.5 h-3.5" />
                    {t('settings.modules_upgrade')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/60">
                {INTEGRATION_MODULES.map(mod => {
                  const status = getStatus(mod.id);
                  const isConnected = !!status?.has_key;
                  const isEnabled = !!status?.enabled;
                  const testStatus = status?.test_status;
                  const isTesting = testIntegration.isPending && testIntegration.variables === mod.id;
                  const isSaving = saveIntegration.isPending && (saveIntegration.variables as { service?: string })?.service === mod.id;

                  return (
                    <div key={mod.id} className={`p-5 transition-colors ${!isPremium ? 'pointer-events-none' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${mod.color}`}>
                          {mod.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">{mod.name}</span>
                            <span className="text-xs text-muted-foreground">{mod.tagline}</span>
                            {isConnected && testStatus === 'ok' && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3 h-3" />{t('settings.module_connected')}
                              </span>
                            )}
                            {isConnected && testStatus === 'error' && (
                              <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                                <XCircle className="w-3 h-3" />{t('settings.module_error')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {mod.enriches.map(e => (
                              <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">{e}</span>
                            ))}
                            <a href={mod.docUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
                              <ExternalLink className="w-2.5 h-2.5" />API docs
                            </a>
                          </div>
                          <div className="mt-3 flex gap-2 max-w-lg">
                            <div className="relative flex-1">
                              <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                              <Input
                                type={showKey[mod.id] ? 'text' : 'password'}
                                value={apiKeys[mod.id] ?? ''}
                                onChange={e => setApiKeys(prev => ({ ...prev, [mod.id]: e.target.value }))}
                                placeholder={isConnected ? '••••••••••••••••' : mod.keyPlaceholder}
                                className="h-8 text-xs pl-8 font-mono"
                                onKeyDown={e => e.key === 'Enter' && handleSaveKey(mod.id)}
                                disabled={!isPremium}
                              />
                            </div>
                            {apiKeys[mod.id]?.trim() && (
                              <Button size="sm" className="h-8 text-xs shrink-0" onClick={() => handleSaveKey(mod.id)} disabled={isSaving}>
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : t('common.save')}
                              </Button>
                            )}
                            {isConnected && (
                              <>
                                <Button
                                  size="sm" variant="outline" className="h-8 text-xs shrink-0"
                                  onClick={() => testIntegration.mutate(mod.id)}
                                  disabled={isTesting}
                                >
                                  {isTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                  {t('settings.module_test')}
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                  onClick={() => deleteIntegration.mutate(mod.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {isConnected && (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={checked => saveIntegration.mutate({ service: mod.id, enabled: checked })}
                            className="shrink-0 mt-0.5"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CustomFieldsManager (controlled) ── */}
      <CustomFieldsManager
        externalOpen={managerOpen}
        onExternalOpenChange={setManagerOpen}
        initialField={editingField ?? undefined}
      />

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deletingId} onOpenChange={open => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('custom_fields.delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('custom_fields.delete_confirm_desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
