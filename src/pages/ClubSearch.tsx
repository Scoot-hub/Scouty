import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { usePlayers } from '@/hooks/use-players';
import { useFollowedClubs, useUnfollowClub, useReorderFollowedClubs, type FollowedClub } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { Search, Building2, Heart, HeartOff, Database, Users, ArrowRight, X, Globe, ChevronDown, GripVertical, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface ClubSuggestion {
  club_name: string;
  logo_url: string | null;
  competition: string;
  country: string;
}

interface CountryOption { country: string; country_code: string; club_count: number; }
interface DivisionOption { competition: string; club_count: number; }

function useClubSuggestions(query: string, country: string, competition: string) {
  return useQuery<ClubSuggestion[]>({
    queryKey: ['club-search', query, country, competition],
    queryFn: async () => {
      if (!query && !country && !competition) return [];
      if (!query && (country || competition)) {
        const p = new URLSearchParams();
        if (country) p.set('country', country);
        if (competition) p.set('competition', competition);
        const resp = await fetch(`${API}/club-search?${p}`);
        return resp.ok ? resp.json() : [];
      }
      if (query.length < 2) return [];
      const params = new URLSearchParams({ q: query });
      if (country) params.set('country', country);
      if (competition) params.set('competition', competition);
      const resp = await fetch(`${API}/club-search?${params}`);
      const local: ClubSuggestion[] = resp.ok ? await resp.json() : [];
      if (query.length >= 3 && !country && !competition) {
        try {
          const tmResp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(query)}`);
          const tm = tmResp.ok ? await tmResp.json() : null;
          if (tm?.clubName) {
            const alreadyHas = local.some(l => l.club_name.toLowerCase() === tm.clubName.toLowerCase());
            if (!alreadyHas) local.push({ club_name: tm.clubName, logo_url: tm.badge || null, competition: tm.league || '', country: tm.country || '' });
          }
        } catch {}
      }
      return local;
    },
    enabled: query.length >= 2 || !!country || !!competition,
    staleTime: 60_000,
  });
}

function useClubCountries() {
  return useQuery<CountryOption[]>({
    queryKey: ['club-countries'],
    queryFn: async () => {
      const resp = await fetch(`${API}/club-countries`);
      return resp.ok ? resp.json() : [];
    },
    staleTime: 60 * 60_000,
  });
}

function useClubDivisions(country: string) {
  return useQuery<DivisionOption[]>({
    queryKey: ['club-divisions', country],
    queryFn: async () => {
      const p = country ? `?country=${encodeURIComponent(country)}` : '';
      const resp = await fetch(`${API}/club-divisions${p}`);
      return resp.ok ? resp.json() : [];
    },
    staleTime: 30 * 60_000,
  });
}

function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ── Drag-and-drop followed clubs ─────────────────────────────────────────────

function FollowedClubsList({
  clubs,
  onNavigate,
  onUnfollow,
}: {
  clubs: FollowedClub[];
  onNavigate: (name: string) => void;
  onUnfollow: (id: string) => void;
}) {
  const reorder = useReorderFollowedClubs();
  const [items, setItems] = useState<FollowedClub[]>(clubs);
  const dragIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);

  useEffect(() => { setItems(clubs); }, [clubs]);

  const handleDragStart = (id: string) => { dragIdRef.current = id; };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverIdRef.current = id;
  };

  const handleDrop = () => {
    const fromId = dragIdRef.current;
    const toId = dragOverIdRef.current;
    if (!fromId || !toId || fromId === toId) return;

    setItems(prev => {
      const arr = [...prev];
      const fromIdx = arr.findIndex(c => c.id === fromId);
      const toIdx = arr.findIndex(c => c.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      // Persist new order
      const order = arr.map((c, i) => ({ id: c.id, display_order: i }));
      reorder.mutate(order);
      return arr;
    });

    dragIdRef.current = null;
    dragOverIdRef.current = null;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {items.map(fc => (
        <div
          key={fc.id}
          draggable
          onDragStart={() => handleDragStart(fc.id)}
          onDragOver={e => handleDragOver(e, fc.id)}
          onDrop={handleDrop}
          className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors group cursor-pointer select-none"
          onClick={() => onNavigate(fc.club_name)}
        >
          <span
            className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </span>
          <ClubBadge club={fc.club_name} size="sm" />
          <span className="flex-1 text-sm font-medium truncate group-hover:text-primary transition-colors">{fc.club_name}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          <button
            onClick={e => { e.stopPropagation(); onUnfollow(fc.id); }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
          >
            <HeartOff className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Filter dropdown ───────────────────────────────────────────────────────────

function FilterDropdown<T>({
  label,
  icon: Icon,
  value,
  options,
  onSelect,
  renderOption,
  renderSelected,
  dropdownRef,
  open,
  setOpen,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  options: T[];
  onSelect: (v: string) => void;
  renderOption: (item: T) => React.ReactNode;
  renderSelected: () => React.ReactNode;
  dropdownRef: React.RefObject<HTMLDivElement>;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'h-9 px-3 flex items-center gap-1.5 rounded-lg border text-sm transition-colors shrink-0',
          value
            ? 'border-primary bg-primary/5 text-primary font-medium'
            : 'border-input bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
        )}
      >
        {value ? renderSelected() : (
          <>
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline max-w-[90px] truncate">{label}</span>
          </>
        )}
        <ChevronDown className={cn('w-3 h-3 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1.5 w-64 rounded-xl border bg-popover shadow-xl overflow-hidden">
          <div className="p-1.5 max-h-72 overflow-y-auto space-y-0.5">
            <button
              type="button"
              onClick={() => { onSelect(''); setOpen(false); }}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors',
                !value ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
            </button>
            {options.map((item, i) => (
              <button key={i} type="button" onClick={() => { onSelect(''); setOpen(false); renderOption(item); }}
                className="hidden" />
            ))}
            {renderOption && options.map((item, i) => (
              <div key={i}>{renderOption(item)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClubSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: players = [] } = usePlayers();
  const { data: followedClubs = [] } = useFollowedClubs();
  const unfollowClub = useUnfollowClub();

  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showDivisionDropdown, setShowDivisionDropdown] = useState(false);

  const { data: suggestions = [] } = useClubSuggestions(search, selectedCountry, selectedDivision);
  const { data: countries = [] } = useClubCountries();
  const { data: divisions = [] } = useClubDivisions(selectedCountry);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const divisionDropdownRef = useRef<HTMLDivElement>(null);

  const scoutedClubs = Array.from(new Set(players.map(p => p.club).filter((c): c is string => !!c))).sort();
  const filteredScoutedClubs = search.trim().length > 0
    ? scoutedClubs.filter(c => c.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : (selectedCountry || selectedDivision) ? [] : scoutedClubs.slice(0, 20);

  const hasSuggestions = suggestions.length > 0 || filteredScoutedClubs.length > 0;
  const selectedCountryOption = countries.find(c => c.country === selectedCountry);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node))
        setShowSuggestions(false);
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node))
        setShowCountryDropdown(false);
      if (divisionDropdownRef.current && !divisionDropdownRef.current.contains(e.target as Node))
        setShowDivisionDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToClub = (name: string) => navigate(`/club?club=${encodeURIComponent(name)}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setShowSuggestions(false);
    goToClub(search.trim());
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('club.search_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('club.search_subtitle')}</p>
        </div>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <form onSubmit={handleSubmit} className="space-y-2">
            {/* Filters row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Country filter */}
              <div className="relative" ref={countryDropdownRef}>
                <button
                  type="button"
                  onClick={() => { setShowCountryDropdown(v => !v); setShowDivisionDropdown(false); }}
                  className={cn(
                    'h-9 px-3 flex items-center gap-1.5 rounded-lg border text-sm transition-colors shrink-0',
                    selectedCountry
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {selectedCountryOption ? (
                    <>
                      <span className="text-base leading-none">{countryFlag(selectedCountryOption.country_code)}</span>
                      <span className="hidden sm:inline max-w-[90px] truncate">{selectedCountry}</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('club.all_countries')}</span>
                    </>
                  )}
                  <ChevronDown className={cn('w-3 h-3 transition-transform shrink-0', showCountryDropdown && 'rotate-180')} />
                </button>

                {showCountryDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-1.5 w-64 rounded-xl border bg-popover shadow-xl overflow-hidden">
                    <div className="p-1.5 max-h-72 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => { setSelectedCountry(''); setSelectedDivision(''); setShowCountryDropdown(false); }}
                        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors', !selectedCountry ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
                      >
                        <Globe className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{t('club.all_countries')}</span>
                      </button>
                      {countries.map(c => (
                        <button
                          key={c.country}
                          type="button"
                          onClick={() => { setSelectedCountry(c.country); setSelectedDivision(''); setShowCountryDropdown(false); if (c.country) setShowSuggestions(true); }}
                          className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors', selectedCountry === c.country ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
                        >
                          <span className="text-base leading-none w-5 text-center">{countryFlag(c.country_code)}</span>
                          <span className="flex-1 truncate">{c.country}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{c.club_count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Division filter */}
              <div className="relative" ref={divisionDropdownRef}>
                <button
                  type="button"
                  onClick={() => { setShowDivisionDropdown(v => !v); setShowCountryDropdown(false); }}
                  className={cn(
                    'h-9 px-3 flex items-center gap-1.5 rounded-lg border text-sm transition-colors shrink-0',
                    selectedDivision
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline max-w-[110px] truncate">{selectedDivision || t('club.all_divisions')}</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform shrink-0', showDivisionDropdown && 'rotate-180')} />
                </button>

                {showDivisionDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-1.5 w-72 rounded-xl border bg-popover shadow-xl overflow-hidden">
                    <div className="p-1.5 max-h-72 overflow-y-auto space-y-0.5">
                      <button
                        type="button"
                        onClick={() => { setSelectedDivision(''); setShowDivisionDropdown(false); }}
                        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors', !selectedDivision ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
                      >
                        <Layers className="w-4 h-4 shrink-0" />
                        <span className="flex-1">{t('club.all_divisions')}</span>
                      </button>
                      {divisions.length === 0 && (
                        <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                          {selectedCountry ? 'Aucune division trouvée pour ce pays.' : 'Sélectionnez un pays pour filtrer.'}
                        </p>
                      )}
                      {divisions.map(d => (
                        <button
                          key={d.competition}
                          type="button"
                          onClick={() => { setSelectedDivision(d.competition); setShowDivisionDropdown(false); setShowSuggestions(true); }}
                          className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors', selectedDivision === d.competition ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}
                        >
                          <span className="flex-1 truncate">{d.competition}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{d.club_count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Search input row */}
            <div className="flex gap-2">
              <div className="flex-1 relative" ref={suggestionsRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => { if (search.trim() || selectedCountry || selectedDivision) setShowSuggestions(true); }}
                  placeholder={t('club.search_placeholder')}
                  className="pl-10 h-11 text-base"
                  autoComplete="off"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setShowSuggestions(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Autocomplete dropdown */}
                {showSuggestions && hasSuggestions && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-xl overflow-hidden">
                    <div className="p-1.5 max-h-80 overflow-y-auto space-y-0.5">
                      {filteredScoutedClubs.length > 0 && (
                        <>
                          <p className="px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="w-3 h-3" />{t('club.your_clubs')}
                          </p>
                          {filteredScoutedClubs.map(club => (
                            <button
                              key={club}
                              type="button"
                              onClick={() => { setShowSuggestions(false); goToClub(club); }}
                              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors group"
                            >
                              <ClubBadge club={club} size="xs" />
                              <span className="flex-1 text-sm font-medium truncate">{club}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          ))}
                        </>
                      )}
                      {suggestions.length > 0 && (
                        <>
                          <p className="px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mt-1">
                            <Database className="w-3 h-3" />{t('club.from_database')}
                          </p>
                          {suggestions.map(s => (
                            <button
                              key={s.club_name}
                              type="button"
                              onClick={() => { setShowSuggestions(false); goToClub(s.club_name); }}
                              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left hover:bg-muted transition-colors group"
                            >
                              {s.logo_url
                                ? <img src={s.logo_url} alt="" className="w-7 h-7 object-contain shrink-0" />
                                : <ClubBadge club={s.club_name} size="xs" />
                              }
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{s.club_name}</p>
                                {(s.competition || s.country) && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {[s.competition, s.country && selectedCountryOption
                                      ? `${countryFlag(selectedCountryOption.country_code)} ${s.country}`
                                      : s.country].filter(Boolean).join(' · ')}
                                  </p>
                                )}
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" className="shrink-0 h-11" disabled={!search.trim()}>
                <Search className="w-4 h-4 mr-2" />
                {t('club.search_btn')}
              </Button>
            </div>
          </form>

          {/* Active filter badges */}
          {(selectedCountry || selectedDivision) && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs text-muted-foreground">{t('club.filtered_by')}:</span>
              {selectedCountry && (
                <Badge variant="secondary" className="gap-1.5 pr-1.5">
                  {selectedCountryOption && <span className="text-sm leading-none">{countryFlag(selectedCountryOption.country_code)}</span>}
                  {selectedCountry}
                  <button type="button" onClick={() => { setSelectedCountry(''); setSelectedDivision(''); }} className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
              {selectedDivision && (
                <Badge variant="secondary" className="gap-1.5 pr-1.5">
                  <Layers className="w-3 h-3" />
                  {selectedDivision}
                  <button type="button" onClick={() => setSelectedDivision('')} className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter results grid */}
      {(selectedCountry || selectedDivision) && !search && suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              {selectedCountryOption && <span className="text-lg leading-none">{countryFlag(selectedCountryOption.country_code)}</span>}
              {selectedDivision
                ? <><Layers className="w-4 h-4" />{selectedDivision}</>
                : t('club.clubs_in_country', { country: selectedCountry })}
              <span className="text-muted-foreground font-normal">({suggestions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map(s => (
                <button
                  key={s.club_name}
                  type="button"
                  onClick={() => goToClub(s.club_name)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors group text-left"
                >
                  {s.logo_url
                    ? <img src={s.logo_url} alt="" className="w-8 h-8 object-contain shrink-0" />
                    : <ClubBadge club={s.club_name} size="sm" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.club_name}</p>
                    {s.competition && <p className="text-[11px] text-muted-foreground truncate">{s.competition}</p>}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Followed clubs with drag-and-drop */}
      {followedClubs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="w-4 h-4 text-rose-500" />
              {t('club.followed_clubs')} ({followedClubs.length})
              <span className="text-[11px] text-muted-foreground/60 font-normal ml-auto flex items-center gap-1">
                <GripVertical className="w-3 h-3" />
                Glisser pour réordonner
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <FollowedClubsList
              clubs={followedClubs}
              onNavigate={goToClub}
              onUnfollow={id => unfollowClub.mutate(id)}
            />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {followedClubs.length === 0 && scoutedClubs.length === 0 && !selectedCountry && !selectedDivision && (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('club.empty_title')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('club.search_hint')}</p>
        </div>
      )}
    </div>
  );
}
