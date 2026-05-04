import { useState, useEffect, useRef, useCallback } from 'react';
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

// ── Icons ─────────────────────────────────────────────────────────────────

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

// ── Hooks ─────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let raf: number;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

// ── Section reveal wrapper ────────────────────────────────────────────────

function RevealSection({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('in-view'); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <section ref={ref} className={`reveal-up ${delay ? `reveal-delay-${delay}` : ''} ${className ?? ''}`}>
      {children}
    </section>
  );
}

// ── Floating orbs background ─────────────────────────────────────────────

function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-[15%] left-[8%] w-64 h-64 rounded-full bg-primary/10 blur-3xl float-slow" style={{ animationDelay: '0s' }} />
      <div className="absolute top-[40%] right-[10%] w-48 h-48 rounded-full bg-accent/10 blur-3xl float-slow" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-[20%] left-[30%] w-72 h-72 rounded-full bg-primary/8 blur-3xl float-slow" style={{ animationDelay: '4s' }} />
    </div>
  );
}

// ── Dynamic stat card (animated counter) ─────────────────────────────────

function StatCard({ icon: Icon, value, labelKey, descKey, color, bg }: {
  icon: React.ElementType; value: string; labelKey: string; descKey: string; color: string; bg: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const numericVal = parseInt(value.replace(/\D/g, '')) || 0;
  const suffix = value.replace(/[\d]/g, '');
  const animated = useCountUp(numericVal, 1200, visible);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="reveal-scale card-tilt">
      <Card className="hover:border-primary/30 transition-all group h-full">
        <CardContent className="p-5 space-y-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <p className={`text-3xl font-black tabular-nums ${color}`}>
            {visible ? (numericVal > 0 ? animated + suffix : value) : '0' + suffix}
          </p>
          <div>
            <p className="text-sm font-bold">{t(labelKey)}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(descKey)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dynamic key figure (live from DB) ────────────────────────────────────

function LiveNumber({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const animated = useCountUp(value, 1800, visible);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="text-center space-y-1 reveal-scale group">
      <p className="text-5xl md:text-6xl font-black text-primary tabular-nums group-hover:scale-105 transition-transform duration-300 inline-block">
        {visible ? (animated > 0 ? animated + suffix : (value > 0 ? value + suffix : '—')) : '—'}
      </p>
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

// ── 3D tilt card ──────────────────────────────────────────────────────────

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(4px)`;
  }, []);
  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) translateZ(0)';
  }, []);
  return (
    <div ref={ref} className={className} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      style={{ transition: 'transform 0.25s ease', transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  );
}

// ── Clubs carousel ────────────────────────────────────────────────────────

interface ClubItem { club_name: string; logo_url: string | null }

function ClubsCarousel({ clubs }: { clubs: ClubItem[] }) {
  if (clubs.length === 0) return null;
  const items = [...clubs, ...clubs, ...clubs];
  return (
    <div className="overflow-hidden relative">
      <style>{`
        @keyframes scouty-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-33.333%); } }
        .scouty-marquee { animation: scouty-marquee ${Math.max(20, clubs.length * 3)}s linear infinite; will-change: transform; }
        .scouty-marquee:hover { animation-play-state: paused; }
      `}</style>
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      <div className="scouty-marquee flex gap-4" style={{ width: 'max-content' }}>
        {items.map((c, i) => {
          const [imgError, setImgError] = useState(false);
          return (
            <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-card hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all shrink-0 cursor-default select-none group">
              {c.logo_url && !imgError ? (
                <img src={c.logo_url} alt={c.club_name} className="w-7 h-7 object-contain shrink-0 group-hover:scale-110 transition-transform" onError={() => setImgError(true)} />
              ) : (
                <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">{c.club_name.charAt(0)}</div>
              )}
              <span className="text-sm font-medium whitespace-nowrap text-foreground/80">{c.club_name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Public user interface ─────────────────────────────────────────────────

interface PublicUser {
  user_id: string; full_name: string; first_name: string | null; last_name: string | null;
  civility: string | null; club: string | null; role: string | null; photo_url: string | null;
  company: string | null; reference_club: string | null; social_public: boolean; created_at: string;
}

interface SiteStats {
  total_users: number;
  total_players: number;
  total_reports: number;
  total_orgs: number;
  total_clubs: number;
}

// ── Values data (scout card style) ───────────────────────────────────────

const values = [
  {
    icon: Target,
    titleKey: 'about.value_precision_title',
    descKey: 'about.value_precision_desc',
    gradient: 'from-primary/80 to-primary/40',
    color: 'text-white',
    label: '01',
    accent: 'bg-primary',
  },
  {
    icon: Zap,
    titleKey: 'about.value_speed_title',
    descKey: 'about.value_speed_desc',
    gradient: 'from-amber-500/80 to-amber-400/40',
    color: 'text-white',
    label: '02',
    accent: 'bg-amber-500',
  },
  {
    icon: Users,
    titleKey: 'about.value_collab_title',
    descKey: 'about.value_collab_desc',
    gradient: 'from-blue-600/80 to-blue-400/40',
    color: 'text-white',
    label: '03',
    accent: 'bg-blue-600',
  },
  {
    icon: Globe,
    titleKey: 'about.value_access_title',
    descKey: 'about.value_access_desc',
    gradient: 'from-emerald-600/80 to-emerald-400/40',
    color: 'text-white',
    label: '04',
    accent: 'bg-emerald-600',
  },
];

const features = [
  { icon: BarChart3, titleKey: 'about.feat_enrichment_title', descKey: 'about.feat_enrichment_desc', color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { icon: Shield, titleKey: 'about.feat_org_title', descKey: 'about.feat_org_desc', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { icon: Sparkles, titleKey: 'about.feat_discover_title', descKey: 'about.feat_discover_desc', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { icon: MapPin, titleKey: 'about.feat_map_title', descKey: 'about.feat_map_desc', color: 'text-green-500', bg: 'bg-green-500/10' },
];

// ── Image "Notre histoire" avec fallback propre ───────────────────────────

function NotreHistoireImage({ stats, totalUsers }: { stats: SiteStats; totalUsers: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const { t } = useTranslation();

  const overlayStats = [
    { label: t('about.num_founded'), value: '2024' },
    { label: t('about.num_users'), value: `${totalUsers || '50'}+` },
    { label: 'Joueurs suivis', value: stats.total_players > 0 ? `${stats.total_players}+` : '500+' },
  ];

  return (
    <div className="relative rounded-3xl overflow-hidden aspect-[4/5] shadow-2xl shadow-primary/10 group">
      {!imgFailed ? (
        <img
          src="/notre_histoire.jpg"
          alt="Notre histoire — Scouty"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          onError={() => setImgFailed(true)}
        />
      ) : (
        /* Placeholder quand l'image n'a pas encore été déposée dans public/ */
        <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex flex-col items-center justify-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-primary/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-primary/40" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <p className="text-xs text-primary/50 font-medium text-center px-6">Déposez <code className="bg-primary/10 px-1 rounded">notre_histoire.jpg</code><br />dans le dossier <code className="bg-primary/10 px-1 rounded">public/</code></p>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
      <div className="absolute bottom-6 left-6 right-6 space-y-2">
        {overlayStats.map((s, i) => (
          <div key={i} className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-xl px-4 py-2.5 border border-white/10">
            <span className="text-xs text-white/70">{s.label}</span>
            <span className="text-sm font-black text-white">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const team = [
  { name: 'Alexis', role: 'Co-fondateur & Product', x: 'AceOSolo', descKey: 'about.alexis_desc' },
  { name: 'Jonathan', role: 'Co-fondateur & Tech', x: 'GhostGamer42800', descKey: 'about.jonathan_desc' },
];

// ── Main component ────────────────────────────────────────────────────────

export default function About() {
  const { t } = useTranslation();
  const [scrollY, setScrollY] = useState(0);
  const [publicUsers, setPublicUsers] = useState<PublicUser[]>([]);
  const [clubsData, setClubsData] = useState<ClubItem[]>([]);
  const [stats, setStats] = useState<SiteStats>({ total_users: 0, total_players: 0, total_reports: 0, total_orgs: 0, total_clubs: 0 });

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, honeypot: '' }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || t('contact.error')); }
      else { setSent(true); setForm(emptyForm); }
    } catch { toast.error(t('contact.error')); }
    finally { setSending(false); }
  };

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Live stats
    fetch(`${API_BASE}/public/stats`).then(r => r.ok ? r.json() : null).then((d) => { if (d) setStats(d as SiteStats); }).catch(() => {});
    // Community users
    fetch(`${API_BASE}/public/users`).then(r => r.ok ? r.json() : []).then(setPublicUsers).catch(() => {});
    // Club logos
    fetch(`${API_BASE}/club-logos`).then(r => r.ok ? r.json() : []).then((rows: ClubItem[]) => {
      const withLogo = rows.filter(c => c.logo_url);
      for (let i = withLogo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [withLogo[i], withLogo[j]] = [withLogo[j], withLogo[i]];
      }
      setClubsData(withLogo.slice(0, 60));
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <PageSEO
        path="/about"
        title="À propos de Scouty | Plateforme de scouting footballistique"
        description="Découvrez l'histoire, la mission et les valeurs de Scouty. Nous aidons les scouts, recruteurs et coachs à gérer efficacement leur travail de détection et d'observation des joueurs."
      />

      {/* ── Hero parallax ── */}
      <div className="relative h-[480px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{ backgroundImage: `url(${stadiumBg})`, transform: `scale(1.1) translateY(${scrollY * 0.35}px)`, willChange: 'transform' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-accent/10" />
        <div className="absolute inset-0 pointer-events-none">
          {[{ top: '20%', left: '15%', s: 3, d: '0s', dur: '4s' }, { top: '35%', left: '75%', s: 2, d: '1.2s', dur: '5s' }, { top: '60%', left: '45%', s: 4, d: '0.6s', dur: '6s' }].map((p, i) => (
            <div key={i} className="absolute rounded-full bg-white/40" style={{ top: p.top, left: p.left, width: p.s * 4, height: p.s * 4, animation: `float-y ${p.dur} ease-in-out ${p.d} infinite` }} />
          ))}
        </div>
        <div className="relative z-10 h-full flex flex-col">
          <header className="px-6 py-4">
            <div className="max-w-5xl mx-auto flex items-center gap-4">
              <Link to="/"><Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 border border-white/10"><ArrowLeft className="w-4 h-4 mr-2" />{t('common.back')}</Button></Link>
              <div className="flex items-center gap-2">
                <img src={logo} alt="Scouty" className="w-8 h-8 rounded-lg float-y" />
                <span className="text-lg font-extrabold tracking-tight text-white">Scouty</span>
              </div>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-white text-sm font-medium pulse-ring">
                <Heart className="w-4 h-4 text-red-400 animate-pulse" />
                {t('about.badge')}
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight drop-shadow-xl">
                <span className="text-white">{t('about.title').split(' ').slice(0, -2).join(' ')} </span>
                <span className="text-gradient-animated">{t('about.title').split(' ').slice(-2).join(' ')}</span>
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">{t('about.intro')}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link to="/auth?signup=true">
                  <Button size="lg" className="font-bold px-8 shadow-xl shadow-primary/30">{t('about.impact_cta_btn')}<Sparkles className="w-4 h-4" /></Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="relative">
        <FloatingOrbs />

        {/* ── Notre Histoire ── */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <RevealSection className="">
            <div className="grid md:grid-cols-2 gap-14 items-center">
              <div className="space-y-7">
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.story_title')}</p>
                  <h2 className="text-3xl md:text-4xl font-black leading-tight">{t('about.story_title')}</h2>
                </div>
                <div className="space-y-5 text-base text-muted-foreground leading-8">
                  <p>{t('about.story_p1')}</p>
                  <p>{t('about.story_p2')}</p>
                  <p>{t('about.story_p3')}</p>
                </div>
                <Link to="/auth?signup=true">
                  <Button size="lg" className="font-bold">{t('about.impact_cta_btn')}</Button>
                </Link>
              </div>

              {/* Notre histoire image */}
              <NotreHistoireImage stats={stats} totalUsers={stats.total_users || publicUsers.length} />
            </div>
          </RevealSection>
        </div>

        {/* ── Chiffres clés dynamiques ── */}
        <div className="border-y border-border/50 bg-gradient-to-r from-primary/5 via-background to-accent/5">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <RevealSection className="space-y-10">
              <div className="text-center space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.numbers_title')}</p>
                <h2 className="text-3xl md:text-4xl font-black">{t('about.numbers_title')}</h2>
                <p className="text-sm text-muted-foreground">Mis à jour en temps réel depuis la plateforme</p>
              </div>

              {/* Live numbers grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 py-4">
                <LiveNumber value={stats.total_users || publicUsers.length} label="Utilisateurs" suffix="+" />
                <LiveNumber value={stats.total_players} label="Joueurs suivis" suffix="+" />
                <LiveNumber value={stats.total_reports} label="Rapports rédigés" suffix="+" />
                <LiveNumber value={stats.total_clubs} label="Clubs référencés" suffix="+" />
                <LiveNumber value={stats.total_orgs} label="Organisations" suffix="+" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {[
                  { value: '2024', labelKey: 'about.num_founded' },
                  { value: '2', labelKey: 'about.num_founders' },
                  { value: '21', labelKey: 'about.num_pages' },
                  { value: '5', labelKey: 'about.num_continents' },
                ].map(({ value, labelKey }) => {
                  const ref = useRef<HTMLDivElement>(null);
                  const [vis, setVis] = useState(false);
                  const n = parseInt(value) || 0;
                  const animated = useCountUp(n, 1600, vis);
                  useEffect(() => {
                    const el = ref.current;
                    if (!el) return;
                    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.3 });
                    obs.observe(el);
                    return () => obs.disconnect();
                  }, []);
                  return (
                    <div ref={ref} key={labelKey} className="reveal-scale">
                      <Card className="text-center hover:border-primary/30 transition-all hover:shadow-lg hover:-translate-y-1 group">
                        <CardContent className="p-5">
                          <p className="text-3xl font-black text-primary tabular-nums group-hover:scale-110 inline-block transition-transform duration-300">
                            {vis ? (n > 0 ? animated : value) : '—'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{t(labelKey)}</p>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </RevealSection>
          </div>
        </div>

        {/* ── 80/20 impact ── */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary/80 dark:from-slate-950 dark:via-slate-900 dark:to-primary/50">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <RevealSection className="space-y-12">
              <div className="text-center space-y-5 max-w-3xl mx-auto">
                <p className="text-xs font-bold uppercase tracking-widest text-primary/80">{t('about.impact_eyebrow')}</p>
                <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight text-white">
                  <span className="text-primary">80%</span>{' '}{t('about.impact_80_label')}<br />
                  <span className="text-white/40 text-2xl md:text-3xl">{t('about.impact_and')}</span><br />
                  <span className="text-white/70">20%</span>{' '}{t('about.impact_20_label')}
                </h2>
                <p className="text-base text-white/60 leading-8 max-w-xl mx-auto">{t('about.impact_desc')}</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { icon: FileX, value: '78%', labelKey: 'about.stat_excel', descKey: 'about.stat_excel_desc', color: 'text-red-400', bg: 'bg-red-400/15' },
                  { icon: TrendingUp, value: '3×', labelKey: 'about.stat_tracking', descKey: 'about.stat_tracking_desc', color: 'text-emerald-400', bg: 'bg-emerald-400/15' },
                  { icon: Clock, value: '40h', labelKey: 'about.stat_saved', descKey: 'about.stat_saved_desc', color: 'text-sky-400', bg: 'bg-sky-400/15' },
                  { icon: Trophy, value: '1/5', labelKey: 'about.stat_lost', descKey: 'about.stat_lost_desc', color: 'text-amber-400', bg: 'bg-amber-400/15' },
                ].map(s => <StatCard key={s.labelKey} {...s} />)}
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <p className="text-xl font-bold text-white">{t('about.impact_cta_title')}</p>
                  <p className="text-sm text-white/60">{t('about.impact_cta_desc')}</p>
                </div>
                <Link to="/auth?signup=true" className="shrink-0">
                  <Button size="lg" className="font-bold px-8 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30">{t('about.impact_cta_btn')}</Button>
                </Link>
              </div>
            </RevealSection>
          </div>
        </div>

        {/* ── Mission & Ambitions ── */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <RevealSection className="space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.mission_title')}</p>
              <h2 className="text-3xl md:text-4xl font-black">{t('about.mission_title')}</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { title: t('about.mission_vision_title'), desc: t('about.mission_vision_desc') },
                { title: t('about.mission_ambition_title'), desc: t('about.mission_ambition_desc') },
              ].map((item, i) => (
                <TiltCard key={i}>
                  <Card className="h-full hover:border-primary/30 transition-all hover:shadow-lg">
                    <CardContent className="p-7 space-y-4">
                      <h3 className="text-lg font-bold text-primary">{item.title}</h3>
                      <p className="text-base text-muted-foreground leading-8">{item.desc}</p>
                    </CardContent>
                  </Card>
                </TiltCard>
              ))}
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-primary/20">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/5" />
              <CardContent className="relative p-8 text-center space-y-2">
                <p className="text-xl font-medium italic leading-9">"{t('about.mission_quote')}"</p>
                <p className="text-sm text-muted-foreground">— {t('about.mission_quote_author')}</p>
              </CardContent>
            </div>
          </RevealSection>
        </div>

        {/* ── Nos Valeurs — Scout Cards ── */}
        <div className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-y border-border/50">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <RevealSection className="space-y-12">
              <div className="text-center space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.values_title')}</p>
                <h2 className="text-3xl md:text-4xl font-black">{t('about.values_title')}</h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">Ce qui guide chaque décision chez Scouty</p>
              </div>

              {/* Scout-card style values grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {values.map((v, i) => (
                  <TiltCard key={v.titleKey} className={`reveal-scale reveal-delay-${i + 1}`}>
                    <div className="rounded-2xl overflow-hidden border border-border/50 hover:border-primary/30 transition-all hover:shadow-2xl group cursor-default h-full flex flex-col">
                      {/* Top — colored art zone */}
                      <div className={`relative bg-gradient-to-br ${v.gradient} p-6 flex flex-col items-center justify-center min-h-[140px]`}>
                        {/* Big label number in background */}
                        <span className="absolute top-3 right-4 text-6xl font-black text-white/10 select-none leading-none">{v.label}</span>
                        {/* Icon */}
                        <div className="relative z-10 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                          <v.icon className="w-8 h-8 text-white" />
                        </div>
                        {/* Decorative dots */}
                        <div className="absolute bottom-2 left-3 flex gap-1 opacity-30">
                          {[...Array(3)].map((_, j) => <div key={j} className="w-1.5 h-1.5 rounded-full bg-white" />)}
                        </div>
                      </div>
                      {/* Bottom — text zone */}
                      <div className="bg-card p-5 flex-1 space-y-2">
                        <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${v.accent} mb-1`}>
                          Valeur {v.label}
                        </div>
                        <h3 className="text-sm font-bold leading-snug">{t(v.titleKey)}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{t(v.descKey)}</p>
                      </div>
                    </div>
                  </TiltCard>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>

        {/* ── Key features ── */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <RevealSection className="space-y-12">
            <div className="text-center space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.features_title')}</p>
              <h2 className="text-3xl md:text-4xl font-black">{t('about.features_title')}</h2>
              <p className="text-base text-muted-foreground max-w-xl mx-auto leading-7">{t('about.features_intro')}</p>
            </div>
            <div className="space-y-8">
              {features.map((f, i) => (
                <TiltCard key={f.titleKey}>
                  <Card className="hover:border-primary/30 transition-all hover:shadow-xl overflow-hidden group">
                    <CardContent className={`p-0 flex flex-col ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                      <div className={`shrink-0 flex items-center justify-center p-10 ${f.bg} md:w-56`}>
                        <f.icon className={`w-14 h-14 ${f.color} group-hover:scale-110 transition-transform duration-300`} />
                      </div>
                      <div className="p-8 space-y-3 flex flex-col justify-center">
                        <h3 className="text-xl font-bold">{t(f.titleKey)}</h3>
                        <p className="text-base text-muted-foreground leading-8">{t(f.descKey)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </TiltCard>
              ))}
            </div>
          </RevealSection>
        </div>

        {/* ── Clubs carousel ── */}
        {clubsData.length > 0 && (
          <div className="py-16 border-b border-border/50">
            <div className="max-w-6xl mx-auto px-6 mb-8">
              <RevealSection className="text-center space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.clubs_title')}</p>
                <h2 className="text-3xl font-black">{t('about.clubs_title')}</h2>
                <p className="text-base text-muted-foreground">{t('about.clubs_subtitle')}</p>
              </RevealSection>
            </div>
            <ClubsCarousel clubs={clubsData} />
          </div>
        )}

        {/* ── Équipe ── */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <RevealSection className="space-y-10">
            <div className="grid md:grid-cols-2 gap-10 items-start">
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.team_title')}</p>
                <h2 className="text-3xl md:text-4xl font-black">{t('about.team_title')}</h2>
                <p className="text-base text-muted-foreground leading-8">{t('about.team_intro')}</p>
              </div>
              <div className="relative rounded-2xl overflow-hidden aspect-video shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80"
                  alt="Team"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/40 to-transparent" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              {team.map((member) => (
                <TiltCard key={member.name}>
                  <Card className="hover:border-primary/30 transition-all hover:shadow-xl group">
                    <CardContent className="p-8 text-center space-y-4">
                      <div className="relative inline-block">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto text-2xl font-black text-primary ring-4 ring-primary/10 group-hover:ring-primary/30 transition-all group-hover:scale-110">
                          {member.name[0]}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-400 border-2 border-card float-y" style={{ animationDelay: '1s' }} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{member.name}</h3>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                      <p className="text-sm text-muted-foreground leading-7">{t(member.descKey)}</p>
                      <a href={`https://x.com/${member.x}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors hover:bg-muted px-3 py-1.5 rounded-full">
                        <XIcon className="w-3.5 h-3.5" />@{member.x}
                      </a>
                    </CardContent>
                  </Card>
                </TiltCard>
              ))}
            </div>
          </RevealSection>
        </div>

        {/* ── Notre communauté ── */}
        <div className="bg-gradient-to-br from-accent/5 via-background to-primary/5 border-y border-border/50">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <RevealSection className="space-y-8">
              <div className="text-center space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.community_title')}</p>
                <h2 className="text-3xl font-black">{t('about.community_title')}</h2>
                <p className="text-base text-muted-foreground">{t('about.community_intro')}</p>
              </div>

              {publicUsers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {publicUsers.slice(0, 4).map((u, i) => {
                    const displayName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.full_name || 'Utilisateur';
                    const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    const card = (
                      <TiltCard key={u.user_id}>
                        <Card className={`hover:border-primary/30 hover:shadow-lg transition-all group cursor-pointer reveal-scale reveal-delay-${i + 1}`}>
                          <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                            {u.photo_url ? (
                              <img src={u.photo_url} alt={displayName} className="w-14 h-14 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/50 group-hover:scale-105 transition-all" />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center text-sm font-bold text-primary ring-2 ring-border group-hover:ring-primary/50 group-hover:scale-105 transition-all">
                                {initials || <User className="w-5 h-5" />}
                              </div>
                            )}
                            <div className="min-w-0 w-full">
                              <p className="text-xs font-semibold truncate">{displayName}</p>
                              {u.role && <p className="text-[10px] text-muted-foreground truncate capitalize">{u.role}</p>}
                              {u.club && <p className="text-[10px] text-primary/70 truncate">{u.club}</p>}
                            </div>
                          </CardContent>
                        </Card>
                      </TiltCard>
                    );
                    if (u.social_public) return <Link key={u.user_id} to={`/profile/${u.user_id}`}>{card}</Link>;
                    return card;
                  })}
                </div>
              ) : (
                /* Placeholder quand pas encore d'utilisateurs publics */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i} className={`reveal-scale reveal-delay-${i + 1}`}>
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-primary/30">
                          <User className="w-6 h-6" />
                        </div>
                        <div className="space-y-1 w-full">
                          <div className="h-2.5 w-20 bg-muted rounded-full mx-auto" />
                          <div className="h-2 w-14 bg-muted/60 rounded-full mx-auto" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="text-center">
                <Link to="/auth?signup=true">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Users className="w-4 h-4" />
                    Rejoindre la communauté
                  </Button>
                </Link>
              </div>
            </RevealSection>
          </div>
        </div>

        {/* ── Réseaux sociaux ── */}
        <div className="max-w-6xl mx-auto px-6 py-16">
          <RevealSection className="text-center space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('about.follow_title')}</p>
              <h2 className="text-3xl font-black">{t('about.follow_title')}</h2>
              <p className="text-base text-muted-foreground">{t('about.follow_desc')}</p>
            </div>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {[
                { href: 'https://www.linkedin.com/company/112788560/', icon: <LinkedInIcon className="w-4 h-4" />, label: 'Scouty', color: 'hover:border-[#0A66C2]/50 hover:bg-[#0A66C2]/5' },
                { href: 'https://x.com/AceOSolo', icon: <XIcon className="w-4 h-4" />, label: '@AceOSolo', color: 'hover:border-foreground/40 hover:bg-foreground/5' },
                { href: 'https://x.com/GhostGamer42800', icon: <XIcon className="w-4 h-4" />, label: '@GhostGamer42800', color: 'hover:border-foreground/40 hover:bg-foreground/5' },
              ].map((s, i) => (
                <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${s.color}`}>
                  {s.icon}{s.label}
                </a>
              ))}
            </div>
          </RevealSection>
        </div>

        {/* ── Nous contacter ── */}
        <div className="bg-gradient-to-br from-primary/8 via-background to-accent/8 border-t border-border/50">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <RevealSection className="space-y-10">
              <div className="grid md:grid-cols-2 gap-12 items-start">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('contact.title')}</p>
                    <h2 className="text-3xl md:text-4xl font-black">{t('contact.title')}</h2>
                    <p className="text-base text-muted-foreground leading-7">{t('contact.subtitle')}</p>
                  </div>

                  {/* Image "nous contacter" — discussion informelle, pas recrutement */}
                  <div className="relative rounded-2xl overflow-hidden aspect-video shadow-xl">
                    <img
                      src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80"
                      alt="Nous contacter — une conversation"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/50 to-transparent" />
                    <div className="absolute bottom-5 left-5 space-y-1">
                      <p className="text-white font-bold text-lg">Une question ?</p>
                      <p className="text-white/70 text-sm">On vous répond sous 24h</p>
                    </div>
                  </div>

                  {/* Raisons de contacter */}
                  <div className="space-y-2.5">
                    {[
                      { icon: '💬', text: 'Une question sur nos fonctionnalités ?' },
                      { icon: '🤝', text: 'Un partenariat ou une collaboration ?' },
                      { icon: '💡', text: 'Une idée d\'amélioration à partager ?' },
                      { icon: '📊', text: 'Besoin d\'une démo personnalisée ?' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span className="text-base">{item.icon}</span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-6 md:p-8">
                    {sent ? (
                      <div className="flex flex-col items-center gap-4 py-10 text-center animate-in fade-in zoom-in-95">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center pulse-ring">
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-lg font-bold">{t('contact.sent_title')}</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">{t('contact.sent_desc')}</p>
                        <Button variant="outline" size="sm" onClick={() => setSent(false)}>{t('contact.send_another')}</Button>
                      </div>
                    ) : (
                      <form onSubmit={handleContact} className="space-y-5">
                        <input type="text" name="honeypot" className="hidden" tabIndex={-1} autoComplete="off" readOnly />
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="c-name">{t('contact.field_name')} <span className="text-destructive">*</span></Label>
                            <Input id="c-name" value={form.name} onChange={e => setField('name', e.target.value)} placeholder={t('contact.placeholder_name')} required className="transition-shadow focus:shadow-md focus:shadow-primary/10" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="c-email">{t('contact.field_email')} <span className="text-destructive">*</span></Label>
                            <Input id="c-email" type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="vous@exemple.com" required className="transition-shadow focus:shadow-md focus:shadow-primary/10" />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="c-company">{t('contact.field_company')}</Label>
                            <Input id="c-company" value={form.company} onChange={e => setField('company', e.target.value)} placeholder={t('contact.placeholder_company')} className="transition-shadow focus:shadow-md focus:shadow-primary/10" />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="c-phone">{t('contact.field_phone')}</Label>
                            <Input id="c-phone" type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+33 6 00 00 00 00" className="transition-shadow focus:shadow-md focus:shadow-primary/10" />
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="c-role">{t('contact.field_role')}</Label>
                            <Select value={form.role} onValueChange={v => setField('role', v)}>
                              <SelectTrigger><SelectValue placeholder={t('contact.placeholder_role')} /></SelectTrigger>
                              <SelectContent>
                                {['scout', 'recruiter', 'coach', 'director', 'agent', 'analyst', 'other'].map(r => (
                                  <SelectItem key={r} value={r}>{t(`contact.role_${r}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="c-need">{t('contact.field_need')}</Label>
                            <Select value={form.need} onValueChange={v => setField('need', v)}>
                              <SelectTrigger><SelectValue placeholder={t('contact.placeholder_need')} /></SelectTrigger>
                              <SelectContent>
                                {['demo', 'pricing', 'partnership', 'support', 'other'].map(n => (
                                  <SelectItem key={n} value={n}>{t(`contact.need_${n}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="c-context">{t('contact.field_context')} <span className="text-destructive">*</span></Label>
                          <Textarea id="c-context" value={form.context} onChange={e => setField('context', e.target.value)} placeholder={t('contact.placeholder_context')} rows={4} required className="transition-shadow focus:shadow-md focus:shadow-primary/10 resize-none" />
                        </div>
                        <Button type="submit" disabled={sending || !form.name || !form.email || !form.context} className="w-full font-semibold" size="lg">
                          {sending ? (
                            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('contact.sending')}</>
                          ) : (
                            <><Mail className="w-4 h-4" />{t('contact.send')}</>
                          )}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>
            </RevealSection>
          </div>
        </div>

        {/* ── Final CTA ── */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <RevealSection className="">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10 border border-primary/20 shadow-2xl shadow-primary/5">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/8 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-accent/8 blur-3xl" />
              </div>
              <div className="relative p-10 md:p-16 text-center space-y-7">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('about.cta_badge')}
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">{t('about.cta_title')}</h2>
                <p className="text-base text-muted-foreground max-w-xl mx-auto leading-8">{t('about.cta_desc')}</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link to="/auth?signup=true">
                    <Button size="lg" className="font-bold px-10 shadow-xl shadow-primary/20 w-full sm:w-auto">{t('about.cta_signup')}</Button>
                  </Link>
                  <Link to="/pricing">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">{t('about.cta_pricing')}</Button>
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground/60">{t('about.cta_no_cc')}</p>
              </div>
            </div>
          </RevealSection>
        </div>
      </main>
    </div>
  );
}
