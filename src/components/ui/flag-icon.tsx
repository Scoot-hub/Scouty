import { getFlagCode, getFlag } from '@/types/player';

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
  const code = getFlagCode(nationality);
  if (code) {
    return (
      <span
        className={`fi fi-${code} rounded-sm ${className}`}
        style={SIZE_STYLES[size]}
        title={nationality}
      />
    );
  }
  return <span className={className}>{getFlag(nationality)}</span>;
}
