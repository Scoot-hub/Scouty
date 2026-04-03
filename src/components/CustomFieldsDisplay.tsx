import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCustomFields, useCustomFieldValues, useUpsertCustomFieldValue, type CustomField } from '@/hooks/use-custom-fields';
import { usePlayers } from '@/hooks/use-players';
import { useMyMatches } from '@/hooks/use-match-assignments';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, Users, CalendarDays, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  if (field.field_type === 'player') {
    return <PlayerRefReadonly playerId={value} />;
  }
  if (field.field_type === 'match') {
    return <MatchRefReadonly matchId={value} />;
  }
  return <span className="text-sm font-bold">{value}</span>;
}

function PlayerRefReadonly({ playerId }: { playerId: string }) {
  const { data: players = [] } = usePlayers();
  const player = players.find(p => p.id === playerId);
  if (!player) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <Link to={`/player/${playerId}`} className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline">
      <Users className="w-3 h-3" />
      {player.name}
    </Link>
  );
}

function MatchRefReadonly({ matchId }: { matchId: string }) {
  const { data: matches = [] } = useMyMatches();
  const match = matches.find(m => m.id === matchId);
  if (!match) return <span className="text-sm text-muted-foreground">—</span>;
  const label = `${match.home_team} - ${match.away_team}`;
  const date = new Date(match.match_date).toLocaleDateString();
  return (
    <Link to="/my-matches" className="text-sm text-primary font-medium flex items-center gap-1.5 hover:underline">
      <CalendarDays className="w-3 h-3" />
      <span>{label} <span className="text-muted-foreground font-normal">({date})</span></span>
    </Link>
  );
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
  if (field.field_type === 'player') {
    return <PlayerRefPicker value={value} onChange={onChange} />;
  }
  if (field.field_type === 'match') {
    return <MatchRefPicker value={value} onChange={onChange} />;
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

// ---------------------------------------------------------------------------
// Searchable picker for player references
// ---------------------------------------------------------------------------

function PlayerRefPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data: players = [] } = usePlayers();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = players.find(p => p.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return players.slice(0, 20);
    const q = search.toLowerCase();
    return players.filter(p => p.name.toLowerCase().includes(q) || p.club?.toLowerCase().includes(q)).slice(0, 20);
  }, [players, search]);

  if (selected && !pickerOpen) {
    return (
      <div className="flex items-center gap-1.5 w-[220px]">
        <Link to={`/player/${selected.id}`} className="text-sm text-primary font-medium flex items-center gap-1 hover:underline truncate flex-1">
          <Users className="w-3 h-3 shrink-0" />
          {selected.name}
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
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPickerOpen(true); }}
          onFocus={() => setPickerOpen(true)}
          placeholder={t('custom_fields.search_player')}
          className="h-8 text-sm pl-7"
        />
      </div>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute z-50 top-9 left-0 w-full max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">{t('custom_fields.no_results')}</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setSearch(''); setPickerOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors',
                    p.id === value && 'bg-primary/10'
                  )}
                >
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">{p.name}</span>
                  {p.club && <span className="text-xs text-muted-foreground truncate ml-auto">{p.club}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable picker for match references
// ---------------------------------------------------------------------------

function MatchRefPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data: matches = [] } = useMyMatches();
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = matches.find(m => m.id === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = search.trim()
      ? matches.filter(m => m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q) || m.competition?.toLowerCase().includes(q))
      : matches;
    return list.slice(0, 20);
  }, [matches, search]);

  if (selected && !pickerOpen) {
    const label = `${selected.home_team} - ${selected.away_team}`;
    const date = new Date(selected.match_date).toLocaleDateString();
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
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPickerOpen(true); }}
          onFocus={() => setPickerOpen(true)}
          placeholder={t('custom_fields.search_match')}
          className="h-8 text-sm pl-7"
        />
      </div>
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute z-50 top-9 left-0 w-full max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">{t('custom_fields.no_results')}</p>
            ) : (
              filtered.map(m => {
                const date = new Date(m.match_date).toLocaleDateString();
                return (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setSearch(''); setPickerOpen(false); }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 transition-colors',
                      m.id === value && 'bg-primary/10'
                    )}
                  >
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{m.home_team} - {m.away_team}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{date}</span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form variant (for Add/Edit player pages)
// ---------------------------------------------------------------------------

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
          ) : field.field_type === 'player' ? (
            <div className="mt-1">
              <PlayerRefPicker value={values[field.id] ?? ''} onChange={v => handleChange(field.id, v)} />
            </div>
          ) : field.field_type === 'match' ? (
            <div className="mt-1">
              <MatchRefPicker value={values[field.id] ?? ''} onChange={v => handleChange(field.id, v)} />
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
