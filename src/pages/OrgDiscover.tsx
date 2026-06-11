import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePublicOrganizations, useMyOrganizations, useJoinOrganization, slugify, type PublicOrg } from '@/hooks/use-organization';
import { Building2, Search, Users, ArrowLeft, Plus, KeyRound, Loader2, Globe, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const ORG_TYPE_LABELS: Record<string, string> = {
  club: 'Club',
  agency: 'Agence',
  scout_group: 'Groupe de scouts',
  other: 'Autre',
};

export default function OrgDiscover() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const { data: publicOrgs = [], isLoading } = usePublicOrganizations(q);
  const { data: myOrgs = [] } = useMyOrganizations();
  const joinOrg = useJoinOrganization();

  const myOrgIds = new Set((myOrgs as { id: string }[]).map(o => o.id));
  const ownedCount = (myOrgs as { myRole: string }[]).filter(o => o.myRole === 'owner').length;
  const canCreate = ownedCount < 2;

  const handleJoin = async (org: PublicOrg & { invite_code?: string }) => {
    if (!org.invite_code) {
      toast.error("Cette organisation ne dispose pas de lien d'invitation public.");
      return;
    }
    setJoiningId(org.id);
    try {
      const joined = await joinOrg.mutateAsync(org.invite_code);
      toast.success(`Vous avez rejoint « ${org.name} » !`);
      navigate(`/organization/${slugify(joined.name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ALREADY_MEMBER') toast.error('Vous êtes déjà membre de cette organisation.');
      else if (msg === 'APPROVAL_PENDING') toast.success('Demande envoyée. Un admin doit approuver votre adhésion.');
      else if (msg === 'MAX_MEMBERS_REACHED') toast.error('Cette organisation a atteint sa limite de membres.');
      else toast.error(t('common.error'));
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/organization">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Mes organisations
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Globe className="w-6 h-6 text-primary" />
          Découvrir des organisations
        </h1>
        <p className="text-sm text-muted-foreground">
          Rejoignez une organisation publique ou créez la vôtre.
        </p>
      </div>

      {/* Create CTA */}
      <div className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${canCreate ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-muted/30'}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Créer mon organisation</p>
          {canCreate ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Vous pouvez encore créer {2 - ownedCount} organisation{2 - ownedCount > 1 ? 's' : ''}.
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Limite atteinte — vous êtes déjà propriétaire de 2 organisations.
            </p>
          )}
        </div>
        <Link to="/organization">
          <Button size="sm" disabled={!canCreate} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />
            Créer
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher une organisation…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : publicOrgs.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {q ? `Aucune organisation publique ne correspond à « ${q} ».` : 'Aucune organisation publique pour le moment.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground px-1">{publicOrgs.length} organisation{publicOrgs.length > 1 ? 's' : ''} publique{publicOrgs.length > 1 ? 's' : ''}</p>
          {publicOrgs.map(org => {
            const alreadyMember = myOrgIds.has(org.id);
            const maxMembers = org.max_members ?? 0;
            const isFull = maxMembers > 0 && org.member_count >= maxMembers;
            const memberLabel = maxMembers > 0
              ? `${org.member_count} / ${maxMembers} membre${maxMembers > 1 ? 's' : ''}`
              : `${org.member_count} membre${org.member_count > 1 ? 's' : ''}`;
            return (
              <div key={org.id} className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
                {/* Logo */}
                <Link to={`/organization/discover/${org.id}`} className="shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-border/40 overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-5 h-5 text-primary/50" />
                    )}
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/organization/discover/${org.id}`} className="text-sm font-semibold truncate hover:underline">
                      {org.name}
                    </Link>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {ORG_TYPE_LABELS[org.type] ?? org.type}
                    </Badge>
                    {isFull && <Badge className="text-[10px] shrink-0 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">Complet</Badge>}
                    {!isFull && org.recruitment_status === 'closed' && <Badge className="text-[10px] shrink-0 bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/15">Fermé</Badge>}
                  </div>
                  {org.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{org.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/60">
                    <Users className="w-3 h-3" />
                    <span>{memberLabel}</span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center gap-2 shrink-0">
                  {alreadyMember ? (
                    <Link to={`/organization/${slugify(org.name)}`}>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        Voir
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link to={`/organization/discover/${org.id}`}>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
                          <ChevronRight className="w-3.5 h-3.5" />
                          Voir
                        </Button>
                      </Link>
                      {!isFull && org.recruitment_status !== 'closed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={joiningId === org.id}
                          onClick={() => handleJoin(org as PublicOrg & { invite_code?: string })}
                        >
                          {joiningId === org.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <KeyRound className="w-3.5 h-3.5" />
                          }
                          {org.require_approval_to_join || org.recruitment_status === 'recruiting' ? 'Demander' : 'Rejoindre'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
