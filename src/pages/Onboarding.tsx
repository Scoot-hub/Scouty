import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Users, ClipboardList, CalendarDays, Building2, Trophy,
  ChevronRight, ChevronLeft, Sparkles, Target, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

const ONBOARDING_KEY = (userId: string) => `scouthub_onboarding_done_${userId}`;

export function markOnboardingDone(userId: string) {
  localStorage.setItem(ONBOARDING_KEY(userId), '1');
}

export function isOnboardingDone(userId: string) {
  return !!localStorage.getItem(ONBOARDING_KEY(userId));
}

// ── Steps definition ─────────────────────────────────────────────────────────

interface Step {
  icon: React.ReactNode;
  color: string;       // bg class for icon circle
  textColor: string;   // text class for accent
  gradient: string;    // bg-gradient for the page backdrop
  titleKey: string;
  descKey: string;
  visual: React.ReactNode;
}

function IlluPlayers() {
  return (
    <div className="relative w-full flex flex-col gap-2">
      {[
        { name: 'Karim B.', pos: 'ATT', lvl: 8, color: 'bg-green-500' },
        { name: 'Lucas M.', pos: 'MC', lvl: 7, color: 'bg-blue-500' },
        { name: 'Noah P.', pos: 'DC', lvl: 6, color: 'bg-orange-500' },
      ].map((p, i) => (
        <div key={i} className="flex items-center gap-3 bg-white/80 dark:bg-white/10 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm border border-white/40 animate-in fade-in slide-in-from-left-4" style={{ animationDelay: `${i * 120}ms`, animationFillMode: 'both' }}>
          <div className={`w-8 h-8 rounded-full ${p.color} text-white text-xs font-bold flex items-center justify-center`}>{p.name[0]}</div>
          <span className="font-semibold text-sm flex-1 text-foreground">{p.name}</span>
          <span className="text-xs text-muted-foreground">{p.pos}</span>
          <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{p.lvl}/10</span>
        </div>
      ))}
    </div>
  );
}

