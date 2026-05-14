import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCustomFields, useCustomFieldValues, useUpsertCustomFieldValue, useDeleteCustomFieldValue, type CustomField } from '@/hooks/use-custom-fields';
import { usePlayers } from '@/hooks/use-players';
import { useMyMatches } from '@/hooks/use-match-assignments';
import { useChampionships } from '@/hooks/use-championships';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink, Users, CalendarDays, Search, X, Trophy, Phone, Mail, Info, Check, CheckCircle2, Pencil, Eye, EyeOff, PlusCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LeagueLogo } from '@/components/ui/league-logo';
import { formatDate, formatDateTime, type DateFormat, type TimeFormat, CURRENCIES } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import DateInput from '@/components/ui/date-input';

interface Props {
  playerId: string;
  editable?: boolean;
}

/**
 * Auto-resize textarea using the "grid mirror" CSS technique.
 * A grid container has two children stacked at the same cell: a hidden <div>
 * that mirrors the textarea content (which makes the grid row grow), and the
 * actual <textarea> sized to fill that row. No JS measurement needed.
 */
function AutoResizeTextarea({ value, onChange, onFocus, onBlur, onKeyDown, className, placeholder, minRows = 2 }: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  minRows?: number;
}) {
  const baseClasses = 'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed';
  // Trailing space prevents the mirror from collapsing on the last newline.
  const mirrorValue = (value || ' ') + (value.endsWith('\n') ? ' ' : '');

  return (
    <div
      className="grid w-full"
      style={{ gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }}
    >
      <div
        aria-hidden="true"
        className={cn(baseClasses, 'invisible whitespace-pre-wrap break-words [grid-area:1/1]')}
      >
        {mirrorValue}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        rows={minRows}
        placeholder={placeholder}
        className={cn(
          baseClasses,
          'resize-none overflow-hidden [grid-area:1/1] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    </div>
  );
}

function parseMultiselect(raw: string): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return raw ? [raw] : []; }
}

function serializeMultiselect(arr: string[]): string {
  return JSON.stringify(arr);
}

function FieldLabel({ field, isSaved }: { field: CustomField; isSaved: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0 min-w-0">
      <span className="truncate">{field.field_name}</span>
      {field.field_hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-primary transition-colors cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap text-xs leading-relaxed">
            {field.field_hint}
          </TooltipContent>
        </Tooltip>
      )}
      {isSaved && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold shrink-0 animate-in fade-in slide-in-from-left-1 duration-200">
          <CheckCircle2 className="w-3 h-3" />
          Enregistré
        </span>
      )}
    </span>
  );
}

