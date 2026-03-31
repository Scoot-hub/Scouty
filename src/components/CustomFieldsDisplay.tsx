import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomFields, useCustomFieldValues, useUpsertCustomFieldValue, type CustomField } from '@/hooks/use-custom-fields';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from 'lucide-react';

interface Props {
  playerId: string;
  editable?: boolean;
}

export function CustomFieldsDisplay({ playerId, editable = false }: Props) {
  const { t } = useTranslation();
  const { data: fields = [] } = useCustomFields();
  const { data: values = [] } = useCustomFieldValues(playerId);
  const upsert = useUpsertCustomFieldValue();

  if (fields.length === 0) return null;

  const getValue = (fieldId: string) => values.find(v => v.custom_field_id === fieldId)?.value ?? '';

  const handleChange = (fieldId: string, value: string) => {
    upsert.mutate({ customFieldId: fieldId, playerId, value });
  };

  return (
    <div className="space-y-2">
      {fields.map(field => (
        <div key={field.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
          <span className="text-sm text-muted-foreground">{field.field_name}</span>
          <div className="text-right">
            {editable ? (
              <EditableField field={field} value={getValue(field.id)} onChange={v => handleChange(field.id, v)} />
            ) : (
              <ReadonlyField field={field} value={getValue(field.id)} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadonlyField({ field, value }: { field: CustomField; value: string }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;

  if (field.field_type === 'link') {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-primary font-medium flex items-center gap-1">
        <ExternalLink className="w-3 h-3" /> {value.length > 40 ? value.slice(0, 40) + '...' : value}
      </a>
    );
  }
  if (field.field_type === 'boolean') {
    return <span className="text-sm font-bold">{value === 'true' ? '✓' : '✗'}</span>;
  }
  return <span className="text-sm font-bold">{value}</span>;
}

function EditableField({ field, value, onChange }: { field: CustomField; value: string; onChange: (v: string) => void }) {
  const [localVal, setLocalVal] = useState(value);

  const commit = () => { if (localVal !== value) onChange(localVal); };

  if (field.field_type === 'select') {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {(field.field_options ?? []).map(opt => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.field_type === 'boolean') {
    return (
      <Checkbox checked={value === 'true'} onCheckedChange={c => onChange(c ? 'true' : 'false')} />
    );
  }
  return (
    <Input
      type={field.field_type === 'number' ? 'number' : 'text'}
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={commit}
      className="w-[180px] h-8 text-sm text-right"
      placeholder="—"
    />
  );
}

// For use in forms (add/edit player)
export function CustomFieldsForm({ values, onChange }: { values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const { t } = useTranslation();
  const { data: fields = [] } = useCustomFields();

  if (fields.length === 0) return null;

  const handleChange = (fieldId: string, val: string) => {
    onChange({ ...values, [fieldId]: val });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('custom_fields.title')}</h2>
      {fields.map(field => (
        <div key={field.id}>
          <label className="text-sm font-medium">{field.field_name}</label>
          {field.field_type === 'select' ? (
            <Select value={values[field.id] ?? ''} onValueChange={v => handleChange(field.id, v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {(field.field_options ?? []).map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field.field_type === 'boolean' ? (
            <div className="mt-1">
              <Checkbox checked={values[field.id] === 'true'} onCheckedChange={c => handleChange(field.id, c ? 'true' : 'false')} />
            </div>
          ) : (
            <Input
              type={field.field_type === 'number' ? 'number' : 'text'}
              value={values[field.id] ?? ''}
              onChange={e => handleChange(field.id, e.target.value)}
              className="mt-1"
              placeholder={field.field_type === 'link' ? 'https://...' : ''}
            />
          )}
        </div>
      ))}
    </div>
  );
}
