import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Building2, Users, Copy, LogOut, UserMinus, Share2,
  Shield, UserCircle, Loader2, Plus, KeyRound, ChevronRight,
} from 'lucide-react';
import {
  useMyOrganizations,
  useCurrentOrg,
  useOrganizationMembers,
  useCreateOrganization,
  useJoinOrganization,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  slugify,
} from '@/hooks/use-organization';

const ORG_TYPES = [
  { value: 'club', labelKey: 'org.type_club' },
  { value: 'agency', labelKey: 'org.type_agency' },
  { value: 'scout_group', labelKey: 'org.type_scout_group' },
  { value: 'other', labelKey: 'org.type_other' },
];

export default function Organization() {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  if (orgSlug) {
    return <OrgDashboardView />;
  }

  return <OrgListView />;
}

// ─── List view: all orgs + create/join ──────────────────────────────────────────

function OrgListView() {
  const { t } = useTranslation();
  const { data: orgs = [], isLoading } = useMyOrganizations();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('org.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {orgs.length > 0 ? t('org.subtitle') : t('org.no_org_subtitle')}
        </p>
      </div>

      {/* Org cards */}
      {orgs.length > 0 && (
        <div className="space-y-2">
          {orgs.map((org: any) => {
            const typeLabel = ORG_TYPES.find(ot => ot.value === org.type);
            return (
              <Link
                key={org.id}
                to={`/organization/${slugify(org.name)}`}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 hover:bg-accent/30 transition-all group"
              >
                <Building2 className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel ? t(typeLabel.labelKey) : org.type}
                    {' · '}
                    {t(`org.role_${org.myRole}`)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            );
          })}
        </div>
      )}

      {orgs.length > 0 && <Separator />}

      {/* Create / Join */}
      <CreateJoinSection />
    </div>
  );
}

// ─── Dashboard view: single org by slug ─────────────────────────────────────────

function OrgDashboardView() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: org, isLoading, isFetching } = useCurrentOrg();

  if (isLoading || (isFetching && !org)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 space-y-4">
        <Building2 className="w-10 h-10 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">{t('org.not_found')}</p>
        <Link to="/organization">
          <Button variant="outline" size="sm">{t('common.back')}</Button>
        </Link>
      </div>
    );
  }

  return <OrganizationDashboard org={org} userId={user?.id} />;
}

// ─── Create / Join section ──────────────────────────────────────────────────────

function CreateJoinSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [type, setType] = useState('club');
  const [inviteCode, setInviteCode] = useState('');

  const createOrg = useCreateOrganization();
  const joinOrg = useJoinOrganization();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const org = await createOrg.mutateAsync({ name: name.trim(), type });
      toast.success(t('org.created'));
      navigate(`/organization/${slugify(org.name)}`);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      const org = await joinOrg.mutateAsync(inviteCode);
      toast.success(t('org.joined'));
      navigate(`/organization/${slugify(org.name)}`);
    } catch (err: any) {
      if (err.message === 'INVALID_CODE') toast.error(t('org.invalid_code'));
      else if (err.message === 'ALREADY_MEMBER') toast.error(t('org.already_member'));
      else toast.error(t('common.error'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === 'create' ? 'default' : 'outline'} size="sm" onClick={() => setTab('create')}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('org.create')}
        </Button>
        <Button variant={tab === 'join' ? 'default' : 'outline'} size="sm" onClick={() => setTab('join')}>
          <KeyRound className="w-4 h-4 mr-1.5" />
          {t('org.join')}
        </Button>
      </div>

      {tab === 'create' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-primary" />
              {t('org.create_title')}
            </CardTitle>
            <CardDescription>{t('org.create_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('org.name')}</label>
              <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder={t('org.name_placeholder')} />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('org.type')}</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ORG_TYPES.map(ot => (
                  <button
                    key={ot.value}
                    onClick={() => setType(ot.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      type === ot.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                    }`}
                  >
                    {t(ot.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} disabled={createOrg.isPending || !name.trim()} className="w-full">
              {createOrg.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('org.create_btn')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="w-5 h-5 text-primary" />
              {t('org.join_title')}
            </CardTitle>
            <CardDescription>{t('org.join_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('org.invite_code')}</label>
              <Input className="mt-1 font-mono text-sm" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder={t('org.invite_code_placeholder')} />
            </div>
            <Button onClick={handleJoin} disabled={joinOrg.isPending || inviteCode.trim().length < 3} className="w-full">
              {joinOrg.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('org.join_btn')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Organization dashboard ────────────────────────────────────────────────────

function OrganizationDashboard({ org, userId }: { org: any; userId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: members = [], isLoading: membersLoading } = useOrganizationMembers(org.id);
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrg = useLeaveOrganization();

  const isOwner = org.myRole === 'owner';
  const isAdmin = org.myRole === 'owner' || org.myRole === 'admin';

  const inviteLink = `${window.location.origin}/auth?invite=${org.invite_code}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success(t('org.link_copied'));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t('org.share_title', { name: org.name }), url: inviteLink });
      } catch { /* user cancelled */ }
    } else {
      handleCopyLink();
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId);
      toast.success(t('org.member_removed'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      await updateRole.mutateAsync({ memberId, role: newRole });
      toast.success(t('org.role_updated'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleLeave = async () => {
    try {
      await leaveOrg.mutateAsync(org.id);
      toast.success(t('org.left'));
      navigate('/organization');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const typeLabel = ORG_TYPES.find(ot => ot.value === org.type);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground text-sm">{t('org.subtitle')}</p>
      </div>

      {/* Org info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="w-5 h-5 text-primary" />
            {org.name}
          </CardTitle>
          <CardDescription>
            {typeLabel ? t(typeLabel.labelKey) : org.type}
            {' · '}
            {members.length} {t('org.members_count')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite link */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('org.invite_link')}</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs text-muted-foreground truncate select-all">
                {inviteLink}
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyLink} title={t('org.copy_link')}>
                <Copy className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleShare} title={t('org.share')}>
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('org.invite_link_help')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-primary" />
            {t('org.members')}
          </CardTitle>
          <CardDescription>{t('org.members_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member: any) => {
                const isMe = member.user_id === userId;
                const memberIsOwner = member.role === 'owner';
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/40"
                  >
                    <UserCircle className="w-8 h-8 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.profile?.full_name || t('org.unknown_user')}
                        {isMe && (
                          <span className="ml-2 text-xs text-muted-foreground">({t('org.you')})</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.profile?.club || ''}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      member.role === 'owner'
                        ? 'bg-primary/10 text-primary'
                        : member.role === 'admin'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {member.role === 'owner' ? t('org.role_owner') : member.role === 'admin' ? t('org.role_admin') : t('org.role_member')}
                    </span>
                    {/* Actions for admins on non-owners */}
                    {isAdmin && !isMe && !memberIsOwner && (
                      <div className="flex gap-1">
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleChangeRole(member.id, member.role === 'admin' ? 'member' : 'admin')}
                            title={member.role === 'admin' ? t('org.demote') : t('org.promote')}
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                          title={t('org.remove')}
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave */}
      {!isOwner && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('org.leave_title')}</p>
                <p className="text-xs text-muted-foreground">{t('org.leave_desc')}</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleLeave} disabled={leaveOrg.isPending}>
                {leaveOrg.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                {t('org.leave_btn')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
