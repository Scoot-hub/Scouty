import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Gift, Copy, Users, Coins, TrendingUp, CheckCircle2, ArrowRight,
  Sparkles, Share2, Crown, UserCheck, ExternalLink, Zap, Star,
  Brain, Rocket, Lock, ChevronRight,
} from 'lucide-react';

// ── Animated counter (fires when start=true) ──────────────────────────────────
function useCountUp(target: number, duration = 1200, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let raf: number;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val;
}

// ── Reveal wrapper — adds 'in-view' when visible ──────────────────────────────
function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('in-view'); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal-up ${className}`}>{children}</div>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, rawValue, suffix, label, delay }: {
  icon: React.ElementType; rawValue: number; suffix?: string; label: string; delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  const animated = useCountUp(rawValue, 1200, vis);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ animation: 'reveal-scale 0.45s ease both', animationDelay: `${delay * 70}ms` }}>
      <Card className="card-tilt hover:border-primary/30 transition-all">
        <CardContent className="p-4 text-center">
          <Icon className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-2xl font-bold tabular-nums">
            {rawValue === 0 && !suffix ? '—' : `${vis ? animated : 0}${suffix ?? ''}`}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tier definitions ──────────────────────────────────────────────────────────
const TIER_THRESHOLDS = [1, 11, 50] as const;

function getTierIndex(referrals: number) {
  if (referrals >= 50) return 2;
  if (referrals >= 11) return 1;
  if (referrals >= 1)  return 0;
  return -1;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Affiliate() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const referralCode = user?.id ? `SCOUTY-${user.id.slice(0, 8).toUpperCase()}` : 'SCOUTY-XXXXXX';
  const referralLink = `${window.location.origin}/auth?signup=true&ref=${referralCode}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t('affiliate.copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const [affiliateStats, setAffiliateStats] = useState({ totalReferrals: 0, activeReferrals: 0, conversion: 0 });
  const [referrer, setReferrer] = useState<{
    user_id: string; full_name: string; club: string | null; role: string | null; photo_url: string | null;
  } | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${apiBase}/affiliate/stats`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d && typeof d.totalReferrals === 'number') setAffiliateStats(d); })
      .catch(() => {});
    fetch(`${apiBase}/affiliate/referrer`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.referrer) setReferrer(d.referrer); })
      .catch(() => {});
  }, [user?.id]);

  const creditsEarned = affiliateStats.totalReferrals * 100;
  const currentTierIdx = getTierIndex(affiliateStats.totalReferrals);
  const nextTierIdx = Math.min(currentTierIdx + 1, 2);
  const nextThreshold = TIER_THRESHOLDS[nextTierIdx] ?? 50;
  const progressPct = currentTierIdx >= 2
    ? 100
    : Math.min(Math.round((affiliateStats.totalReferrals / nextThreshold) * 100), 100);
  const toNextTier = Math.max(nextThreshold - affiliateStats.totalReferrals, 0);

  const tierMeta = [
    { key: 'ambassador', icon: Star,   iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10', color: 'border-border',        credit: t('affiliate.tier_ambassador_credit'), referrals: '1–10', bonus: t('affiliate.tier_ambassador_bonus'), popular: false },
    { key: 'partner',    icon: Rocket, iconColor: 'text-primary',   iconBg: 'bg-primary/10',   color: 'border-primary/50',    credit: t('affiliate.tier_partner_credit'),    referrals: '11–50', bonus: t('affiliate.tier_partner_bonus'),    popular: true  },
    { key: 'elite',      icon: Crown,  iconColor: 'text-amber-500', iconBg: 'bg-amber-500/10', color: 'border-amber-500/50',  credit: t('affiliate.tier_elite_credit'),      referrals: '50+',  bonus: t('affiliate.tier_elite_bonus'),      popular: false },
  ];

  const steps = [
    { step: '1', title: t('affiliate.step1_title'), desc: t('affiliate.step1_desc') },
    { step: '2', title: t('affiliate.step2_title'), desc: t('affiliate.step2_desc') },
    { step: '3', title: t('affiliate.step3_title'), desc: t('affiliate.step3_desc') },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary" />
          {t('affiliate.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('affiliate.subtitle')}</p>
      </div>

      {/* ── Referrer banner ── */}
      {referrer && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                {referrer.photo_url
                  ? <img src={referrer.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <UserCheck className="w-5 h-5 text-green-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  {t('affiliate.referred_by')}
                  <Link to={`/profile/${referrer.user_id}`} className="font-bold hover:underline inline-flex items-center gap-1">
                    {referrer.full_name} <ExternalLink className="w-3 h-3" />
                  </Link>
                </p>
                {(referrer.role || referrer.club) && (
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    {referrer.role}{referrer.club ? ` · ${referrer.club}` : ''}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Hero ── */}
      <RevealSection>
        <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-10 -left-10 w-56 h-56 rounded-full bg-primary/8 blur-3xl float-slow" />
            <div className="absolute -bottom-10 -right-10 w-44 h-44 rounded-full bg-accent/10 blur-3xl float-slow" style={{ animationDelay: '2s' }} />
          </div>
          <CardContent className="p-8 text-center space-y-4 relative">
            <div className="float-y inline-flex">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto shadow-lg shadow-primary/10">
                <Gift className="w-7 h-7 text-primary" />
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              {t('affiliate.hero_badge')}
            </div>
            <h2 className="text-3xl font-black tracking-tight text-gradient-animated">
              {t('affiliate.hero_title')}
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
              {t('affiliate.hero_desc')}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Coins className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm font-black text-amber-600 dark:text-amber-400">+100 {t('affiliate.credits_per_referral')}</span>
            </div>
            <div className="flex items-center gap-2 max-w-md mx-auto pt-1">
              <div className="flex-1 relative">
                <Input readOnly value={referralLink} className="pr-20 font-mono text-xs" />
                <Button size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7" onClick={() => handleCopy(referralLink)}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied ? t('affiliate.copied_short') : t('affiliate.copy')}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4">
              <p className="text-xs text-muted-foreground">{t('affiliate.your_code')}</p>
              <button onClick={() => handleCopy(referralCode)} className="font-mono text-sm font-bold text-primary hover:underline cursor-pointer">
                {referralCode}
              </button>
            </div>
          </CardContent>
        </Card>
      </RevealSection>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users}        rawValue={affiliateStats.totalReferrals}  label={t('affiliate.stat_referrals')}  delay={1} />
        <StatCard icon={CheckCircle2} rawValue={affiliateStats.activeReferrals} label={t('affiliate.stat_active')}     delay={2} />
        <StatCard icon={Coins}        rawValue={creditsEarned}                  label={t('affiliate.stat_credits')}    delay={3} />
        <StatCard icon={TrendingUp}   rawValue={affiliateStats.conversion} suffix="%" label={t('affiliate.stat_conversion')} delay={4} />
      </div>

      {/* ── Ma progression ── */}
      <RevealSection>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              {t('affiliate.progress_title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Tier progress bar */}
            <div className="space-y-3">
              {/* Labels */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {currentTierIdx >= 0 ? t(`affiliate.tier_${tierMeta[currentTierIdx].key}`) : t('affiliate.progress_no_tier')}
                </span>
                {currentTierIdx < 2 && (
                  <span className="flex items-center gap-1">
                    {toNextTier} {t('affiliate.progress_to_next', { tier: t(`affiliate.tier_${tierMeta[nextTierIdx].key}`) })}
                    <ChevronRight className="w-3 h-3" />
                  </span>
                )}
                {currentTierIdx >= 2 && <span className="text-amber-500 font-semibold">{t('affiliate.progress_max')}</span>}
              </div>

              {/* Bar */}
              <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-1000 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
                {/* Milestone ticks */}
                {([1, 11, 50] as const).map((threshold, i) => {
                  const pct = i === 2 ? 100 : Math.round((threshold / 50) * 100);
                  return (
                    <div
                      key={threshold}
                      className={`absolute top-0 bottom-0 w-0.5 ${affiliateStats.totalReferrals >= threshold ? 'bg-primary/60' : 'bg-border'}`}
                      style={{ left: `${pct}%` }}
                    />
                  );
                })}
              </div>

              {/* Tier markers */}
              <div className="flex justify-between text-[10px] text-muted-foreground">
                {tierMeta.map((tier, i) => (
                  <div key={tier.key} className={`flex items-center gap-1 ${currentTierIdx >= i ? 'text-primary font-semibold' : ''}`}>
                    <tier.icon className={`w-3 h-3 ${currentTierIdx >= i ? tier.iconColor : ''}`} />
                    {t(`affiliate.tier_${tier.key}`)}
                    <span className="opacity-60">({tier.referrals})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t('affiliate.kpi_total'),   value: affiliateStats.totalReferrals, icon: Users,  color: 'text-primary' },
                { label: t('affiliate.kpi_active'),  value: affiliateStats.activeReferrals, icon: CheckCircle2, color: 'text-emerald-500' },
                { label: t('affiliate.kpi_credits'), value: creditsEarned,                 icon: Coins,  color: 'text-amber-500' },
                { label: t('affiliate.kpi_next'),    value: currentTierIdx >= 2 ? '✓' : toNextTier, icon: Zap, color: 'text-violet-500' },
              ].map((kpi, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1 rounded-xl bg-muted/40 border border-border/60 p-3"
                  style={{ animation: 'reveal-scale 0.4s ease both', animationDelay: `${i * 60 + 100}ms` }}
                >
                  <div className="flex items-center gap-1.5">
                    <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                    <span className="text-[10px] text-muted-foreground">{kpi.label}</span>
                  </div>
                  <span className={`text-xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</span>
                </div>
              ))}
            </div>

            {/* Next unlock preview */}
            {currentTierIdx < 2 && (
              <div className="flex items-start gap-3 rounded-xl bg-primary/5 border border-primary/15 p-3">
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {t('affiliate.progress_next_unlock', { tier: t(`affiliate.tier_${tierMeta[nextTierIdx].key}`) })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tierMeta[nextTierIdx].bonus}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </RevealSection>

      {/* ── Tiers / Rôles ── */}
      <RevealSection>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Crown className="w-5 h-5 text-primary" />
          {t('affiliate.tiers_title')}
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {tierMeta.map((tier, i) => {
            const isActive = currentTierIdx >= i;
            return (
              <Card
                key={tier.key}
                className={`relative transition-all hover:shadow-md ${tier.color} ${isActive ? 'ring-1 ring-primary/20' : ''}`}
                style={{ animation: 'reveal-scale 0.45s ease both', animationDelay: `${i * 100 + 80}ms` }}
              >
                {tier.popular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap">
                    {t('affiliate.recommended')}
                  </div>
                )}
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tier.iconBg}`}>
                      <tier.icon className={`w-4 h-4 ${tier.iconColor}`} />
                    </div>
                    <CardTitle className="text-base">{t(`affiliate.tier_${tier.key}`)}</CardTitle>
                  </div>
                  <CardDescription>{tier.referrals} {t('affiliate.referrals_label')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center">
                    <span className="text-4xl font-black text-primary">{tier.credit}</span>
                    <p className="text-xs text-muted-foreground mt-1">{t('affiliate.credit_label')}</p>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{tier.bonus}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{t('affiliate.perk_enrichments')}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{t('affiliate.dashboard_access')}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RevealSection>

      {/* ── Comment ça marche ── */}
      <RevealSection>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Share2 className="w-5 h-5 text-primary" />
              {t('affiliate.how_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {steps.map((s, i) => (
                <div
                  key={s.step}
                  className="flex items-start gap-4"
                  style={{ animation: 'reveal-scale 0.45s ease both', animationDelay: `${i * 100 + 150}ms` }}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                    {s.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold">{s.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <ArrowRight className="w-5 h-5 text-muted-foreground/30 shrink-0 hidden md:block self-center" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </RevealSection>

      {/* ── Crédits & boosts ── */}
      <RevealSection>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-primary" />
              {t('affiliate.boosts_title')}
            </CardTitle>
            <CardDescription>{t('affiliate.boosts_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  {t('affiliate.boost_credits_title')}
                </h3>
                <p className="text-2xl font-black text-primary">100</p>
                <p className="text-xs text-muted-foreground">{t('affiliate.boost_credits_desc')}</p>
              </div>
              <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-primary" />
                  {t('affiliate.boost_usage_title')}
                </h3>
                <p className="text-2xl font-black text-primary">{t('affiliate.boost_usage_value')}</p>
                <p className="text-xs text-muted-foreground">{t('affiliate.boost_usage_desc')}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Brain,  label: t('affiliate.benefit_ai_enrichments'),  color: 'text-violet-500', bg: 'bg-violet-500/10' },
                { icon: Zap,    label: t('affiliate.benefit_modules'),          color: 'text-amber-500',  bg: 'bg-amber-500/10' },
                { icon: Star,   label: t('affiliate.benefit_features'),         color: 'text-primary',    bg: 'bg-primary/10' },
                { icon: Lock,   label: t('affiliate.benefit_badge'),            color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              ].map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background"
                  style={{ animation: 'reveal-scale 0.4s ease both', animationDelay: `${i * 60 + 100}ms` }}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${b.bg}`}>
                    <b.icon className={`w-4 h-4 ${b.color}`} />
                  </div>
                  <p className="text-xs font-medium leading-tight">{b.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {t('affiliate.example_title')}
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {t('affiliate.example_desc')}
              </p>
            </div>
          </CardContent>
        </Card>
      </RevealSection>

    </div>
  );
}
