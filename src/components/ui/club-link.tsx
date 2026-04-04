import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface ClubLinkProps {
  club: string;
  className?: string;
  children?: React.ReactNode;
}

export function ClubLink({ club, className, children }: ClubLinkProps) {
  if (!club) return <>{children || null}</>;
  return (
    <Link
      to={`/club?club=${encodeURIComponent(club)}`}
      className={cn('hover:text-primary hover:underline underline-offset-2 transition-colors', className)}
      onClick={e => e.stopPropagation()}
    >
      {children || club}
    </Link>
  );
}
