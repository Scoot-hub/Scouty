import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Users, Zap, FileSearch, Download, Crown, ArrowRight, Sparkles, Loader2 } from 'lucide-react';


const premiumFeatures = [
  { icon: Users, titleKey: 'premium_success.unlimited_players', descKey: 'premium_success.unlimited_players_desc', link: '/players', linkLabelKey: 'premium_success.view_players' },
  { icon: Zap, titleKey: 'premium_success.auto_enrichment', descKey: 'premium_success.auto_enrichment_desc', link: '/players', linkLabelKey: 'premium_success.enrich_players' },
  { icon: Download, titleKey: 'premium_success.exports', descKey: 'premium_success.exports_desc', link: '/players', linkLabelKey: 'premium_success.export' },
  { icon: FileSearch, titleKey: 'premium_success.advanced_reports', descKey: 'premium_success.advanced_reports_desc', link: '/players', linkLabelKey: 'premium_success.view_players' },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export default function PremiumSuccess() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [confetti, setConfetti] = useState(true);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const timer = setTimeout(() => setConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Activate premium via authenticated endpoint, then verify
  useEffect(() => {
    let cancelled = false;

    async function verify() {
      // Step 1: Call activate-checkout (authenticated, uses JWT user ID)
      if (sessionId && user) {
        try {
          const { data, error } = await supabase.functions.invoke('activate-checkout', {
            body: { session_id: sessionId },
          });
          if (!cancelled && !error && data?.activated) {
            setVerified(true);
            setVerifying(false);
            return;
          }
        } catch {}
      }

      // Step 2: Fallback — poll check-subscription
      if (user) {
        const maxAttempts = 5;
        for (let i = 0; i < maxAttempts && !cancelled; i++) {
          try {
            const { data } = await supabase.functions.invoke('check-subscription');
            if (!cancelled && data?.subscribed) {
              setVerified(true);
              setVerifying(false);
              return;
            }
          } catch {}
          if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!cancelled) setVerifying(false);
    }

    verify();
    return () => { cancelled = true; };
  }, [sessionId, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      {/* Confetti particles */}
      {confetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                backgroundColor: ['hsl(var(--primary))', 'hsl(var(--accent))', '#FFD700', '#FF6B6B', '#4ECDC4'][i % 5],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1.5 + Math.random() * 2}s`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 max-w-3xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 mx-auto mb-2">
            <Crown className="w-10 h-10 text-primary" />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mx-auto">
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {verifying ? t('premium_success.verifying') : t('premium_success.payment_confirmed')}
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">
            {t('premium_success.welcome')}{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Premium
            </span>
            {' '}
            <Sparkles className="inline w-8 h-8 text-primary" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            {t('premium_success.subtitle')}
          </p>
        </div>

        {/* Features grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          {premiumFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Card
                key={i}
                className="group border-border hover:border-primary/40 transition-all duration-200 bg-card/80 backdrop-blur-sm"
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm">{t(feature.titleKey)}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t(feature.descKey)}</p>
                    </div>
                  </div>
                  <Link to={feature.link}>
                    <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary font-medium p-0 h-auto">
                      {t(feature.linkLabelKey)}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link to="/players">
            <Button size="lg" className="font-bold px-8 shadow-lg shadow-primary/25">
              {t('premium_success.view_players')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link to="/player/new">
            <Button size="lg" variant="outline" className="font-bold px-8">
              {t('premium_success.add_player')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
