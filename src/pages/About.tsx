import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, Target, Users, Zap, Globe, Shield, BarChart3, Sparkles, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
  }, []);

  return (
    <div className="min-h-screen bg-background">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {publicUsers.map((u) => {
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

        {/* ── CTA ── */}
        <div className="text-center pt-4">
          <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20">
            <CardContent className="p-8 space-y-4">
              <h2 className="text-xl font-bold">{t('about.cta_title')}</h2>
              <p className="text-sm text-muted-foreground">{t('about.cta_desc')}</p>
              <div className="flex items-center justify-center gap-3">
                <Link to="/auth?signup=true">
                  <Button>{t('about.cta_signup')}</Button>
                </Link>
                <Link to="/pricing">
                  <Button variant="outline">{t('about.cta_pricing')}</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
