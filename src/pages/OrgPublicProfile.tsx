import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePublicOrg, usePublicOrgMembers, useJoinOrganization, useMyOrganizations, slugify, type PublicOrg } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2, Users, ArrowLeft, Loader2, CheckCircle2, Lock, UserPlus, Quote, Globe, Mail, AtSign, Calendar, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const ORG_TYPE_LABELS: Record<string, string> = {
  club: 'Club',
  agency: 'Agence',
  scout_group: 'Groupe de scouts',
  other: 'Autre',
};

function getOrgStatus(org: PublicOrg): 'full' | 'closed' | 'recruiting' | 'open' {
  if (org.max_members && org.max_members > 0 && org.member_count >= org.max_members) return 'full';
  if (org.recruitment_status === 'closed') return 'closed';
  if (org.require_approval_to_join || org.recruitment_status === 'recruiting') return 'recruiting';
  return 'open';
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

export default function OrgPublicProfile() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  const { data: org, isLoading, isError } = usePublicOrg(orgId);
  const { data: myOrgs = [] } = useMyOrganizations();
  const { data: publicMembers = [] } = usePublicOrgMembers(orgId, !!org?.allow_member_directory);
  const joinOrg = useJoinOrganization();

  const myOrgIds = new Set((myOrgs as { id: string }[]).map(o => o.id));
  const alreadyMember = org ? myOrgIds.has(org.id) : false;

  const handleJoin = async () => {
    if (!org?.invite_code) {
      toast.error("Cette organisation ne dispose pas de lien d'invitation.");
      return;
    }
    setJoining(true);
    try {
      const joined = await joinOrg.mutateAsync(org.invite_code);
      toast.success(`Vous avez rejoint « ${org.name} » !`);
      navigate(`/organization/${slugify(joined.name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ALREADY_MEMBER') toast.error('Vous êtes déjà membre de cette organisation.');
      else if (msg === 'APPROVAL_PENDING') toast.success('Demande envoyée. Un admin doit approuver votre adhésion.');
      else if (msg === 'MAX_MEMBERS_REACHED') toast.error("Cette organisation a atteint sa limite de membres.");
      else toast.error('Une erreur est survenue.');
    } finally {
      setJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !org) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">Organisation introuvable ou profil non public.</p>
        <Link to="/organization/discover">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Retour à la découverte
          </Button>
        </Link>
      </div>
    );
  }

  const status = getOrgStatus(org);
  const accentStyle = org.accent_color ? { '--org-accent': org.accent_color } as React.CSSProperties : {};

  const statusBadge = () => {
    if (status === 'full') return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">Complet</Badge>;
    if (status === 'closed') return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/15">Fermé</Badge>;
    if (status === 'recruiting') return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/15">Recrutement</Badge>;
    return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">Ouvert</Badge>;
  };

  const ctaButton = () => {
    if (alreadyMember) {
      return (
        <Link to={`/organization/${slugify(org.name)}`}>
          <Button size="lg" className="gap-2 w-full sm:w-auto" style={org.accent_color ? { backgroundColor: org.accent_color, borderColor: org.accent_color } : {}}>
            <CheckCircle2 className="w-4 h-4" />
            Voir mon espace
          </Button>
        </Link>
      );
    }
    if (status === 'full' || status === 'closed') return null;
    if (status === 'recruiting') {
      return (
        <Button size="lg" className="gap-2 w-full sm:w-auto" style={org.accent_color ? { backgroundColor: org.accent_color, borderColor: org.accent_color } : {}} onClick={handleJoin} disabled={joining}>
          {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Demander à rejoindre
        </Button>
      );
    }
    return (
      <Button size="lg" className="gap-2 w-full sm:w-auto" style={org.accent_color ? { backgroundColor: org.accent_color, borderColor: org.accent_color } : {}} onClick={handleJoin} disabled={joining}>
        {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        Rejoindre
      </Button>
    );
  };

  const memberLabel = () => {
    const max = org.max_members ?? 0;
    if (max > 0) return `${org.member_count} / ${max} membre${max > 1 ? 's' : ''}`;
    return `${org.member_count} membre${org.member_count > 1 ? 's' : ''}`;
  };

  const hasSocials = org.social_x || org.social_linkedin || org.social_instagram;
  const hasLinks = org.website_url || org.contact_email || hasSocials;

  const formatCreatedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  const memberRoleLabel = (role: string) => {
    if (role === 'owner') return 'Propriétaire';
    if (role === 'admin') return 'Administrateur';
    if (role === 'moderator') return 'Modérateur';
    return 'Membre';
  };

  const initials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10" style={accentStyle}>
      {/* Back */}
      <div>
        <Link to="/organization/discover">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Découvrir des organisations
          </Button>
        </Link>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Banner */}
        {org.banner_url && (
          <div className="h-36 w-full overflow-hidden">
            <img src={org.banner_url} alt="Bannière" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Logo / header area */}
        <div className={`flex items-center gap-5 p-6 border-b border-border/40 ${org.banner_url ? '-mt-10 relative' : ''}`}>
          <div
            className="w-20 h-20 rounded-2xl border-4 border-card bg-primary/10 overflow-hidden flex items-center justify-center shrink-0"
            style={org.accent_color ? { borderColor: `color-mix(in srgb, ${org.accent_color} 20%, transparent)` } : {}}
          >
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-8 h-8 text-primary/50" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{org.name}</h1>
              <Badge variant="outline" className="text-xs shrink-0">
                {ORG_TYPE_LABELS[org.type] ?? org.type}
              </Badge>
              {statusBadge()}
            </div>
            {org.slogan && (
              <p className="text-sm text-muted-foreground mt-1 italic flex items-start gap-1.5">
                <Quote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/50" />
                {org.slogan}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                {memberLabel()}
                {org.max_members && org.max_members > 0 && status === 'full' && (
                  <span className="text-amber-600 text-xs font-medium">(complet)</span>
                )}
              </span>
              {org.created_at && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  Créée en {formatCreatedAt(org.created_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {org.description && (
          <div className="px-6 py-4 border-b border-border/40">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{org.description}</p>
          </div>
        )}

        {/* Links / social */}
        {hasLinks && (
          <div className="px-6 py-4 border-b border-border/40 flex flex-wrap gap-3">
            {org.website_url && (
              <a
                href={org.website_url.startsWith('http') ? org.website_url : `https://${org.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Globe className="w-4 h-4" />
                Site web
              </a>
            )}
            {org.contact_email && (
              <a
                href={`mailto:${org.contact_email}`}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="w-4 h-4" />
                {org.contact_email}
              </a>
            )}
            {org.social_x && (
              <a
                href={`https://x.com/${org.social_x.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <AtSign className="w-4 h-4" />
                {org.social_x.replace(/^@/, '')}
              </a>
            )}
            {org.social_linkedin && (
              <a
                href={org.social_linkedin.startsWith('http') ? org.social_linkedin : `https://linkedin.com/in/${org.social_linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LinkedinIcon className="w-4 h-4" />
                LinkedIn
              </a>
            )}
            {org.social_instagram && (
              <a
                href={`https://instagram.com/${org.social_instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <InstagramIcon className="w-4 h-4" />
                {org.social_instagram.replace(/^@/, '')}
              </a>
            )}
          </div>
        )}

        {/* Member directory */}
        {org.allow_member_directory && publicMembers.length > 0 && (
          <div className="px-6 py-4 border-b border-border/40 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Membres{publicMembers.length >= 50 ? ' (50+)' : ` · ${publicMembers.length}`}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {publicMembers.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40 transition-colors">
                  <Avatar className="w-9 h-9 shrink-0">
                    {m.photo_url && <AvatarImage src={m.photo_url} />}
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {initials(m.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.full_name || 'Membre'}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      {(m.role === 'owner' || m.role === 'admin' || m.role === 'moderator') && (
                        <Shield className="w-3 h-3 shrink-0" />
                      )}
                      {memberRoleLabel(m.role)}
                      {m.club && <span className="before:content-['·'] before:mx-1 truncate">{m.club}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {status === 'full' && <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />L'effectif est au complet.</span>}
            {status === 'closed' && <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Cette organisation n'accepte plus de nouveaux membres.</span>}
            {status === 'recruiting' && !alreadyMember && <span>Votre demande sera examinée par un administrateur.</span>}
            {status === 'open' && !alreadyMember && <span>Vous pouvez rejoindre librement cette organisation.</span>}
            {alreadyMember && <span className="text-green-600 font-medium flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Vous êtes membre de cette organisation.</span>}
          </div>
          {ctaButton()}
        </div>
      </div>
    </div>
  );
}
