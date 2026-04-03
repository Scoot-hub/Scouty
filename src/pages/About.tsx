import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, Target, Users, Zap, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm">⚽</span>
            <span className="text-lg font-extrabold tracking-tight">Scouty</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-16">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium">
            <Heart className="w-4 h-4" />
            {t('about.badge')}
          </div>
          <h1 className="text-4xl font-black tracking-tight">{t('about.title')}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t('about.intro')}
          </p>
        </div>

        {/* Story */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t('about.story_title')}</h2>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-4">
            <p>{t('about.story_p1')}</p>
            <p>{t('about.story_p2')}</p>
            <p>{t('about.story_p3')}</p>
          </div>
        </section>

        <Separator />

        {/* Values */}
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

        {/* Team */}
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

        {/* Social / Follow */}
        <section className="text-center space-y-4">
          <h2 className="text-2xl font-bold">{t('about.follow_title')}</h2>
          <p className="text-sm text-muted-foreground">{t('about.follow_desc')}</p>
          <div className="flex items-center justify-center gap-4">
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

        {/* CTA */}
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
