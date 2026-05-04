import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomFieldsManager } from '@/components/CustomFieldsManager';
import { useCustomFields, useDeleteCustomField } from '@/hooks/use-custom-fields';
import {
  Settings2, Globe, Pencil, Trash2, Eye, BellOff, MessageSquareOff,
  Type, Hash, ListOrdered, Link2, ToggleLeft, User, CalendarDays, Trophy,
  Plus, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    setReducedVisionMode,
    setShowNotifications,
    setShowChatbot,
  } = useUiPreferences();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<typeof fields[0] | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

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
                { key: 'vision',   icon: Eye,            title: t('settings.reduced_vision_title'),       desc: t('settings.reduced_vision_desc'),       checked: reducedVisionMode, onCheckedChange: setReducedVisionMode },
                { key: 'notif',    icon: BellOff,         title: t('settings.notifications_toggle_title'), desc: t('settings.notifications_toggle_desc'), checked: showNotifications, onCheckedChange: setShowNotifications },
                { key: 'chatbot',  icon: MessageSquareOff, title: t('settings.chatbot_toggle_title'),       desc: t('settings.chatbot_toggle_desc'),       checked: showChatbot,       onCheckedChange: setShowChatbot },
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
        </div>
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
