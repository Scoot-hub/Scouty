import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { ClubBadge } from '@/components/ui/club-badge';
import { Search, Database, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface ClubSuggestion {
  club_name: string;
  logo_url: string | null;
  competition: string;
  country: string;
}

function useClubSuggestions(query: string) {
  return useQuery<ClubSuggestion[]>({
    queryKey: ['club-search-input', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const params = new URLSearchParams({ q: query });
      const resp = await fetch(`${API}/club-search?${params}`);
      const local: ClubSuggestion[] = resp.ok ? await resp.json() : [];
      // Also try TM for richer results (fire-and-forget, best-effort)
      if (query.length >= 3) {
        try {
          const tmResp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(query)}`);
          const tm = tmResp.ok ? await tmResp.json() : null;
          if (tm?.clubName && !local.some(l => l.club_name.toLowerCase() === tm.clubName.toLowerCase())) {
            local.push({ club_name: tm.clubName, logo_url: tm.badge || null, competition: tm.league || '', country: tm.country || '' });
          }
        } catch {}
      }
      return local;
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

interface ClubSearchInputProps {
  value: string;
  onChange: (clubName: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
}

export function ClubSearchInput({ value, onChange, placeholder = 'Rechercher un club…', className, disabled, size = 'default' }: ClubSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: suggestions = [] } = useClubSuggestions(query);

  // Sync external value changes
  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (club: ClubSuggestion) => {
    setQuery(club.club_name);
    onChange(club.club_name);
    setOpen(false);
  };

  const heightClass = size === 'sm' ? 'h-8' : 'h-9';

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (query.length >= 2) setOpen(true); }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn('pl-8 text-sm rounded-xl', heightClass, query && 'pr-7')}
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
            <p className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3 h-3" />Base de données
            </p>
            {suggestions.map(s => (
              <button
                key={s.club_name}
                type="button"
                onMouseDown={e => { e.preventDefault(); select(s); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
              >
                {s.logo_url
                  ? <img src={s.logo_url} alt="" className="w-6 h-6 object-contain shrink-0" />
                  : <ClubBadge club={s.club_name} size="xs" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.club_name}</p>
                  {(s.competition || s.country) && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[s.competition, s.country].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
