import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, FileSearch, Shield, Zap, Globe, UserCircle, Star, ChevronLeft, ChevronRight, Layers, Share2, Menu, X } from 'lucide-react';
import stadiumHero from '@/assets/stadium-hero.jpg';
import { useAuth } from '@/contexts/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import logo from '@/assets/logo.png';
import PageSEO from '@/components/PageSEO';
import { cn } from '@/lib/utils';

const featureIcons = [Users, FileSearch, BarChart3, Shield, Zap, Globe];

// ── Cinematic 4-part presentation ────────────────────────────────────────────

const SCENE_DURATION = 5000; // ms per scene

// Visual/structural data only — text comes from i18n landing.scenes[]
const BASE_SCENES = [
  { id: 1, accent: '#6366f1', accentLight: 'rgba(99,102,241,0.12)',  ui: 'player' },
  { id: 2, accent: '#10b981', accentLight: 'rgba(16,185,129,0.12)',  ui: 'enrich' },
  { id: 3, accent: '#f59e0b', accentLight: 'rgba(245,158,11,0.12)',  ui: 'team'   },
  { id: 4, accent: '#ec4899', accentLight: 'rgba(236,72,153,0.12)',  ui: 'collab' },
];

function PlayerUIMockup({ accent }: { accent: string }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-sm mx-auto select-none pointer-events-none">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: accent + '33' }}>
            <UserCircle className="w-7 h-7" style={{ color: accent }} />
          </div>
          <div className="flex-1">
            <div className="h-3 rounded-full w-28 mb-2" style={{ backgroundColor: accent + '60' }} />
            <div className="h-2 rounded-full w-20 bg-white/20" />
          </div>
          <div className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: accent + '30', color: accent }}>{t('landing.ui.watch')}</div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-white/10 p-0">
          {[['7.5', t('landing.ui.level')], ['8.0', t('landing.ui.potential')], ['€2.5M', t('landing.ui.value')]].map(([val, lbl]) => (
            <div key={lbl} className="py-3 text-center">
              <div className="text-lg font-black text-white">{val}</div>
              <div className="text-[9px] text-white/40 mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
        {/* Tags */}
        <div className="flex gap-1.5 p-4 pt-2 flex-wrap">
          {['MC', 'France', 'Ligue 1', '24 ans'].map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-white/60">{tag}</span>
          ))}
        </div>
        {/* Notes preview */}
        <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="h-2 rounded-full w-3/4 bg-white/20 mb-2" />
          <div className="h-2 rounded-full w-1/2 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function EnrichUIMockup({ accent }: { accent: string }) {
  const { t } = useTranslation();
  const bars = [65, 82, 91, 54, 78, 88];
  return (
    <div className="w-full max-w-sm mx-auto select-none pointer-events-none">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/60">{t('landing.ui.stats_season')}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: accent + '30', color: accent }}>{t('landing.ui.collab_live')}</span>
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, backgroundColor: i === 2 ? accent : accent + '40' }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[['12', t('landing.ui.goals')], ['7', t('landing.ui.assists')], ['87%', t('landing.ui.pass_pct')], ['1842', t('landing.ui.minutes')]].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center">
              <div className="text-base font-black text-white">{v}</div>
              <div className="text-[9px] text-white/40">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/40">
          <Zap className="w-3 h-3" style={{ color: accent }} />
          {t('landing.ui.enriched_via')}
        </div>
      </div>
    </div>
  );
}

