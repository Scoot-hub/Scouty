import { cn } from '@/lib/utils';
import { Opinion, getOpinionBgClass } from '@/types/player';

interface OpinionBadgeProps {
  opinion: Opinion;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function OpinionBadge({ opinion, size = 'md', className }: OpinionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full',
        getOpinionBgClass(opinion),
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-xs',
        size === 'lg' && 'px-4 py-1.5 text-sm',
        className
      )}
    >
      {opinion}
    </span>
  );
}
