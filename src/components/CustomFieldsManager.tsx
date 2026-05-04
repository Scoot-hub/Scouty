import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomFields, useCreateCustomField, useUpdateCustomField, useDeleteCustomField, type CustomField } from '@/hooks/use-custom-fields';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Pencil, Trash2, Settings2, X, Trophy, Type, Hash, ListOrdered, Link2, ToggleLeft, User, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

const FIELD_TYPES = [
  { value: 'text',         label: 'custom_fields.type_text',         icon: Type },
  { value: 'number',       label: 'custom_fields.type_number',       icon: Hash },
  { value: 'select',       label: 'custom_fields.type_select',       icon: ListOrdered },
  { value: 'link',         label: 'custom_fields.type_link',         icon: Link2 },
  { value: 'boolean',      label: 'custom_fields.type_boolean',      icon: ToggleLeft },
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
  const [options, setOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState('');

  // When opened with initialField from parent, pre-populate
  useEffect(() => {
    if (open && initialField) {
      setEditingField(initialField);
      setFieldName(initialField.field_name);
      setFieldType(initialField.field_type);
      setOptions(initialField.field_options ?? []);
    }
  }, [open, initialField]);

  const resetForm = () => {
    setEditingField(null);
    setFieldName('');
    setFieldType('text');
    setOptions([]);
    setNewOption('');
  };

  const openEdit = (field: CustomField) => {
    setEditingField(field);
    setFieldName(field.field_name);
    setFieldType(field.field_type);
    setOptions(field.field_options ?? []);
    setOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const handleSave = async () => {
    if (!fieldName.trim()) return;
    try {
      if (editingField) {
        await updateField.mutateAsync({
          id: editingField.id,
          field_name: fieldName.trim(),
          field_type: fieldType,
          field_options: options,
        });
        toast.success(t('custom_fields.updated'));
      } else {
        await createField.mutateAsync({
          field_name: fieldName.trim(),
          field_type: fieldType,
          field_options: options,
          display_order: fields.length,
        });
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

  const removeOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

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

          {/* Existing fields list (only in create mode) */}
          {!editingField && fields.length > 0 && (
            <div className="space-y-1.5 mb-2 max-h-44 overflow-y-auto pr-1">
              {fields.map(f => {
                const ftMeta = FIELD_TYPES.find(ft => ft.value === f.field_type);
                const FIcon = ftMeta?.icon ?? Settings2;
                return (
                  <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <FIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">{f.field_name}</span>
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
              <Label>{t('custom_fields.field_name')}</Label>
              <Input value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder={t('custom_fields.field_name_placeholder')} className="mt-1" />
            </div>
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

            {/* Type-specific help text */}
            {fieldType === 'championship' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-700 dark:text-yellow-400">
                <Trophy className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('custom_fields.championship_hint')}</span>
              </div>
            )}

            {fieldType === 'select' && (
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
            <Button onClick={handleSave} disabled={!fieldName.trim()}>
              {editingField ? t('common.save') : t('custom_fields.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
