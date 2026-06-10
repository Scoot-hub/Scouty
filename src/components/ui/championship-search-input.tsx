import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Trophy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function useChampionshipSuggestions(query: string, allChampionships: string[]) {
  const lower = query.toLowerCase();
  if (!lower || lower.length < 1) return allChampionships.slice(0, 20);
  return allChampionships.filter(c => c.toLowerCase().includes(lower)).slice(0, 20);
}

interface ChampionshipSearchInputProps {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ChampionshipSearchInput({ value, onChange, placeholder = 'Rechercher un championnat…', className, disabled }: ChampionshipSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: autocomplete } = useQuery<{ championships: string[] }>({
    queryKey: ['calendar-autocomplete'],
    queryFn: () => fetch(`${API}/calendar-autocomplete`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });

  const allChampionships = autocomplete?.championships ?? [];
  const suggestions = useChampionshipSuggestions(query, allChampionships);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <Trophy className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn('pl-8 text-sm rounded-xl h-9', query && 'pr-7')}
      />
      {query && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => { setQuery(''); onChange(''); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border bg-popover shadow-xl overflow-hidden">
          <div className="p-1 max-h-64 overflow-y-auto space-y-0.5">
            {suggestions.map(name => (
              <button
                key={name}
                type="button"
                onMouseDown={e => { e.preventDefault(); select(name); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
              >
                <LeagueLogo league={name} size="xs" className="shrink-0" />
                <span className="text-sm truncate">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
