import { useTranslation } from 'react-i18next';
import { getFlagCode, getFlag, translateCountry } from '@/types/player';

interface FlagIconProps {
  nationality: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm:  { width: '1.1em',  height: '0.85em', display: 'inline-block' },
  md:  { width: '1.25em', height: '0.95em', display: 'inline-block' },
  lg:  { width: '1.5em',  height: '1.15em', display: 'inline-block' },
};

export function FlagIcon({ nationality, className = '', size = 'md' }: FlagIconProps) {
  const { i18n } = useTranslation();
  const code = getFlagCode(nationality);
  const title = translateCountry(nationality, i18n.language);
  if (code) {
    return (
      <span
        className={`fi fi-${code} rounded-sm ${className}`}
        style={SIZE_STYLES[size]}
        title={title}
      />
    );
  }
  return <span className={className} title={title}>{getFlag(nationality)}</span>;
}
