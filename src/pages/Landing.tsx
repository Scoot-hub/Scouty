import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Users, BarChart3, Shield, Zap, Globe, UserCircle, Star, Layers, Share2, Menu, X,
  Target, ListChecks, Users2, ClipboardList, GitCompare, MapPin, Sparkles, Calendar,
  Upload, Download, MessagesSquare, Map, Newspaper, TrendingUp, MessageCircle, FileText,
  AtSign, Search, Building2, Compass, Clock, Check, ArrowRight,
} from 'lucide-react';
import stadiumHero from '@/assets/stadium-hero.jpg';
import cherkiPhoto from '@/assets/cherki.png';
import { useAuth } from '@/contexts/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import logo from '@/assets/logo.png';
import PageSEO from '@/components/PageSEO';
import { cn } from '@/lib/utils';

// Every link/button on the landing opens in a new tab (keeps the marketing page open behind)
function ExtLink(props: React.ComponentProps<typeof Link>) {
  return <Link {...props} target="_blank" rel="noopener noreferrer" />;
}

// ── Shared in-view hook (one-shot) ────────────────────────────────────────────
function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

// ── Scroll reveal wrapper (uses .reveal-up / .in-view from index.css) ─────────
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref} className={cn('reveal-up', inView && 'in-view', className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ── Count-up number (animates from 0 when scrolled into view) ─────────────────
function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1100, className }:
  { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.4);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return <span ref={ref} className={className}>{prefix}{val.toFixed(decimals)}{suffix}</span>;
}

// ── Tilt-on-cursor wrapper (desktop / fine-pointer only) ──────────────────────
function TiltCard({ children, className, max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useRef(false);
  const [transform, setTransform] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)');
  useEffect(() => {
    enabled.current = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);
  const onMove = (e: React.MouseEvent) => {
    if (!enabled.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTransform(`perspective(1000px) rotateY(${px * max}deg) rotateX(${-py * max}deg) scale(1.02)`);
  };
  const onLeave = () => setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)');
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      className={cn('transition-transform duration-300 ease-out will-change-transform', className)}
      style={{ transform }}>
      {children}
    </div>
  );
}

// ── Branded product mockups (light theme, magenta/amber DA) ───────────────────

function PlayerMockup() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-sm select-none">
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gradient-to-b from-primary/15 to-accent/15 ring-1 ring-border">
            <img src={cherkiPhoto} alt="Rayan Cherki" className="w-full h-full object-cover object-top" loading="lazy" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground truncate">Rayan Cherki</div>
            <div className="text-xs text-muted-foreground">Milieu offensif · 22 ans</div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent/25 text-accent-foreground whitespace-nowrap">
            {t('landing.ui.watch')}
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            { node: <CountUp value={8.2} decimals={1} />, l: t('landing.ui.level') },
            { node: <CountUp value={8.8} decimals={1} />, l: t('landing.ui.potential') },
            { node: <CountUp value={40} prefix="€" suffix="M" />, l: t('landing.ui.value') },
          ].map(s => (
            <div key={s.l} className="py-3 text-center">
              <div className="text-lg font-black text-foreground tabular-nums">{s.node}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 px-4 pt-3 flex-wrap">
          {['MO', 'France', 'Gaucher', '22 ans'].map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">{tag}</span>
          ))}
        </div>
        <div className="m-4 p-3 rounded-xl bg-muted/60 border border-border">
          <div className="text-[11px] text-muted-foreground leading-relaxed italic">
            « Génie technique, élimine dans les petits espaces. À confirmer dans le repli défensif. »
          </div>
        </div>
      </div>
    </div>
  );
}

