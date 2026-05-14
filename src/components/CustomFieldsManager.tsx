import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomFields, useCreateCustomField, useUpdateCustomField, useDeleteCustomField, type CustomField } from '@/hooks/use-custom-fields';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PlusCircle, Pencil, Trash2, Settings2, X, Trophy, Users,
  Type, Hash, List, Link2, ToggleLeft, User, CalendarDays,
  Clock, AlignLeft, Banknote, Phone, Mail, Lock, Minus, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';

const FIELD_TYPES = [
  { value: 'separator',    label: 'custom_fields.type_separator',    icon: Minus,        noOptions: true },
  { value: 'text',         label: 'custom_fields.type_text',         icon: Type },
  { value: 'textarea',     label: 'custom_fields.type_textarea',     icon: AlignLeft },
  { value: 'number',       label: 'custom_fields.type_number',       icon: Hash },
  { value: 'price',        label: 'custom_fields.type_price',        icon: Banknote },
  { value: 'date',         label: 'custom_fields.type_date',         icon: CalendarDays },
  { value: 'datetime',     label: 'custom_fields.type_datetime',     icon: Clock },
  { value: 'select',       label: 'custom_fields.type_select',       icon: List,         hasOptions: true },
  { value: 'multiselect',  label: 'custom_fields.type_multiselect',  icon: ListChecks,   hasOptions: true },
  { value: 'boolean',      label: 'custom_fields.type_boolean',      icon: ToggleLeft },
  { value: 'link',         label: 'custom_fields.type_link',         icon: Link2 },
  { value: 'phone',        label: 'custom_fields.type_phone',        icon: Phone },
  { value: 'email',        label: 'custom_fields.type_email',        icon: Mail },
  { value: 'password',     label: 'custom_fields.type_password',     icon: Lock },
  { value: 'player',       label: 'custom_fields.type_player',       icon: User },
  { value: 'match',        label: 'custom_fields.type_match',        icon: CalendarDays },
  { value: 'championship', label: 'custom_fields.type_championship', icon: Trophy },
];