export function CustomFieldsDisplay({ playerId, editable = false }: Props) {
  const { t } = useTranslation();
  const { dateFormat, timeFormat, timezone, currency } = useUiPreferences();
  const { data: fields = [] } = useCustomFields();
  const { data: values = [] } = useCustomFieldValues(playerId);
  const upsert = useUpsertCustomFieldValue();
  const deleteValue = useDeleteCustomFieldValue();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Optional fields the user just added in this session but hasn't filled in yet.
  // Tracked locally so we don't pollute custom_field_values with empty rows.
  const [expandedOptional, setExpandedOptional] = useState<Set<string>>(new Set());
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const hasNonEmptyValue = (fieldId: string) => {
    const v = values.find(x => x.custom_field_id === fieldId)?.value;
    return v != null && v !== '';
  };
  const visibleFields = fields.filter(f => {
    if (f.field_type === 'separator') return true;
    if (f.applies_to_all !== false) return true;
    // Optional field: show only if it has a real value, or user just added it in this session
    return hasNonEmptyValue(f.id) || (editable && expandedOptional.has(f.id));
  });
  const optionalAddable = fields.filter(f =>
    f.field_type !== 'separator' && f.applies_to_all === false && !hasNonEmptyValue(f.id) && !expandedOptional.has(f.id)
  );

  if (fields.length === 0) return null;
  if (!editable && visibleFields.length === 0) return null;

  const getValue = (fieldId: string) => values.find(v => v.custom_field_id === fieldId)?.value ?? '';

  const handleChange = (fieldId: string, value: string) => {
    // If the user is editing an optional field, keep it visible even if they
    // clear the value mid-edit (otherwise the row would vanish from under them).
    const field = fields.find(f => f.id === fieldId);
    if (field && field.applies_to_all === false) {
      setExpandedOptional(prev => { const next = new Set(prev); next.add(fieldId); return next; });
    }
    upsert.mutate({ customFieldId: fieldId, playerId, value }, {
      onSuccess: () => {
        setSavedIds(prev => new Set(prev).add(fieldId));
        clearTimeout(timersRef.current[fieldId]);
        timersRef.current[fieldId] = setTimeout(() => {
          setSavedIds(prev => { const next = new Set(prev); next.delete(fieldId); return next; });
        }, 2500);
      },
    });
  };

  const addOptional = (fieldId: string) =>
    setExpandedOptional(prev => { const next = new Set(prev); next.add(fieldId); return next; });
  const removeOptional = (fieldId: string) => {
    setExpandedOptional(prev => { const next = new Set(prev); next.delete(fieldId); return next; });
    if (values.some(v => v.custom_field_id === fieldId)) {
      deleteValue.mutate({ customFieldId: fieldId, playerId });
    }
  };

  return (
    <div className="space-y-2">
      {visibleFields.map(field => {
        // Separator — full-width, no value
        if (field.field_type === 'separator') {
          return (
            <div key={field.id} className="flex items-center gap-2 py-1">
              {field.field_name && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
                  {field.field_name}
                </span>
              )}
              <div className="flex-1 h-px bg-border" />
            </div>
          );
        }

        const isSaved = savedIds.has(field.id);
        const isOptional = editable && field.applies_to_all === false;
        const removeBtn = isOptional ? (
          <button
            onClick={() => removeOptional(field.id)}
            className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title={t('custom_fields.remove_optional_from_player')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null;

        // Vertical layout for fields whose values can be long (multi-line / long URLs / emails)
        const isVertical = ['textarea', 'multiselect', 'text', 'link', 'email', 'password'].includes(field.field_type);
        if (isVertical) {
          return (
            <div key={field.id} className={cn(
              'p-3 rounded-xl space-y-1.5 transition-colors duration-300',
              isSaved ? 'bg-emerald-500/10' : 'bg-muted/40',
            )}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel field={field} isSaved={isSaved} />
                {removeBtn}
              </div>
              {editable
                ? <EditableField field={field} value={getValue(field.id)} onChange={v => handleChange(field.id, v)} fullWidth dateFormat={dateFormat} timeFormat={timeFormat} timezone={timezone} currency={currency} />
                : <ReadonlyField field={field} value={getValue(field.id)} fullWidth dateFormat={dateFormat} timeFormat={timeFormat} timezone={timezone} currency={currency} />
              }
            </div>
          );
        }

        return (
          <div key={field.id} className={cn(
            'flex items-center justify-between p-3 rounded-xl transition-colors duration-300',
            isSaved ? 'bg-emerald-500/10' : 'bg-muted/40',
          )}>
            <FieldLabel field={field} isSaved={isSaved} />
            <div className="flex items-center gap-1 text-right min-w-0 ml-3">
              {editable
                ? <EditableField field={field} value={getValue(field.id)} onChange={v => handleChange(field.id, v)} dateFormat={dateFormat} timeFormat={timeFormat} timezone={timezone} currency={currency} />
                : <ReadonlyField field={field} value={getValue(field.id)} dateFormat={dateFormat} timeFormat={timeFormat} timezone={timezone} currency={currency} />
              }
              {removeBtn}
            </div>
          </div>
        );
      })}

      {editable && optionalAddable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl w-full justify-center mt-1 border-dashed">
              <PlusCircle className="w-3.5 h-3.5 mr-2" />
              {t('custom_fields.add_optional_field')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto w-56">
            {optionalAddable.map(f => (
              <DropdownMenuItem key={f.id} onClick={() => addOptional(f.id)}>
                {f.field_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password toggle (readonly)
// ---------------------------------------------------------------------------

function PasswordReadonly({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="flex items-center gap-1 justify-end">
      <span className={cn('text-sm font-mono', !show && 'tracking-widest')}>
        {show ? value : '●'.repeat(Math.min(value.length, 8))}
      </span>
      <button onClick={() => setShow(s => !s)}
        className="p-0.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Read-only display
// ---------------------------------------------------------------------------

function ReadonlyField({ field, value, fullWidth, dateFormat, timeFormat, timezone, currency }: {
  field: CustomField; value: string; fullWidth?: boolean;
  dateFormat: DateFormat; timeFormat: TimeFormat; timezone?: string; currency: string;
}) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  switch (field.field_type) {
    case 'link':
      return (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className={cn('text-sm text-primary font-medium flex items-start gap-1', fullWidth ? 'break-all' : '')}>
          <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
          {fullWidth ? <span className="break-all">{value}</span> : <span>{value.length > 40 ? value.slice(0, 40) + '...' : value}</span>}
        </a>
      );
    case 'boolean':
      return <span className="text-sm font-bold">{value === 'true' ? '✓' : '✗'}</span>;
    case 'player':
      return <PlayerRefReadonly playerId={value} />;
    case 'match':
      return <MatchRefReadonly matchId={value} dateFormat={dateFormat} />;
    case 'championship':
      return <ChampionshipRefReadonly name={value} />;
    case 'date':
      return <span className="text-sm font-medium">{formatDate(value, dateFormat)}</span>;
    case 'datetime':
      return <span className="text-sm font-medium">{formatDateTime(value, dateFormat, timeFormat, timezone)}</span>;
    case 'textarea':
      return <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">{value}</p>;
    case 'text':
      return <p className="text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">{value}</p>;
    case 'price':
      return <span className="text-sm font-semibold">{currencySymbol}{Number(value).toLocaleString()}</span>;
    case 'phone':
      return (
        <a href={`tel:${value}`} className={cn('text-sm text-primary font-medium flex items-center gap-1', fullWidth ? '' : 'justify-end')}>
          <Phone className="w-3 h-3 shrink-0" /> {value}
        </a>
      );
    case 'email':
      return (
        <a href={`mailto:${value}`} className={cn('text-sm text-primary font-medium flex items-center gap-1', fullWidth ? 'break-all' : 'justify-end')}>
          <Mail className="w-3 h-3 shrink-0" /> <span className={cn(fullWidth ? 'break-all' : '')}>{value}</span>
        </a>
      );
    case 'password':
      return <PasswordReadonly value={value} />;
    case 'multiselect': {
      const opts = parseMultiselect(value);
      if (!opts.length) return <span className="text-sm text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1 mt-1">
          {opts.map(o => <Badge key={o} variant="secondary" className="text-xs">{o}</Badge>)}
        </div>
      );
    }
    default:
      return <span className="text-sm font-medium">{value}</span>;
  }
}

// ---------------------------------------------------------------------------
// Editable field
// ---------------------------------------------------------------------------

function ensureHttps(url: string): string {
  if (!url.trim()) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return 'https://' + url;
}

function EditableField({ field, value, onChange, fullWidth, dateFormat, timeFormat, timezone, currency }: {
  field: CustomField; value: string; onChange: (v: string) => void; fullWidth?: boolean;
  dateFormat: DateFormat; timeFormat: TimeFormat; timezone?: string; currency: string;
}) {
  const [localVal, setLocalVal] = useState(value);
  const [linkEditing, setLinkEditing] = useState(false);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Track focus so we don't overwrite the user's in-progress edits when the
  // parent query refetches (e.g. first load delivers value after mount)
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setLocalVal(value);
    }
  }, [value]);

  const isDirty = localVal !== value;

  const commit = () => {
    focusedRef.current = false;
    const finalVal = field.field_type === 'link' ? ensureHttps(localVal) : localVal;
    if (finalVal !== localVal) setLocalVal(finalVal);
    if (finalVal !== value) onChange(finalVal);
    if (field.field_type === 'link') setLinkEditing(false);
    if (field.field_type === 'phone') setPhoneEditing(false);
    if (field.field_type === 'email') setEmailEditing(false);
  };

  const onFocus = () => { focusedRef.current = true; };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && field.field_type !== 'textarea') { e.preventDefault(); commit(); }
    // Ctrl+Enter (ou Cmd+Enter) pour enregistrer dans textarea
    if (e.key === 'Enter' && field.field_type === 'textarea' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); setLocalVal(value); focusedRef.current = false; }
  };

  const SaveBtn = isDirty ? (
    <button onClick={commit}
      className="ml-1 p-0.5 rounded bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors shrink-0"
      title="Enregistrer">
      <Check className="w-3.5 h-3.5" />
    </button>
  ) : null;
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;

  switch (field.field_type) {
    case 'select':
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
    case 'multiselect':
      return <MultiSelectPicker field={field} value={value} onChange={onChange} />;
    case 'boolean':
      return <Checkbox checked={value === 'true'} onCheckedChange={c => onChange(c ? 'true' : 'false')} />;
    case 'player':
      return <PlayerRefPicker value={value} onChange={onChange} />;
    case 'match':
      return <MatchRefPicker value={value} onChange={onChange} />;
    case 'championship':
      return <ChampionshipRefPicker value={value} onChange={onChange} />;
    case 'date':
      return (
        <DateInput value={localVal} onChange={iso => { setLocalVal(iso); if (iso !== value) onChange(iso); }}
          className="h-8 text-sm w-[180px]" />
      );
    case 'datetime':
      return (
        <input type="datetime-local" value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onFocus={onFocus} onBlur={commit} onKeyDown={onKeyDown}
          className="h-8 text-sm border border-border rounded-lg px-2 bg-background w-[200px]" />
      );
    case 'textarea':
      return (
        <div className="w-full">
          <AutoResizeTextarea
            value={localVal}
            onChange={setLocalVal}
            onFocus={onFocus}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder="—"
            minRows={2}
          />
          <p className="mt-1 text-[10px] text-muted-foreground/50">Ctrl+Entrée pour enregistrer</p>
        </div>
      );
    case 'price':
      return (
        <div className="flex items-center gap-1">
          <div className="relative w-[130px]">
            <input type="number" value={localVal} onChange={e => setLocalVal(e.target.value)}
              onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
              className="h-8 text-sm border border-border rounded-lg px-2 pr-8 bg-background w-full text-right" placeholder="0" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none font-medium">{currencySymbol}</span>
          </div>
          {SaveBtn}
        </div>
      );
    case 'phone':
      if (value && !phoneEditing) {
        return (
          <div className={cn('flex items-center gap-1.5', fullWidth ? 'w-full' : 'max-w-[200px]')}>
            <a href={`tel:${value}`} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline truncate flex-1">
              <Phone className="w-3 h-3 shrink-0" /><span className="truncate">{value}</span>
            </a>
            <button onClick={() => setPhoneEditing(true)} className="p-0.5 hover:bg-muted rounded shrink-0" title="Modifier">
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
            <button onClick={() => { setLocalVal(''); onChange(''); }} className="p-0.5 hover:bg-muted rounded shrink-0" title="Supprimer">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      }
      return (
        <div className={cn('flex items-center gap-1', fullWidth ? 'w-full' : '')}>
          <Input type="tel" value={localVal} onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            autoFocus={phoneEditing}
            className={cn('h-8 text-sm', fullWidth ? 'flex-1 text-left' : 'w-[170px] text-right')}
            placeholder="+33 6 00 00 00 00" />
          {SaveBtn}
        </div>
      );
    case 'email':
      if (value && !emailEditing) {
        return (
          <div className={cn('flex items-center gap-1.5', fullWidth ? 'w-full' : 'max-w-[220px]')}>
            <a href={`mailto:${value}`} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline truncate flex-1">
              <Mail className="w-3 h-3 shrink-0" /><span className="truncate">{value}</span>
            </a>
            <button onClick={() => setEmailEditing(true)} className="p-0.5 hover:bg-muted rounded shrink-0" title="Modifier">
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
            <button onClick={() => { setLocalVal(''); onChange(''); }} className="p-0.5 hover:bg-muted rounded shrink-0" title="Supprimer">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      }
      return (
        <div className={cn('flex items-center gap-1', fullWidth ? 'w-full' : '')}>
          <Input type="email" value={localVal} onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            autoFocus={emailEditing}
            className={cn('h-8 text-sm', fullWidth ? 'flex-1 text-left' : 'w-[190px] text-right')}
            placeholder="email@exemple.com" />
          {SaveBtn}
        </div>
      );
    case 'password':
      return (
        <div className={cn('flex items-center gap-1', fullWidth ? 'w-full' : 'w-[200px]')}>
          <Input type={showPassword ? 'text' : 'password'} value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            className="flex-1 h-8 text-sm" placeholder="••••••••" />
          <button onClick={() => setShowPassword(s => !s)}
            className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground shrink-0">
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {SaveBtn}
        </div>
      );
    case 'link':
      if (value && !linkEditing) {
        return (
          <div className={cn('flex items-center gap-1.5', fullWidth ? 'w-full' : 'max-w-[220px]')}>
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary font-medium flex items-center gap-1 hover:underline truncate flex-1">
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{value.replace(/^https?:\/\//, '')}</span>
            </a>
            <button onClick={() => setLinkEditing(true)}
              className="p-0.5 hover:bg-muted rounded shrink-0" title="Modifier">
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
            <button onClick={() => { setLocalVal(''); onChange(''); }}
              className="p-0.5 hover:bg-muted rounded shrink-0" title="Supprimer">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      }
      return (
        <div className={cn('flex items-center gap-1', fullWidth ? 'w-full' : '')}>
          <Input value={localVal} onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            autoFocus={linkEditing}
            className={cn('h-8 text-sm', fullWidth ? 'flex-1 text-left' : 'w-[200px] text-right')}
            placeholder="https://..." />
          {SaveBtn}
        </div>
      );
    case 'text':
      return (
        <div className={cn('flex items-center gap-1', fullWidth ? 'w-full' : '')}>
          <Input value={localVal} maxLength={256} onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            className={cn('h-8 text-sm', fullWidth ? 'flex-1 text-left' : 'w-[170px] text-right')}
            placeholder="—" />
          {SaveBtn}
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1">
          <Input type={field.field_type === 'number' ? 'number' : 'text'}
            value={localVal} onChange={e => setLocalVal(e.target.value)}
            onFocus={onFocus} onKeyDown={onKeyDown} onBlur={commit}
            className="w-[170px] h-8 text-sm text-right" placeholder="—" />
          {SaveBtn}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Multi-select picker (checkboxes)
// ---------------------------------------------------------------------------

function MultiSelectPicker({ field, value, onChange }: { field: CustomField; value: string; onChange: (v: string) => void }) {
  const selected = useMemo(() => parseMultiselect(value), [value]);

  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(serializeMultiselect(next));
  };

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {(field.field_options ?? []).map(opt => (
        <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
          <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player reference picker
// ---------------------------------------------------------------------------

function PlayerRefReadonly({ playerId }: { playerId: string }) {
  const { data: players = [], isLoading } = usePlayers();
  const player = players.find(p => p.id === playerId);
  if (isLoading && !player) return (
    <span className="text-sm text-muted-foreground flex items-center gap-1">
      <Users className="w-3 h-3 animate-pulse" />
      <span className="h-3.5 w-24 bg-muted animate-pulse rounded" />
    </span>
  );
  if (!player) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Link to={`/player/${playerId}`} className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline">
      <Users className="w-3 h-3" /> {player.name}
    </Link>
  );
}

function PlayerRefPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data: players = [], isLoading } = usePlayers();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = players.find(p => p.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return players.slice(0, 20);
    const q = search.toLowerCase();
    return players.filter(p => p.name.toLowerCase().includes(q) || p.club?.toLowerCase().includes(q)).slice(0, 20);
  }, [players, search]);

  // Skeleton while the players list loads and we already have a selected value
  if (value && isLoading && !selected) {
    return (
      <div className="flex items-center gap-1.5 w-[220px]">
        <Users className="w-3 h-3 text-muted-foreground shrink-0 animate-pulse" />
        <span className="h-3.5 flex-1 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (selected && !pickerOpen) {
    return (
      <div className="flex items-center gap-1.5 w-[220px]">
        <Link to={`/player/${selected.id}`} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline truncate flex-1">
          <Users className="w-3 h-3 shrink-0" /> {selected.name}
        </Link>
        <button onClick={() => { onChange(''); setPickerOpen(true); }} className="p-0.5 hover:bg-muted rounded shrink-0">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative w-[220px]">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => { setSearch(e.target.value); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)}
          placeholder={t('custom_fields.search_player')} className="h-8 text-sm pl-7" />
      </div>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute z-50 top-9 left-0 w-full max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filtered.length === 0
              ? <p className="p-3 text-xs text-muted-foreground text-center">{t('custom_fields.no_results')}</p>
              : filtered.map(p => (
                <button key={p.id} onClick={() => { onChange(p.id); setSearch(''); setPickerOpen(false); }}
                  className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors', p.id === value && 'bg-primary/10')}>
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{p.name}</span>
                  {p.club && <span className="text-xs text-muted-foreground truncate ml-auto">{p.club}</span>}
                </button>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Championship reference picker
// ---------------------------------------------------------------------------

function ChampionshipRefReadonly({ name }: { name: string }) {
  if (!name) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Link to={`/championships?selected=${encodeURIComponent(name)}`}
      className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline">
      <LeagueLogo league={name} size="sm" /> {name} <Trophy className="w-3 h-3 shrink-0" />
    </Link>
  );
}

function ChampionshipRefPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data: championships = [] } = useChampionships();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (q ? championships.filter(c => c.name.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q)) : championships).slice(0, 25);
  }, [championships, search]);

  if (value && !pickerOpen) {
    return (
      <div className="flex items-center gap-1.5 w-[220px]">
        <Link to={`/championships?selected=${encodeURIComponent(value)}`}
          className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline truncate flex-1">
          <LeagueLogo league={value} size="sm" /> <span className="truncate">{value}</span>
        </Link>
        <button onClick={() => { onChange(''); setPickerOpen(true); }} className="p-0.5 hover:bg-muted rounded shrink-0">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative w-[220px]">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => { setSearch(e.target.value); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)}
          placeholder={t('custom_fields.search_championship')} className="h-8 text-sm pl-7" />
      </div>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute z-50 top-9 left-0 w-full max-h-56 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filtered.length === 0
              ? <p className="p-3 text-xs text-muted-foreground text-center">{t('custom_fields.no_results')}</p>
              : filtered.map(c => (
                <button key={c.name} onClick={() => { onChange(c.name); setSearch(''); setPickerOpen(false); }}
                  className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2.5 transition-colors', c.name === value && 'bg-primary/10')}>
                  <LeagueLogo league={c.name ?? ''} size="sm" />
                  <span className="truncate font-medium">{c.name}</span>
                  {c.country && <span className="text-xs text-muted-foreground ml-auto shrink-0">{c.country}</span>}
                </button>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match reference picker
// ---------------------------------------------------------------------------

function MatchRefReadonly({ matchId, dateFormat }: { matchId: string; dateFormat: DateFormat }) {
  const { data: matches = [] } = useMyMatches();
  const match = matches.find(m => m.id === matchId);
  if (!match) return <span className="text-sm text-muted-foreground">—</span>;
  const label = `${match.home_team} - ${match.away_team}`;
  const date = formatDate(match.match_date, dateFormat);
  return (
    <Link to="/my-matches" className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline">
      <CalendarDays className="w-3 h-3" />
      <span>{label} <span className="text-muted-foreground font-normal">({date})</span></span>
    </Link>
  );
}

function MatchRefPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();
  const { data: matches = [] } = useMyMatches();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = matches.find(m => m.id === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (search.trim()
      ? matches.filter(m => m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q) || m.competition?.toLowerCase().includes(q))
      : matches).slice(0, 20);
  }, [matches, search]);

  if (selected && !pickerOpen) {
    const label = `${selected.home_team} - ${selected.away_team}`;
    const date = formatDate(selected.match_date, dateFormat);
    return (
      <div className="flex items-center gap-1.5 w-[260px]">
        <span className="text-sm font-medium flex items-center gap-1 truncate flex-1">
          <CalendarDays className="w-3 h-3 text-primary shrink-0" />
          {label} <span className="text-muted-foreground font-normal">({date})</span>
        </span>
        <button onClick={() => { onChange(''); setPickerOpen(true); }} className="p-0.5 hover:bg-muted rounded shrink-0">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative w-[260px]">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={search} onChange={e => { setSearch(e.target.value); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)}
          placeholder={t('custom_fields.search_match')} className="h-8 text-sm pl-7" />
      </div>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute z-50 top-9 left-0 w-full max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filtered.length === 0
              ? <p className="p-3 text-xs text-muted-foreground text-center">{t('custom_fields.no_results')}</p>
              : filtered.map(m => {
                const date = formatDate(m.match_date, dateFormat);
                return (
                  <button key={m.id} onClick={() => { onChange(m.id); setSearch(''); setPickerOpen(false); }}
                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors', m.id === value && 'bg-primary/10')}>
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{m.home_team} - {m.away_team}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{date}</span>
                  </button>
                );
              })
            }
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form variant (Add/Edit player pages)
// ---------------------------------------------------------------------------

export function CustomFieldsForm({ values, onChange }: { values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const { t } = useTranslation();
  const { dateFormat, timeFormat, timezone, currency } = useUiPreferences();
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
  const { data: fields = [] } = useCustomFields();
  // Optional fields the user explicitly added in this session (so they stay visible
  // even when their value is empty mid-edit).
  const [expandedOptional, setExpandedOptional] = useState<Set<string>>(new Set());

  if (fields.length === 0) return null;

  const handleChange = (fieldId: string, val: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field && field.applies_to_all === false) {
      setExpandedOptional(prev => { const next = new Set(prev); next.add(fieldId); return next; });
    }
    onChange({ ...values, [fieldId]: val });
  };
  const removeOptional = (fieldId: string) => {
    setExpandedOptional(prev => { const next = new Set(prev); next.delete(fieldId); return next; });
    const next = { ...values };
    delete next[fieldId];
    onChange(next);
  };

  const hasNonEmptyValue = (fieldId: string) => {
    const v = values[fieldId];
    return v != null && v !== '';
  };
  const visibleFields = fields.filter(f => {
    if (f.field_type === 'separator') return true;
    if (f.applies_to_all !== false) return true;
    return hasNonEmptyValue(f.id) || expandedOptional.has(f.id);
  });
  const optionalAddable = fields.filter(f =>
    f.field_type !== 'separator' && f.applies_to_all === false && !hasNonEmptyValue(f.id) && !expandedOptional.has(f.id)
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('custom_fields.title')}</h2>
      {visibleFields.map(field => {
        if (field.field_type === 'separator') {
          return (
            <div key={field.id} className="flex items-center gap-2 py-1">
              {field.field_name && <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{field.field_name}</span>}
              <div className="flex-1 h-px bg-border" />
            </div>
          );
        }

        const val = values[field.id] ?? '';
        const isOptional = field.applies_to_all === false;

        return (
          <div key={field.id}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{field.field_name}</label>
              {isOptional && (
                <button
                  type="button"
                  onClick={() => removeOptional(field.id)}
                  className="p-0.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title={t('custom_fields.remove_optional_from_player')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1">
              {field.field_type === 'select' ? (
                <Select value={val} onValueChange={v => handleChange(field.id, v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {(field.field_options ?? []).map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : field.field_type === 'multiselect' ? (
                <MultiSelectPicker field={field} value={val} onChange={v => handleChange(field.id, v)} />
              ) : field.field_type === 'boolean' ? (
                <Checkbox checked={val === 'true'} onCheckedChange={c => handleChange(field.id, c ? 'true' : 'false')} />
              ) : field.field_type === 'textarea' ? (
                <AutoResizeTextarea value={val} onChange={v => handleChange(field.id, v)} placeholder="—" minRows={2} />
              ) : field.field_type === 'date' ? (
                <DateInput value={val} onChange={iso => handleChange(field.id, iso)} />
              ) : field.field_type === 'datetime' ? (
                <input type="datetime-local" value={val} onChange={e => handleChange(field.id, e.target.value)}
                  className="w-full h-9 border border-border rounded-md px-3 text-sm bg-background" />
              ) : field.field_type === 'price' ? (
                <div className="relative">
                  <input type="number" value={val} onChange={e => handleChange(field.id, e.target.value)}
                    className="w-full h-9 border border-border rounded-md px-3 pr-8 text-sm bg-background" placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none font-medium">{currencySymbol}</span>
                </div>
              ) : field.field_type === 'phone' ? (
                <Input type="tel" value={val} onChange={e => handleChange(field.id, e.target.value)} placeholder="+33 6 00 00 00 00" />
              ) : field.field_type === 'email' ? (
                <Input type="email" value={val} onChange={e => handleChange(field.id, e.target.value)} placeholder="email@exemple.com" />
              ) : field.field_type === 'password' ? (
                <Input type="password" value={val} onChange={e => handleChange(field.id, e.target.value)} placeholder="••••••••" />
              ) : field.field_type === 'player' ? (
                <PlayerRefPicker value={val} onChange={v => handleChange(field.id, v)} />
              ) : field.field_type === 'match' ? (
                <MatchRefPicker value={val} onChange={v => handleChange(field.id, v)} />
              ) : field.field_type === 'championship' ? (
                <ChampionshipRefPicker value={val} onChange={v => handleChange(field.id, v)} />
              ) : field.field_type === 'link' ? (
                <Input value={val} onChange={e => handleChange(field.id, e.target.value)}
                  onBlur={e => { const v = ensureHttps(e.target.value); if (v !== val) handleChange(field.id, v); }}
                  placeholder="https://..." />
              ) : field.field_type === 'text' ? (
                <Input value={val} maxLength={256} onChange={e => handleChange(field.id, e.target.value)} placeholder="—" />
              ) : (
                <Input type={field.field_type === 'number' ? 'number' : 'text'} value={val}
                  onChange={e => handleChange(field.id, e.target.value)} placeholder="—" />
              )}
            </div>
          </div>
        );
      })}

      {optionalAddable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="rounded-xl w-full justify-center border-dashed">
              <PlusCircle className="w-3.5 h-3.5 mr-2" />
              {t('custom_fields.add_optional_field')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="max-h-64 overflow-y-auto w-56">
            {optionalAddable.map(f => (
              <DropdownMenuItem
                key={f.id}
                onClick={() => setExpandedOptional(prev => { const next = new Set(prev); next.add(f.id); return next; })}
              >
                {f.field_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
