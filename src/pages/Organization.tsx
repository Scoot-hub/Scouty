import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Building2, Users, Copy, LogOut, UserMinus, Share2,
  Shield, Loader2, Plus, KeyRound, ChevronRight,
  Calendar, Briefcase, Camera, Trash2,
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
  useUpdateOrgLogo,
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
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-border/40 overflow-hidden flex items-center justify-center shrink-0">
                  {org.logo_url ? (
                    <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-4 h-4 text-primary/60" />
                  )}
                </div>
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const createOrg = useCreateOrganization();
  const joinOrg = useJoinOrganization();

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleLogoClear = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const org = await createOrg.mutateAsync({ name: name.trim(), type, logoFile: logoFile ?? undefined });
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
            {/* Logo picker */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('org.logo')}</label>
              <div className="mt-2 flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
                      <Camera className="w-3.5 h-3.5" />
                      {logoPreview ? t('org.logo_change') : t('org.logo_add')}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                  </label>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={handleLogoClear}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('org.logo_remove')}
                    </button>
                  )}
                </div>
              </div>
            </div>

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
  const { upload: uploadLogo, remove: removeLogo } = useUpdateOrgLogo(org.id);

  const isOwner = org.myRole === 'owner';
  const isAdmin = org.myRole === 'owner' || org.myRole === 'admin';
  const [selectedMember, setSelectedMember] = useState<any>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadLogo.mutateAsync(file);
      toast.success(t('org.logo_updated'));
    } catch {
      toast.error(t('common.error'));
    }
    e.target.value = '';
  };

  const handleRemoveLogo = async () => {
    try {
      await removeLogo.mutateAsync();
      toast.success(t('org.logo_removed'));
    } catch {
      toast.error(t('common.error'));
    }
  };

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
      <div className="flex items-start gap-4">
        {/* Logo + actions */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-border/50 overflow-hidden flex items-center justify-center">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-7 h-7 text-primary/60" />
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1">
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors">
                  {uploadLogo.isPending
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Camera className="w-3 h-3" />}
                  {org.logo_url ? t('org.logo_change') : t('org.logo_add')}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploadLogo.isPending} />
              </label>
              {org.logo_url && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={removeLogo.isPending}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-border bg-background hover:text-destructive hover:border-destructive/40 transition-colors"
                  title={t('org.logo_remove')}
                >
                  {removeLogo.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-2xl font-bold tracking-tight truncate">{org.name}</h1>
          <p className="text-muted-foreground text-sm">{t('org.subtitle')}</p>
        </div>
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
          ) : (<>
            <div className="space-y-2">
              {members.map((member: any) => {
                const isMe = member.user_id === userId;
                const memberIsOwner = member.role === 'owner';
                const displayName = member.profile?.full_name?.trim() || member.email || t('org.unknown_user');
                const initials = displayName
                  .split(/[\s.@]+/)
                  .filter(Boolean)
                  .map((w: string) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || '?';
                const subtitle = [member.profile?.club, member.profile?.role].filter(Boolean).join(' · ');
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 hover:border-primary/20 transition-colors cursor-pointer group"
                    onClick={() => setSelectedMember(member)}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary group-hover:bg-primary/20 transition-colors">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {displayName}
                        {isMe && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">({t('org.you')})</span>
                        )}
                      </p>
                      {subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                      )}
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
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
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

            {/* Member profile dialog */}
            <Dialog open={!!selectedMember} onOpenChange={o => { if (!o) setSelectedMember(null); }}>
              <DialogContent className="sm:max-w-md">
                {selectedMember && (() => {
                  const p = selectedMember.profile;
                  const dialogName = p?.full_name?.trim() || selectedMember.email || t('org.unknown_user');
                  const memberInitials = dialogName.split(/[\s.@]+/).filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
                  const joinDate = selectedMember.joined_at
                    ? new Date(selectedMember.joined_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                    : null;
                  const hasSocials = p?.social_x || p?.social_instagram || p?.social_linkedin;
                  const isSocialPublic = p?.social_public === true || p?.social_public === 1;
                  const showSocials = isSocialPublic && hasSocials;
                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="sr-only">{dialogName}</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col items-center gap-4 py-2">
                        {/* Avatar */}
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                          {memberInitials}
                        </div>

                        {/* Name + role badge */}
                        <div className="text-center">
                          <h2 className="text-xl font-extrabold tracking-tight">{dialogName}</h2>
                          <div className="flex items-center justify-center gap-2 mt-2">
                            <Badge variant="outline" className={
                              selectedMember.role === 'owner'
                                ? 'border-primary/30 text-primary'
                                : selectedMember.role === 'admin'
                                  ? 'border-amber-500/30 text-amber-600'
                                  : ''
                            }>
                              {selectedMember.role === 'owner' ? t('org.role_owner') : selectedMember.role === 'admin' ? t('org.role_admin') : t('org.role_member')}
                            </Badge>
                          </div>
                        </div>

                        {/* Info grid */}
                        <div className="w-full space-y-3 pt-2 border-t border-border">
                          {p?.club && (
                            <div className="flex items-center gap-3 text-sm pt-3">
                              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{t('org.profile_club')}</span>
                              <span className="ml-auto font-semibold">{p.club}</span>
                            </div>
                          )}
                          {p?.role && (
                            <div className="flex items-center gap-3 text-sm">
                              <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{t('org.profile_role')}</span>
                              <span className="ml-auto font-semibold">{p.role}</span>
                            </div>
                          )}
                          {joinDate && (
                            <div className="flex items-center gap-3 text-sm">
                              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{t('org.profile_joined')}</span>
                              <span className="ml-auto font-semibold">{joinDate}</span>
                            </div>
                          )}

                          {/* Social links (only if user chose to make them public) */}
                          {showSocials && (
                            <div className="pt-3 border-t border-border">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('org.profile_socials')}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                {p.social_x && (
                                  <a href={`https://x.com/${p.social_x.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted">
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                    {p.social_x.startsWith('@') ? p.social_x : `@${p.social_x}`}
                                  </a>
                                )}
                                {p.social_instagram && (
                                  <a href={`https://instagram.com/${p.social_instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted">
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                                    {p.social_instagram.startsWith('@') ? p.social_instagram : `@${p.social_instagram}`}
                                  </a>
                                )}
                                {p.social_linkedin && (
                                  <a href={p.social_linkedin.startsWith('http') ? p.social_linkedin : `https://linkedin.com/in/${p.social_linkedin}`} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted">
                                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                    LinkedIn
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                          {!isSocialPublic && hasSocials && (
                            <p className="text-xs text-muted-foreground/60 text-center pt-2 italic">{t('org.profile_socials_private')}</p>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </>)}
        </CardContent>
      </Card>

      {/* Leave (non-owner) */}
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