export function CustomFieldsManager({
  trigger,
  externalOpen,
  onExternalOpenChange,
  initialField,
}: {
  trigger?: React.ReactNode;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  initialField?: CustomField;
}) {
  const { t } = useTranslation();
  const { data: fields = [] } = useCustomFields();
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onExternalOpenChange?.(v); else setInternalOpen(v); };
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [fieldHint, setFieldHint] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState('');
  const [appliesToAll, setAppliesToAll] = useState(true);

  useEffect(() => {
    if (open && initialField) {
      setEditingField(initialField);
      setFieldName(initialField.field_name);
      setFieldType(initialField.field_type);
      setFieldHint(initialField.field_hint ?? '');
      setOptions(initialField.field_options ?? []);
      setAppliesToAll(initialField.applies_to_all !== false);
    }
  }, [open, initialField]);

  const resetForm = () => {
    setEditingField(null);
    setFieldName('');
    setFieldType('text');
    setFieldHint('');
    setOptions([]);
    setNewOption('');
    setAppliesToAll(true);
  };

  const openEdit = (field: CustomField) => {
    setEditingField(field);
    setFieldName(field.field_name);
    setFieldType(field.field_type);
    setFieldHint(field.field_hint ?? '');
    setOptions(field.field_options ?? []);
    setAppliesToAll(field.applies_to_all !== false);
    setOpen(true);
  };

  const openCreate = () => { resetForm(); setOpen(true); };

  const isSeparator = fieldType === 'separator';
  const hasOptions = ['select', 'multiselect'].includes(fieldType);
  const canSave = isSeparator ? true : !!fieldName.trim();

  const handleSave = async () => {
    if (!canSave) return;
    try {
      const name = isSeparator ? (fieldName.trim() || '') : fieldName.trim();
      if (editingField) {
        await updateField.mutateAsync({ id: editingField.id, field_name: name, field_type: fieldType, field_options: options, field_hint: fieldHint || null, applies_to_all: isSeparator ? true : appliesToAll });
        toast.success(t('custom_fields.updated'));
      } else {
        await createField.mutateAsync({ field_name: name, field_type: fieldType, field_options: options, field_hint: fieldHint || undefined, applies_to_all: isSeparator ? true : appliesToAll, display_order: fields.length });
        toast.success(t('custom_fields.created'));
      }
      resetForm();
      setOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteField.mutateAsync(id);
      toast.success(t('custom_fields.deleted'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const addOption = () => {
    if (newOption.trim() && !options.includes(newOption.trim())) {
      setOptions([...options, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (idx: number) => setOptions(options.filter((_, i) => i !== idx));

  return (
    <>
      {!isControlled && (
        <div onClick={openCreate}>
          {trigger || (
            <Button variant="outline" size="sm" className="rounded-xl">
              <Settings2 className="w-4 h-4 mr-2" />{t('custom_fields.manage')}
            </Button>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingField ? t('custom_fields.edit_field') : t('custom_fields.add_field')}</DialogTitle>
            <DialogDescription>{t('custom_fields.manage_desc')}</DialogDescription>
          </DialogHeader>

          {/* Existing fields list */}
          {!editingField && fields.length > 0 && (
            <div className="space-y-1.5 mb-2 max-h-44 overflow-y-auto pr-1">
              {fields.map(f => {
                const ftMeta = FIELD_TYPES.find(ft => ft.value === f.field_type);
                const FIcon = ftMeta?.icon ?? Settings2;
                return (
                  <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <FIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">{f.field_name || <span className="text-muted-foreground italic">—</span>}</span>
                    {f.field_type !== 'separator' && f.applies_to_all === false && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold shrink-0" title={t('custom_fields.applies_to_all_off_badge_title')}>
                        {t('custom_fields.applies_to_all_off_badge')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground hidden sm:block">{t(`custom_fields.type_${f.field_type}`)}</span>
                    <button onClick={() => openEdit(f)} className="p-1 hover:bg-muted rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(f.id)} className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <div>
              <Label>{t('custom_fields.field_type')}</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => {
                    const FtIcon = ft.icon;
                    return (
                      <SelectItem key={ft.value} value={ft.value}>
                        <div className="flex items-center gap-2">
                          <FtIcon className="w-4 h-4 text-muted-foreground" />
                          {t(ft.label)}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('custom_fields.field_name')}{isSeparator && <span className="ml-1 text-muted-foreground text-xs">({t('common.optional')})</span>}</Label>
              <Input
                value={fieldName}
                onChange={e => setFieldName(e.target.value)}
                placeholder={isSeparator ? t('custom_fields.separator_placeholder') : t('custom_fields.field_name_placeholder')}
                className="mt-1"
              />
            </div>

            {!isSeparator && (
              <div>
                <Label className="flex items-center gap-1">
                  {t('custom_fields.field_hint')}
                  <span className="text-muted-foreground text-xs">({t('common.optional')})</span>
                </Label>
                <Input
                  value={fieldHint}
                  onChange={e => setFieldHint(e.target.value)}
                  placeholder={t('custom_fields.field_hint_placeholder')}
                  className="mt-1"
                />
              </div>
            )}

            {/* Applies to all players toggle */}
            {!isSeparator && (
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/40">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="cf-applies-to-all" className="flex items-center gap-1.5 cursor-pointer">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    {t('custom_fields.applies_to_all')}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {appliesToAll ? t('custom_fields.applies_to_all_on_desc') : t('custom_fields.applies_to_all_off_desc')}
                  </p>
                </div>
                <Switch id="cf-applies-to-all" checked={appliesToAll} onCheckedChange={setAppliesToAll} />
              </div>
            )}

            {/* Championship hint */}
            {fieldType === 'championship' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-700 dark:text-yellow-400">
                <Trophy className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('custom_fields.championship_hint')}</span>
              </div>
            )}

            {/* Options (select / multiselect) */}
            {hasOptions && (
              <div>
                <Label>{t('custom_fields.options')}</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    placeholder={t('custom_fields.option_placeholder')}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  />
                  <Button size="sm" variant="outline" onClick={addOption}><PlusCircle className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {options.map((opt, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {opt}
                      <button onClick={() => removeOption(i)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {editingField ? t('common.save') : t('custom_fields.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