function TeamUIMockup({ accent }: { accent: string }) {
  const positions = [
    { top: '5%',  left: '50%', label: 'GK' },
    { top: '28%', left: '20%', label: 'DD' },
    { top: '28%', left: '40%', label: 'DC' },
    { top: '28%', left: '60%', label: 'DC' },
    { top: '28%', left: '80%', label: 'DG' },
    { top: '55%', left: '30%', label: 'MC' },
    { top: '55%', left: '50%', label: 'MC' },
    { top: '55%', left: '70%', label: 'MO' },
    { top: '78%', left: '20%', label: 'AG' },
    { top: '78%', left: '50%', label: 'AT' },
    { top: '78%', left: '80%', label: 'AD' },
  ];
  return (
    <div className="w-full max-w-sm mx-auto select-none pointer-events-none">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-xs font-semibold text-white/60">Shadow Team</span>
          <span className="text-[10px] font-bold" style={{ color: accent }}>4-3-3</span>
        </div>
        {/* Mini pitch */}
        <div className="relative mx-4 my-3 rounded-xl overflow-hidden" style={{ height: 170, background: 'linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="absolute inset-0 flex flex-col justify-around">
            <div className="border-b border-white/10 w-full" />
            <div className="border-b border-white/10 w-full" />
          </div>
          {positions.map((p, i) => (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
              style={{ top: p.top, left: p.left }}>
              <div className="w-5 h-5 rounded-full border-2 border-white/30 flex items-center justify-center" style={{ backgroundColor: accent + '60' }}>
                <div className="w-2 h-2 rounded-full bg-white/80" />
              </div>
              <span className="text-[7px] text-white/50 font-bold">{p.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 px-4 pb-3">
          <Star className="w-3 h-3" style={{ color: accent }} />
          <span className="text-[10px] text-white/40">11 joueurs · 4 suivis dans vos fiches</span>
        </div>
      </div>
    </div>
  );
}

function CollabUIMockup({ accent }: { accent: string }) {
  const members = [
    { initials: 'JM', role: 'Admin' },
    { initials: 'AL', role: 'Scout' },
    { initials: 'PR', role: 'Recruteur' },
    { initials: 'SC', role: 'Coach' },
  ];
  return (
    <div className="w-full max-w-sm mx-auto select-none pointer-events-none">
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: accent }} />
          <span className="text-xs font-semibold text-white/70">Organisation · Cellule Pro</span>
        </div>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.initials} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: accent + '50' }}>{m.initials}</div>
              <div className="flex-1">
                <div className="h-2 rounded-full w-20 bg-white/20 mb-1" />
                <div className="text-[9px] text-white/40">{m.role}</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-white/20">
          <Share2 className="w-3.5 h-3.5 text-white/30" />
          <span className="text-[10px] text-white/30">Partager des fiches · Opinions croisées</span>
        </div>
      </div>
    </div>
  );
}

function SceneUI({ ui, accent }: { ui: string; accent: string }) {
  if (ui === 'player')  return <PlayerUIMockup accent={accent} />;
  if (ui === 'enrich')  return <EnrichUIMockup accent={accent} />;
  if (ui === 'team')    return <TeamUIMockup accent={accent} />;
  if (ui === 'collab')  return <CollabUIMockup accent={accent} />;
  return null;
}

function CinematicPresentation() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Merge i18n text with static visual data
  const sceneTexts = t('landing.scenes', { returnObjects: true }) as { tag: string; title: string; sub: string }[];
  const SCENES = BASE_SCENES.map((base, i) => ({ ...base, ...(sceneTexts[i] ?? {}) }));

  // Intersection observer — only animate when visible
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  const goTo = (idx: number) => {
    setActive(idx);
    setProgress(0);
    setAnimKey(k => k + 1);
  };

  const next = () => goTo((active + 1) % SCENES.length);
  const prev = () => goTo((active - 1 + SCENES.length) % SCENES.length);

  useEffect(() => {
    if (paused || !visible) { clearInterval(intervalRef.current!); clearInterval(progressRef.current!); return; }

    setProgress(0);
    const step = 100 / (SCENE_DURATION / 50);
    progressRef.current = setInterval(() => setProgress(p => Math.min(p + step, 100)), 50);
    intervalRef.current = setInterval(() => {
      setActive(a => {
        const next = (a + 1) % SCENES.length;
        setAnimKey(k => k + 1);
        setProgress(0);
        return next;
      });
    }, SCENE_DURATION);

    return () => { clearInterval(intervalRef.current!); clearInterval(progressRef.current!); };
  }, [active, paused, visible]);

  const scene = SCENES[active];

  return (
    <section
      ref={sectionRef}
      className="relative py-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, transparent 0%, #08090d 8%, #08090d 92%, transparent 100%)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${scene.accentLight}, transparent 70%)` }} />

      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
        {/* Scene number + line */}
        <div className="flex items-center gap-3 mb-10 justify-center">
          {SCENES.map((s, i) => (
            <button key={s.id} onClick={() => goTo(i)}
              className="flex items-center gap-2 transition-all duration-300 group"
              aria-label={`Scène ${i + 1}`}>
              <div className={cn(
                'h-px transition-all duration-500',
                i === active ? 'w-8' : 'w-4',
              )} style={{ backgroundColor: i === active ? scene.accent : 'rgba(255,255,255,0.2)' }} />
              <span className={cn('text-[11px] font-bold tracking-widest uppercase transition-all duration-300',
                i === active ? 'opacity-100' : 'opacity-30 group-hover:opacity-60')}
                style={{ color: i === active ? scene.accent : 'white' }}>
                {String(s.id).padStart(2, '0')}
              </span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center min-h-[380px]">

          {/* Left — text */}
          <div key={`text-${animKey}`} className="space-y-6 animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="inline-block text-[11px] font-bold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full border transition-colors duration-500"
              style={{ borderColor: scene.accent + '60', color: scene.accent, backgroundColor: scene.accentLight }}>
              {scene.tag}
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-[1.1] tracking-tight whitespace-pre-line">
              {scene.title}
            </h2>

            <p className="text-base text-white/55 leading-relaxed max-w-md">
              {scene.sub}
            </p>

            {/* Scene dots */}
            <div className="flex items-center gap-3 pt-2">
              {SCENES.map((_, i) => (
                <button key={i} onClick={() => goTo(i)}
                  className={cn('rounded-full transition-all duration-400', i === active ? 'w-6 h-2' : 'w-2 h-2 hover:opacity-60')}
                  style={{ backgroundColor: i === active ? scene.accent : 'rgba(255,255,255,0.25)' }} />
              ))}

              <div className="ml-4 flex items-center gap-1">
                <button onClick={prev} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={next} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right — UI mockup */}
          <div key={`ui-${animKey}`} className="animate-in fade-in slide-in-from-right-8 duration-700 delay-150">
            <SceneUI ui={scene.ui} accent={scene.accent} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-14 grid grid-cols-4 gap-1.5">
          {SCENES.map((s, i) => (
            <button key={i} onClick={() => goTo(i)} className="group h-0.5 rounded-full overflow-hidden bg-white/10 relative">
              <div className={cn('absolute inset-y-0 left-0 rounded-full transition-all')}
                style={{
                  width: i < active ? '100%' : i === active ? `${progress}%` : '0%',
                  backgroundColor: i === active ? scene.accent : i < active ? 'rgba(255,255,255,0.35)' : 'transparent',
                  transition: i === active ? 'width 50ms linear' : 'width 0.4s ease',
                }} />
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {SCENES.map((s, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={cn('text-[9px] uppercase tracking-widest transition-colors duration-300',
                i === active ? 'font-bold' : 'text-white/25 hover:text-white/50')}
              style={{ color: i === active ? scene.accent : undefined }}>
              {s.tag.split(' — ')[1]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

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

  const features = (t('features.items', { returnObjects: true }) as { title: string; description: string }[]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageSEO
        path="/"
        title="Scouty — Logiciel de scouting footballistique professionnel"
        description="Gérez vos fiches joueurs, rédigez vos rapports d'observation et construisez vos shadow teams. La plateforme tout-en-un pour scouts, recruteurs et coachs professionnels."
      />
      {/* Nav */}
      <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img src={logo} alt="Scouty" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl" />
            <span className="text-base sm:text-lg font-extrabold tracking-tight">Scouty</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-2">
            <LanguageSwitcher variant="ghost" />
            <Link to="/pricing">
              <Button variant="ghost" size="sm">{t('sidebar.pricing')}</Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" size="sm">{t('nav.signin')}</Button>
            </Link>
            <Link to="/auth?signup=true">
              <Button size="sm">{t('nav.signup')}</Button>
            </Link>
          </div>

          {/* Mobile: language switcher + burger */}
          <div className="flex sm:hidden items-center gap-1">
            <LanguageSwitcher variant="ghost" />
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="p-2 rounded-lg hover:bg-muted/60 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-border/40 bg-background/95 backdrop-blur-md px-4 py-3 flex flex-col gap-1">
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">{t('sidebar.pricing')}</Button>
            </Link>
            <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start">{t('nav.signin')}</Button>
            </Link>
            <Link to="/auth?signup=true" onClick={() => setMobileMenuOpen(false)}>
              <Button size="sm" className="w-full mt-1">{t('nav.signup')}</Button>
            </Link>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <img
            src={stadiumHero}
            alt="Stadium"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t('hero.badge')}
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            {t('hero.title1')}
            <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t('hero.title2')}
            </span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth?signup=true">
              <Button size="lg" className="text-base px-8 h-12 font-bold shadow-lg shadow-primary/25">
                {t('hero.cta_primary')}
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="text-base px-8 h-12">
                {t('hero.cta_secondary')}
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto">
            {[
              { value: '∞', label: t('hero.stat_players') },
              { value: '100%', label: t('hero.stat_private') },
              { value: '24/7', label: t('hero.stat_available') },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-black text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cinematic 4-part presentation */}
      <CinematicPresentation />

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
              {t('features.title')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <div
                  key={feature.title}
                  className="group p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-all duration-200"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-bold text-base mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-muted-foreground mb-8">
            {t('cta.subtitle')}
          </p>
          <Link to="/auth?signup=true">
            <Button size="lg" className="px-10 h-12 text-base font-bold shadow-lg shadow-primary/25">
              {t('cta.btn')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Scouty" className="w-5 h-5" />
            <span className="text-sm font-bold">Scouty</span>
            <span className="text-xs text-muted-foreground ml-2">{t('footer.copy')}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/cgu" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('footer.cgu')}
            </Link>
            <Link to="/cgv" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('footer.cgv')}
            </Link>
            <Link to="/legal" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('footer.legal')}
            </Link>
            <Link to="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('footer.about')}
            </Link>
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t('footer.privacy')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
