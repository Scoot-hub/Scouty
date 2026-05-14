import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { COUNTRIES, PRIORITY_CODES, getSortedCountries, getCountryName, type Country } from '@/lib/countries';

const LANG_KEY = 'scouthub-lang';
const COUNTRY_KEY = 'scouthub-country';

function Flag({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span
      className={`fi fi-${code} rounded-sm inline-block shrink-0 ${className}`}
      style={{ width: '1.25em', height: '0.95em', verticalAlign: 'middle' }}
    />
  );
}

interface LanguageSwitcherProps {
  variant?: 'ghost' | 'outline' | 'sidebar';
  /** Called when user picks a country (for signup form autocomplete) */
  onCountryChange?: (country: Country) => void;
}

export function getStoredCountry(): Country | null {
  const code = localStorage.getItem(COUNTRY_KEY);
  return code ? (COUNTRIES.find(c => c.code === code) ?? null) : null;
}

export default function LanguageSwitcher({ variant = 'ghost', onCountryChange }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const uiLang = i18n.language ?? 'fr';

  // Current selection — try stored country first, fall back to language match
  const current: Country = useMemo(() => {
    const stored = getStoredCountry();
    if (stored) return stored;
    // Best match from active UI language
    const byLang = COUNTRIES.find(c => PRIORITY_CODES.includes(c.code) && c.lang === uiLang);
    return byLang ?? COUNTRIES.find(c => c.code === 'fr')!;
  }, [uiLang]);

  const sorted = useMemo(() => getSortedCountries(uiLang), [uiLang]);
  const priorityList = useMemo(() => sorted.filter(c => PRIORITY_CODES.includes(c.code)), [sorted]);
  const otherList = useMemo(() => sorted.filter(c => !PRIORITY_CODES.includes(c.code)), [sorted]);

  const filter = useCallback((list: Country[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      c.fr.toLowerCase().includes(q) ||
      c.en.toLowerCase().includes(q) ||
      c.es.toLowerCase().includes(q) ||
      c.code.includes(q)
    );
  }, [search]);

  const filteredPriority = useMemo(() => filter(priorityList), [filter, priorityList]);
  const filteredOther    = useMemo(() => filter(otherList),    [filter, otherList]);

  const select = useCallback((country: Country) => {
    localStorage.setItem(COUNTRY_KEY, country.code);
    localStorage.setItem(LANG_KEY, country.lang);
    i18n.changeLanguage(country.lang);
    onCountryChange?.(country);
    setOpen(false);
    setSearch('');
  }, [i18n, onCountryChange]);

  const displayName = getCountryName(current, uiLang);

  const trigger = variant === 'sidebar' ? (
    <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all">
      <Flag code={current.flagCode} />
      <span className="flex-1 text-left">{displayName}</span>
      <ChevronDown className="w-3.5 h-3.5 opacity-50" />
    </button>
  ) : (
    <Button variant={variant} size="sm" className="gap-2 font-normal">
      <Flag code={current.flagCode} />
      <span className="hidden sm:inline">{displayName}</span>
      <ChevronDown className="w-3 h-3 opacity-50" />
    </Button>
  );

  const CountryRow = ({ c }: { c: Country }) => {
    const name = getCountryName(c, uiLang);
    const isActive = current.code === c.code;
    return (
      <button
        key={c.code}
        onClick={() => select(c)}
        className={cn(
          'flex items-center gap-2.5 w-full px-2.5 py-1.5 text-sm rounded-md transition-colors text-left',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/60 text-foreground'
        )}
      >
        <Flag code={c.flagCode} />
        <span className="flex-1 truncate">{name}</span>
        {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={variant === 'sidebar' ? 'start' : 'end'}
        side={variant === 'sidebar' ? 'right' : 'bottom'}
        className="w-64 p-2 space-y-1"
        sideOffset={6}
      >
        {/* Search */}
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={uiLang === 'fr' ? 'Rechercher un pays…' : uiLang === 'de' ? 'Land suchen…' : uiLang === 'es' ? 'Buscar país…' : 'Search country…'}
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5 -mr-0.5">
          {/* Priority section */}
          {filteredPriority.length > 0 && (
            <div>
              {!search && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pt-1 pb-0.5">
                  {uiLang === 'fr' ? 'Priorité' : uiLang === 'de' ? 'Empfohlen' : uiLang === 'es' ? 'Prioridad' : 'Priority'}
                </p>
              )}
              {filteredPriority.map(c => <CountryRow key={c.code} c={c} />)}
              {!search && filteredOther.length > 0 && (
                <div className="border-t border-border/50 my-1" />
              )}
            </div>
          )}

          {/* Other countries */}
          {filteredOther.length > 0 && (
            <div>
              {!search && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 pt-1 pb-0.5">
                  {uiLang === 'fr' ? 'Tous les pays' : uiLang === 'de' ? 'Alle Länder' : uiLang === 'es' ? 'Todos los países' : 'All countries'}
                </p>
              )}
              {filteredOther.map(c => <CountryRow key={c.code} c={c} />)}
            </div>
          )}

          {filteredPriority.length === 0 && filteredOther.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {uiLang === 'fr' ? 'Aucun résultat' : uiLang === 'de' ? 'Keine Ergebnisse' : uiLang === 'es' ? 'Sin resultados' : 'No results'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
