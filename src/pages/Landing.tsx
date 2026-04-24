import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, FileSearch, Shield, Zap, Globe } from 'lucide-react';
import stadiumHero from '@/assets/stadium-hero.jpg';
import { useAuth } from '@/contexts/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import logo from '@/assets/logo.png';
import PageSEO from '@/components/PageSEO';

const featureIcons = [Users, FileSearch, BarChart3, Shield, Zap, Globe];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (user) navigate('/players');
  }, [user, navigate]);

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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Scouty" className="w-9 h-9 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">Scouty</span>
          </div>
          <div className="flex items-center gap-3">
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
        </div>
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
