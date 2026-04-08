import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CustomFieldsManager } from '@/components/CustomFieldsManager';
import { useCustomFields, useDeleteCustomField } from '@/hooks/use-custom-fields';
import { Settings2, Globe, Pencil, Trash2, Eye, BellOff, MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { Switch } from '@/components/ui/switch';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { toast } from 'sonner';

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

  const handleDelete = async (id: string) => {
    try {
      await deleteField.mutateAsync(id);
      toast.success(t('custom_fields.deleted'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('settings.subtitle')}</p>
        </div>
        <LanguageSwitcher variant="outline" />
      </div>

      <Tabs defaultValue="custom_fields" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="custom_fields" className="gap-2">
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('settings.tab_fields')}</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">{t('settings.tab_preferences')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Custom Fields Tab */}
        <TabsContent value="custom_fields">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('custom_fields.title')}</CardTitle>
                <CardDescription>{t('custom_fields.manage_desc')}</CardDescription>
              </div>
              <CustomFieldsManager
                trigger={
                  <Button size="sm" className="rounded-xl gap-2">
                    <Settings2 className="w-4 h-4" />
                    {t('custom_fields.add_field')}
                  </Button>
                }
              />
            </CardHeader>
            <CardContent>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {t('settings.no_fields')}
                </p>
              ) : (
                <div className="space-y-2">
                  {fields.map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.field_name}</p>
                        <p className="text-xs text-muted-foreground">{t(`custom_fields.type_${f.field_type}`)}</p>
                      </div>
                      {f.field_type === 'select' && f.field_options.length > 0 && (
                        <div className="hidden sm:flex gap-1 flex-wrap">
                          {f.field_options.slice(0, 3).map((opt, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{String(opt)}</span>
                          ))}
                          {f.field_options.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{f.field_options.length - 3}</span>
                          )}
                        </div>
                      )}
                      <CustomFieldsManager
                        trigger={
                          <button className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                        }
                      />
                      <button onClick={() => handleDelete(f.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.tab_preferences')}</CardTitle>
              <CardDescription>{t('settings.preferences_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('settings.language')}</label>
                <LanguageSwitcher variant="outline" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">{t('settings.theme')}</label>
                <ThemeSwitcher variant="outline" />
              </div>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Eye className="w-4 h-4 text-primary" />
                      {t('settings.reduced_vision_title')}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t('settings.reduced_vision_desc')}</p>
                  </div>
                  <Switch checked={reducedVisionMode} onCheckedChange={setReducedVisionMode} />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <BellOff className="w-4 h-4 text-primary" />
                      {t('settings.notifications_toggle_title')}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t('settings.notifications_toggle_desc')}</p>
                  </div>
                  <Switch checked={showNotifications} onCheckedChange={setShowNotifications} />
                </div>
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareOff className="w-4 h-4 text-primary" />
                      {t('settings.chatbot_toggle_title')}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t('settings.chatbot_toggle_desc')}</p>
                  </div>
                  <Switch checked={showChatbot} onCheckedChange={setShowChatbot} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
