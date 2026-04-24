import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageSEO from '@/components/PageSEO';
import { ArrowLeft, Heart, Target, Users, Zap, Globe, Shield, BarChart3, Sparkles, MapPin, User, TrendingUp, Clock, FileX, Trophy, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import stadiumBg from '@/assets/stadium-hero.jpg';
import logo from '@/assets/logo.png';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const team = [
  {
    name: 'Alexis',
    role: 'Co-fondateur & Product',
    x: 'AceOSolo',
    descKey: 'about.alexis_desc',
  },
  {
    name: 'Jonathan',
    role: 'Co-fondateur & Tech',
    x: 'GhostGamer42800',
    descKey: 'about.jonathan_desc',
  },
];

const values = [
  { icon: Target, titleKey: 'about.value_precision_title', descKey: 'about.value_precision_desc' },
  { icon: Zap, titleKey: 'about.value_speed_title', descKey: 'about.value_speed_desc' },
  { icon: Users, titleKey: 'about.value_collab_title', descKey: 'about.value_collab_desc' },
  { icon: Globe, titleKey: 'about.value_access_title', descKey: 'about.value_access_desc' },
];

const features = [
  { icon: BarChart3, titleKey: 'about.feat_enrichment_title', descKey: 'about.feat_enrichment_desc' },
  { icon: Shield, titleKey: 'about.feat_org_title', descKey: 'about.feat_org_desc' },
  { icon: Sparkles, titleKey: 'about.feat_discover_title', descKey: 'about.feat_discover_desc' },
  { icon: MapPin, titleKey: 'about.feat_map_title', descKey: 'about.feat_map_desc' },
];

interface ClubItem { club_name: string; logo_url: string | null }

function ClubsCarousel({ clubs }: { clubs: ClubItem[] }) {
  if (clubs.length === 0) return null;
  // Triple to ensure seamless loop on all screen sizes
  const items = [...clubs, ...clubs, ...clubs];
  return (
    <div className="overflow-hidden relative">
      <style>{`
        @keyframes scouty-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .scouty-marquee {
          animation: scouty-marquee ${Math.max(20, clubs.length * 3)}s linear infinite;
          will-change: transform;
        }
        .scouty-marquee:hover { animation-play-state: paused; }
      `}</style>
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      <div className="scouty-marquee flex gap-4" style={{ width: 'max-content' }}>
        {items.map((c, i) => (
          <ClubCard key={i} club={c} />
        ))}
      </div>
    </div>
  );
}

function ClubCard({ club }: { club: ClubItem }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-card hover:border-primary/30 hover:shadow-sm transition-all shrink-0 cursor-default select-none">
      {club.logo_url && !imgError ? (
        <img
          src={club.logo_url}
          alt={club.club_name}
          className="w-7 h-7 object-contain shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
          {club.club_name.charAt(0)}
        </div>
      )}
      <span className="text-sm font-medium whitespace-nowrap text-foreground/80">{club.club_name}</span>
    </div>
  );
}

interface PublicUser {
  user_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  civility: string | null;
  club: string | null;
  role: string | null;
  photo_url: string | null;
  company: string | null;
  reference_club: string | null;
  social_public: boolean;
  created_at: string;
}

