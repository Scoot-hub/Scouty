import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const languages = [
  { code: 'fr', label: 'Français', flagCode: 'fr' },
  { code: 'en', label: 'English',  flagCode: 'gb' },
  { code: 'es', label: 'Español',  flagCode: 'es' },
];

function LangFlag({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span
      className={`fi fi-${code} rounded-sm inline-block ${className}`}
      style={{ width: '1.25em', height: '0.95em', verticalAlign: 'middle' }}
    />
  );
}

interface LanguageSwitcherProps {
  variant?: 'ghost' | 'outline' | 'sidebar';
}

export default function LanguageSwitcher({ variant = 'ghost' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const current = languages.find(l => l.code === i18n.language) ?? languages[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('scouthub-lang', code);
  };

  const items = languages.map(lang => (
    <DropdownMenuItem
      key={lang.code}
      onClick={() => changeLanguage(lang.code)}
      className="flex items-center gap-2.5 cursor-pointer"
    >
      <LangFlag code={lang.flagCode} />
      <span className="flex-1">{lang.label}</span>
      {i18n.language === lang.code && <Check className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />}
    </DropdownMenuItem>
  ));

  if (variant === 'sidebar') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all">
            <LangFlag code={current.flagCode} />
            <span>{current.label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="min-w-[160px]">
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className="gap-2 font-normal">
          <LangFlag code={current.flagCode} />
          <span className="hidden sm:inline">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {items}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