function EnrichMockup() {
  const { t } = useTranslation();
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const bars = [62, 80, 95, 54, 78, 88];
  return (
    <div ref={ref} className="w-full max-w-sm select-none">
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{t('landing.ui.stats_season')}</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t('landing.ui.collab_live')}
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm transition-[height] duration-700 ease-out"
              style={{ height: inView ? `${h}%` : '0%', transitionDelay: `${i * 70}ms`, backgroundColor: i === 2 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.25)' }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { node: <CountUp value={12} />, l: t('landing.ui.goals') },
            { node: <CountUp value={7} />, l: t('landing.ui.assists') },
            { node: <CountUp value={87} suffix="%" />, l: t('landing.ui.pass_pct') },
            { node: <CountUp value={1842} />, l: t('landing.ui.minutes') },
          ].map(s => (
            <div key={s.l} className="rounded-xl bg-muted/50 border border-border p-2.5 text-center">
              <div className="text-base font-black text-foreground tabular-nums">{s.node}</div>
              <div className="text-[9px] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3 text-accent-foreground fill-accent" />
          {t('landing.ui.enriched_via')}
        </div>
      </div>
    </div>
  );
}

function TeamMockup() {
  const positions = [
    { top: '6%', left: '50%', label: 'GK' },
    { top: '30%', left: '20%', label: 'DD' }, { top: '30%', left: '40%', label: 'DC' },
    { top: '30%', left: '60%', label: 'DC' }, { top: '30%', left: '80%', label: 'DG' },
    { top: '56%', left: '30%', label: 'MC' }, { top: '56%', left: '50%', label: 'MC' },
    { top: '56%', left: '70%', label: 'MO' },
    { top: '80%', left: '20%', label: 'AG' }, { top: '80%', left: '50%', label: 'AT' },
    { top: '80%', left: '80%', label: 'AD' },
  ];
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="w-full max-w-sm select-none">
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-foreground">Shadow Team</span>
          <span className="text-[10px] font-bold text-primary">4-3-3</span>
        </div>
        <div className="relative mx-4 my-3 rounded-xl overflow-hidden" style={{ height: 180, background: 'linear-gradient(180deg, hsl(var(--primary) / 0.10) 0%, hsl(var(--primary) / 0.03) 100%)', border: '1px solid hsl(var(--border))' }}>
          <div className="absolute inset-0 flex flex-col justify-around opacity-60">
            <div className="border-b border-border w-full" />
            <div className="border-b border-border w-full" />
          </div>
          {positions.map((p, i) => (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 transition-all duration-500"
              style={{ top: p.top, left: p.left, opacity: inView ? 1 : 0, transform: `translate(-50%, -50%) scale(${inView ? 1 : 0.4})`, transitionDelay: `${i * 45}ms` }}>
              <div className="w-5 h-5 rounded-full border-2 border-card flex items-center justify-center bg-primary shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground/90" />
              </div>
              <span className="text-[7px] text-muted-foreground font-bold">{p.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <Star className="w-3 h-3 text-accent-foreground fill-accent" />
          <span className="text-[10px] text-muted-foreground">11 postes · 4 joueurs suivis par poste</span>
        </div>
      </div>
    </div>
  );
}

function CollabMockup() {
  const members = [
    { initials: 'JM', role: 'Admin' },
    { initials: 'AL', role: 'Scout' },
    { initials: 'PR', role: 'Recruteur' },
    { initials: 'SC', role: 'Coach' },
  ];
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} className="w-full max-w-sm select-none">
      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Organisation · Cellule Pro</span>
        </div>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.initials} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50 border border-border transition-all duration-500"
              style={{ opacity: inView ? 1 : 0, transform: `translateX(${inView ? 0 : -12}px)`, transitionDelay: `${i * 90}ms` }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-primary/15 text-primary">{m.initials}</div>
              <div className="flex-1">
                <div className="h-2 rounded-full w-24 bg-foreground/15 mb-1.5" />
                <div className="text-[9px] text-muted-foreground">{m.role}</div>
              </div>
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-border">
          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Partager des fiches · Avis croisés</span>
        </div>
      </div>
    </div>
  );
}

const SHOWCASE_MOCKUPS = [PlayerMockup, EnrichMockup, TeamMockup, CollabMockup];

// ── Catalogue: icon sets per universe (counts match i18n landing.universes) ───
const UNIVERSE_ICONS: Record<string, React.ComponentType<{ className?: string }>[]> = {
  scouting: [Target, ListChecks, Users2, ClipboardList, GitCompare, MapPin],
  data:     [Sparkles, Globe, Calendar, BarChart3, Upload, Download],
  collab:   [Layers, MessagesSquare, Shield, Users, Map, Share2],
  content:  [Newspaper, TrendingUp, MessageCircle, FileText, AtSign],
  clubs:    [Search, Building2, Star, Compass],
};
const UNIVERSE_ORDER = ['scouting', 'data', 'collab', 'content', 'clubs'] as const;

const HERO_VALUE_ICONS = [Clock, Sparkles, Layers];
const AUDIENCE_ICONS = [UserCircle, Users2, Target, ClipboardList];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user) navigate('/players');
  }, [user, navigate]);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 640) setMobileMenuOpen(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const heroValues = t('hero.values', { returnObjects: true }) as { label: string; desc: string }[];
  const trust = t('landing.trust', { returnObjects: true }) as string[];
  const showcase = t('landing.showcase', { returnObjects: true }) as { tag: string; title: string; sub: string; bullets: string[] }[];
  const beforeItems = t('landing.migrate.before_items', { returnObjects: true }) as string[];
  const afterItems = t('landing.migrate.after_items', { returnObjects: true }) as string[];
  const universes = t('landing.universes', { returnObjects: true }) as Record<string, { title: string; subtitle: string; features: { title: string; desc: string }[] }>;
  const audience = t('landing.audience.items', { returnObjects: true }) as { title: string; desc: string }[];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
      <PageSEO
        path="/"
        title="Scouty — Le scouting football sans les tableurs"
        description="Centralisez vos fiches joueurs, rapports d'observation, shadow teams et données enrichies dans un seul outil. La plateforme tout-en-un pour scouts, recruteurs et cellules de recrutement."
      />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src={logo} alt="Scouty" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl" />
            <span className="text-base sm:text-lg font-extrabold tracking-tight">Scouty</span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <LanguageSwitcher variant="ghost" />
            <ExtLink to="/pricing"><Button variant="ghost" size="sm">{t('sidebar.pricing')}</Button></ExtLink>
            <ExtLink to="/auth"><Button variant="ghost" size="sm">{t('nav.signin')}</Button></ExtLink>
            <ExtLink to="/auth?signup=true"><Button size="sm">{t('nav.signup')}</Button></ExtLink>
          </div>

          <div className="flex sm:hidden items-center gap-1">
            <LanguageSwitcher variant="ghost" />
            <button onClick={() => setMobileMenuOpen(o => !o)} className="p-2 rounded-lg hover:bg-muted/60 transition-colors" aria-label="Menu">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-border/60 bg-background/95 backdrop-blur-md px-4 py-3 flex flex-col gap-1">
            <ExtLink to="/pricing" onClick={() => setMobileMenuOpen(false)}><Button variant="ghost" size="sm" className="w-full justify-start">{t('sidebar.pricing')}</Button></ExtLink>
            <ExtLink to="/auth" onClick={() => setMobileMenuOpen(false)}><Button variant="ghost" size="sm" className="w-full justify-start">{t('nav.signin')}</Button></ExtLink>
            <ExtLink to="/auth?signup=true" onClick={() => setMobileMenuOpen(false)}><Button size="sm" className="w-full mt-1">{t('nav.signup')}</Button></ExtLink>
          </div>
        )}
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-28 sm:pt-32 pb-16 sm:pb-24">
        {/* Warm ambient background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 -right-24 w-[480px] sm:w-[640px] h-[480px] sm:h-[640px] rounded-full blur-3xl opacity-30 float-slow"
            style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.22), transparent 70%)' }} />
          <div className="absolute top-40 -left-32 w-[420px] sm:w-[520px] h-[420px] sm:h-[520px] rounded-full blur-3xl opacity-25 float-y"
            style={{ background: 'radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)' }} />
          <img src={stadiumHero} alt="" aria-hidden className="absolute inset-x-0 bottom-0 w-full h-2/3 object-cover opacity-[0.05]"
            style={{ WebkitMaskImage: 'linear-gradient(to top, black, transparent)', maskImage: 'linear-gradient(to top, black, transparent)' }} />
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-6 grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/5 text-primary text-xs sm:text-sm font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {t('hero.badge')}
            </div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight leading-[1.05] mb-5">
              {t('hero.title1')}{' '}
              <span className="text-gradient-animated">{t('hero.title2')}</span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              {t('hero.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <ExtLink to="/auth?signup=true">
                <Button size="lg" className="w-full sm:w-auto text-base px-8 h-12 font-bold shadow-lg shadow-primary/20">
                  {t('hero.cta_primary')}
                </Button>
              </ExtLink>
              <ExtLink to="/pricing">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base px-8 h-12">
                  {t('sidebar.pricing')}
                </Button>
              </ExtLink>
            </div>

            {/* Value props (replaces vanity stats) */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {heroValues.map((v, i) => {
                const Icon = HERO_VALUE_ICONS[i] ?? Sparkles;
                return (
                  <div key={v.label} className="flex items-start gap-2.5">
                    <div className="mt-0.5 w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">{v.label}</div>
                      <div className="text-xs text-muted-foreground leading-snug">{v.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — branded mockup with floating chips */}
          <div className="relative flex justify-center lg:justify-center mt-2">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-transparent to-accent/15 blur-2xl -z-10" />
            <div className="relative">
              <div className="float-y">
                <TiltCard>
                  <PlayerMockup />
                </TiltCard>
              </div>

              {/* Floating feature chips (desktop) — positioned to avoid covering card text */}
              <div className="hidden sm:flex items-center gap-1.5 absolute -left-5 top-[46%] px-3 py-2 rounded-xl bg-card border border-border shadow-lg float-slow">
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-foreground">Ajouté à la watchlist</span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 absolute -right-4 -bottom-3 px-3 py-2 rounded-xl bg-card border border-border shadow-lg float-y">
                <Star className="w-3.5 h-3.5 text-accent-foreground fill-accent" />
                <span className="text-[11px] font-semibold text-foreground">Note 8.2 · Rapport</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip (generic — no source names) */}
        <div className="max-w-5xl mx-auto px-5 sm:px-6 mt-14">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {trust.map(item => (
              <span key={item} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary/60 border border-border rounded-full px-3 py-1.5">
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Migrate: "fini Excel / Notion" ──────────────────────────────────── */}
      <section className="py-20 sm:py-24 px-5 sm:px-6 border-t border-border/60 bg-secondary/40">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-foreground/80">{t('landing.migrate.tag')}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">{t('landing.migrate.title')}</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">{t('landing.migrate.sub')}</p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 items-stretch relative">
            <Reveal>
              <div className="h-full p-6 rounded-2xl border border-border bg-card/60">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-4">{t('landing.migrate.before_title')}</h3>
                <ul className="space-y-3">
                  {beforeItems.map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <X className="w-4 h-4 mt-0.5 shrink-0 text-destructive/70" />
                      <span className="line-through decoration-muted-foreground/40">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Arrow between cards (desktop) */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-primary text-primary-foreground items-center justify-center shadow-lg shadow-primary/30">
              <ArrowRight className="w-5 h-5" />
            </div>

            <Reveal delay={120}>
              <div className="h-full p-6 rounded-2xl border border-primary/30 bg-card shadow-lg shadow-primary/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl bg-primary/10" />
                <h3 className="relative text-sm font-bold uppercase tracking-wide text-primary mb-4">{t('landing.migrate.after_title')}</h3>
                <ul className="relative space-y-3">
                  {afterItems.map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Showcase: flagship tools (alternating) ──────────────────────────── */}
      <section className="py-20 sm:py-28 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-20 sm:space-y-28">
          {showcase.map((s, i) => {
            const Mockup = SHOWCASE_MOCKUPS[i] ?? PlayerMockup;
            const imageRight = i % 2 === 0;
            return (
              <Reveal key={s.title}>
                <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                  {/* Text */}
                  <div className={cn('text-center lg:text-left', imageRight ? 'lg:order-1' : 'lg:order-2')}>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-foreground/80">{s.tag}</span>
                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-3 mb-4 leading-tight">{s.title}</h3>
                    <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">{s.sub}</p>
                    <ul className="space-y-2.5 inline-block text-left">
                      {s.bullets.map(b => (
                        <li key={b} className="flex items-center gap-3 text-sm text-foreground">
                          <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-primary" />
                          </span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Mockup */}
                  <div className={cn('flex justify-center', imageRight ? 'lg:order-2' : 'lg:order-1')}>
                    <div className="relative">
                      <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-tr from-primary/8 via-transparent to-accent/12 blur-2xl -z-10" />
                      <TiltCard><Mockup /></TiltCard>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── Catalogue complet par univers ───────────────────────────────────── */}
      <section className="py-20 sm:py-24 px-5 sm:px-6 border-t border-border/60 bg-secondary/40">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent-foreground/80">{t('landing.catalog.tag')}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">{t('landing.catalog.title')}</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">{t('landing.catalog.subtitle')}</p>
          </Reveal>

          <div className="space-y-14">
            {UNIVERSE_ORDER.map((key, idx) => {
              const uni = universes[key];
              if (!uni) return null;
              const icons = UNIVERSE_ICONS[key];
              return (
                <Reveal key={key}>
                  <div className="flex items-baseline gap-3 mb-6">
                    <span className="text-sm font-black text-accent-foreground/70 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black tracking-tight">{uni.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{uni.subtitle}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {uni.features.map((f, i) => {
                      const Icon = icons?.[i] ?? Sparkles;
                      return (
                        <div key={f.title} className="group p-5 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-200">
                          <div className="flex items-start justify-between">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                              <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <ArrowRight className="w-4 h-4 text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                          </div>
                          <h4 className="font-bold text-sm mb-1.5">{f.title}</h4>
                          <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pour qui ────────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">{t('landing.audience.title')}</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">{t('landing.audience.subtitle')}</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {audience.map((a, i) => {
              const Icon = AUDIENCE_ICONS[i] ?? UserCircle;
              return (
                <Reveal key={a.title} delay={i * 80}>
                  <div className="h-full p-6 rounded-2xl border border-border bg-card text-center hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-base mb-2">{a.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 px-5 sm:px-6 border-t border-border/60">
        <Reveal className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-3xl border border-primary/20 bg-card p-8 sm:p-14 overflow-hidden">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full blur-3xl bg-primary/10" />
            <h2 className="relative text-3xl sm:text-4xl font-black tracking-tight mb-4">{t('cta.title')}</h2>
            <p className="relative text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto">{t('cta.subtitle')}</p>
            <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
              <ExtLink to="/auth?signup=true">
                <Button size="lg" className="w-full sm:w-auto px-10 h-12 text-base font-bold shadow-lg shadow-primary/20">
                  {t('cta.btn')}
                </Button>
              </ExtLink>
              <ExtLink to="/pricing">
                <Button size="lg" variant="outline" className="w-full sm:w-auto px-8 h-12 text-base">
                  {t('sidebar.pricing')} <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </ExtLink>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 px-5 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Scouty" className="w-5 h-5" />
            <span className="text-sm font-bold">Scouty</span>
            <span className="text-xs text-muted-foreground ml-2">{t('footer.copy')}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <ExtLink to="/cgu" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.cgu')}</ExtLink>
            <ExtLink to="/cgv" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.cgv')}</ExtLink>
            <ExtLink to="/legal" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.legal')}</ExtLink>
            <ExtLink to="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.about')}</ExtLink>
            <ExtLink to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">{t('footer.privacy')}</ExtLink>
          </div>
        </div>
      </footer>
    </div>
  );
}
