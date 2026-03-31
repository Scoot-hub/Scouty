import { cn } from '@/lib/utils';
import { getAvatarGradient } from '@/types/player';
import playerPlaceholder from '@/assets/player-placeholder.png';

interface PlayerAvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
}

const sizeClasses = {
  sm: 'w-10 h-10 text-xs rounded-lg',
  md: 'w-14 h-14 text-lg rounded-xl',
  lg: 'w-20 h-20 text-2xl rounded-2xl',
  xl: 'w-24 h-24 text-3xl rounded-2xl',
  hero: 'w-32 h-32 md:w-40 md:h-40 text-5xl rounded-3xl',
};

export function PlayerAvatar({ name, photoUrl, size = 'md', className }: PlayerAvatarProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);

  if (photoUrl) {
    return (
      <div className={cn('shrink-0 overflow-hidden shadow-lg', sizeClasses[size], className)}>
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover object-[center_20%]"
          onError={(e) => {
            (e.target as HTMLImageElement).src = playerPlaceholder;
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'shrink-0 bg-gradient-to-br flex items-center justify-center font-extrabold text-card shadow-lg',
        getAvatarGradient(name),
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
