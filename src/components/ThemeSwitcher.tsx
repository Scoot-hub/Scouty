import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import { Sun, Moon, Leaf, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const themes: { value: Theme; icon: React.ElementType; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'settings.theme_light' },
  { value: 'dark', icon: Moon, labelKey: 'settings.theme_dark' },
  { value: 'scout', icon: Leaf, labelKey: 'settings.theme_scout' },
];

interface ThemeSwitcherProps {
  variant?: 'outline' | 'ghost' | 'sidebar';
}

export default function ThemeSwitcher({ variant = 'outline' }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const current = themes.find(th => th.value === theme) ?? themes[0];
  const CurrentIcon = current.icon;

  if (variant === 'sidebar') {
    return (
      <div className="space-y-0.5">
        {themes.map(th => {
          const Icon = th.icon;
          return (
            <button
              key={th.value}
              onClick={() => setTheme(th.value)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-1.5 rounded-lg text-xs transition-all',
                theme === th.value
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(th.labelKey)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className="gap-2">
          <CurrentIcon className="w-4 h-4" />
          {t(current.labelKey)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {themes.map(th => {
          const Icon = th.icon;
          return (
            <DropdownMenuItem key={th.value} onClick={() => setTheme(th.value)} className="gap-2">
              <Icon className="w-4 h-4" />
              {t(th.labelKey)}
              {theme === th.value && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
