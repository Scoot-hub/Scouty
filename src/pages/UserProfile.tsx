import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Building2, Calendar, ExternalLink, X as XIcon } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

interface UserProfileData {
  user_id: string;
  full_name: string;
  club: string | null;
  role: string | null;
  photo_url: string | null;
  company: string | null;
  reference_club: string | null;
  created_at: string;
  social_public: boolean;
  social_x: string | null;
  social_instagram: string | null;
  social_linkedin: string | null;
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();

  const { data: profile, isLoading, isError } = useQuery<UserProfileData>({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/profile/user/${encodeURIComponent(userId!)}`);
      if (!res.ok) throw new Error('Profil introuvable');
      return res.json();
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center space-y-4">
        <User className="w-16 h-16 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground">Profil introuvable ou inaccessible.</p>
        <Button variant="outline" asChild>
          <Link to="/community"><ArrowLeft className="w-4 h-4 mr-2" />Retour</Link>
        </Button>
      </div>
    );
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const memberSince = new Date(profile.created_at).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });

  const hasSocials = profile.social_public && (profile.social_x || profile.social_instagram || profile.social_linkedin);

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/community"><ArrowLeft className="w-4 h-4 mr-1" />Retour à la communauté</Link>
      </Button>

      {/* Profile card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="shrink-0">
              {profile.photo_url ? (
                <img
                  src={profile.photo_url}
                  alt={profile.full_name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-background shadow-md"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/10 border-4 border-background shadow-md flex items-center justify-center text-primary font-bold text-3xl">
                  {initials}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
              <h1 className="text-2xl font-bold truncate">{profile.full_name}</h1>

              {profile.role && (
                <Badge variant="secondary" className="capitalize">
                  {profile.role}
                </Badge>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground pt-1">
                {(profile.club || profile.reference_club) && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {profile.club || profile.reference_club}
                  </span>
                )}
                {profile.company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    {profile.company}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Membre depuis {memberSince}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social links */}
      {hasSocials && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Réseaux sociaux</h2>
            <div className="space-y-2">
              {profile.social_x && (
                <a
                  href={`https://x.com/${profile.social_x.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                    <XIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">X (Twitter)</p>
                    <p className="text-sm font-medium truncate">{profile.social_x}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </a>
              )}
              {profile.social_instagram && (
                <a
                  href={`https://instagram.com/${profile.social_instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500 font-bold text-xs">
                    IG
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Instagram</p>
                    <p className="text-sm font-medium truncate">{profile.social_instagram}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </a>
              )}
              {profile.social_linkedin && (
                <a
                  href={profile.social_linkedin.startsWith('http') ? profile.social_linkedin : `https://${profile.social_linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-600 font-bold text-xs">
                    in
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">LinkedIn</p>
                    <p className="text-sm font-medium truncate">{profile.social_linkedin}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
