import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Building2, Users, Copy, LogOut, UserMinus, Share2,
  Shield, Loader2, Plus, KeyRound, ChevronRight,
  Calendar, Briefcase, Camera, Trash2, Pencil, Check, X,
  MessageSquare, Bell, Eye, SlidersHorizontal, MessageSquareOff,
  Map, Download, UserCheck, UserX, Lock, Link2Off, FileX, UserCog,
  Crown, LayoutDashboard, ListChecks, BarChart2, Sparkles, AtSign,
  Globe, AlertCircle, Search, ExternalLink, Mail, Palette, Image as ImageIcon,
  Linkedin, Instagram,
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
  useUpdateOrganization,
  useUpdateOrgSettings,
  useUpdateOrgPublicPage,
  useUpdateOrgBanner,
  useBlockMemberMessaging,
  useJoinRequests,
  useHandleJoinRequest,
  usePublicOrganizations,
  slugify,
  type PublicOrg,
} from '@/hooks/use-organization';
import { useIsPremium } from '@/hooks/use-admin';
import OrgTabBar from '@/components/OrgTabBar';

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

  const ownedCount = (orgs as { myRole: string }[]).filter(o => o.myRole === 'owner').length;

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
          {orgs.map((org: Record<string, unknown>) => {
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

      <Separator />

      {/* Sous-menu : Créer · Rejoindre · Découvrir */}
      <OrgSubMenu ownedCount={ownedCount} myOrgs={orgs as { id: string; myRole: string }[]} />
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

// ─── Sous-menu Créer / Rejoindre / Découvrir ────────────────────────────────────

const ORG_TYPE_LABELS: Record<string, string> = {
  club: 'Club', agency: 'Agence', scout_group: 'Groupe de scouts', other: 'Autre',
};

function OrgSubMenu({ ownedCount, myOrgs }: { ownedCount: number; myOrgs: { id: string; myRole: string }[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canCreate = ownedCount < 2;
  const [tab, setTab] = useState<'create' | 'join' | 'discover'>('create');

  // Create form state
  const [name, setName] = useState('');
  const [type, setType] = useState('club');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const createOrg = useCreateOrganization();

  // Join form state
  const [inviteCode, setInviteCode] = useState('');
  const joinOrg = useJoinOrganization();

  // Discover state
  const [discoverQ, setDiscoverQ] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const { data: publicOrgs = [], isLoading: discoverLoading } = usePublicOrganizations(discoverQ);
  const myOrgIds = new Set(myOrgs.map(o => o.id));

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
    if (!name.trim() || !canCreate) return;
    try {
      const org = await createOrg.mutateAsync({ name: name.trim(), type, logoFile: logoFile ?? undefined });
      toast.success(t('org.created'));
      navigate(`/organization/${slugify(org.name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'MAX_ORGS_REACHED') toast.error('Vous ne pouvez pas créer plus de 2 organisations.');
      else toast.error(t('common.error'));
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      const org = await joinOrg.mutateAsync(inviteCode);
      toast.success(t('org.joined'));
      navigate(`/organization/${slugify(org.name)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'INVALID_CODE') toast.error(t('org.invalid_code'));
      else if (message === 'ALREADY_MEMBER') toast.error(t('org.already_member'));
      else if (message === 'APPROVAL_PENDING') toast.success('Demande envoyée. Un admin doit approuver votre adhésion.');
      else if (message === 'MAX_MEMBERS_REACHED') toast.error('Cette organisation a atteint sa limite de membres.');
      else toast.error(t('common.error'));
    }
  };

  const handleJoinPublic = async (org: PublicOrg & { invite_code?: string }) => {
    if (!org.invite_code) { toast.error("Pas de lien d'invitation public."); return; }
    setJoiningId(org.id);
    try {
      const joined = await joinOrg.mutateAsync(org.invite_code);
      toast.success(`Vous avez rejoint « ${org.name} » !`);
      navigate(`/organization/${slugify(joined.name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ALREADY_MEMBER') toast.error('Vous êtes déjà membre.');
      else if (msg === 'APPROVAL_PENDING') toast.success('Demande envoyée. Un admin doit approuver.');
      else if (msg === 'MAX_MEMBERS_REACHED') toast.error('Limite de membres atteinte.');
      else toast.error(t('common.error'));
    } finally { setJoiningId(null); }
  };

  const tabs = [
    { key: 'create' as const, icon: Plus,     label: 'Créer' },
    { key: 'join'   as const, icon: KeyRound, label: 'Rejoindre' },
    { key: 'discover' as const, icon: Globe,  label: 'Découvrir' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex rounded-xl border border-border/60 bg-muted/30 p-1 gap-1">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Créer ── */}
      {tab === 'create' && (
        <div className="space-y-4">
          {!canCreate && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/10 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">Limite atteinte</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                  Vous êtes déjà propriétaire de 2 organisations. Supprimez-en une pour pouvoir en créer une nouvelle.
                </p>
              </div>
            </div>
          )}
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
                <label className="text-sm font-medium text-muted-foreground">{t('org.logo')}</label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center shrink-0">
                    {logoPreview
                      ? <img src={logoPreview} alt="preview" className="w-full h-full object-cover" />
                      : <Building2 className="w-6 h-6 text-muted-foreground/40" />}
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
                      <button type="button" onClick={handleLogoClear} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3 h-3" />{t('org.logo_remove')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('org.name')}</label>
                <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder={t('org.name_placeholder')} disabled={!canCreate} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('org.type')}</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {ORG_TYPES.map(ot => (
                    <button
                      key={ot.value}
                      onClick={() => setType(ot.value)}
                      disabled={!canCreate}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                        type === ot.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {t(ot.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createOrg.isPending || !name.trim() || !canCreate} className="w-full">
                {createOrg.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {t('org.create_btn')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Rejoindre ── */}
      {tab === 'join' && (
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
              {joinOrg.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t('org.join_btn')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Découvrir ── */}
      {tab === 'discover' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Rechercher une organisation publique…"
              value={discoverQ}
              onChange={e => setDiscoverQ(e.target.value)}
            />
          </div>

          {discoverLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : publicOrgs.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Building2 className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                {discoverQ ? `Aucun résultat pour « ${discoverQ} ».` : 'Aucune organisation publique pour le moment.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground px-0.5">{publicOrgs.length} organisation{publicOrgs.length > 1 ? 's' : ''} publique{publicOrgs.length > 1 ? 's' : ''}</p>
              {(publicOrgs as (PublicOrg & { invite_code?: string })[]).map(org => {
                const alreadyMember = myOrgIds.has(org.id);
                return (
                  <div key={org.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-border/40 overflow-hidden flex items-center justify-center shrink-0">
                      {org.logo_url
                        ? <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                        : <Building2 className="w-4 h-4 text-primary/50" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold truncate">{org.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{ORG_TYPE_LABELS[org.type] ?? org.type}</Badge>
                      </div>
                      {org.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{org.description}</p>}
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground/60">
                        <Users className="w-3 h-3" /><span>{org.member_count} membre{org.member_count > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    {alreadyMember ? (
                      <Link to={`/organization/${slugify(org.name)}`} className="shrink-0">
                        <Button size="sm" variant="outline" className="text-xs">Voir</Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0 text-xs"
                        disabled={joiningId === org.id}
                        onClick={() => handleJoinPublic(org)}
                      >
                        {joiningId === org.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <KeyRound className="w-3.5 h-3.5" />}
                        Rejoindre
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Organization dashboard ────────────────────────────────────────────────────

function OrganizationDashboard({ org, userId }: { org: Record<string, unknown>; userId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: members = [], isLoading: membersLoading } = useOrganizationMembers(org.id);
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrg = useLeaveOrganization();
  const updateOrg = useUpdateOrganization(org.id as string);
  const { upload: uploadLogo, remove: removeLogo } = useUpdateOrgLogo(org.id);

  const updateOrgSettings = useUpdateOrgSettings(org.id as string);
  const updatePublicPage = useUpdateOrgPublicPage(org.id as string);
  const { upload: uploadBanner, remove: removeBanner } = useUpdateOrgBanner(org.id as string);
  const blockMessaging = useBlockMemberMessaging(org.id as string);

  const [publicSlogan, setPublicSlogan] = useState('');
  const [publicWebsite, setPublicWebsite] = useState('');
  const [publicEmail, setPublicEmail] = useState('');
  const [publicSocialX, setPublicSocialX] = useState('');
  const [publicSocialLi, setPublicSocialLi] = useState('');
  const [publicSocialIg, setPublicSocialIg] = useState('');
  const [publicAccentColor, setPublicAccentColor] = useState('');
  const [publicPageInitialized, setPublicPageInitialized] = useState(false);

  const isOwner = org.myRole === 'owner';
  const isAdmin = org.myRole === 'owner' || org.myRole === 'admin';
  const { data: isPremium } = useIsPremium();
  const [selectedMember, setSelectedMember] = useState<Record<string, unknown> | null>(null);

  // Parse org-level settings with defaults
  const DEFAULT_SETTINGS: Record<string, boolean | number | string> = {
    allow_messaging: true, allow_player_sharing: true, notify_new_members: true, allow_squad_viewing: true,
    allow_roadmap_editing: true, require_approval_to_join: false, allow_player_export: true,
    allow_member_directory: true, allow_external_links: true, allow_file_uploads: true,
    org_visibility: false, max_members: 0,
    // Modules
    enable_dashboard: true, enable_shortlist: false, enable_analytics: false, enable_advanced_chat: false, enable_mentions: false,
    // Public profile
    recruitment_status: 'open', slogan: '',
  };
  const orgSettings: Record<string, boolean | number | string> = (() => {
    try {
      const raw = org.settings;
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch { return { ...DEFAULT_SETTINGS }; }
  })();

  useEffect(() => {
    if (!publicPageInitialized && org) {
      const raw = org as Record<string, unknown>;
      setPublicSlogan((raw.slogan as string) || (orgSettings.slogan as string) || '');
      setPublicWebsite((raw.website_url as string) || '');
      setPublicEmail((raw.contact_email as string) || '');
      setPublicSocialX((raw.social_x as string) || '');
      setPublicSocialLi((raw.social_linkedin as string) || '');
      setPublicSocialIg((raw.social_instagram as string) || '');
      setPublicAccentColor((raw.accent_color as string) || '');
      setPublicPageInitialized(true);
    }
  }, [org, publicPageInitialized, orgSettings.slogan]);

  const handleOrgSetting = async (key: string, value: boolean | number | string) => {
    const next = { ...orgSettings, [key]: value };
    try {
      await updateOrgSettings.mutateAsync(next);
      toast.success('Paramètre enregistré.');
    } catch { toast.error('Erreur lors de la sauvegarde.'); }
  };

  const joinRequests = useJoinRequests(isAdmin ? org.id as string : undefined);
  const handleJoinRequest = useHandleJoinRequest(org.id as string);

  const handleToggleBlockMessaging = async (member: Record<string, unknown>) => {
    const blocked = !member.messaging_blocked;
    try {
      await blockMessaging.mutateAsync({ memberId: member.id as string, blocked });
      toast.success(blocked ? 'Messagerie bloquée pour ce membre.' : 'Messagerie réactivée.');
    } catch { toast.error('Erreur lors de la modification.'); }
  };

  // Description inline edit state
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(String(org.description || ''));
  useEffect(() => { setDescDraft(String(org.description || '')); }, [org.description]);

  const handleSaveDesc = async () => {
    const trimmed = descDraft.trim();
    try {
      await updateOrg.mutateAsync({ description: trimmed });
      setEditingDesc(false);
      setDescDraft(trimmed);
      toast.success(t('org.desc_updated'));
    } catch { toast.error(t('common.error')); }
  };

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
    <div className="space-y-6 pb-10">
      {/* Tab bar (includes persistent org header) */}
      <OrgTabBar orgName={org.name as string} />

      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">

        {/* ── Left column : paramètres ── */}
        <div className="space-y-4">
        {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-4 h-4 text-primary" />
              Informations de l'organisation
            </CardTitle>
            <CardDescription>Logo, nom et description visibles par tous les membres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-border/50 overflow-hidden flex items-center justify-center shrink-0">
                {org.logo_url ? (
                  <img src={org.logo_url as string} alt={org.name as string} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-7 h-7 text-primary/60" />
                )}
              </div>
              <div className="space-y-1.5 min-w-0">
                <p className="text-sm font-medium">{t('org.logo')}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
                      {uploadLogo.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      {org.logo_url ? t('org.logo_change') : t('org.logo_add')}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploadLogo.isPending} />
                  </label>
                  {org.logo_url && (
                    <Button type="button" variant="outline" size="sm" onClick={handleRemoveLogo} disabled={removeLogo.isPending} className="gap-1.5 text-destructive hover:text-destructive">
                      {removeLogo.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {t('org.logo_remove')}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Description</label>
                {!editingDesc && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingDesc(true)} className="gap-1.5 h-7 text-xs">
                    <Pencil className="w-3 h-3" /> Modifier
                  </Button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    placeholder="Décrivez votre organisation (objectifs, type de scouting, zone géographique…)"
                    className="text-sm resize-none min-h-[100px]"
                    maxLength={2000}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground text-right">{descDraft.length}/2000</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleSaveDesc} disabled={updateOrg.isPending} className="gap-1.5">
                      {updateOrg.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Enregistrer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingDesc(false); setDescDraft(String(org.description || '')); }}>
                      <X className="w-3.5 h-3.5 mr-1" /> Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2.5 rounded-lg bg-muted/40 border border-border/50 min-h-[60px]">
                  {org.description ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">{org.description as string}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/40 italic">Aucune description pour l'instant.</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modules de l'organisation — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Modules de l'organisation
            </CardTitle>
            <CardDescription>Activez ou désactivez les onglets visibles par les membres.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Free modules */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Gratuit</p>
              {([
                {
                  key: 'enable_dashboard',
                  icon: LayoutDashboard,
                  title: 'Tableau de bord',
                  desc: 'Vue d\'ensemble de l\'activité : stats, membres actifs, matchs à venir, shortlist récente.',
                },
              ] as { key: string; icon: React.ElementType; title: string; desc: string }[]).map(item => {
                const ItemIcon = item.icon;
                return (
                  <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ItemIcon className="w-4 h-4 shrink-0 text-primary" />
                        <span>{item.title}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                    <Switch
                      checked={!!orgSettings[item.key]}
                      onCheckedChange={v => handleOrgSetting(item.key, v)}
                      disabled={updateOrgSettings.isPending}
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                );
              })}
            </div>

            {/* Premium modules */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500/80 px-1 flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Premium
              </p>
              {([
                {
                  key: 'enable_shortlist',
                  icon: ListChecks,
                  title: 'Shortlist collective',
                  desc: 'Suivez collectivement les joueurs en cours d\'observation, avec statuts et notes partagées.',
                },
                {
                  key: 'enable_analytics',
                  icon: BarChart2,
                  title: 'Analytics',
                  desc: 'Graphiques détaillés : pipeline de recrutement, activité par membre, croissance, matchs.',
                },
              ] as { key: string; icon: React.ElementType; title: string; desc: string }[]).map(item => {
                const ItemIcon = item.icon;
                const premiumLocked = !isPremium;
                return (
                  <TooltipProvider key={item.key} delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={`flex items-start justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10 p-3 ${premiumLocked ? 'opacity-70' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                              <ItemIcon className="w-4 h-4 shrink-0 text-amber-500" />
                              <span>{item.title}</span>
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40">
                                <Crown className="w-2.5 h-2.5" />
                                Payant
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                            {premiumLocked && (
                              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <Lock className="w-3 h-3 shrink-0" />
                                Nécessite un abonnement Scout+ ou Scout Pro.
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 mt-0.5">
                            <Switch
                              checked={!!orgSettings[item.key]}
                              onCheckedChange={v => { if (!premiumLocked) handleOrgSetting(item.key, v); }}
                              disabled={updateOrgSettings.isPending || premiumLocked}
                              className={premiumLocked ? 'opacity-40 cursor-not-allowed' : ''}
                            />
                          </span>
                        </div>
                      </TooltipTrigger>
                      {premiumLocked && (
                        <TooltipContent side="left" className="text-xs max-w-[220px]">
                          Fonctionnalité réservée aux abonnés. Passez à Scout+ ou Scout Pro pour l'activer.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paramètres avancés — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              Paramètres avancés
            </CardTitle>
            <CardDescription>Contrôlez les droits et comportements de l'organisation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* ── Section Chat & messagerie ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Chat &amp; messagerie</p>

              {/* allow_messaging — master toggle */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                    <span>Messagerie dans le chat</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Autoriser les membres à envoyer des messages dans le chat de l'organisation.</p>
                </div>
                <Switch
                  checked={!!orgSettings.allow_messaging}
                  onCheckedChange={v => handleOrgSetting('allow_messaging', v)}
                  disabled={updateOrgSettings.isPending}
                  className="shrink-0 mt-0.5"
                />
              </div>

              {/* Sub-settings — indented, cascade-disabled when messaging off */}
              <div className={`ml-5 pl-3 border-l-2 border-border/40 space-y-2 transition-opacity ${!orgSettings.allow_messaging ? 'opacity-40 pointer-events-none' : ''}`}>
                {/* enable_advanced_chat [PREMIUM] */}
                {(() => {
                  const premiumLocked = !isPremium;
                  const isLocked = !orgSettings.allow_messaging || premiumLocked;
                  return (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`flex items-start justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/10 p-2.5 ${isLocked ? 'opacity-70' : ''}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                                <MessageSquare className="w-4 h-4 shrink-0 text-amber-500" />
                                <span>Messagerie avancée</span>
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40">
                                  <Crown className="w-2.5 h-2.5" />
                                  Payant
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Canaux thématiques, messages épinglés et recherche dans l'historique.</p>
                              {premiumLocked && orgSettings.allow_messaging && (
                                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <Lock className="w-3 h-3 shrink-0" />
                                  Nécessite un abonnement Scout+ ou Scout Pro.
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 mt-0.5">
                              <Switch
                                checked={!!orgSettings.enable_advanced_chat}
                                onCheckedChange={v => { if (!isLocked) handleOrgSetting('enable_advanced_chat', v); }}
                                disabled={updateOrgSettings.isPending || isLocked}
                                className={isLocked ? 'opacity-40 cursor-not-allowed' : ''}
                              />
                            </span>
                          </div>
                        </TooltipTrigger>
                        {premiumLocked && orgSettings.allow_messaging && (
                          <TooltipContent side="left" className="text-xs max-w-[220px]">
                            Fonctionnalité réservée aux abonnés. Passez à Scout+ ou Scout Pro pour l'activer.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}

                {/* enable_mentions */}
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AtSign className="w-4 h-4 text-primary shrink-0" />
                      <span>Mentions (@)</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Mentionnez des membres avec @pseudo. Ils reçoivent une notification ciblée.</p>
                  </div>
                  <Switch
                    checked={!!orgSettings.enable_mentions}
                    onCheckedChange={v => handleOrgSetting('enable_mentions', v)}
                    disabled={updateOrgSettings.isPending || !orgSettings.allow_messaging}
                    className="shrink-0 mt-0.5"
                  />
                </div>

                {/* allow_external_links */}
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Link2Off className="w-4 h-4 text-primary shrink-0" />
                      <span>Liens externes</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Autoriser l'envoi de liens http(s) dans les messages du chat.</p>
                  </div>
                  <Switch
                    checked={!!orgSettings.allow_external_links}
                    onCheckedChange={v => handleOrgSetting('allow_external_links', v)}
                    disabled={updateOrgSettings.isPending || !orgSettings.allow_messaging}
                    className="shrink-0 mt-0.5"
                  />
                </div>

                {/* allow_file_uploads */}
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileX className="w-4 h-4 text-primary shrink-0" />
                      <span>Envoi de fichiers</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Autoriser l'envoi de pièces jointes dans le chat. (Fonctionnalité à venir)</p>
                  </div>
                  <Switch
                    checked={!!orgSettings.allow_file_uploads}
                    onCheckedChange={v => handleOrgSetting('allow_file_uploads', v)}
                    disabled={updateOrgSettings.isPending || !orgSettings.allow_messaging}
                    className="shrink-0 mt-0.5"
                  />
                </div>
              </div>
            </div>

            {/* ── Section Organisation ── */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Organisation</p>

              {/* allow_player_sharing — master */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Share2 className="w-4 h-4 text-primary shrink-0" />
                    <span>Partage de fiches joueurs</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Autoriser les membres à partager des fiches de joueurs au sein de l'organisation.</p>
                </div>
                <Switch
                  checked={!!orgSettings.allow_player_sharing}
                  onCheckedChange={v => handleOrgSetting('allow_player_sharing', v)}
                  disabled={updateOrgSettings.isPending}
                  className="shrink-0 mt-0.5"
                />
              </div>

              {/* allow_player_export — sub-setting, depends on allow_player_sharing */}
              <div className={`ml-5 pl-3 border-l-2 border-border/40 transition-opacity ${!orgSettings.allow_player_sharing ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Download className="w-4 h-4 text-primary shrink-0" />
                      <span>Export des joueurs</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Autoriser les membres à exporter la liste des joueurs partagés en Excel.</p>
                  </div>
                  <Switch
                    checked={!!orgSettings.allow_player_export}
                    onCheckedChange={v => handleOrgSetting('allow_player_export', v)}
                    disabled={updateOrgSettings.isPending || !orgSettings.allow_player_sharing}
                    className="shrink-0 mt-0.5"
                  />
                </div>
              </div>

              {/* Remaining flat settings */}
              {([
                { key: 'notify_new_members',      icon: Bell,      title: 'Notification d\'arrivée',            desc: 'Notifier tous les membres à l\'arrivée d\'un nouveau membre dans l\'organisation.' },
                { key: 'allow_squad_viewing',      icon: Eye,       title: 'Visibilité de l\'effectif',          desc: 'Les membres peuvent consulter la liste complète de l\'effectif.' },
                { key: 'allow_roadmap_editing',    icon: Map,       title: 'Modification de la feuille de route', desc: 'Autoriser les membres (non-admins) à ajouter ou modifier des assignations de matchs.' },
                { key: 'allow_member_directory',   icon: UserCog,   title: 'Annuaire des membres',               desc: 'Permettre aux membres de voir la liste et les profils des autres membres.' },
                { key: 'require_approval_to_join', icon: UserCheck, title: 'Approbation des nouveaux membres',   desc: 'Un admin doit approuver chaque demande avant qu\'un utilisateur puisse rejoindre.' },
                { key: 'org_visibility',           icon: Share2,    title: 'Organisation publique',              desc: 'Rendre l\'organisation visible dans l\'annuaire public de la plateforme.' },
              ] as { key: string; icon: React.ElementType; title: string; desc: string }[]).map(item => {
                const ItemIcon = item.icon;
                return (
                  <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ItemIcon className="w-4 h-4 text-primary shrink-0" />
                        <span>{item.title}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                    <Switch
                      checked={!!orgSettings[item.key]}
                      onCheckedChange={v => handleOrgSetting(item.key, v)}
                      disabled={updateOrgSettings.isPending}
                      className="shrink-0 mt-0.5"
                    />
                  </div>
                );
              })}

              {/* max_members — numeric input */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <span>Limite de membres</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Nombre maximum de membres autorisés. Mettre 0 pour illimité.</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={orgSettings.max_members as number}
                  onChange={e => handleOrgSetting('max_members', Math.max(0, Number(e.target.value)))}
                  onBlur={e => handleOrgSetting('max_members', Math.max(0, Number(e.target.value)))}
                  disabled={updateOrgSettings.isPending}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-center shrink-0 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* recruitment_status — shown only if org is public */}
              {orgSettings.org_visibility && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <span>Statut de recrutement</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">Visible sur votre profil public.</p>
                  </div>
                  <select
                    value={orgSettings.recruitment_status as string}
                    onChange={e => handleOrgSetting('recruitment_status', e.target.value)}
                    disabled={updateOrgSettings.isPending}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-sm shrink-0 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="open">Ouvert</option>
                    <option value="recruiting">Recrutement</option>
                    <option value="closed">Fermé</option>
                  </select>
                </div>
              )}

              {/* slogan — shown only if org is public */}
              {orgSettings.org_visibility && (
                <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>Slogan</span>
                    <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
                  </div>
                  <Input
                    placeholder="Un slogan court pour votre organisation…"
                    maxLength={200}
                    value={orgSettings.slogan as string}
                    onChange={e => handleOrgSetting('slogan', e.target.value)}
                    disabled={updateOrgSettings.isPending}
                    className="text-sm"
                  />
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      )}
        </div>{/* end left column */}

        {/* ── Right column : actions rapides ── */}
        <div className="space-y-4">

        {/* Demandes d'adhésion — toujours visible pour les admins */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="w-4 h-4 text-primary" />
                Demandes d'adhésion
                {(joinRequests.data?.length ?? 0) > 0 && (
                  <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                    {joinRequests.data!.length}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                {orgSettings.require_approval_to_join
                  ? 'Approuvez ou refusez les demandes d\'adhésion en attente.'
                  : 'Activez l\'approbation dans Paramètres avancés pour gérer les demandes.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!orgSettings.require_approval_to_join ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <UserCheck className="w-8 h-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">L'approbation manuelle est désactivée.</p>
                  <p className="text-xs text-muted-foreground/70">Tout membre avec le lien d'invitation peut rejoindre directement.</p>
                </div>
              ) : joinRequests.isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : (joinRequests.data?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <UserCheck className="w-7 h-7 text-emerald-500/40" />
                  <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {joinRequests.data?.map(req => (
                    <div key={req.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary overflow-hidden">
                        {req.photo_url ? <img src={req.photo_url} alt={req.name} className="w-full h-full object-cover" /> : req.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{req.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(req.requested_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          title="Approuver"
                          disabled={handleJoinRequest.isPending}
                          onClick={() => handleJoinRequest.mutateAsync({ requestId: req.id, action: 'approve' }).then(() => toast.success('Membre approuvé.')).catch(() => toast.error('Erreur'))}>
                          <UserCheck className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-destructive border-destructive/20 hover:bg-destructive/5"
                          title="Refuser"
                          disabled={handleJoinRequest.isPending}
                          onClick={() => handleJoinRequest.mutateAsync({ requestId: req.id, action: 'reject' }).then(() => toast.success('Demande refusée.')).catch(() => toast.error('Erreur'))}>
                          <UserX className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Page publique — personnalisation, admin only, visible si org_visibility activé */}
      {isAdmin && !!orgSettings.org_visibility && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-primary" />
              Page publique
            </CardTitle>
            <CardDescription>Personnalisez la présentation de votre organisation dans l'annuaire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Banner */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Bannière</p>
              {(org as Record<string, unknown>).banner_url ? (
                <div className="relative group rounded-lg overflow-hidden border border-border/50 h-28">
                  <img
                    src={(org as Record<string, unknown>).banner_url as string}
                    alt="Bannière"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={async () => {
                      try { await removeBanner.mutateAsync(); toast.success('Bannière supprimée.'); }
                      catch { toast.error('Erreur lors de la suppression.'); }
                    }}
                    disabled={removeBanner.isPending}
                    className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm border border-border rounded-md px-2 py-1 text-xs flex items-center gap-1 hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" /> Supprimer
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-border/50 hover:border-primary/40 cursor-pointer transition-colors bg-muted/20">
                  <ImageIcon className="w-6 h-6 text-muted-foreground/50 mb-1" />
                  <span className="text-xs text-muted-foreground">Ajouter une bannière</span>
                  {uploadBanner.isPending && <Loader2 className="w-4 h-4 animate-spin mt-1" />}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try { await uploadBanner.mutateAsync(file); toast.success('Bannière mise à jour.'); }
                      catch { toast.error('Erreur lors de l\'upload.'); }
                    }}
                  />
                </label>
              )}
            </div>

            <Separator />

            {/* Slogan */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slogan</label>
              <Textarea
                placeholder="Votre accroche en une phrase…"
                maxLength={150}
                value={publicSlogan}
                rows={2}
                onChange={e => setPublicSlogan(e.target.value)}
                className="text-sm resize-none"
              />
            </div>

            {/* Couleur d'accent */}
            <div className="flex items-center gap-3">
              <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Couleur d'accent</label>
                <p className="text-xs text-muted-foreground">Teinte principale de la page publique.</p>
              </div>
              <input
                type="color"
                value={publicAccentColor || '#6366f1'}
                onChange={e => setPublicAccentColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
              />
              {publicAccentColor && (
                <button onClick={() => setPublicAccentColor('')} className="text-xs text-muted-foreground hover:text-foreground">Réinitialiser</button>
              )}
            </div>

            <Separator />

            {/* Site web */}
            <div className="flex items-start gap-3">
              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-2.5" />
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Site web</label>
                <Input
                  placeholder="https://www.monclub.fr"
                  value={publicWebsite}
                  onChange={e => setPublicWebsite(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Email de contact */}
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0 mt-2.5" />
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">Email de contact</label>
                <Input
                  placeholder="contact@monclub.fr"
                  type="email"
                  value={publicEmail}
                  onChange={e => setPublicEmail(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <Separator />

            {/* Réseaux sociaux */}
            <p className="text-sm font-medium">Réseaux sociaux</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AtSign className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Pseudo X / Twitter (sans @)"
                  value={publicSocialX}
                  onChange={e => setPublicSocialX(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center gap-3">
                <Linkedin className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="URL LinkedIn"
                  value={publicSocialLi}
                  onChange={e => setPublicSocialLi(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center gap-3">
                <Instagram className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Pseudo Instagram (sans @)"
                  value={publicSocialIg}
                  onChange={e => setPublicSocialIg(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                disabled={updatePublicPage.isPending}
                onClick={async () => {
                  try {
                    await updatePublicPage.mutateAsync({
                      slogan: publicSlogan,
                      website_url: publicWebsite,
                      contact_email: publicEmail,
                      social_x: publicSocialX,
                      social_linkedin: publicSocialLi,
                      social_instagram: publicSocialIg,
                      accent_color: publicAccentColor,
                    });
                    toast.success('Page publique mise à jour.');
                  } catch { toast.error('Erreur lors de la sauvegarde.'); }
                }}
              >
                {updatePublicPage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Lien de parrainage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-primary" />
            Lien d'invitation
          </CardTitle>
          <CardDescription>{t('org.invite_link_help')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
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
        </CardContent>
      </Card>

        </div>{/* end right column */}
        </div>{/* end grid */}

      {/* Members — full width */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-primary" />
            {t('org.members')}
          </CardTitle>
          <CardDescription>{t('org.members_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isAdmin && orgSettings.allow_member_directory === false ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
              <Lock className="w-6 h-6" />
              <p className="text-sm font-medium">Annuaire désactivé</p>
              <p className="text-xs text-center">Le propriétaire a restreint l'accès à la liste des membres.</p>
            </div>
          ) : membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (<>
            <div className="space-y-2">
              {members.map((member: Record<string, unknown>) => {
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
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary group-hover:bg-primary/20 transition-colors overflow-hidden">
                      {member.profile?.photo_url ? (
                        <img
                          src={member.profile.photo_url as string}
                          alt={initials}
                          className="w-full h-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : initials}
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {member.messaging_blocked && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                          <MessageSquareOff className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        member.role === 'owner'
                          ? 'bg-primary/10 text-primary'
                          : member.role === 'admin'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {member.role === 'owner' ? t('org.role_owner') : member.role === 'admin' ? t('org.role_admin') : t('org.role_member')}
                      </span>
                    </div>
                    {/* Actions for admins on non-owners */}
                    {isAdmin && !isMe && !memberIsOwner && (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {/* Block/unblock messaging */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${member.messaging_blocked ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-amber-500'}`}
                          onClick={() => handleToggleBlockMessaging(member)}
                          title={member.messaging_blocked ? 'Réactiver la messagerie' : 'Bloquer la messagerie'}
                          disabled={blockMessaging.isPending}
                        >
                          <MessageSquareOff className="w-3.5 h-3.5" />
                        </Button>
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
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary overflow-hidden ring-4 ring-background shadow-md">
                          {p?.photo_url ? (
                            <img
                              src={p.photo_url as string}
                              alt={memberInitials}
                              className="w-full h-full object-cover"
                              onError={e => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                (e.currentTarget.parentElement as HTMLElement).innerText = memberInitials;
                              }}
                            />
                          ) : memberInitials}
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t('org.leave_title')}</p>
                <p className="text-xs text-muted-foreground">{t('org.leave_desc')}</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleLeave} disabled={leaveOrg.isPending} className="shrink-0 self-start sm:self-auto">
                {leaveOrg.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                {t('org.leave_btn')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