function IlluScoutReport() {
  return (
    <div className="w-full bg-white/80 dark:bg-white/10 backdrop-blur rounded-xl p-4 shadow-sm border border-white/40 space-y-3 animate-in fade-in slide-in-from-bottom-4">
      {[
        { label: '🏋️ Physique', val: 80 },
        { label: '⚽ Avec ballon', val: 68 },
        { label: '🧠 Mental', val: 75 },
      ].map((z, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1 font-medium">
            <span>{z.label}</span><span>{z.val}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${z.val}%`, transitionDelay: `${i * 150 + 200}ms` }} />
          </div>
        </div>
      ))}
      <div className="mt-2 p-2 rounded-lg bg-muted/40 text-[11px] text-muted-foreground italic leading-relaxed">
        "Excellent vis-à-vis du pressing. Lecture du jeu remarquable..."
      </div>
    </div>
  );
}

function IlluCalendar() {
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  return (
    <div className="w-full space-y-3 animate-in fade-in slide-in-from-right-4">
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground">{d}</div>)}
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} className={cn(
            'aspect-square rounded-md flex items-center justify-center text-[11px] font-medium',
            i === 7 ? 'bg-primary text-white shadow-sm' :
            i === 14 ? 'bg-orange-500 text-white shadow-sm' :
            i === 21 ? 'bg-green-500 text-white shadow-sm' :
            'bg-white/50 dark:bg-white/10 text-muted-foreground'
          )}>{i + 1}</div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {[
          { color: 'bg-primary', text: 'PSG – OM · Parc des Princes' },
          { color: 'bg-orange-500', text: 'Lyon – Monaco · Groupama' },
        ].map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] font-medium bg-white/70 dark:bg-white/10 rounded-lg px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${m.color}`} />
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function IlluClub() {
  return (
    <div className="w-full bg-white/80 dark:bg-white/10 backdrop-blur rounded-xl p-4 shadow-sm border border-white/40 animate-in fade-in slide-in-from-left-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow">PSG</div>
        <div>
          <p className="font-bold text-sm">Paris Saint-Germain</p>
          <p className="text-[11px] text-muted-foreground">Ligue 1 · France</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[{ v: '33', l: 'Joueurs' }, { v: '24.8', l: 'Âge moy.' }, { v: '€1.2B', l: 'Valeur' }].map((s, i) => (
          <div key={i} className="bg-muted/40 rounded-lg p-2">
            <p className="text-sm font-bold text-primary">{s.v}</p>
            <p className="text-[10px] text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IlluOrg() {
  return (
    <div className="w-full space-y-2 animate-in fade-in slide-in-from-bottom-4">
      {[
        { name: 'Thomas D.', role: 'Chef scout', color: 'bg-purple-500' },
        { name: 'Julie M.', role: 'Analyste', color: 'bg-indigo-500' },
        { name: 'Marc R.', role: 'Scout terrain', color: 'bg-blue-500' },
      ].map((u, i) => (
        <div key={i} className="flex items-center gap-3 bg-white/80 dark:bg-white/10 backdrop-blur rounded-xl px-4 py-2.5 shadow-sm border border-white/40 animate-in fade-in slide-in-from-right-4" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
          <div className={`w-7 h-7 rounded-full ${u.color} text-white text-[11px] font-bold flex items-center justify-center`}>{u.name[0]}</div>
          <span className="font-semibold text-sm flex-1 text-foreground">{u.name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{u.role}</span>
        </div>
      ))}
    </div>
  );
}

function IlluChamp() {
  return (
    <div className="w-full grid grid-cols-2 gap-2 animate-in fade-in zoom-in-95">
      {[
        { name: 'Ligue 1', flag: '🇫🇷', teams: 18 },
        { name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', teams: 20 },
        { name: 'La Liga', flag: '🇪🇸', teams: 20 },
        { name: 'Bundesliga', flag: '🇩🇪', teams: 18 },
      ].map((c, i) => (
        <div key={i} className="bg-white/80 dark:bg-white/10 backdrop-blur rounded-xl p-3 shadow-sm border border-white/40 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}>
          <span className="text-xl">{c.flag}</span>
          <p className="text-xs font-bold mt-1 leading-tight">{c.name}</p>
          <p className="text-[10px] text-muted-foreground">{c.teams} clubs</p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [animating, setAnimating] = useState(false);

  const steps: Step[] = [
    {
      icon: <Sparkles className="w-6 h-6 text-white" />,
      color: 'bg-primary',
      textColor: 'text-primary',
      gradient: 'from-primary/5 via-background to-background',
      titleKey: 'onboarding.step0_title',
      descKey: 'onboarding.step0_desc',
      visual: (
        <div className="flex flex-col items-center gap-4 py-2 animate-in fade-in zoom-in-95">
          <img src={logo} alt="Scouty" className="w-20 h-20 rounded-3xl shadow-xl" />
          <div className="flex gap-2 flex-wrap justify-center">
            {['⚽ Scouting', '📊 Analyse', '🏆 Performance', '🤝 Collaboration'].map((tag, i) => (
              <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      icon: <Users className="w-6 h-6 text-white" />,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      gradient: 'from-blue-50 via-background to-background dark:from-blue-950/20',
      titleKey: 'onboarding.step1_title',
      descKey: 'onboarding.step1_desc',
      visual: <IlluPlayers />,
    },
    {
      icon: <ClipboardList className="w-6 h-6 text-white" />,
      color: 'bg-violet-500',
      textColor: 'text-violet-600',
      gradient: 'from-violet-50 via-background to-background dark:from-violet-950/20',
      titleKey: 'onboarding.step2_title',
      descKey: 'onboarding.step2_desc',
      visual: <IlluScoutReport />,
    },
    {
      icon: <CalendarDays className="w-6 h-6 text-white" />,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      gradient: 'from-orange-50 via-background to-background dark:from-orange-950/20',
      titleKey: 'onboarding.step3_title',
      descKey: 'onboarding.step3_desc',
      visual: <IlluCalendar />,
    },
    {
      icon: <Building2 className="w-6 h-6 text-white" />,
      color: 'bg-teal-500',
      textColor: 'text-teal-600',
      gradient: 'from-teal-50 via-background to-background dark:from-teal-950/20',
      titleKey: 'onboarding.step4_title',
      descKey: 'onboarding.step4_desc',
      visual: <IlluClub />,
    },
    {
      icon: <Target className="w-6 h-6 text-white" />,
      color: 'bg-indigo-500',
      textColor: 'text-indigo-600',
      gradient: 'from-indigo-50 via-background to-background dark:from-indigo-950/20',
      titleKey: 'onboarding.step5_title',
      descKey: 'onboarding.step5_desc',
      visual: <IlluOrg />,
    },
    {
      icon: <Trophy className="w-6 h-6 text-white" />,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      gradient: 'from-amber-50 via-background to-background dark:from-amber-950/20',
      titleKey: 'onboarding.step6_title',
      descKey: 'onboarding.step6_desc',
      visual: <IlluChamp />,
    },
    {
      icon: <BarChart3 className="w-6 h-6 text-white" />,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      gradient: 'from-green-50 via-background to-background dark:from-green-950/20',
      titleKey: 'onboarding.step7_title',
      descKey: 'onboarding.step7_desc',
      visual: (
        <div className="flex flex-col items-center gap-3 py-2 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-4 border-green-500/30 flex items-center justify-center">
            <span className="text-4xl">🎉</span>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            {t('onboarding.ready_hint')}
          </p>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    if (user) markOnboardingDone(user.id);
    navigate('/players');
  };

  const goTo = (next: number, dir: 'forward' | 'back' = 'forward') => {
    if (animating) return;
    setAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 180);
  };

  const next = () => (isLast ? finish() : goTo(step + 1, 'forward'));
  const prev = () => step > 0 && goTo(step - 1, 'back');

  return (
    <div className={cn(
      'min-h-screen bg-gradient-to-br flex flex-col items-center justify-between p-4 sm:p-6 transition-all duration-500',
      current.gradient
    )}>
      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Scouty" className="w-7 h-7 rounded-xl" />
          <span className="font-extrabold text-sm tracking-tight">Scouty</span>
        </div>
        <button
          onClick={finish}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {t('onboarding.skip')}
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg flex-1 flex flex-col justify-center py-6">
        <div
          key={step}
          className={cn(
            'bg-card border border-border rounded-2xl shadow-lg overflow-hidden',
            animating
              ? direction === 'forward'
                ? 'animate-out fade-out slide-out-to-left-4'
                : 'animate-out fade-out slide-out-to-right-4'
              : direction === 'forward'
                ? 'animate-in fade-in slide-in-from-right-4'
                : 'animate-in fade-in slide-in-from-left-4'
          )}
          style={{ animationDuration: '180ms' }}
        >
          {/* Step header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shadow-sm', current.color)}>
                {current.icon}
              </div>
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-full transition-all duration-300',
                      i === step
                        ? cn('w-5 h-2', current.color)
                        : i < step
                          ? 'w-2 h-2 bg-primary/40'
                          : 'w-2 h-2 bg-muted'
                    )}
                  />
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground font-medium tabular-nums">
                {step + 1} / {steps.length}
              </span>
            </div>

            <h2 className="text-xl font-extrabold tracking-tight leading-tight">{t(current.titleKey)}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t(current.descKey)}</p>
          </div>

          {/* Visual */}
          <div className="px-6 pb-4">
            {current.visual}
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 pt-2 flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={prev} className="gap-1.5 text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
                {t('onboarding.prev')}
              </Button>
            )}
            <Button onClick={next} className="ml-auto gap-1.5">
              {isLast ? t('onboarding.start') : t('onboarding.next')}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom skip */}
      <div className="w-full max-w-lg flex justify-end">
        <button
          onClick={finish}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          {t('onboarding.skip_full')}
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
