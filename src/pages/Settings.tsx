import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, INACTIVITY_TIMEOUT_KEY } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomFieldsManager } from '@/components/CustomFieldsManager';
import { useCustomFields, useDeleteCustomField } from '@/hooks/use-custom-fields';
import { useIsPremium } from '@/hooks/use-admin';
import { useIntegrations, useSaveIntegration, useDeleteIntegration, useTestIntegration } from '@/hooks/use-integrations';
import {
  Settings2, Globe, Pencil, Trash2, Eye, EyeOff, BellOff, MessageSquareOff,
  Type, Hash, ListOrdered, Link2, ToggleLeft, User, CalendarDays, Trophy,
  Plus, GripVertical, ShieldAlert, Plug, CheckCircle2, XCircle, Loader2,
  KeyRound, ExternalLink, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Switch } from '@/components/ui/switch';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
  logo: string; // emoji fallback
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

const TYPE_META: Record<string, { icon: React.ElementType; color: string }> = {
  text:         { icon: Type,          color: 'text-blue-500 bg-blue-500/10' },
  number:       { icon: Hash,          color: 'text-violet-500 bg-violet-500/10' },
  select:       { icon: ListOrdered,   color: 'text-amber-500 bg-amber-500/10' },
  link:         { icon: Link2,         color: 'text-sky-500 bg-sky-500/10' },
  boolean:      { icon: ToggleLeft,    color: 'text-emerald-500 bg-emerald-500/10' },
  player:       { icon: User,          color: 'text-primary bg-primary/10' },
  match:        { icon: CalendarDays,  color: 'text-orange-500 bg-orange-500/10' },
  championship: { icon: Trophy,        color: 'text-yellow-500 bg-yellow-500/10' },
};

export default function Settings() {
  const { t } = useTranslation();
  const { data: fields = [] } = useCustomFields();
  const deleteField = useDeleteCustomField();
  const {
    reducedVisionMode,
    showNotifications,
    showChatbot,
    hideRestrictedElements,
    weekStartDay,
    distanceUnit,
    setReducedVisionMode,
    setShowNotifications,
    setShowChatbot,
    setHideRestrictedElements,
    setWeekStartDay,
    setDistanceUnit,
  } = useUiPreferences();

  const { data: isPremium } = useIsPremium();
  const { data: integrations = [] } = useIntegrations();
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testIntegration = useTestIntegration();

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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
        </div>
        <Button size="sm" className="rounded-xl gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {t('custom_fields.add_field')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Custom Fields (2/3 width) ── */}
        <div className="lg:col-span-2 space-y-4">
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
                <Badge variant="secondary" className="tabular-nums">{fields.length}</Badge>
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
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        {/* Drag handle (visual only) */}
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />

                        {/* Type icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>

                        {/* Name + type */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{f.field_name}</p>
                          <p className="text-xs text-muted-foreground">{t(`custom_fields.type_${f.field_type}`)}</p>
                        </div>

                        {/* Preview (options / championship) */}
                        <div className="hidden sm:flex items-center gap-1.5 flex-wrap max-w-[200px]">
                          {f.field_type === 'select' && (f.field_options ?? []).slice(0, 3).map((opt, oi) => (
                            <span key={oi} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">{String(opt)}</span>
                          ))}
                          {f.field_type === 'select' && (f.field_options ?? []).length > 3 && (
                            <span className="text-[11px] text-muted-foreground">+{(f.field_options ?? []).length - 3}</span>
                          )}
                          {f.field_type === 'championship' && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Trophy className="w-3 h-3 text-yellow-500" />
                              {t('custom_fields.type_championship')}
                            </span>
                          )}
                          {f.field_type === 'link' && (
                            <span className="text-[11px] text-muted-foreground">URL</span>
                          )}
                          {f.field_type === 'boolean' && (
                            <span className="text-[11px] text-muted-foreground">✓ / ✗</span>
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
        </div>

        {/* ── Right: Preferences (1/3 width) ── */}
        <div className="space-y-4">
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

          {/* UI Toggles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('settings.ui_toggles_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { key: 'vision',    icon: Eye,             title: t('settings.reduced_vision_title'),        desc: t('settings.reduced_vision_desc'),        checked: reducedVisionMode,      onCheckedChange: setReducedVisionMode },
                { key: 'notif',     icon: BellOff,         title: t('settings.notifications_toggle_title'),  desc: t('settings.notifications_toggle_desc'),  checked: showNotifications,      onCheckedChange: setShowNotifications },
                { key: 'chatbot',   icon: MessageSquareOff, title: t('settings.chatbot_toggle_title'),        desc: t('settings.chatbot_toggle_desc'),        checked: showChatbot,            onCheckedChange: setShowChatbot },
                { key: 'hideperm', icon: EyeOff,          title: t('settings.hide_restricted_title'),       desc: t('settings.hide_restricted_desc'),       checked: hideRestrictedElements, onCheckedChange: setHideRestrictedElements },
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
          {/* Régionalisation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="w-4 h-4 text-primary" />
                {t('settings.regional_title')}
              </CardTitle>
              <CardDescription>{t('settings.regional_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  {t('settings.week_start')}
                </label>
                <Select
                  value={String(weekStartDay)}
                  onValueChange={(v) => {
                    setWeekStartDay(Number(v) as 0 | 1);
                    toast.success(t('settings.saved'));
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('settings.week_start_monday')}</SelectItem>
                    <SelectItem value="0">{t('settings.week_start_sunday')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  {t('settings.distance_unit')}
                </label>
                <Select
                  value={distanceUnit}
                  onValueChange={(v) => {
                    setDistanceUnit(v as 'km' | 'mi');
                    toast.success(t('settings.saved'));
                  }}
                >
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="km">{t('settings.distance_km')}</SelectItem>
                    <SelectItem value="mi">{t('settings.distance_mi')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
      </div>

      {/* ── Modules complémentaires ── */}
      <div className="mt-6">
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
                      {/* Logo */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${mod.color}`}>
                        {mod.logo}
                      </div>

                      {/* Info */}
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

                        {/* What it enriches */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {mod.enriches.map(e => (
                            <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">{e}</span>
                          ))}
                          <a href={mod.docUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
                            <ExternalLink className="w-2.5 h-2.5" />API docs
                          </a>
                        </div>

                        {/* Key input */}
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

                      {/* Enable toggle */}
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
      </div>

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
