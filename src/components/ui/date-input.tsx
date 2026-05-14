import { useRef, useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isoToDisplay, displayToIso, datePlaceholder } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

interface DateInputProps {
  value: string;                    // always YYYY-MM-DD or ''
  onChange: (iso: string) => void;  // always returns YYYY-MM-DD or ''
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Date input that displays dates in the user's preferred format (from UiPreferences)
 * while storing/returning ISO (YYYY-MM-DD) strings internally.
 *
 * - Text field: type the date in the displayed format
 * - Calendar button: opens the native browser date picker
 * - On blur: parses the typed text and normalises to ISO
 * - Reacts to format preference changes without losing the stored value
 */
export default function DateInput({ value, onChange, className, disabled, id }: DateInputProps) {
  const { dateFormat } = useUiPreferences();
  const [display, setDisplay] = useState(() => isoToDisplay(value, dateFormat));
  const [invalid, setInvalid] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Sync display when the ISO value or format changes externally
  useEffect(() => {
    if (document.activeElement !== textRef.current) {
      setDisplay(isoToDisplay(value, dateFormat));
      setInvalid(false);
    }
  }, [value, dateFormat]);

  const commit = (text: string) => {
    if (!text.trim()) {
      setInvalid(false);
      if (value) onChange('');
      return;
    }
    const iso = displayToIso(text, dateFormat);
    if (iso) {
      setInvalid(false);
      onChange(iso);
      setDisplay(isoToDisplay(iso, dateFormat));
    } else {
      setInvalid(true);
    }
  };

  const handleNativePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (iso) {
      setInvalid(false);
      onChange(iso);
      setDisplay(isoToDisplay(iso, dateFormat));
    }
  };

  const openNativePicker = () => {
    try { nativeRef.current?.showPicker(); } catch { nativeRef.current?.click(); }
  };

  return (
    <div className="relative">
      <input
        ref={textRef}
        id={id}
        type="text"
        value={display}
        disabled={disabled}
        placeholder={datePlaceholder(dateFormat)}
        onChange={e => { setDisplay(e.target.value); setInvalid(false); }}
        onBlur={e => commit(e.target.value)}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-9 text-sm shadow-sm transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
      />
      {/* Hidden native date picker — opened programmatically */}
      <input
        ref={nativeRef}
        type="date"
        value={value || ''}
        onChange={handleNativePick}
        tabIndex={-1}
        className="absolute right-0 top-0 h-0 w-0 opacity-0 pointer-events-none"
      />
      {/* Calendar icon button */}
      <button
        type="button"
        disabled={disabled}
        onClick={openNativePicker}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        tabIndex={-1}
        aria-label="Ouvrir le calendrier"
      >
        <Calendar className="w-4 h-4" />
      </button>
    </div>
  );
}
