import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Gift, Copy, Users, Euro, TrendingUp, CheckCircle2, ArrowRight, Sparkles, Share2, Crown, UserCheck, ExternalLink } from 'lucide-react';

export default function Affiliate() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  // Generate a referral code from user id
  const referralCode = user?.id ? `SCOUTY-${user.id.slice(0, 8).toUpperCase()}` : 'SCOUTY-XXXXXX';
  const referralLink = `${window.location.origin}/auth?signup=true&ref=${referralCode}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(t('affiliate.copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const tiers = [
    {
      name: t('affiliate.tier_ambassador'),
      referrals: '1-10',
      commission: '15%',
      bonus: t('affiliate.tier_ambassador_bonus'),
      color: 'border-border',
    },
    {
      name: t('affiliate.tier_partner'),
      referrals: '11-50',
      commission: '20%',
      bonus: t('affiliate.tier_partner_bonus'),
      color: 'border-primary/50',
      popular: true,
    },
    {
      name: t('affiliate.tier_elite'),
      referrals: '50+',
      commission: '25%',
      bonus: t('affiliate.tier_elite_bonus'),
      color: 'border-amber-500/50',
    },
  ];

  const [affiliateStats, setAffiliateStats] = useState({ totalReferrals: 0, activeReferrals: 0, conversion: 0 });
  const [referrer, setReferrer] = useState<{ user_id: string; full_name: string; club: string | null; role: string | null; photo_url: string | null } | null>(null);

  const apiBase = (import.meta as any).env.VITE_API_URL || '/api';

  useEffect(() => {
    if (!user?.id) return;
    const token = JSON.parse(localStorage.getItem('scouthub_session') || '{}').access_token;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${apiBase}/affiliate/stats`, { headers })
      .then(r => r.json())
      .then(data => { if (data && typeof data.totalReferrals === 'number') setAffiliateStats(data); })
      .catch(() => {});
    fetch(`${apiBase}/affiliate/referrer`, { headers })
      .then(r => r.json())
      .then(data => { if (data?.referrer) setReferrer(data.referrer); })
      .catch(() => {});
  }, [user?.id]);

  const stats = [
    { label: t('affiliate.stat_referrals'), value: String(affiliateStats.totalReferrals), icon: Users },
    { label: t('affiliate.stat_active'), value: String(affiliateStats.activeReferrals), icon: CheckCircle2 },
    { label: t('affiliate.stat_earnings'), value: '0,00 €', icon: Euro },
    { label: t('affiliate.stat_conversion'), value: affiliateStats.totalReferrals > 0 ? `${affiliateStats.conversion}%` : '—', icon: TrendingUp },
  ];

  const steps = [
    { step: '1', title: t('affiliate.step1_title'), desc: t('affiliate.step1_desc') },
    { step: '2', title: t('affiliate.step2_title'), desc: t('affiliate.step2_desc') },
    { step: '3', title: t('affiliate.step3_title'), desc: t('affiliate.step3_desc') },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary" />
          {t('affiliate.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('affiliate.subtitle')}</p>
      </div>

      {/* Referrer banner — shown only if the user was referred */}
      {referrer && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                {referrer.photo_url ? (
                  <img src={referrer.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <UserCheck className="w-5 h-5 text-green-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  Vous avez été parrainé par
                  <Link
                    to={`/profile/${referrer.user_id}`}
                    className="font-bold hover:underline inline-flex items-center gap-1"
                  >
                    {referrer.full_name}
                    <ExternalLink className="w-3 h-3" />
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

      {/* Hero banner */}
      <Card className="bg-gradient-to-br from-primary/10 via-background to-accent/10 border-primary/20">
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            {t('affiliate.hero_badge')}
          </div>
          <h2 className="text-3xl font-black tracking-tight">
            {t('affiliate.hero_title')}
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            {t('affiliate.hero_desc')}
          </p>
          <div className="flex items-center gap-2 max-w-md mx-auto pt-2">
            <div className="flex-1 relative">
              <Input
                readOnly
                value={referralLink}
                className="pr-20 font-mono text-xs"
              />
              <Button
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
                onClick={() => handleCopy(referralLink)}
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copied ? t('affiliate.copied_short') : t('affiliate.copy')}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 pt-2">
            <p className="text-xs text-muted-foreground">{t('affiliate.your_code')}</p>
            <button
              onClick={() => handleCopy(referralCode)}
              className="font-mono text-sm font-bold text-primary hover:underline cursor-pointer"
            >
              {referralCode}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <stat.icon className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Commission tiers */}
      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          {t('affiliate.tiers_title')}
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <Card key={tier.name} className={`relative ${tier.color}`}>
              {tier.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {t('affiliate.recommended')}
                </div>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{tier.name}</CardTitle>
                <CardDescription>{tier.referrals} {t('affiliate.referrals_label')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <span className="text-4xl font-black text-primary">{tier.commission}</span>
                  <p className="text-xs text-muted-foreground mt-1">{t('affiliate.commission_label')}</p>
                </div>
                <Separator />
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{tier.bonus}</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{t('affiliate.recurring')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{t('affiliate.dashboard_access')}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How it works */}
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
              <div key={s.step} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                  {s.step}
                </div>
                <div>
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

      {/* Payout info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Euro className="w-5 h-5 text-primary" />
            {t('affiliate.payout_title')}
          </CardTitle>
          <CardDescription>{t('affiliate.payout_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
              <h3 className="text-sm font-bold">{t('affiliate.payout_threshold')}</h3>
              <p className="text-2xl font-black text-primary">50 €</p>
              <p className="text-xs text-muted-foreground">{t('affiliate.payout_threshold_desc')}</p>
            </div>
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
              <h3 className="text-sm font-bold">{t('affiliate.payout_frequency')}</h3>
              <p className="text-2xl font-black text-primary">{t('affiliate.payout_monthly')}</p>
              <p className="text-xs text-muted-foreground">{t('affiliate.payout_frequency_desc')}</p>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              {t('affiliate.example_title')}
            </h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {t('affiliate.example_desc')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