export default function About() {
  const { t } = useTranslation();
  const [scrollY, setScrollY] = useState(0);
  const [publicUsers, setPublicUsers] = useState<PublicUser[]>([]);
  const [clubsData, setClubsData] = useState<ClubItem[]>([]);

  const emptyForm = { name: '', email: '', company: '', role: '', need: '', phone: '', context: '' };
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const setField = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.context.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, honeypot: '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t('contact.error'));
      } else {
        setSent(true);
        setForm(emptyForm);
      }
    } catch {
      toast.error(t('contact.error'));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/public/users`)
      .then(r => r.ok ? r.json() : [])
      .then(setPublicUsers)
      .catch(() => {});
    fetch(`${API_BASE}/club-logos`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: ClubItem[]) => {
        // Only keep clubs with logos, shuffle for variety, cap at 60
        const withLogo = rows.filter(c => c.logo_url);
        for (let i = withLogo.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [withLogo[i], withLogo[j]] = [withLogo[j], withLogo[i]];
        }
        setClubsData(withLogo.slice(0, 60));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PageSEO
        path="/about"
        title="À propos de Scouty | Plateforme de scouting footballistique"
        description="Découvrez l'histoire, la mission et les valeurs de Scouty. Nous aidons les scouts, recruteurs et coachs à gérer efficacement leur travail de détection et d'observation des joueurs."
      />
      {/* ── Parallax hero ── */}
      <div className="relative h-[420px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${stadiumBg})`,
            transform: `translateY(${scrollY * 0.4}px)`,
            willChange: 'transform',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
        <div className="relative z-10 h-full flex flex-col">
          <header className="px-6 py-4">
            <div className="max-w-5xl mx-auto flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('common.back')}
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <img src={logo} alt="Scouty" className="w-8 h-8 rounded-lg" />
                <span className="text-lg font-extrabold tracking-tight text-white">Scouty</span>
              </div>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm text-white text-sm font-medium">
                <Heart className="w-4 h-4" />
                {t('about.badge')}
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-lg">{t('about.title')}</h1>
              <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
                {t('about.intro')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* ── Story ── */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t('about.story_title')}</h2>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-4">
            <p>{t('about.story_p1')}</p>
            <p>{t('about.story_p2')}</p>
            <p>{t('about.story_p3')}</p>
          </div>
        </section>

        <Separator />

        {/* ── 80/20 impact statement ── */}
        <section className="space-y-10">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.impact_eyebrow')}</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
              <span className="text-primary">80%</span>{' '}{t('about.impact_80_label')}<br />
              <span className="text-muted-foreground/60 text-2xl md:text-3xl">{t('about.impact_and')}</span><br />
              <span className="text-foreground/70">20%</span>{' '}{t('about.impact_20_label')}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t('about.impact_desc')}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: FileX,      value: '78%',   labelKey: 'about.stat_excel',    descKey: 'about.stat_excel_desc',    color: 'text-red-500',    bg: 'bg-red-500/10' },
              { icon: TrendingUp, value: '3×',    labelKey: 'about.stat_tracking', descKey: 'about.stat_tracking_desc', color: 'text-green-500',  bg: 'bg-green-500/10' },
              { icon: Clock,      value: '40h',   labelKey: 'about.stat_saved',    descKey: 'about.stat_saved_desc',    color: 'text-blue-500',   bg: 'bg-blue-500/10' },
              { icon: Trophy,     value: '1/5',   labelKey: 'about.stat_lost',     descKey: 'about.stat_lost_desc',     color: 'text-orange-500', bg: 'bg-orange-500/10' },
            ].map((s) => (
              <Card key={s.labelKey} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-5 space-y-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  <div>
                    <p className="text-sm font-bold">{t(s.labelKey)}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(s.descKey)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-accent/5">
            <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <p className="text-lg font-bold">{t('about.impact_cta_title')}</p>
                <p className="text-sm text-muted-foreground">{t('about.impact_cta_desc')}</p>
              </div>
              <Link to="/auth?signup=true" className="shrink-0">
                <Button size="lg" className="font-bold px-8">{t('about.impact_cta_btn')}</Button>
              </Link>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ── Mission & Ambitions ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('about.mission_title')}</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-base font-bold text-primary">{t('about.mission_vision_title')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t('about.mission_vision_desc')}</p>
            </div>
            <div className="space-y-3">
              <h3 className="text-base font-bold text-primary">{t('about.mission_ambition_title')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t('about.mission_ambition_desc')}</p>
            </div>
          </div>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <p className="text-sm font-medium italic text-center leading-relaxed">
                "{t('about.mission_quote')}"
              </p>
              <p className="text-xs text-muted-foreground text-center mt-2">— {t('about.mission_quote_author')}</p>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ── Values ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('about.values_title')}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {values.map((v) => (
              <Card key={v.titleKey} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <v.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{t(v.titleKey)}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(v.descKey)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* ── Key features ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('about.features_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('about.features_intro')}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((f) => (
              <Card key={f.titleKey} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <f.icon className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{t(f.titleKey)}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(f.descKey)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* ── Numbers ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('about.numbers_title')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '2024', labelKey: 'about.num_founded' },
              { value: '2', labelKey: 'about.num_founders' },
              { value: `${publicUsers.length}+`, labelKey: 'about.num_users' },
              { value: '21', labelKey: 'about.num_pages' },
            ].map((n) => (
              <Card key={n.labelKey} className="text-center">
                <CardContent className="p-5">
                  <p className="text-2xl font-black text-primary">{n.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t(n.labelKey)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {clubsData.length > 0 && (
          <>
            <Separator />
            <section className="space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold">{t('about.clubs_title')}</h2>
                <p className="text-sm text-muted-foreground">{t('about.clubs_subtitle')}</p>
              </div>
              <ClubsCarousel clubs={clubsData} />
            </section>
          </>
        )}

        <Separator />

        {/* ── Team ── */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">{t('about.team_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('about.team_intro')}</p>
          <div className="grid sm:grid-cols-2 gap-6">
            {team.map((member) => (
              <Card key={member.name} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-6 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto text-2xl font-black text-primary">
                    {member.name[0]}
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{member.name}</h3>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(member.descKey)}</p>
                  <a
                    href={`https://x.com/${member.x}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    @{member.x}
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* ── Community showcase ── */}
        {publicUsers.length > 0 && (
          <>
            <section className="space-y-6">
              <h2 className="text-2xl font-bold">{t('about.community_title')}</h2>
              <p className="text-sm text-muted-foreground">{t('about.community_intro')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {publicUsers.slice(0, 4).map((u) => {
                  const displayName = u.first_name && u.last_name
                    ? `${u.first_name} ${u.last_name}`
                    : u.full_name || 'Utilisateur';
                  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const card = (
                    <Card key={u.user_id} className="hover:border-primary/30 hover:shadow-md transition-all group cursor-pointer">
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                        {u.photo_url ? (
                          <img
                            src={u.photo_url}
                            alt={displayName}
                            className="w-14 h-14 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/40 transition-all"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center text-sm font-bold text-primary ring-2 ring-border group-hover:ring-primary/40 transition-all">
                            {initials || <User className="w-5 h-5" />}
                          </div>
                        )}
                        <div className="min-w-0 w-full">
                          <p className="text-xs font-semibold truncate">{displayName}</p>
                          {u.role && (
                            <p className="text-[10px] text-muted-foreground truncate">{u.role}</p>
                          )}
                          {u.club && (
                            <p className="text-[10px] text-primary/70 truncate">{u.club}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );

                  if (u.social_public) {
                    return (
                      <Link key={u.user_id} to={`/profile/${u.user_id}`}>
                        {card}
                      </Link>
                    );
                  }
                  return card;
                })}
              </div>
            </section>
            <Separator />
          </>
        )}

        {/* ── Social / Follow ── */}
        <section className="text-center space-y-4">
          <h2 className="text-2xl font-bold">{t('about.follow_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('about.follow_desc')}</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a
              href="https://www.linkedin.com/company/112788560/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-[#0A66C2]/40 text-sm font-medium transition-colors"
            >
              <LinkedInIcon className="w-4 h-4" />
              Scouty
            </a>
            <a
              href="https://x.com/AceOSolo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-foreground/30 text-sm font-medium transition-colors"
            >
              <XIcon className="w-4 h-4" />
              @AceOSolo
            </a>
            <a
              href="https://x.com/GhostGamer42800"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-foreground/30 text-sm font-medium transition-colors"
            >
              <XIcon className="w-4 h-4" />
              @GhostGamer42800
            </a>
          </div>
        </section>

        <Separator />

        {/* ── Contact form ── */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t('contact.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('contact.subtitle')}</p>
            </div>
          </div>

          <Card>
            <CardContent className="p-6 md:p-8">
              {sent ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-bold">{t('contact.sent_title')}</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">{t('contact.sent_desc')}</p>
                  <Button variant="outline" size="sm" onClick={() => setSent(false)}>
                    {t('contact.send_another')}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleContact} className="space-y-5">
                  {/* Honeypot — hidden from real users */}
                  <input type="text" name="honeypot" className="hidden" tabIndex={-1} autoComplete="off" readOnly />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-name">{t('contact.field_name')} <span className="text-destructive">*</span></Label>
                      <Input id="c-name" value={form.name} onChange={e => setField('name', e.target.value)} placeholder={t('contact.placeholder_name')} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-email">{t('contact.field_email')} <span className="text-destructive">*</span></Label>
                      <Input id="c-email" type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="vous@exemple.com" required />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-company">{t('contact.field_company')}</Label>
                      <Input id="c-company" value={form.company} onChange={e => setField('company', e.target.value)} placeholder={t('contact.placeholder_company')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-phone">{t('contact.field_phone')}</Label>
                      <Input id="c-phone" type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+33 6 00 00 00 00" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('contact.field_role')}</Label>
                      <Select value={form.role} onValueChange={v => setField('role', v)}>
                        <SelectTrigger><SelectValue placeholder={t('contact.placeholder_role')} /></SelectTrigger>
                        <SelectContent>
                          {['scout', 'recruteur', 'directeur_sportif', 'agent', 'analyste', 'club', 'autre'].map(r => (
                            <SelectItem key={r} value={r}>{t(`contact.role_${r}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('contact.field_need')}</Label>
                      <Select value={form.need} onValueChange={v => setField('need', v)}>
                        <SelectTrigger><SelectValue placeholder={t('contact.placeholder_need')} /></SelectTrigger>
                        <SelectContent>
                          {['demo', 'information', 'partenariat', 'tarifs', 'support', 'autre'].map(n => (
                            <SelectItem key={n} value={n}>{t(`contact.need_${n}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="c-context">{t('contact.field_context')} <span className="text-destructive">*</span></Label>
                    <Textarea
                      id="c-context"
                      value={form.context}
                      onChange={e => setField('context', e.target.value)}
                      placeholder={t('contact.placeholder_context')}
                      rows={5}
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">{t('contact.required_note')}</p>
                    <Button type="submit" disabled={sending || !form.name.trim() || !form.email.trim() || !form.context.trim()} className="shrink-0">
                      {sending ? t('contact.sending') : t('contact.send')}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ── CTA final ── */}
        <div className="pt-4">
          <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/10">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-accent/5 blur-3xl" />
            </div>
            <CardContent className="relative p-8 md:p-12 text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" />
                {t('about.cta_badge')}
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">{t('about.cta_title')}</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">{t('about.cta_desc')}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/auth?signup=true">
                  <Button size="lg" className="font-bold px-8 w-full sm:w-auto">{t('about.cta_signup')}</Button>
                </Link>
                <Link to="/pricing">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">{t('about.cta_pricing')}</Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground/70">{t('about.cta_no_cc')}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
